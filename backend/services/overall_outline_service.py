"""总纲生成服务"""
import json
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from services.context_service import load_shared_context
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def generate_overall_outline(project_id: int, custom_instructions: str = None) -> dict:
    """根据已有内容生成/重新生成总纲（不含分卷，分卷由 volume_outline_service 负责）"""
    # 加载共享上下文
    shared = await load_shared_context(project_id)
    project = shared["project"]
    characters = shared["characters"]

    async with get_db_ctx() as db:
        # 加载已有章纲
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective, emotional_arc, hooks
               FROM chapter_outlines WHERE project_id=?
               ORDER BY chapter_number""",
            (project_id,),
        )
        existing_outlines = [dict(r) for r in await cursor.fetchall()]

        # 加载伏笔（含所有状态，用于总纲展示）
        cursor = await db.execute(
            "SELECT description, planted_chapter, importance, status FROM foreshadowing WHERE project_id=?",
            (project_id,),
        )
        foreshadowings = [dict(r) for r in await cursor.fetchall()]

        # 加载章节摘要
        cursor = await db.execute(
            """SELECT chapter_number, title, word_count, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]

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
    "future_directions": "后续发展方向建议",
    "rhythm_blueprint": "整体节奏蓝图：描述全书的节奏起伏设计，如开篇缓起、中段高潮密集、尾段收束等",
    "core_appeal": "核心爽点/卖点：本书最吸引读者的核心要素是什么，如何在各卷中持续释放"
}"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("overall_outline", context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=3072)
        raw = extract_content(response)
    except Exception as e:
        logger.error("总纲生成 AI 调用失败: project=%s", project_id, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        data = extract_json(raw)
    except Exception:
        logger.error("总纲 JSON 解析失败: project=%s raw=%s", project_id, raw[:200], exc_info=True)
        return {"error": f"JSON 解析失败: {raw[:300]}"}

    # 保存到 project.volume_summaries
    outline_text = json.dumps(data, ensure_ascii=False, indent=2)
    async with get_db_ctx() as db:
        await db.execute(
            "UPDATE projects SET volume_summaries=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (outline_text, project_id),
        )
        await db.commit()

    return data


async def get_overall_outline(project_id: int) -> dict:
    """获取当前总纲"""
    async with get_db_ctx() as db:
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


async def update_overall_outline(project_id: int, data: dict) -> dict:
    """手动更新总纲"""
    outline_text = json.dumps(data, ensure_ascii=False, indent=2)
    async with get_db_ctx() as db:
        await db.execute(
            "UPDATE projects SET volume_summaries=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (outline_text, project_id),
        )
        await db.commit()
    return data
