"""风格分析服务 - 每卷自动分析 + 偏差检测"""
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.prompt_manager import format_prompt
from utils.cache import invalidate_project

logger = logging.getLogger(__name__)


async def analyze_volume_style(project_id: int, volume_number: int) -> dict:
    """分析指定卷的写作风格，保存为风格基线"""
    async with get_db_ctx() as db:
        # 找到该卷的章节范围
        cursor = await db.execute(
            """SELECT chapter_start, chapter_end FROM volume_outlines
               WHERE project_id=? AND volume_number=?""",
            (project_id, volume_number),
        )
        vol = await cursor.fetchone()
        if not vol:
            return {"error": "分卷大纲不存在"}

        ch_start = vol["chapter_start"] or 1
        ch_end = vol["chapter_end"] or 999

        # 取该卷有内容的章节
        cursor = await db.execute(
            """SELECT chapter_number, title, content FROM chapters
               WHERE project_id=? AND content != '' AND word_count > 200
               AND chapter_number >= ? AND chapter_number <= ?
               ORDER BY chapter_number""",
            (project_id, ch_start, ch_end),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]

    if not chapters:
        return {"error": "该卷没有足够的章节内容"}

    # 构建分析上下文
    context = f"## 分析任务\n分析第 {volume_number} 卷（第{ch_start}-{ch_end}章）的写作风格\n\n"
    context += "## 样本章节\n"
    for ch in chapters:
        content = ch["content"][:1500]
        context += f"### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content}\n\n"

    system = format_prompt("style_analysis", context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=1024)
        analysis = extract_content(response)
    except Exception as e:
        logger.error("卷风格分析失败: project=%s volume=%s", project_id, volume_number, exc_info=True)
        return {"error": f"AI 分析失败: {str(e)}"}

    # 保存到 style_baselines
    async with get_db_ctx() as db:
        # 检查是否已有该卷的基线
        cursor = await db.execute(
            "SELECT id FROM style_baselines WHERE project_id=? AND volume_number=?",
            (project_id, volume_number),
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute(
                """UPDATE style_baselines SET analysis=?, created_at=CURRENT_TIMESTAMP
                   WHERE project_id=? AND volume_number=?""",
                (analysis, project_id, volume_number),
            )
        else:
            await db.execute(
                """INSERT INTO style_baselines (project_id, volume_number, analysis, is_baseline)
                   VALUES (?, ?, ?, 1)""",
                (project_id, volume_number, analysis),
            )
        await db.commit()

    invalidate_project(project_id)
    return {"volume_number": volume_number, "analysis": analysis}


async def auto_analyze_if_volume_complete(project_id: int, chapter: int) -> dict | None:
    """续写完成后自动检查：如果本章是某卷的最后一章，自动触发该卷的风格分析"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT volume_number, chapter_end FROM volume_outlines
               WHERE project_id=? AND chapter_end=?""",
            (project_id, chapter),
        )
        vol = await cursor.fetchone()

    if not vol:
        return None

    logger.info("卷完成自动风格分析: project=%s volume=%s", project_id, vol["volume_number"])
    return await analyze_volume_style(project_id, vol["volume_number"])
