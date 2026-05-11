"""章节保存服务 - 保存章节内容、版本管理和项目进度更新"""
import logging
from models.database import get_db_ctx
from utils.text_utils import count_chinese_words
from utils.cache import invalidate_project

logger = logging.getLogger(__name__)


async def update_project_progress(db, project_id: int):
    """更新项目的 current_chapter 和 current_words（共享辅助函数，接收已有连接）"""
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


async def _archive_old_version(db, project_id: int, chapter: int):
    """将当前章节内容存入版本历史表（接收已有连接）"""
    cursor = await db.execute(
        "SELECT content, word_count, title FROM chapters WHERE project_id=? AND chapter_number=?",
        (project_id, chapter),
    )
    row = await cursor.fetchone()
    if not row or not row["content"]:
        return

    cursor = await db.execute(
        "SELECT COALESCE(MAX(version), 0) FROM chapter_versions WHERE project_id=? AND chapter_number=?",
        (project_id, chapter),
    )
    max_ver = (await cursor.fetchone())[0]

    await db.execute(
        """INSERT INTO chapter_versions (project_id, chapter_number, version, content, word_count, title)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (project_id, chapter, max_ver + 1, row["content"], row["word_count"], row["title"]),
    )


# 单章最大内容长度（10MB，防止意外超大文本提交）
MAX_CHAPTER_LENGTH = 10 * 1024 * 1024


async def save_chapter(project_id: int, chapter: int, content: str, title: str = None) -> dict:
    """保存章节内容并更新项目统计（自动归档旧版本）"""
    if not content:
        raise ValueError("章节内容不能为空")
    if chapter < 1:
        raise ValueError("章节号必须大于0")
    if len(content) > MAX_CHAPTER_LENGTH:
        raise ValueError(f"章节内容过长（{len(content)} 字符，上限 {MAX_CHAPTER_LENGTH} 字符）")

    word_count = count_chinese_words(content)

    # 如果没有传入标题，尝试从章纲获取
    if not title:
        async with get_db_ctx() as db:
            cursor = await db.execute(
                "SELECT title FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
                (project_id, chapter),
            )
            row = await cursor.fetchone()
            if row:
                title = row["title"]

    async with get_db_ctx() as db:
        # 归档旧版本
        await _archive_old_version(db, project_id, chapter)

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

        await update_project_progress(db, project_id)
        await db.commit()

    invalidate_project(project_id)
    return {
        "chapter_number": chapter,
        "title": title,
        "word_count": word_count,
        "status": "draft",
    }


async def list_chapter_versions(project_id: int, chapter: int) -> list[dict]:
    """获取某章的历史版本列表"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT id, version, word_count, title, created_at
               FROM chapter_versions
               WHERE project_id=? AND chapter_number=?
               ORDER BY version DESC""",
            (project_id, chapter),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def restore_chapter_version(project_id: int, chapter: int, version_id: int) -> dict:
    """回退到指定版本：将版本内容写回 chapters 表，当前内容归档"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT content, title FROM chapter_versions WHERE id=? AND project_id=? AND chapter_number=?",
            (version_id, project_id, chapter),
        )
        version_row = await cursor.fetchone()
        if not version_row:
            return {"error": "版本不存在"}

        # 归档当前内容
        await _archive_old_version(db, project_id, chapter)

        content = version_row["content"]
        title = version_row["title"]
        word_count = count_chinese_words(content)
        await db.execute(
            "UPDATE chapters SET content=?, word_count=?, title=COALESCE(?, title) WHERE project_id=? AND chapter_number=?",
            (content, word_count, title, project_id, chapter),
        )

        await update_project_progress(db, project_id)
        await db.commit()

        invalidate_project(project_id)
        return {
            "chapter_number": chapter,
            "title": title,
            "word_count": word_count,
            "status": "draft",
        }
