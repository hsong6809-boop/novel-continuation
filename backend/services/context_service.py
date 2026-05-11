"""上下文构建服务 - 为续写和章纲生成提供上下文"""
import asyncio
import logging
from models.database import get_db_ctx
from utils.prompt_manager import format_prompt
from utils.cache import (
    get_cached, set_cached,
    project_key, characters_ctx_key, foreshadowing_active_key, style_key,
    invalidate_project,
)

logger = logging.getLogger(__name__)


async def _load_project_info(db, project_id: int) -> dict:
    """加载项目信息（带缓存）"""
    cached = get_cached(project_key(project_id))
    if cached is not None:
        return cached
    cursor = await db.execute(
        "SELECT id, name, genre, description, model_provider, model_name, "
        "target_words, current_words, current_chapter, style_notes, "
        "volume_summaries, platform, notes, style_ref_chapters, created_at, updated_at "
        "FROM projects WHERE id=?", (project_id,)
    )
    row = await cursor.fetchone()
    result = dict(row) if row else {}
    if row:
        set_cached(project_key(project_id), result)
    return result


async def _load_characters(db, project_id: int) -> list:
    """加载角色列表（带缓存）"""
    cached = get_cached(characters_ctx_key(project_id))
    if cached is not None:
        return cached
    cursor = await db.execute(
        "SELECT name, role, personality, speech_style, background, appearance, "
        "relationships, spans_all_volumes FROM characters WHERE project_id=?",
        (project_id,),
    )
    result = [dict(r) for r in await cursor.fetchall()]
    set_cached(characters_ctx_key(project_id), result)
    return result


async def _load_active_foreshadowing(db, project_id: int) -> list:
    """加载活跃伏笔（带缓存）"""
    cached = get_cached(foreshadowing_active_key(project_id))
    if cached is not None:
        return cached
    cursor = await db.execute(
        "SELECT description, planted_chapter, expected_reveal_chapter, importance "
        "FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
        (project_id,),
    )
    result = [dict(r) for r in await cursor.fetchall()]
    set_cached(foreshadowing_active_key(project_id), result)
    return result


async def load_shared_context(project_id: int, before_chapter: int = None) -> dict:
    """加载各服务共用的基础上下文数据（共享连接）。

    Args:
        project_id: 项目ID
        before_chapter: 若指定，只加载该章之前的数据（用于章纲/分卷生成）

    Returns:
        dict with keys: project, characters, foreshadowings, snapshots
    """
    async with get_db_ctx() as db:
        # 项目信息（带缓存）
        project = await _load_project_info(db, project_id)

        # 角色（带缓存）
        characters = await _load_characters(db, project_id)

        # 活跃伏笔（带缓存）
        foreshadowings = await _load_active_foreshadowing(db, project_id)

        # 角色快照（每个角色最新）
        if before_chapter is not None:
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
                (project_id, before_chapter, project_id, before_chapter),
            )
        else:
            cursor = await db.execute(
                """SELECT cs.character_name, cs.current_state, cs.chapter_number
                   FROM character_snapshots cs
                   INNER JOIN (
                       SELECT character_name, MAX(chapter_number) as max_ch
                       FROM character_snapshots
                       WHERE project_id=?
                       GROUP BY character_name
                   ) latest ON cs.character_name=latest.character_name
                          AND cs.chapter_number=latest.max_ch
                   WHERE cs.project_id=?
                   ORDER BY cs.character_name""",
                (project_id, project_id),
            )
        snapshots = [dict(r) for r in await cursor.fetchall()]

    return {
        "project": project,
        "characters": characters,
        "foreshadowings": foreshadowings,
        "snapshots": snapshots,
    }


async def _load_all_context(project_id: int, chapter: int, recent_count: int = 15) -> dict:
    """一次性加载所有上下文数据（共享连接）"""
    async with get_db_ctx() as db:
        # 项目信息（带缓存）
        project = await _load_project_info(db, project_id)

        # 章纲
        cursor = await db.execute(
            "SELECT id, project_id, chapter_number, volume_id, title, "
            "core_objective, emotional_arc, hooks, core_conflict, rhythm_type, chapter_opening, "
            "version, created_at FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline_row = await cursor.fetchone()
        outline = dict(outline_row) if outline_row else {}

        # 场景要点
        cursor = await db.execute(
            "SELECT id, project_id, chapter_number, scene_order, mission, "
            "key_dialogue_hint, atmosphere, target_words_ratio, scene_type "
            "FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        scenes = [dict(r) for r in await cursor.fetchall()]

        # 最近章节（只取续写章节之前的）
        cursor = await db.execute(
            """SELECT chapter_number, title, content, word_count, summary
               FROM chapters WHERE project_id=? AND content != '' AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT ?""",
            (project_id, chapter, recent_count),
        )
        recent_rows = await cursor.fetchall()
        recent = [dict(r) for r in reversed(recent_rows)]

        # 风格
        cursor = await db.execute(
            "SELECT id, project_id, base_analysis, human_notes, "
            "default_description_density, default_dialogue_ratio, default_pacing "
            "FROM style_profiles WHERE project_id=?", (project_id,)
        )
        style_row = await cursor.fetchone()
        style = dict(style_row) if style_row else {}

        # 活跃伏笔（带缓存）
        foreshadowing = await _load_active_foreshadowing(db, project_id)

        # 时间线（只取续写章节之前的）
        cursor = await db.execute(
            "SELECT id, project_id, chapter_number, story_time_description, "
            "story_date, duration, summary FROM timeline WHERE project_id=? AND chapter_number < ? ORDER BY chapter_number DESC LIMIT 10",
            (project_id, chapter),
        )
        timeline_rows = await cursor.fetchall()
        timeline = [dict(r) for r in reversed(timeline_rows)]

        # 角色（带缓存）
        characters = await _load_characters(db, project_id)

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
    try:
        return await _build_write_preview_inner(project_id, chapter)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error("build_write_preview 失败: project=%s chapter=%s\n%s", project_id, chapter, tb)
        return {
            "chapter_number": chapter,
            "outline": None, "scenes": [], "style_params": None,
            "active_foreshadowing": [], "recent_timeline": [],
            "character_snapshots": [], "context_range": "暂无前文",
            "estimated_tokens": 0, "recent_chapters": [],
            "characters": [], "project": {},
            "context_summary": [],
            "_error": str(e),
        }


async def _build_write_preview_inner(project_id: int, chapter: int) -> dict:
    ctx = await _load_all_context(project_id, chapter)
    recent = ctx["recent"]

    recent_range = ""
    if recent:
        recent_range = f"第{recent[0]['chapter_number']}章 ~ 第{recent[-1]['chapter_number']}章"

    # 构建上下文构成摘要 + 精确 token 预估
    # token 预估基于实际发送给AI的内容逐项累加
    # 中文 BPE 约 1 字 = 1.2 tokens，取保守值
    CHARS_TO_TOKENS = 1.2
    est_chars = 0  # 累计实际发送的字符数
    summary = []

    # 1. 项目信息 + 系统提示模板（固定开销）
    fixed_chars = 300  # 项目信息 + 当前任务 + 系统提示词模板
    est_chars += fixed_chars
    summary.append({"name": "项目信息", "detail": ctx["project"].get("name", "未命名")})

    # 2. 章纲
    outline = ctx["outline"]
    if outline:
        oc = len(outline.get("title") or "") + len(outline.get("core_objective") or "") + len(outline.get("emotional_arc") or "") + len(outline.get("hooks") or "")
        est_chars += oc + 100  # +100 格式标记
        summary.append({"name": "章纲", "detail": outline.get("title") or f"第{chapter}章"})

    # 3. 场景要点
    scenes = ctx["scenes"]
    if scenes:
        sc = sum(len(s.get("mission") or "") + len(s.get("atmosphere") or "") for s in scenes) + len(scenes) * 50
        est_chars += sc
        summary.append({"name": "场景要点", "detail": f"{len(scenes)}个场景"})

    # 4. 角色设定
    chars = ctx["characters"]
    if chars:
        cc = sum(len(c.get("name") or "") + len(c.get("role") or "") + len(c.get("personality") or "") for c in chars) + len(chars) * 30
        est_chars += cc
        roles = {}
        for c in chars:
            r = c.get("role") or "其他"
            roles[r] = roles.get(r, 0) + 1
        role_str = "、".join(f"{v}个{k}" for k, v in roles.items())
        summary.append({"name": "角色设定", "detail": f"{len(chars)}人（{role_str}）"})

    # 5. 角色状态快照
    snapshots = ctx["snapshots"]
    if snapshots:
        snap_c = sum(len(s.get("current_state") or "") + len(s.get("character_name") or "") + 30 for s in snapshots)
        est_chars += snap_c
        summary.append({"name": "角色状态", "detail": f"{len(snapshots)}条快照"})

    # 6. 风格参考章节（每章前2000字）
    style_ref_str = ctx["project"].get("style_ref_chapters") or "1,2,3"
    try:
        style_ref_nums = [int(x.strip()) for x in style_ref_str.split(",") if x.strip().isdigit()]
    except (ValueError, AttributeError):
        style_ref_nums = [1, 2, 3]
    ref_label = ",".join(str(n) for n in style_ref_nums)

    style_ref_chars = 0
    if style_ref_nums:
        async with get_db_ctx() as db:
            placeholders = ",".join("?" * len(style_ref_nums))
            cursor = await db.execute(
                f"""SELECT chapter_number, content FROM chapters
                    WHERE project_id=? AND chapter_number IN ({placeholders}) AND content != ''
                    ORDER BY chapter_number""",
                [project_id] + style_ref_nums,
            )
            style_chs = [dict(r) for r in await cursor.fetchall()]
        for sc in style_chs:
            style_ref_chars += min(len(sc.get("content") or ""), 2000) + 100  # +100 格式标记
    est_chars += style_ref_chars
    summary.append({"name": "风格参考", "detail": f"第{ref_label}章文风锚定（{style_ref_chars}字）"})

    # 7. 活跃伏笔
    fs = ctx["foreshadowing"]
    if fs:
        fs_chars = sum(len(f.get("description") or "") + 40 for f in fs)
        est_chars += fs_chars
        summary.append({"name": "活跃伏笔", "detail": f"{len(fs)}条（{fs_chars}字）"})

    # 8. 前文回顾（全量正文，非摘要）
    recent_chars = 0
    if recent:
        for ch in recent:
            recent_chars += len(ch.get("content") or "") + len(ch.get("title") or "") + 50  # +50 格式标记
        est_chars += recent_chars
        summary.append({"name": "前文回顾", "detail": f"最近{len(recent)}章全文（{recent_chars}字）"})

    # 9. FTS5 早期片段 + 设定库（并行加载）
    from services.fts_service import get_early_chapter_fragments
    from services.settings_library_service import get_settings_for_context
    import asyncio
    early_frags, settings_text = await asyncio.gather(
        get_early_chapter_fragments(project_id, chapter),
        get_settings_for_context(project_id),
    )
    frag_chars = 0
    if early_frags:
        frag_chars = sum(len(f.get("snippet") or "") + len(f.get("title") or "") + 50 for f in early_frags)
        est_chars += frag_chars
        summary.append({"name": "早期片段", "detail": f"FTS5检索{len(early_frags)}段（{frag_chars}字）"})

    settings_chars = 0
    if settings_text:
        settings_chars = len(settings_text)
        est_chars += settings_chars
        setting_lines = [l for l in settings_text.strip().split("\n") if l.strip() and not l.startswith("#")]
        summary.append({"name": "世界观设定", "detail": f"{len(setting_lines)}条（{settings_chars}字）"})

    # 计算总 token
    estimated_tokens = int(est_chars * CHARS_TO_TOKENS)
    summary.append({"name": "总计", "detail": f"{est_chars}字 ≈ {estimated_tokens} tokens"})

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
        "context_summary": summary,
    }


async def build_continuation_messages(project_id: int, chapter: int,
                                      custom_instructions: str = None) -> list:
    """构建续写的完整消息列表 — 核心上下文：前文+章纲，其余为辅助"""
    preview = await build_write_preview(project_id, chapter)
    project = preview.get("project", {})

    import json as _json

    # ==========================================
    # 核心上下文1：前文（最近章节全文）
    # ==========================================
    context = ""
    recent = preview.get("recent_chapters", [])
    if recent:
        context += "## 前文\n"
        for ch in recent:
            context += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{ch.get('content', '')}\n"
    else:
        context += "## 前文\n（暂无前文）\n"

    # ==========================================
    # 核心上下文2：本章章纲
    # ==========================================
    outline = preview.get("outline")
    if outline:
        context += f"""

## 本章章纲（第{chapter}章）
- 标题：{outline.get('title', '未定')}
- 情节描述：{outline.get('core_objective', '无')}"""
        if outline.get('core_conflict'):
            context += f"""
- 核心矛盾：{outline.get('core_conflict')}"""
        if outline.get('hooks'):
            context += f"""
- 章末钩子：{outline.get('hooks')}"""
    else:
        context += f"\n\n## 本章章纲（第{chapter}章）\n（暂无章纲）"

    # ==========================================
    # 辅助信息
    # ==========================================
    context += "\n\n---\n\n## 辅助信息"

    # 所属卷纲阶段
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT volume_name, summary, volume_end_state, phases
               FROM volume_outlines WHERE project_id=?
               AND chapter_start <= ? AND chapter_end >= ?
               ORDER BY chapter_start DESC LIMIT 1""",
            (project_id, chapter, chapter),
        )
        vol_row = await cursor.fetchone()

    if vol_row:
        vol = dict(vol_row)
        vol_info = f"卷名：{vol.get('volume_name', '')}"
        if vol.get('summary'):
            vol_info += f" | 概要：{vol.get('summary', '')}"

        phases = vol.get('phases')
        if phases:
            if isinstance(phases, str):
                try:
                    phases = _json.loads(phases)
                except Exception:
                    pass
            if isinstance(phases, list):
                for p in phases:
                    if isinstance(p, dict):
                        prange = p.get('chapter_range', '')
                        try:
                            nums = [int(x.strip()) for x in prange.replace('第','').replace('章','').split('-') if x.strip().isdigit()]
                            if len(nums) == 2 and nums[0] <= chapter <= nums[1]:
                                vol_info += f" | 当前阶段：{p.get('phase_name', '')}（{prange}）"
                                if p.get('conflict'):
                                    vol_info += f" | 核心冲突：{p.get('conflict')}"
                                break
                        except Exception:
                            pass

        ves = vol.get('volume_end_state')
        if ves:
            if isinstance(ves, str):
                try:
                    ves = _json.loads(ves)
                except Exception:
                    pass
            if isinstance(ves, dict) and ves.get('protagonist_level'):
                vol_info += f" | 本卷变强目标：{ves.get('protagonist_level')}"

        context += f"\n- 所属卷纲：{vol_info}"

    # 主要角色 + 最新状态
    characters = preview.get("characters", [])
    snapshots = preview.get("character_snapshots", [])
    if characters:
        context += "\n- 主要角色："
        for c in characters:
            context += f" {c['name']}({c.get('role', '')})"
        if snapshots:
            context += " | 最新状态："
            for s in snapshots:
                context += f" {s['character_name']}={s['current_state']}"

    # 活跃伏笔（续写不加载，避免干扰；章纲生成时仍会加载）
    # foreshadowing = preview.get("active_foreshadowing", [])

    # 世界观设定
    from services.settings_library_service import get_settings_for_context
    settings_text = await get_settings_for_context(project_id)
    if settings_text:
        # 精简：只取前500字
        context += f"\n- 世界观：{settings_text[:500]}"

    if custom_instructions:
        context += f"\n- 额外要求：{custom_instructions}"

    system = format_prompt("continuation", chapter=chapter, context=context)
    messages = [{"role": "system", "content": system}]
    return messages
