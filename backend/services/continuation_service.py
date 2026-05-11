"""续写服务 - 生成章节正文（流式 + 非流式）"""
import asyncio
import json
import logging
from fastapi import HTTPException
from models.database import get_db_ctx
from services.llm_client import chat_completion, chat_completion_stream, extract_content
from services.context_service import build_continuation_messages
from services.chapter_service import update_project_progress
from utils.text_utils import count_chinese_words

logger = logging.getLogger(__name__)

# 节奏类型 → 温度映射
RHYTHM_TEMPERATURE = {
    "高潮章": 0.95,
    "爆发章": 0.95,
    "推进章": 0.85,
    "过渡章": 0.7,
    "铺垫章": 0.7,
    "收束章": 0.75,
}


def _get_temperature(outline) -> float:
    """根据章纲的 rhythm_type 动态计算生成温度"""
    if not outline:
        return 0.85
    rhythm = outline.get("rhythm_type") if isinstance(outline, dict) else dict(outline).get("rhythm_type")
    return RHYTHM_TEMPERATURE.get(rhythm, 0.85)


async def _check_outline(project_id: int, chapter: int):
    """检查章纲是否存在，返回章纲行"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT id, project_id, chapter_number, volume_id, title, "
            "core_objective, emotional_arc, hooks, core_conflict, rhythm_type, chapter_opening "
            "FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        return await cursor.fetchone()


async def _get_chapter_title(project_id: int, chapter: int) -> str | None:
    """获取章纲标题"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT title FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        return row["title"] if row else None


async def _save_and_update(project_id: int, chapter: int, content: str, title: str | None):
    """保存章节并更新项目进度"""
    from services.chapter_service import save_chapter
    await save_chapter(project_id, chapter, content, title=title)


async def _extract_meta(project_id: int, chapter: int) -> dict:
    """提取元数据（失败不阻断）"""
    try:
        from services.meta_service import extract_chapter_meta
        return await extract_chapter_meta(project_id, chapter)
    except Exception:
        logger.warning("元数据提取失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": "元数据提取异常"}


async def generate_stream(project_id: int, chapter: int, custom_instructions: str = None):
    """流式续写生成器，yield SSE 事件字典"""
    outline = await _check_outline(project_id, chapter)
    if not outline:
        yield {"type": "error", "message": f"第{chapter}章的章纲不存在，请先生成章纲"}
        return

    messages = await build_continuation_messages(project_id, chapter, custom_instructions)
    chapter_title = await _get_chapter_title(project_id, chapter)

    # 根据节奏类型动态调整温度
    temperature = _get_temperature(outline)
    logger.info("续写温度: project=%s chapter=%s rhythm=%s temp=%.2f",
                project_id, chapter, dict(outline).get("rhythm_type", ""), temperature)

    full_text = ""
    reasoning_text = ""
    try:
        # 不硬性限制 max_tokens，让 AI 写完章纲内容；字数靠提示词约束
        async for chunk in chat_completion_stream(messages, temperature=temperature, max_tokens=8192):
            if isinstance(chunk, dict):
                if chunk["type"] == "reasoning":
                    reasoning_text += chunk["content"]
                    yield {"type": "reasoning", "content": chunk["content"]}
                elif chunk["type"] == "content":
                    full_text += chunk["content"]
                    yield {"type": "chunk", "content": chunk["content"]}
            else:
                # 兼容旧格式（纯文本）
                full_text += chunk
                yield {"type": "chunk", "content": chunk}
    except Exception as e:
        logger.error("流式续写 LLM 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        yield {"type": "error", "message": "AI 调用失败，请检查网络和模型配置"}
        return

    if not full_text.strip():
        yield {"type": "error", "message": "AI 返回了空内容"}
        return

    # 保存章节
    try:
        await _save_and_update(project_id, chapter, full_text, chapter_title)
    except Exception as e:
        logger.error("章节保存失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        yield {"type": "error", "message": f"章节保存失败: {str(e)}"}
        return

    # 提取元数据
    meta = await _extract_meta(project_id, chapter)
    if "error" in meta:
        logger.warning("元数据提取失败: project=%s chapter=%s error=%s", project_id, chapter, meta["error"])
        yield {"type": "done", "meta": {}, "meta_error": meta["error"]}
    else:
        yield {"type": "done", "meta": meta}

    # 自审 + 卷风格分析并行执行
    async def _safe_review():
        try:
            from services.self_review_service import review_chapter
            review = await review_chapter(project_id, chapter)
            if review and "error" not in review:
                verdict = review.get("overall_verdict", "pass")
                if verdict != "pass":
                    return {"type": "info", "message": f"自审完成：{verdict}", "review": review}
        except Exception:
            logger.warning("自审失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return None

    async def _safe_style():
        try:
            from services.style_service import auto_analyze_if_volume_complete
            style_result = await auto_analyze_if_volume_complete(project_id, chapter)
            if style_result and "error" not in style_result:
                return {"type": "info", "message": f"第{style_result.get('volume_number')}卷风格分析已完成"}
        except Exception:
            logger.warning("自动风格分析失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return None

    review_result, style_result = await asyncio.gather(_safe_review(), _safe_style())
    if review_result:
        yield review_result
    if style_result:
        yield style_result


async def generate_chapter_content(project_id: int, chapter: int, data) -> dict:
    """非流式续写（兼容旧接口）"""
    outline = await _check_outline(project_id, chapter)
    if not outline:
        raise HTTPException(400, f"第{chapter}章的章纲不存在，请先生成章纲")

    messages = await build_continuation_messages(project_id, chapter, data.custom_instructions)
    temperature = _get_temperature(outline)

    try:
        response = await chat_completion(messages, temperature=temperature, max_tokens=8192)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("非流式续写 LLM 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, "AI 调用失败，请检查网络和模型配置")

    if not content:
        raise HTTPException(500, "AI 返回了空内容")

    chapter_title = await _get_chapter_title(project_id, chapter)

    try:
        await _save_and_update(project_id, chapter, content, chapter_title)
    except Exception as e:
        logger.error("章节保存失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, f"章节保存失败: {str(e)}")

    # 元数据提取 + 自审 + 风格分析并行执行
    meta = await _extract_meta(project_id, chapter)

    async def _safe_review():
        try:
            from services.self_review_service import review_chapter
            await review_chapter(project_id, chapter)
        except Exception:
            logger.warning("自审失败: project=%s chapter=%s", project_id, chapter, exc_info=True)

    async def _safe_style():
        try:
            from services.style_service import auto_analyze_if_volume_complete
            await auto_analyze_if_volume_complete(project_id, chapter)
        except Exception:
            logger.warning("自动风格分析失败: project=%s chapter=%s", project_id, chapter, exc_info=True)

    await asyncio.gather(_safe_review(), _safe_style())

    return {
        "chapter_number": chapter,
        "content": content,
        "word_count": count_chinese_words(content),
        "status": "draft",
        "meta_extracted": "error" not in meta,
    }
