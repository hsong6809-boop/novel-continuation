"""上下文构建服务 - 为续写和章纲生成提供上下文"""
from models.database import get_db
from utils.prompt_manager import format_prompt


async def _load_project(project_id: int) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        return dict(row) if row else {}
    finally:
        await db.close()


async def _load_recent_chapters(project_id: int, count: int = 15) -> list:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT chapter_number, title, content, word_count, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number DESC LIMIT ?""",
            (project_id, count),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in reversed(rows)]
    finally:
        await db.close()


async def _load_outline(project_id: int, chapter: int) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        return dict(row) if row else {}
    finally:
        await db.close()


async def _load_scenes(project_id: int, chapter: int) -> list:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


async def _load_characters(project_id: int) -> list:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name, role, personality, speech_style, background FROM characters WHERE project_id=?",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


async def _load_style(project_id: int) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else {}
    finally:
        await db.close()


async def _load_active_foreshadowing(project_id: int) -> list:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


async def _load_timeline(project_id: int, limit: int = 10) -> list:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM timeline WHERE project_id=? ORDER BY chapter_number DESC LIMIT ?",
            (project_id, limit),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in reversed(rows)]
    finally:
        await db.close()


async def _load_character_snapshots(project_id: int, up_to_chapter: int) -> list:
    """加载每个角色在最近章节中的最新状态快照"""
    db = await get_db()
    try:
        # 获取每个角色在 up_to_chapter 之前（含）的最新快照
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
            (project_id, up_to_chapter, project_id, up_to_chapter),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


async def build_write_preview(project_id: int, chapter: int) -> dict:
    """构建续写向导的预览信息"""
    project = await _load_project(project_id)
    outline = await _load_outline(project_id, chapter)
    scenes = await _load_scenes(project_id, chapter)
    recent = await _load_recent_chapters(project_id, 15)
    style = await _load_style(project_id)
    foreshadowing = await _load_active_foreshadowing(project_id)
    timeline = await _load_timeline(project_id)
    characters = await _load_characters(project_id)
    snapshots = await _load_character_snapshots(project_id, chapter - 1)

    recent_range = ""
    if recent:
        recent_range = f"第{recent[0]['chapter_number']}章 ~ 第{recent[-1]['chapter_number']}章"

    # 估算 token
    total_chars = sum(len(ch.get("content", "")) for ch in recent)
    estimated_tokens = int(total_chars * 0.5) + 2000

    return {
        "chapter_number": chapter,
        "outline": outline if outline else None,
        "scenes": scenes,
        "style_params": style if style else None,
        "active_foreshadowing": foreshadowing,
        "recent_timeline": timeline,
                "character_snapshots": snapshots,
        "context_range": recent_range or "暂无前文",
        "estimated_tokens": estimated_tokens,
        "recent_chapters": recent,
        "characters": characters,
        "project": project,
    }


async def build_continuation_messages(project_id: int, chapter: int,
                                      custom_instructions: str = None) -> list:
    """构建续写的完整消息列表"""
    preview = await build_write_preview(project_id, chapter)
    project = preview.get("project", {})

    # 构建上下文数据块
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
