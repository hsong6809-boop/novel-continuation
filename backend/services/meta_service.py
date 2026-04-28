"""元数据提取服务 - 从章节内容中提取角色状态、伏笔等"""
import json
from models.database import get_db
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt


async def extract_chapter_meta(project_id: int, chapter: int) -> dict:
    """从章节正文中提取元数据"""
    # 加载章节内容
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT content, title FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "章节不存在或无内容"}
        content = row["content"]
        title = row["title"] or ""
    finally:
        await db.close()

    if not content or len(content) < 100:
        return {"error": "章节内容过短，无法提取元数据"}

    # 加载角色列表
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name, role FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    char_names = [c["name"] for c in characters] if characters else []

    context = f"""## 章节信息
- 章节号：第{chapter}章
- 标题：{title}

## 已知角色
{', '.join(char_names) if char_names else '暂无角色信息'}

## 输出格式
请以 JSON 格式输出：
{{
    "character_snapshots": {{
        "角色名": "角色在本章的状态变化描述"
    }},
    "new_foreshadowings": [
        {{
            "description": "伏笔描述",
            "importance": "high/normal/low"
        }}
    ],
    "resolved_foreshadowings": [
        {{
            "description": "被解决的伏笔描述"
        }}
    ],
    "timeline": {{
        "story_time_description": "本章的时间描述",
        "summary": "本章时间线摘要"
    }}
}}

## 章节内容（前3000字）
{content[:3000]}"""

    system = format_prompt("meta_extraction", context=context)

    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=2048)
        raw = extract_content(response)
    except Exception as e:
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        data = extract_json(raw)
    except Exception:
        return {"error": f"JSON 解析失败: {raw[:200]}"}

    # 保存角色快照
    snapshots = data.get("character_snapshots", {})
    if snapshots:
        db = await get_db()
        try:
            for char_name, state in snapshots.items():
                if state:
                    await db.execute(
                        """INSERT OR REPLACE INTO character_snapshots
                           (project_id, chapter_number, character_name, current_state)
                           VALUES (?, ?, ?, ?)""",
                        (project_id, chapter, char_name, state),
                    )
            await db.commit()
        finally:
            await db.close()

        # 保存伏笔
    new_foreshadowings = data.get("new_foreshadowings", [])
    if new_foreshadowings:
        db = await get_db()
        try:
            for fs in new_foreshadowings:
                await db.execute(
                    """INSERT INTO foreshadowing
                       (project_id, description, planted_chapter, importance, status)
                       VALUES (?, ?, ?, ?, 'active')""",
                    (project_id, fs["description"], chapter, fs.get("importance", "normal")),
                )
            await db.commit()
        finally:
            await db.close()

    # 回收伏笔：将已解决的伏笔状态更新为 resolved
    resolved_foreshadowings = data.get("resolved_foreshadowings", [])
    if resolved_foreshadowings:
        db = await get_db()
        try:
            # 加载当前活跃伏笔用于模糊匹配
            cursor = await db.execute(
                "SELECT id, description FROM foreshadowing WHERE project_id=? AND status='active'",
                (project_id,),
            )
            active_list = [dict(r) for r in await cursor.fetchall()]

            for resolved in resolved_foreshadowings:
                desc = resolved.get("description", "")
                if not desc:
                    continue
                # 精确匹配或子串匹配
                matched_id = None
                for af in active_list:
                    if af["description"] == desc or desc in af["description"] or af["description"] in desc:
                        matched_id = af["id"]
                        break
                if matched_id:
                    await db.execute(
                        "UPDATE foreshadowing SET status='resolved', actual_reveal_chapter=? WHERE id=?",
                        (chapter, matched_id),
                    )
            await db.commit()
        finally:
            await db.close()

    # 保存时间线
    timeline = data.get("timeline", {})
    if timeline and timeline.get("story_time_description"):
        db = await get_db()
        try:
            await db.execute(
                """INSERT INTO timeline (project_id, chapter_number, story_time_description, summary)
                   VALUES (?, ?, ?, ?)""",
                (project_id, chapter, timeline["story_time_description"], timeline.get("summary")),
            )
            await db.commit()
        finally:
            await db.close()

    return data
