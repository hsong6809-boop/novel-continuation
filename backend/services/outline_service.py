"""章纲生成服务"""
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from services.context_service import load_shared_context
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def generate_outline_for_chapter(project_id: int, chapter: int,
                                       custom_instructions: str = None) -> dict:
    """AI 生成单章章纲 + 场景要点"""
    # 加载共享上下文
    shared = await load_shared_context(project_id, before_chapter=chapter)
    project = shared["project"]
    characters = shared["characters"]
    foreshadowings = shared["foreshadowings"]
    snapshots = shared["snapshots"]

    async with get_db_ctx() as db:
        # 前几章章纲
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective, emotional_arc, hooks
               FROM chapter_outlines WHERE project_id=? AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, chapter),
        )
        prev_outlines = [dict(r) for r in await cursor.fetchall()]
        prev_outlines.reverse()

        # 所属卷大纲
        cursor = await db.execute(
            """SELECT id, project_id, volume_number, volume_name, summary,
               core_events, emotional_tone, key_turning_point,
               chapter_start, chapter_end, internal_rhythm, volume_hook
               FROM volume_outlines WHERE project_id=?
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
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章，预计第{f.get('expected_reveal_chapter', '?')}章回收）"""

    context += """

## 输出格式
请以 JSON 格式输出，包含以下字段：
{
    "title": "章节标题",
    "core_objective": "情节描述（3-4句话，描述本章主要发生的事情和推进的剧情）",
    "hooks": "章末钩子（1句话，本章结尾的悬念或转折，驱动读者继续阅读）"
}"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("chapter_outline", chapter=chapter, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.7, max_tokens=2048)
        content = extract_content(response)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error("章纲生成 AI 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    try:
        data = extract_json(content)
    except Exception:
        logger.error("章纲 JSON 解析失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": f"AI 返回的内容无法解析为 JSON: {content[:200]}"}

    # 保存章纲
    async with get_db_ctx() as db:
        await db.execute(
            "DELETE FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        await db.execute(
            """INSERT INTO chapter_outlines (project_id, chapter_number, title, core_objective, hooks, source)
               VALUES (?, ?, ?, ?, ?, 'generated')""",
            (project_id, chapter, data.get("title"),
             data.get("core_objective"), data.get("hooks")),
        )
        await db.commit()

    return {
        "title": data.get("title"),
        "core_objective": data.get("core_objective"),
        "hooks": data.get("hooks"),
    }


async def batch_generate_outlines_for_volume(project_id: int, volume_id: int,
                                              custom_instructions: str = None) -> dict:
    """按卷批量生成章纲：只生成缺失的章纲，跳过已有的"""
    shared = await load_shared_context(project_id)
    characters = shared["characters"]
    foreshadowings = shared["foreshadowings"]
    snapshots = shared["snapshots"]

    async with get_db_ctx() as db:
        # 分卷大纲
        cursor = await db.execute(
            "SELECT id, project_id, volume_number, volume_name, summary, "
            "core_events, emotional_tone, key_turning_point, "
            "chapter_start, chapter_end, internal_rhythm, volume_hook "
            "FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        vol = await cursor.fetchone()
        if not vol:
            return {"error": "分卷大纲不存在"}
        vol = dict(vol)

        ch_start = vol.get("chapter_start") or 1
        ch_end = vol.get("chapter_end") or 30

        # 已有章纲 — 找出哪些章节已有
        cursor = await db.execute(
            """SELECT chapter_number, source FROM chapter_outlines WHERE project_id=?
               AND chapter_number >= ? AND chapter_number <= ?
               ORDER BY chapter_number""",
            (project_id, ch_start, ch_end),
        )
        existing_rows = [dict(r) for r in await cursor.fetchall()]
        existing_numbers = {r["chapter_number"] for r in existing_rows}

    # 计算缺失章节
    all_chapters = set(range(ch_start, ch_end + 1))
    missing_numbers = sorted(all_chapters - existing_numbers)

    if not missing_numbers:
        return {
            "outlines": [],
            "count": 0,
            "skipped": len(existing_numbers),
            "message": "本卷章纲已完整，无需生成",
        }

    # 卷前最近 5 章正文
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT chapter_number, title, content, summary
               FROM chapters WHERE project_id=? AND content != '' AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, ch_start),
        )
        recent_chapters = [dict(r) for r in reversed(await cursor.fetchall())]

    project = shared["project"]

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

    # 告知AI已有章纲（作为参考，不覆盖）
    if existing_rows:
        async with get_db_ctx() as db:
            cursor = await db.execute(
                """SELECT chapter_number, title, core_objective
                   FROM chapter_outlines WHERE project_id=?
                   AND chapter_number >= ? AND chapter_number <= ?
                   ORDER BY chapter_number""",
                (project_id, ch_start, ch_end),
            )
            existing_outlines = [dict(r) for r in await cursor.fetchall()]
        context += "\n\n## 已有章纲（仅供参考，请勿重复生成）"
        for o in existing_outlines:
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

    # 只请求缺失章节的章纲
    missing_str = ", ".join(str(n) for n in missing_numbers)
    context += f"""

## 输出格式
请只为以下缺失章纲的章节生成章纲（第{missing_str}章），以 JSON 格式输出：
{{
    "outlines": [
        {{
            "chapter_number": {missing_numbers[0]},
            "title": "章节标题",
            "core_objective": "情节描述（3-4句话，描述本章主要发生的事情和推进的剧情）",
            "hooks": "章末钩子（1句话，本章结尾的悬念或转折）"
        }}
    ]
}}

## 要求
1. 只生成上述列出的缺失章节，不要生成已有章纲的章节
2. 每章的 core_objective 要具体，3-4句话
3. hooks 要简洁有力，1句话
4. 与已有章纲保持连贯的递进关系"""

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

    # 只保存确实缺失的章节
    saved = []
    async with get_db_ctx() as db:
        for o in outlines:
            ch = o.get("chapter_number", 0)
            if ch not in missing_numbers:
                continue  # 跳过AI误生成的已有章节
            await db.execute(
                """INSERT INTO chapter_outlines
                   (project_id, chapter_number, volume_id, title, core_objective, hooks, source)
                   VALUES (?, ?, ?, ?, ?, ?, 'generated')
                   ON CONFLICT(project_id, chapter_number) DO UPDATE SET
                   volume_id=excluded.volume_id,
                   title=excluded.title,
                   core_objective=excluded.core_objective,
                   hooks=excluded.hooks,
                   source='generated',
                   version=version+1""",
                (project_id, ch, volume_id, o.get("title"),
                 o.get("core_objective"), o.get("hooks")),
            )
            saved.append(o)
        await db.commit()

    return {
        "outlines": saved,
        "count": len(saved),
        "skipped": len(existing_numbers),
    }
