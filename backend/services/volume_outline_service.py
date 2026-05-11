"""分卷大纲服务"""
import json
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def list_volume_outlines(project_id: int) -> list:
    """获取项目所有分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT id, volume_number, volume_name, summary, core_events,
               emotional_tone, key_turning_point, chapter_start, chapter_end,
               internal_rhythm, volume_hook, volume_end_state, phases
               FROM volume_outlines WHERE project_id=? ORDER BY volume_number""",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_volume_outline(project_id: int, volume_id: int) -> dict:
    """获取单个分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT id, volume_number, volume_name, summary, core_events,
               emotional_tone, key_turning_point, chapter_start, chapter_end,
               internal_rhythm, volume_hook, volume_end_state, phases
               FROM volume_outlines WHERE project_id=? AND id=?""",
            (project_id, volume_id),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "分卷大纲不存在"}
        return dict(row)


async def create_volume_outline(project_id: int, data: dict) -> dict:
    """手动创建分卷大纲"""
    async with get_db_ctx() as db:
        # 验证项目存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            return {"error": "项目不存在"}

        # 检查卷号是否重复
        cursor = await db.execute(
            "SELECT id FROM volume_outlines WHERE project_id=? AND volume_number=?",
            (project_id, data.get("volume_number")),
        )
        if await cursor.fetchone():
            return {"error": f"卷号 {data.get('volume_number')} 已存在"}

        cursor = await db.execute(
            """INSERT INTO volume_outlines
               (project_id, volume_number, volume_name, summary, core_events,
                emotional_tone, chapter_start, chapter_end)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id,
             data.get("volume_number", 1),
             data.get("name", f"第{data.get('volume_number', 1)}卷"),
             data.get("description"),
             data.get("core_events"),
             data.get("emotional_tone"),
             data.get("chapter_start"),
             data.get("chapter_end")),
        )
        await db.commit()
        vol_id = cursor.lastrowid

        cursor = await db.execute(
            "SELECT * FROM volume_outlines WHERE id=?", (vol_id,)
        )
        return dict(await cursor.fetchone())


async def update_volume_outline(project_id: int, volume_id: int, data: dict) -> dict:
    """更新分卷大纲"""
    async with get_db_ctx() as db:
        # 验证存在
        cursor = await db.execute(
            "SELECT id FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        if not await cursor.fetchone():
            return {"error": "分卷大纲不存在"}

        # 字段映射：前端 name → volume_name, description → summary
        field_map = {
            "name": "volume_name",
            "description": "summary",
            "summary": "summary",
            "volume_number": "volume_number",
            "core_events": "core_events",
            "emotional_tone": "emotional_tone",
            "key_turning_point": "key_turning_point",
            "chapter_start": "chapter_start",
            "chapter_end": "chapter_end",
            "internal_rhythm": "internal_rhythm",
            "volume_hook": "volume_hook",
        }
        fields = {}
        for k, v in data.items():
            db_key = field_map.get(k)
            if db_key:
                fields[db_key] = v

        if not fields:
            return {"error": "没有需要更新的字段"}

        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [volume_id, project_id]
        await db.execute(
            f"UPDATE volume_outlines SET {set_clause}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?",
            values,
        )
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM volume_outlines WHERE id=? AND project_id=?",
            (volume_id, project_id),
        )
        return dict(await cursor.fetchone())


async def delete_volume_outline(project_id: int, volume_id: int) -> dict:
    """删除分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT id FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        if not await cursor.fetchone():
            return {"error": "分卷大纲不存在"}
        await db.execute(
            "DELETE FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        await db.commit()
    return {"ok": True}


async def generate_next_volume(project_id: int) -> dict:
    """基于总纲 + 上一卷正文，生成下一分卷大纲"""
    async with get_db_ctx() as db:
        # 加载项目
        cursor = await db.execute(
            "SELECT id, name, genre, description, volume_summaries FROM projects WHERE id=?",
            (project_id,),
        )
        project_row = await cursor.fetchone()
        if not project_row:
            return {"error": "项目不存在"}
        project = dict(project_row)

        overall_outline = project.get("volume_summaries", "")

        # 加载已有分卷（按卷号排序）
        cursor = await db.execute(
            """SELECT id, volume_number, volume_name, summary, core_events,
               emotional_tone, key_turning_point, chapter_start, chapter_end,
               internal_rhythm, volume_hook
               FROM volume_outlines WHERE project_id=? ORDER BY volume_number""",
            (project_id,),
        )
        existing_volumes = [dict(r) for r in await cursor.fetchall()]

        # 加载角色
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

        # 加载活跃伏笔
        cursor = await db.execute(
            "SELECT description, planted_chapter, expected_reveal_chapter, importance "
            "FROM foreshadowing WHERE project_id=? AND status='active' ORDER BY planted_chapter",
            (project_id,),
        )
        foreshadowings = [dict(r) for r in await cursor.fetchall()]

    # 确定下一卷的卷号
    next_vol_number = (existing_volumes[-1]["volume_number"] + 1) if existing_volumes else 1

    # 上一卷的章末章节号
    prev_chapter_end = 0
    if existing_volumes:
        prev_chapter_end = existing_volumes[-1].get("chapter_end") or 0

    # 检查已有正文的起始章节是否被已有卷纲覆盖
    # 如果第一卷卷纲的 chapter_start > 已有正文的最小章节号，说明有章节未被覆盖，需要重新生成第一卷
    if existing_volumes and existing_volumes[0].get("chapter_start", 1) > 1:
        async with get_db_ctx() as db:
            cursor = await db.execute(
                "SELECT MIN(chapter_number) FROM chapters WHERE project_id=? AND content != ''",
                (project_id,),
            )
            min_ch_row = await cursor.fetchone()
            min_ch = min_ch_row[0] if min_ch_row and min_ch_row[0] else 1
        if min_ch < existing_volumes[0].get("chapter_start", 1):
            # 删除已有的第一卷卷纲，重新生成
            logger.info("第一卷卷纲未覆盖已有章节（%d-%d），重新生成第一卷", min_ch, existing_volumes[0].get("chapter_start", 1) - 1)
            async with get_db_ctx() as db:
                await db.execute(
                    "DELETE FROM volume_outlines WHERE project_id=? AND volume_number=1",
                    (project_id,),
                )
                await db.commit()
            existing_volumes = []
            next_vol_number = 1
            prev_chapter_end = 0

    # 根据场景加载核心输入：已有正文
    prev_chapter_content = ""
    is_first_volume = next_vol_number == 1

    if is_first_volume:
        # 第一卷：已有正文是核心输入，加载全部已有章节
        async with get_db_ctx() as db:
            cursor = await db.execute(
                """SELECT chapter_number, title, content, summary
                   FROM chapters WHERE project_id=? AND content != ''
                   ORDER BY chapter_number""",
                (project_id,),
            )
            all_chapters = [dict(r) for r in await cursor.fetchall()]
        if all_chapters:
            prev_chapter_content = "\n\n## 核心输入：已有正文（第一卷需基于这些内容展开）"
            for ch in all_chapters:
                # 新项目传入更多内容，信息密度更高
                content = ch.get("content", "")[:2000] if len(all_chapters) <= 10 else (ch.get("summary") or ch.get("content", "")[:800])
                prev_chapter_content += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content}\n"
            prev_chapter_end = all_chapters[-1]["chapter_number"]
    else:
        # 非第一卷：上一卷全部前文是核心输入
        if prev_chapter_end > 0:
            async with get_db_ctx() as db:
                cursor = await db.execute(
                    """SELECT chapter_number, title, content, summary
                       FROM chapters WHERE project_id=? AND content != ''
                       AND chapter_number <= ? AND chapter_number > ?
                       ORDER BY chapter_number""",
                    (project_id, prev_chapter_end, max(0, prev_chapter_end - 100)),
                )
                prev_chapters = [dict(r) for r in await cursor.fetchall()]
            if prev_chapters:
                prev_chapter_content = "\n\n## 核心输入：上一卷正文（本卷需基于这些内容衔接展开）"
                for ch in prev_chapters:
                    content = ch.get("summary") or ch.get("content", "")[:800]
                    prev_chapter_content += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content}\n"
        else:
            # 没有上一卷，取已有前文
            async with get_db_ctx() as db:
                cursor = await db.execute(
                    """SELECT chapter_number, title, content, summary
                       FROM chapters WHERE project_id=? AND content != ''
                       ORDER BY chapter_number""",
                    (project_id,),
                )
                prev_chapters = [dict(r) for r in await cursor.fetchall()]
            if prev_chapters:
                prev_chapter_content = "\n\n## 核心输入：已有正文"
                for ch in prev_chapters:
                    content = ch.get("summary") or ch.get("content", "")[:800]
                    prev_chapter_content += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content}\n"
                prev_chapter_end = prev_chapters[-1]["chapter_number"]

    # 确定新卷的起始章节
    new_ch_start = prev_chapter_end + 1

    # 构建 prompt
    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 本卷是第 {next_vol_number} 卷，从第 {new_ch_start} 章开始

## 辅助框架：总纲（不要重复总纲的内容，只以此为方向约束）
{overall_outline or '暂无总纲'}"""

    if existing_volumes:
        context += "\n\n## 已有分卷大纲"
        for v in existing_volumes:
            context += f"\n### 第{v['volume_number']}卷 {v.get('volume_name', '')}"
            context += f"\n- 章节范围：第{v.get('chapter_start', '?')}章 ~ 第{v.get('chapter_end', '?')}章"
            context += f"\n- 概要：{v.get('summary', '')}"
            context += f"\n- 核心事件：{v.get('core_events', '')}"
            context += f"\n- 情感基调：{v.get('emotional_tone', '')}"
            if v.get('volume_end_state'):
                context += f"\n- 卷末状态：{v.get('volume_end_state')}"

    context += prev_chapter_content

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if foreshadowings:
        context += "\n\n## 活跃伏笔"
        for f in foreshadowings:
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章）"

    context += f"""

## 输出要求
请为第 {next_vol_number} 卷生成分卷大纲。新卷从第 {new_ch_start} 章开始。
默认情节范围为 100 章（约 20 万字），这是网文一卷的标准篇幅。

请以 JSON 格式输出：
{{
    "volume_name": "卷名（简短有力，概括本卷主题）",
    "summary": "本卷概要（5-8句话，描述本卷的主要故事线和走向）",
    "core_events": "核心事件（本卷的关键事件和转折点，要具体）",
    "emotional_tone": "情感基调（本卷的主要情感氛围）",
    "key_turning_point": "关键转折（本卷最重要的剧情转折）",
    "chapter_start": {new_ch_start},
    "chapter_end": {new_ch_start + 99},
    "volume_end_state": {{
        "protagonist_level": "本卷结束时主角的实力/地位/状态",
        "side_characters": "核心配角的状态变化",
        "foreshadowing_progress": "关键伏笔的推进程度",
        "world_change": "世界观/势力格局的变化"
    }},
    "power_progression": "本卷主角变强的具体路径（分几个阶段、每次变强的方式和节点）",
    "key_reveals": ["本卷要揭示/回收的关键信息或伏笔1", "关键信息2"],
    "phases": [
        {{
            "phase_name": "阶段名（如：重生初期、势力初建、第一次大冲突）",
            "description": "本阶段的核心冲突和剧情走向",
            "chapter_range": "第{new_ch_start}-{new_ch_start + 19}章",
            "conflict": "本阶段的核心冲突是什么",
            "resolution": "冲突如何解决/推进",
            "protagonist_change": "本阶段结束后主角有什么变化（实力/地位/认知）"
        }}
    ],
    "volume_hook": "卷末钩子（本卷结尾的悬念，驱动读者看下一卷）"
}}

## 要求
1. 概要和核心事件要基于已有正文自然衔接，不要凭空编造
2. chapter_end 可以根据实际剧情需要调整（80-120章之间）
3. phases 至少包含5个阶段，每个阶段要有具体的核心冲突和解决方式，不要笼统
4. volume_end_state 要具体可衡量，不要用「变强了」「成长了」这类模糊描述
5. power_progression 要写清楚变强的路径和节点，不能笼统说「实力提升」"""

    system = format_prompt("volume_outline", count=1, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=8192)
        raw = extract_content(response)
    except Exception as e:
        logger.error("分卷大纲生成 AI 调用失败: project=%s", project_id, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    try:
        data = extract_json(raw)
    except Exception:
        logger.error("分卷大纲 JSON 解析失败: project=%s", project_id, exc_info=True)
        return {"error": f"JSON 解析失败: {raw[:300]}"}

    # 保存
    import json as _json
    phases_json = _json.dumps(data.get("phases", []), ensure_ascii=False) if data.get("phases") else None
    ves = data.get("volume_end_state")
    volume_end_state_json = _json.dumps(ves, ensure_ascii=False) if isinstance(ves, (dict, list)) else ves

    async with get_db_ctx() as db:
        cursor = await db.execute(
            """INSERT INTO volume_outlines
               (project_id, volume_number, volume_name, summary, core_events,
                emotional_tone, key_turning_point, chapter_start, chapter_end,
                internal_rhythm, volume_hook, volume_end_state, phases)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, next_vol_number,
             data.get("volume_name", f"第{next_vol_number}卷"),
             data.get("summary"), data.get("core_events"),
             data.get("emotional_tone"), data.get("key_turning_point"),
             data.get("chapter_start", new_ch_start),
             data.get("chapter_end", new_ch_start + 99),
             data.get("internal_rhythm"), data.get("volume_hook"),
             volume_end_state_json, phases_json),
        )
        await db.commit()
        vol_id = cursor.lastrowid

    return {
        "id": vol_id,
        "volume_number": next_vol_number,
        **data,
    }
