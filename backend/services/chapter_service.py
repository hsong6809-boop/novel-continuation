"""章节保存服务 - 保存章节内容并更新项目进度"""
from models.database import get_db


async def save_chapter(project_id: int, chapter: int, content: str, title: str = None) -> dict:
    """保存章节内容并更新项目统计"""
    word_count = len(content)

    # 如果没有传入标题，尝试从章纲获取
    if not title:
        db_tmp = await get_db()
        try:
            cursor = await db_tmp.execute(
                "SELECT title FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
                (project_id, chapter),
            )
            row = await cursor.fetchone()
            if row:
                title = row["title"]
        finally:
            await db_tmp.close()

    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute(
                "UPDATE chapters SET content=?, word_count=?, status='draft', title=COALESCE(?, title) WHERE project_id=? AND chapter_number=?",
                (content, word_count, title, project_id, chapter),
            )
        else:
            await db.execute(
                """INSERT INTO chapters (project_id, chapter_number, title, content, word_count, status)
                   VALUES (?, ?, ?, ?, ?, 'draft')""",
                (project_id, chapter, title, content, word_count),
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

    return {
        "chapter_number": chapter,
        "title": title,
        "word_count": word_count,
        "status": "draft",
    }
