"""续写服务 - 生成章节正文（流式 + 非流式）"""
import json
import logging
from fastapi import HTTPException
from models.database import get_db_ctx
from services.llm_client import chat_completion, chat_completion_stream, extract_content
from services.context_service import build_continuation_messages
from services.chapter_service import update_project_progress

logger = logging.getLogger(__name__)


async def _check_outline(project_id: int, chapter: int):
    """检查章纲是否存在，返回章纲行"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
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

    full_text = ""
    try:
        async for chunk in chat_completion_stream(messages, temperature=0.85):
            full_text += chunk
            yield {"type": "chunk", "content": chunk}
    except Exception as e:
        logger.error("流式续写 LLM 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        yield {"type": "error", "message": f"AI 调用失败: {str(e)}"}
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
    yield {"type": "done", "meta": meta}


async def generate_chapter_content(project_id: int, chapter: int, data) -> dict:
    """非流式续写（兼容旧接口）"""
    outline = await _check_outline(project_id, chapter)
    if not outline:
        raise HTTPException(400, f"第{chapter}章的章纲不存在，请先生成章纲")

    messages = await build_continuation_messages(project_id, chapter, data.custom_instructions)

    try:
        response = await chat_completion(messages, temperature=0.8, max_tokens=4096)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("非流式续写 LLM 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, f"AI 调用失败: {str(e)}")

    if not content:
        raise HTTPException(500, "AI 返回了空内容")

    chapter_title = await _get_chapter_title(project_id, chapter)

    try:
        await _save_and_update(project_id, chapter, content, chapter_title)
    except Exception as e:
        logger.error("章节保存失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, f"章节保存失败: {str(e)}")

    meta = await _extract_meta(project_id, chapter)

    return {
        "chapter_number": chapter,
        "content": content,
        "word_count": len(content),
        "status": "draft",
        "meta_extracted": "error" not in meta,
    }
