"""上下文构建服务 - 为续写和章纲生成提供上下文"""
from models.database import get_db_ctx
from utils.prompt_manager import format_prompt


async def _load_all_context(project_id: int, chapter: int, recent_count: int = 15) -> dict:
    """一次性加载所有上下文数据（共享连接）"""
    async with get_db_ctx() as db:
        # 项目信息
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project_row = await cursor.fetchone()
        project = dict(project_row) if project_row else {}

        # 章纲
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline_row = await cursor.fetchone()
        outline = dict(outline_row) if outline_row else {}

        # 场景要点
        cursor = await db.execute(
            "SELECT * FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        scenes = [dict(r) for r in await cursor.fetchall()]

        # 最近章节
        cursor = await db.execute(
            """SELECT chapter_number, title, content, word_count, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number DESC LIMIT ?""",
            (project_id, recent_count),
        )
        recent_rows = await cursor.fetchall()
        recent = [dict(r) for r in reversed(recent_rows)]

        # 风格
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        style_row = await cursor.fetchone()
        style = dict(style_row) if style_row else {}

        # 活跃伏笔
        cursor = await db.execute(
            "SELECT * FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
            (project_id,),
        )
        foreshadowing = [dict(r) for r in await cursor.fetchall()]

        # 时间线
        cursor = await db.execute(
            "SELECT * FROM timeline WHERE project_id=? ORDER BY chapter_number DESC LIMIT 10",
            (project_id,),
        )
        timeline_rows = await cursor.fetchall()
        timeline = [dict(r) for r in reversed(timeline_rows)]

        # 角色
        cursor = await db.execute(
            "SELECT name, role, personality, speech_style, background FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

        # 角色快照（每个角色最新）
        cursor = await db.execute(
            """SELECT cs.character_name, cs.current_state, cs.chapter_number
               FROM character_snapshots cs
               INNER JOIN (
                   SELECT character_name, MAX(chapter_number) as max_ch
                   FROM character_snapshots
                   WHERE project_id=? AND chapter_number<=?
                   GROUP BY character_name
               ) latest ON cs.character_name=latest.character_name
                      AND cs.chapter_number=latest.max_ch
               WHERE cs.project_id=? AND cs.chapter_number<=?
               ORDER BY cs.character_name""",
            (project_id, chapter - 1, project_id, chapter - 1),
        )
        snapshots = [dict(r) for r in await cursor.fetchall()]

    return {
        "project": project,
        "outline": outline,
        "scenes": scenes,
        "recent": recent,
        "style": style,
        "foreshadowing": foreshadowing,
        "timeline": timeline,
        "characters": characters,
        "snapshots": snapshots,
    }


async def build_write_preview(project_id: int, chapter: int) -> dict:
    """构建续写向导的预览信息"""
    ctx = await _load_all_context(project_id, chapter)
    recent = ctx["recent"]

    recent_range = ""
    if recent:
        recent_range = f"第{recent[0]['chapter_number']}章 ~ 第{recent[-1]['chapter_number']}章"

    total_chars = sum(len(ch.get("content", "")) for ch in recent)
    estimated_tokens = int(total_chars * 0.5) + 2000

    return {
        "chapter_number": chapter,
        "outline": ctx["outline"] if ctx["outline"] else None,
        "scenes": ctx["scenes"],
        "style_params": ctx["style"] if ctx["style"] else None,
        "active_foreshadowing": ctx["foreshadowing"],
        "recent_timeline": ctx["timeline"],
        "character_snapshots": ctx["snapshots"],
        "context_range": recent_range or "暂无前文",
        "estimated_tokens": estimated_tokens,
        "recent_chapters": recent,
        "characters": ctx["characters"],
        "project": ctx["project"],
    }


async def build_continuation_messages(project_id: int, chapter: int,
                                      custom_instructions: str = None) -> list:
    """构建续写的完整消息列表"""
    preview = await build_write_preview(project_id, chapter)
    project = preview.get("project", {})

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 目标字数：{project.get('target_words', 200000)}字

## 当前任务
续写第{chapter}章"""

    outline = preview.get("outline")
    if outline:
        context += f"""

## 第{chapter}章大纲
- 标题：{outline.get('title', '未定')}
- 核心目标：{outline.get('core_objective', '无')}
- 情感弧线：{outline.get('emotional_arc', '无')}
- 钩子/悬念：{outline.get('hooks', '无')}"""

    scenes = preview.get("scenes", [])
    if scenes:
        context += "\n\n## 场景要点"
        for s in scenes:
            context += f"\n- 场景{s['scene_order']}: {s.get('mission', '')} (氛围: {s.get('atmosphere', '')})"

    characters = preview.get("characters", [])
    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    snapshots = preview.get("character_snapshots", [])
    if snapshots:
        context += "\n\n## 角色最新状态"
        for s in snapshots:
            context += f"\n- {s['character_name']}: {s['current_state']}（第{s['chapter_number']}章）"

    style = preview.get("style_params")
    if style:
        context += f"""

## 风格要求
- 描写密度：{style.get('default_description_density', 3)}/5
- 对话比例：{style.get('default_dialogue_ratio', 3)}/5
- 节奏：{style.get('default_pacing', 'medium')}"""

    foreshadowing = preview.get("active_foreshadowing", [])
    if foreshadowing:
        context += "\n\n## 需要呼应的伏笔"
        for f in foreshadowing:
            context += f"\n- {f['description']} (重要性: {f.get('importance', 'normal')})"

    recent = preview.get("recent_chapters", [])
    if recent:
        context += "\n\n## 前文回顾"
        for ch in recent:
            summary = ch.get("summary") or ch.get("content", "")[:200]
            context += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"

    # FTS5 早期章节片段注入
    from services.fts_service import get_early_chapter_fragments
    early_fragments = await get_early_chapter_fragments(project_id, chapter)
    if early_fragments:
        context += "\n\n## 早期章节相关片段（供呼应参考）"
        for frag in early_fragments:
            context += f"\n### 第{frag['chapter_number']}章 {frag.get('title', '')}（片段）\n{frag['snippet']}\n"

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("continuation", chapter=chapter, context=context)
    messages = [{"role": "system", "content": system}]
    return messages
