"""章纲生成服务"""
import logging
from fastapi import HTTPException
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def generate_outline_for_chapter(project_id: int, chapter: int,
                                       custom_instructions: str = None) -> dict:
    """AI 生成章纲 + 场景要点"""
    async with get_db_ctx() as db:
        # 项目信息
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())

        # 前几章章纲
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective, emotional_arc, hooks
               FROM chapter_outlines WHERE project_id=? AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, chapter),
        )
        prev_outlines = [dict(r) for r in await cursor.fetchall()]
        prev_outlines.reverse()

        # 角色
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

        # 所属卷大纲
        cursor = await db.execute(
            """SELECT * FROM volume_outlines WHERE project_id=?
               AND chapter_start <= ? AND chapter_end >= ?
               ORDER BY chapter_start DESC LIMIT 1""",
            (project_id, chapter, chapter),
        )
        vol_row = await cursor.fetchone()
        volume = dict(vol_row) if vol_row else None

        # 最近 5 章正文
        cursor = await db.execute(
            """SELECT chapter_number, title, content, summary
               FROM chapters WHERE project_id=? AND content != '' AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, chapter),
        )
        recent_chapters = [dict(r) for r in reversed(await cursor.fetchall())]

        # 活跃伏笔
        cursor = await db.execute(
            "SELECT description, planted_chapter, expected_reveal_chapter, importance FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
            (project_id,),
        )
        foreshadowings = [dict(r) for r in await cursor.fetchall()]

        # 角色快照
        cursor = await db.execute(
            """SELECT cs.character_name, cs.current_state, cs.chapter_number
               FROM character_snapshots cs
               INNER JOIN (
                   SELECT character_name, MAX(chapter_number) as max_ch
                   FROM character_snapshots
                   WHERE project_id=? AND chapter_number < ?
                   GROUP BY character_name
               ) latest ON cs.character_name=latest.character_name
                      AND cs.chapter_number=latest.max_ch
               WHERE cs.project_id=? AND cs.chapter_number < ?
               ORDER BY cs.character_name""",
            (project_id, chapter, project_id, chapter),
        )
        snapshots = [dict(r) for r in await cursor.fetchall()]

    # 构建上下文
    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 当前进度：第{project.get('current_chapter', 0)}章"""

    if volume:
        context += f"""

## 所属卷大纲
- 卷名：{volume.get('volume_name', '')}
- 概要：{volume.get('summary', '')}
- 核心事件：{volume.get('core_events', '')}
- 情感基调：{volume.get('emotional_tone', '')}
- 关键转折：{volume.get('key_turning_point', '')}"""

    if prev_outlines:
        context += "\n\n## 前几章大纲"
        for o in prev_outlines:
            context += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    if recent_chapters:
        context += "\n\n## 前文内容（最近 5 章）"
        for ch in recent_chapters:
            summary = ch.get("summary") or ch.get("content", "")[:300]
            context += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if snapshots:
        context += "\n\n## 角色最新状态"
        for s in snapshots:
            context += f"\n- {s['character_name']}: {s['current_state']}（第{s['chapter_number']}章）"

    if foreshadowings:
        context += "\n\n## 活跃伏笔"
        for f in foreshadowings:
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章，预计第{f.get('expected_reveal_chapter', '?')}章回收）"

    context += """

## 输出格式
请以 JSON 格式输出，包含以下字段：
{
    "title": "章节标题",
    "core_objective": "本章核心目标（2-3句话）",
    "emotional_arc": "情感弧线描述",
    "hooks": "本章结尾的钩子/悬念",
    "scenes": [
        {
            "scene_order": 1,
            "mission": "场景任务描述",
            "key_dialogue_hint": "关键对话提示",
            "atmosphere": "氛围描述",
            "target_words_ratio": 0.25
        }
    ]
}"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("chapter_outline", chapter=chapter, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.7, max_tokens=2048)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("章纲生成 AI 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, f"AI 调用失败: {str(e)}")

    try:
        data = extract_json(content)
    except Exception:
        logger.error("章纲 JSON 解析失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        raise HTTPException(500, f"AI 返回的内容无法解析为 JSON: {content[:200]}")

    # 保存章纲
    async with get_db_ctx() as db:
        await db.execute(
            "DELETE FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        await db.execute(
            """INSERT INTO chapter_outlines (project_id, chapter_number, title, core_objective, emotional_arc, hooks)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, chapter, data.get("title"), data.get("core_objective"),
             data.get("emotional_arc"), data.get("hooks")),
        )

        for scene in data.get("scenes", []):
            await db.execute(
                """INSERT INTO scene_points (project_id, chapter_number, scene_order,
                   mission, key_dialogue_hint, atmosphere, target_words_ratio)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (project_id, chapter, scene.get("scene_order", 0),
                 scene.get("mission"), scene.get("key_dialogue_hint"),
                 scene.get("atmosphere"), scene.get("target_words_ratio", 0.25)),
            )

        await db.commit()

    return {
        "title": data.get("title"),
        "core_objective": data.get("core_objective"),
        "emotional_arc": data.get("emotional_arc"),
        "hooks": data.get("hooks"),
        "scenes": data.get("scenes", []),
    }


async def batch_generate_outlines_for_volume(project_id: int, volume_id: int,
                                              custom_instructions: str = None) -> dict:
    """按卷批量生成章纲：AI 为该卷所有章节一次性生成章纲"""
    async with get_db_ctx() as db:
        # 分卷大纲
        cursor = await db.execute(
            "SELECT * FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        vol = await cursor.fetchone()
        if not vol:
            return {"error": "分卷大纲不存在"}
        vol = dict(vol)

        # 项目信息
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())

        # 角色
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

        ch_start = vol.get("chapter_start") or 1
        ch_end = vol.get("chapter_end") or 30

        # 已有章纲
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective
               FROM chapter_outlines WHERE project_id=?
               AND chapter_number >= ? AND chapter_number <= ?
               ORDER BY chapter_number""",
            (project_id, ch_start, ch_end),
        )
        existing = [dict(r) for r in await cursor.fetchall()]

        # 卷前最近 5 章正文
        cursor = await db.execute(
            """SELECT chapter_number, title, content, summary
               FROM chapters WHERE project_id=? AND content != '' AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, ch_start),
        )
        recent_chapters = [dict(r) for r in reversed(await cursor.fetchall())]

        # 活跃伏笔
        cursor = await db.execute(
            "SELECT description, planted_chapter, expected_reveal_chapter, importance FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
            (project_id,),
        )
        foreshadowings = [dict(r) for r in await cursor.fetchall()]

        # 角色快照
        cursor = await db.execute(
            """SELECT cs.character_name, cs.current_state, cs.chapter_number
               FROM character_snapshots cs
               INNER JOIN (
                   SELECT character_name, MAX(chapter_number) as max_ch
                   FROM character_snapshots
                   WHERE project_id=? AND chapter_number < ?
                   GROUP BY character_name
               ) latest ON cs.character_name=latest.character_name
                      AND cs.chapter_number=latest.max_ch
               WHERE cs.project_id=? AND cs.chapter_number < ?
               ORDER BY cs.character_name""",
            (project_id, ch_start, project_id, ch_start),
        )
        snapshots = [dict(r) for r in await cursor.fetchall()]

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}

## 本卷信息
- 卷名：{vol.get('volume_name', '')}
- 概要：{vol.get('summary', '')}
- 核心事件：{vol.get('core_events', '')}
- 情感基调：{vol.get('emotional_tone', '')}
- 关键转折：{vol.get('key_turning_point', '')}
- 章节范围：第 {ch_start} 章 ~ 第 {ch_end} 章"""

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if existing:
        context += "\n\n## 已有章纲（请在此基础上补充/优化）"
        for o in existing:
            context += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    if recent_chapters:
        context += "\n\n## 前文内容（卷前最近 5 章）"
        for ch in recent_chapters:
            summary = ch.get("summary") or ch.get("content", "")[:300]
            context += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"

    if snapshots:
        context += "\n\n## 角色最新状态"
        for s in snapshots:
            context += f"\n- {s['character_name']}: {s['current_state']}（第{s['chapter_number']}章）"

    if foreshadowings:
        context += "\n\n## 活跃伏笔"
        for f in foreshadowings:
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章，预计第{f.get('expected_reveal_chapter', '?')}章回收）"

    context += f"""

## 输出格式
请为第 {ch_start} 章到第 {ch_end} 章各生成一条章纲，以 JSON 格式输出：
{{
    "outlines": [
        {{
            "chapter_number": {ch_start},
            "title": "章节标题",
            "core_objective": "本章核心目标（1-2句话）",
            "emotional_arc": "情感走向",
            "hooks": "悬念/钩子"
        }}
    ]
}}

## 要求
1. 每章的 core_objective 要具体，描述本章推进了什么剧情
2. 章与章之间要有连贯的递进关系
3. 注意节奏控制：高潮章、过渡章、铺垫章交替
4. 每 5-8 章设置一个小高潮，每 20-30 章设置一个大转折"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("batch_outline", ch_start=ch_start, ch_end=ch_end, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=4096)
        raw_text = extract_content(response)
    except Exception as e:
        logger.error("批量章纲生成 AI 调用失败: project=%s volume=%s", project_id, volume_id, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    try:
        data = extract_json(raw_text)
    except Exception:
        logger.error("批量章纲 JSON 解析失败: project=%s volume=%s", project_id, volume_id, exc_info=True)
        return {"error": f"JSON 解析失败: {raw_text[:300]}"}

    outlines = data.get("outlines", [])
    if not outlines:
        return {"error": "AI 未返回有效的章纲数据"}

    async with get_db_ctx() as db:
        for o in outlines:
            ch = o.get("chapter_number", 0)
            await db.execute(
                """INSERT INTO chapter_outlines
                   (project_id, chapter_number, volume_id, title, core_objective, emotional_arc, hooks)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(project_id, chapter_number) DO UPDATE SET
                   volume_id=excluded.volume_id,
                   title=excluded.title,
                   core_objective=excluded.core_objective,
                   emotional_arc=excluded.emotional_arc,
                   hooks=excluded.hooks,
                   version=version+1""",
                (project_id, ch, volume_id, o.get("title"), o.get("core_objective"),
                 o.get("emotional_arc"), o.get("hooks")),
            )
        await db.commit()

    return {"outlines": outlines, "count": len(outlines)}
