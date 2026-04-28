"""续写服务 - 生成章节正文"""
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from models.database import get_db
from services.llm_client import chat_completion, extract_content, get_active_config
from services.context_service import build_continuation_messages, build_write_preview


async def generate_chapter_content(project_id: int, chapter: int, data) -> dict:
    """执行正式续写"""
    # 检查章纲是否存在
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline = await cursor.fetchone()
    finally:
        await db.close()

    if not outline:
        raise HTTPException(400, f"第{chapter}章的章纲不存在，请先生成章纲")

    # 构建消息
    messages = await build_continuation_messages(
        project_id, chapter, data.custom_instructions
    )

    # 调用 LLM
    try:
        response = await chat_completion(messages, temperature=0.8, max_tokens=4096)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI 调用失败: {str(e)}")

    if not content:
        raise HTTPException(500, "AI 返回了空内容")

    word_count = len(content)

    # 保存或更新章节
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute(
                "UPDATE chapters SET content=?, word_count=?, status='draft' WHERE project_id=? AND chapter_number=?",
                (content, word_count, project_id, chapter),
            )
        else:
            await db.execute(
                """INSERT INTO chapters (project_id, chapter_number, content, word_count, status)
                   VALUES (?, ?, ?, ?, 'draft')""",
                (project_id, chapter, content, word_count),
            )
        await db.commit()

        # 更新项目进度
        cursor = await db.execute(
            "SELECT MAX(chapter_number) as max_ch FROM chapters WHERE project_id=? AND word_count > 0",
            (project_id,),
        )
        row = await cursor.fetchone()
        max_ch = row["max_ch"] if row else 0

        cursor = await db.execute(
            "SELECT SUM(word_count) as total FROM chapters WHERE project_id=?",
            (project_id,),
        )
        row = await cursor.fetchone()
        total_words = row["total"] or 0

        await db.execute(
            "UPDATE projects SET current_chapter=?, current_words=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (max_ch, total_words, project_id),
        )
        await db.commit()
    finally:
        await db.close()

        # 自动触发元数据提取（伏笔/时间线/角色快照）
    meta_result = {}
    try:
        from services.meta_service import extract_chapter_meta
        meta_result = await extract_chapter_meta(project_id, chapter)
    except Exception:
        pass  # 元数据提取失败不影响续写结果

    return {
        "chapter_number": chapter,
        "content": content,
        "word_count": word_count,
        "status": "draft",
        "meta_extracted": "error" not in meta_result,
    }
