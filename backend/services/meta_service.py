"""元数据提取服务 - 从章节内容中提取角色状态、伏笔等"""
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def extract_chapter_meta(project_id: int, chapter: int) -> dict:
    """从章节正文中提取元数据"""
    # 加载章节内容和角色列表（共享连接）
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT content, title FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "章节不存在或无内容"}
        content = row["content"]
        title = row["title"] or ""

        if not content or len(content) < 100:
            return {"error": "章节内容过短，无法提取元数据"}

        cursor = await db.execute(
            "SELECT name, role FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

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
    }},
    "emotion_peak": "本章的情感高潮点描述：最打动读者的关键场景或情感爆发点",
    "new_settings": [
        {{
            "category": "设定类别（如：地理/势力/魔法体系/科技/社会制度/历史/生物等）",
            "name": "设定名称",
            "description": "设定描述",
            "importance": "high/normal/low"
        }}
    ]
}}

## 章节内容
{content}"""

    system = format_prompt("meta_extraction", context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=4096)
        raw = extract_content(response)
    except Exception as e:
        logger.error("元数据提取 AI 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        data = extract_json(raw)
    except Exception:
        logger.error("元数据 JSON 解析失败: project=%s chapter=%s raw=%s", project_id, chapter, raw[:200], exc_info=True)
        return {"error": f"JSON 解析失败: {raw[:200]}"}

    # 保存所有元数据（共享连接）
    async with get_db_ctx() as db:
        # 保存角色快照
        snapshots = data.get("character_snapshots", {})
        if snapshots:
            for char_name, state in snapshots.items():
                if state:
                    await db.execute(
                        """INSERT INTO character_snapshots
                           (project_id, chapter_number, character_name, current_state)
                           VALUES (?, ?, ?, ?)
                           ON CONFLICT(project_id, chapter_number, character_name)
                           DO UPDATE SET current_state=excluded.current_state""",
                        (project_id, chapter, char_name, state),
                    )

        # 保存伏笔
        new_foreshadowings = data.get("new_foreshadowings", [])
        if new_foreshadowings:
            for fs in new_foreshadowings:
                desc = fs.get("description", "")
                if not desc:
                    continue
                await db.execute(
                    """INSERT INTO foreshadowing
                       (project_id, description, planted_chapter, importance, status)
                       VALUES (?, ?, ?, ?, 'active')""",
                    (project_id, desc, chapter, fs.get("importance", "normal")),
                )

        # 回收伏笔
        resolved_foreshadowings = data.get("resolved_foreshadowings", [])
        if resolved_foreshadowings:
            cursor = await db.execute(
                "SELECT id, description FROM foreshadowing WHERE project_id=? AND status='active'",
                (project_id,),
            )
            active_list = [dict(r) for r in await cursor.fetchall()]

            for resolved in resolved_foreshadowings:
                desc = resolved.get("description", "")
                if not desc:
                    continue
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

        # 保存时间线
        timeline = data.get("timeline", {})
        if timeline and timeline.get("story_time_description"):
            await db.execute(
                """INSERT INTO timeline (project_id, chapter_number, story_time_description, summary)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(project_id, chapter_number)
                   DO UPDATE SET story_time_description=excluded.story_time_description,
                   summary=excluded.summary""",
                (project_id, chapter, timeline["story_time_description"], timeline.get("summary")),
            )

        # 保存情感高潮点
        emotion_peak = data.get("emotion_peak")
        if emotion_peak:
            await db.execute(
                "UPDATE chapters SET emotion_peak=? WHERE project_id=? AND chapter_number=?",
                (emotion_peak, project_id, chapter),
            )

        # 保存新设定到设定库
        new_settings = data.get("new_settings", [])
        if new_settings:
            for setting in new_settings:
                if setting.get("name") and setting.get("category"):
                    await db.execute(
                        """INSERT INTO settings_library
                           (project_id, category, name, description, source_chapter, importance)
                           VALUES (?, ?, ?, ?, ?, ?)
                           ON CONFLICT(project_id, category, name)
                           DO UPDATE SET description=excluded.description,
                           source_chapter=excluded.source_chapter,
                           importance=excluded.importance,
                           updated_at=CURRENT_TIMESTAMP""",
                        (project_id, setting["category"], setting["name"],
                         setting.get("description", ""), chapter,
                         setting.get("importance", "normal")),
                    )

        await db.commit()

    return data
