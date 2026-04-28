"""总纲生成服务"""
import json
from models.database import get_db
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt


async def generate_overall_outline(project_id: int, custom_instructions: str = None) -> dict:
    """根据已有内容生成/重新生成总纲（不含分卷，分卷由 volume_outline_service 负责）"""
    # 加载项目信息
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())
    finally:
        await db.close()

    # 加载已有章纲
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective, emotional_arc, hooks
               FROM chapter_outlines WHERE project_id=?
               ORDER BY chapter_number""",
            (project_id,),
        )
        existing_outlines = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    # 加载角色信息
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    # 加载伏笔
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT description, planted_chapter, importance, status FROM foreshadowing WHERE project_id=?",
            (project_id,),
        )
        foreshadowings = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    # 加载章节摘要
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT chapter_number, title, word_count, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '暂无')}
- 目标字数：{project.get('target_words', 200000)}
- 当前进度：{len(chapters)} 章，共 {sum(ch.get('word_count', 0) for ch in chapters)} 字"""

    if existing_outlines:
        context += "\n\n## 已有章纲"
        for o in existing_outlines:
            context += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if foreshadowings:
        context += "\n\n## 已埋伏笔"
        for fs in foreshadowings:
            status_mark = "✓" if fs["status"] == "resolved" else "○"
            context += f"\n- [{status_mark}] 第{fs['planted_chapter']}章: {fs['description']}"

    if chapters:
        context += "\n\n## 章节摘要"
        for ch in chapters:
            summary = ch.get("summary") or "（无摘要）"
            context += f"\n- 第{ch['chapter_number']}章 {ch.get('title', '')} ({ch.get('word_count', 0)}字): {summary[:100]}"

    context += """

## 输出格式
请以 JSON 格式输出：
{
    "premise": "故事核心前提/设定（2-3句话）",
    "main_conflict": "主要矛盾和冲突线",
    "themes": "核心主题",
    "character_arcs": "主要角色弧线概述",
    "story_structure": "整体故事结构（三幕/多幕等）",
    "total_chapters": 60,
    "future_directions": "后续发展方向建议"
}"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("overall_outline", context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=3072)
        raw = extract_content(response)
    except Exception as e:
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        data = extract_json(raw)
    except Exception:
        return {"error": f"JSON 解析失败: {raw[:300]}"}

    # 保存到 project.volume_summaries
    outline_text = json.dumps(data, ensure_ascii=False, indent=2)
    db = await get_db()
    try:
        await db.execute(
            "UPDATE projects SET volume_summaries=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (outline_text, project_id),
        )
        await db.commit()
    finally:
        await db.close()

    return data


async def get_overall_outline(project_id: int) -> dict:
    """获取当前总纲"""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT volume_summaries FROM projects WHERE id=?", (project_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "项目不存在"}
        raw = row["volume_summaries"]
        if raw:
            return json.loads(raw)
        return {}
    finally:
        await db.close()


async def update_overall_outline(project_id: int, data: dict) -> dict:
    """手动更新总纲"""
    outline_text = json.dumps(data, ensure_ascii=False, indent=2)
    db = await get_db()
    try:
        await db.execute(
            "UPDATE projects SET volume_summaries=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (outline_text, project_id),
        )
        await db.commit()
        return data
    finally:
        await db.close()
