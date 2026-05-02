"""设定库服务 - 管理世界观设定"""
import logging
from models.database import get_db_ctx

logger = logging.getLogger(__name__)


async def list_settings(project_id: int, category: str = None) -> list:
    """获取项目的设定库"""
    async with get_db_ctx() as db:
        if category:
            cursor = await db.execute(
                """SELECT * FROM settings_library WHERE project_id=? AND category=?
                   ORDER BY importance DESC, name""",
                (project_id, category),
            )
        else:
            cursor = await db.execute(
                """SELECT * FROM settings_library WHERE project_id=?
                   ORDER BY category, importance DESC, name""",
                (project_id,),
            )
        return [dict(r) for r in await cursor.fetchall()]


async def get_setting(project_id: int, setting_id: int) -> dict:
    """获取单个设定"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM settings_library WHERE project_id=? AND id=?",
            (project_id, setting_id),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return dict(row)


async def create_setting(project_id: int, data: dict) -> dict:
    """手动创建设定"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """INSERT INTO settings_library
               (project_id, category, name, description, details, importance)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(project_id, category, name)
               DO UPDATE SET description=excluded.description,
               details=excluded.details, importance=excluded.importance,
               updated_at=CURRENT_TIMESTAMP""",
            (project_id, data["category"], data["name"],
             data.get("description", ""), data.get("details", ""),
             data.get("importance", "normal")),
        )
        await db.commit()
        new_id = cursor.lastrowid
    # ON CONFLICT DO UPDATE 时 lastrowid 可能为 0，回退到按唯一键查询
    result = await get_setting(project_id, new_id) if new_id else None
    if not result:
        async with get_db_ctx() as db2:
            cursor2 = await db2.execute(
                "SELECT * FROM settings_library WHERE project_id=? AND category=? AND name=?",
                (project_id, data["category"], data["name"]),
            )
            row = await cursor2.fetchone()
            result = dict(row) if row else None
    return result


async def update_setting(project_id: int, setting_id: int, data: dict) -> dict:
    """更新设定"""
    async with get_db_ctx() as db:
        fields = []
        values = []
        for key in ("category", "name", "description", "details", "importance"):
            if key in data:
                fields.append(f"{key}=?")
                values.append(data[key])
        if fields:
            fields.append("updated_at=CURRENT_TIMESTAMP")
            values.extend([project_id, setting_id])
            await db.execute(
                f"UPDATE settings_library SET {', '.join(fields)} WHERE project_id=? AND id=?",
                values,
            )
            await db.commit()
    return await get_setting(project_id, setting_id)


async def delete_setting(project_id: int, setting_id: int) -> bool:
    """删除设定"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "DELETE FROM settings_library WHERE project_id=? AND id=?",
            (project_id, setting_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def get_categories(project_id: int) -> list:
    """获取所有设定类别"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT category, COUNT(*) as count FROM settings_library
               WHERE project_id=? GROUP BY category ORDER BY count DESC""",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_settings_for_context(project_id: int, limit: int = 30) -> str:
    """获取设定库内容，格式化为可注入到 AI 提示词中的文本"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT category, name, description FROM settings_library
               WHERE project_id=?
               ORDER BY CASE importance WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, name
               LIMIT ?""",
            (project_id, limit),
        )
        rows = [dict(r) for r in await cursor.fetchall()]

    if not rows:
        return ""

    lines = []
    current_cat = None
    for r in rows:
        if r["category"] != current_cat:
            current_cat = r["category"]
            lines.append(f"\n### {current_cat}")
        lines.append(f"- **{r['name']}**：{r['description'] or '（无描述）'}")
    return "\n".join(lines)
