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
            """SELECT chapter_number, title, content, word_count, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]

    # 判断项目阶段：新项目（前几章）vs 已有大量内容
    is_new_project = len(chapters) <= 10

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '暂无')}
- 目标字数：{project.get('target_words', 200000)}
- 当前进度：{len(chapters)} 章，共 {sum(ch.get('word_count', 0) for ch in chapters)} 字"""

    # 传入已有正文内容（核心输入）
    if chapters:
        context += "\n\n## 已有正文内容"
        for ch in chapters:
            title = ch.get('title', '') or f"第{ch['chapter_number']}章"
            content = ch.get("content", "")
            # 新项目传入更多内容，已有项目用摘要
            if is_new_project:
                preview = content[:2000]
            else:
                preview = (ch.get("summary") or content[:800])
            context += f"\n\n### 第{ch['chapter_number']}章 {title}\n{preview}"

    # 章纲（辅助信息）
    if existing_outlines:
        context += "\n\n## 已有章纲"
        for o in existing_outlines:
            context += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    # 角色（辅助信息）
    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    # 伏笔（辅助信息）
    if foreshadowings:
        context += "\n\n## 已埋伏笔"
        for fs in foreshadowings:
            status_mark = "✓" if fs["status"] == "resolved" else "○"
            context += f"\n- [{status_mark}] 第{fs['planted_chapter']}章: {fs['description']}"

    context += """

## 输出格式
请以 JSON 格式输出：
{
    "start_point": "起点：故事开始时主角的状态、处境（从正文中提炼，要具体）",
    "core_mainline": "核心主线：主角「变强」的具体定义和方向（高魔=自身实力，低魔=势力/地位，结合具体世界观说明）。要写清楚变强的过程是什么——比如逐渐成为武道宗师的同时带领华国屹立世界之巅，是一个持续向上的过程",
    "end_point": "终点方向：一个足够遥远、足够虚的方向性描述，不要具体到情节结局。网文的结局在一开始是无法确定的，只需要给出「变强到什么程度」的大致方向，比如「站上武道之巅」「成为最强者」这类虚化表达。如果前三章体现不出终点，就写「以过程为主，终点待定」",
    "key_info": {
        "world_setting": "世界观核心设定（从正文中提取：时代背景、地理环境、社会结构等）",
        "power_system": "力量体系（修炼等级、能力类型、变强路径等，从正文中提取）",
        "faction_landscape": "势力格局（主要势力/门派/家族/组织及其关系）",
        "core_selling_point": "核心卖点/爽点（本书最吸引读者的要素）",
        "main_characters": "主要角色关系网（主角、对手、盟友等及其关系）",
        "first_crisis": "第一个危机/冲突（从正文中提取）",
        "early_goals": "前期目标（主角当前要达成的目标）",
        "key_items": "关键道具/金手指/系统（如有）"
    },
    "world_type": "世界观类型：高魔/中魔/低魔/无武/现代/其他",
    "themes": "核心主题（1-2句话）",
    "main_conflict": "主要矛盾和冲突线（简要描述）"
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
    from utils.cache import invalidate_project
    invalidate_project(project_id)

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
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                # 可能是旧版纯文本存储，包装为 dict 返回
                return {"raw_text": raw}
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
    from utils.cache import invalidate_project
    invalidate_project(project_id)
    return data
