"""分卷大纲服务"""
import json
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


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

    # 上一卷的正文摘要（取最后10章）
    prev_chapter_content = ""
    if prev_chapter_end > 0:
        async with get_db_ctx() as db:
            cursor = await db.execute(
                """SELECT chapter_number, title, content, summary
                   FROM chapters WHERE project_id=? AND content != ''
                   AND chapter_number <= ? AND chapter_number > ?
                   ORDER BY chapter_number DESC LIMIT 10""",
                (project_id, prev_chapter_end, max(0, prev_chapter_end - 15)),
            )
            prev_chapters = [dict(r) for r in reversed(await cursor.fetchall())]
        if prev_chapters:
            prev_chapter_content = "\n\n## 上一卷正文摘要（最后10章）"
            for ch in prev_chapters:
                summary = ch.get("summary") or ch.get("content", "")[:300]
                prev_chapter_content += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"
    else:
        # 没有上一卷，取已有前文的最后10章
        async with get_db_ctx() as db:
            cursor = await db.execute(
                """SELECT chapter_number, title, content, summary
                   FROM chapters WHERE project_id=? AND content != ''
                   ORDER BY chapter_number DESC LIMIT 10""",
                (project_id,),
            )
            prev_chapters = [dict(r) for r in reversed(await cursor.fetchall())]
        if prev_chapters:
            prev_chapter_content = "\n\n## 已有正文（最后10章）"
            for ch in prev_chapters:
                summary = ch.get("summary") or ch.get("content", "")[:300]
                prev_chapter_content += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"
            prev_chapter_end = prev_chapters[-1]["chapter_number"]

    # 构建 prompt
    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}

## 总纲
{overall_outline or '暂无总纲'}"""

    if existing_volumes:
        context += "\n\n## 已有分卷大纲"
        for v in existing_volumes:
            context += f"\n### 第{v['volume_number']}卷 {v.get('volume_name', '')}"
            context += f"\n- 章节范围：第{v.get('chapter_start', '?')}章 ~ 第{v.get('chapter_end', '?')}章"
            context += f"\n- 概要：{v.get('summary', '')}"
            context += f"\n- 核心事件：{v.get('core_events', '')}"
            context += f"\n- 情感基调：{v.get('emotional_tone', '')}"

    context += prev_chapter_content

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if foreshadowings:
        context += "\n\n## 活跃伏笔"
        for f in foreshadowings:
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章）"

    # 确定新卷的起始章节
    new_ch_start = prev_chapter_end + 1

    context += f"""

## 输出要求
请为第 {next_vol_number} 卷生成分卷大纲。新卷从第 {new_ch_start} 章开始。

请以 JSON 格式输出：
{{
    "volume_name": "卷名（简短有力，概括本卷主题）",
    "summary": "本卷概要（3-5句话，描述本卷的主要故事线和走向）",
    "core_events": "核心事件（本卷的关键事件和转折点）",
    "emotional_tone": "情感基调（本卷的主要情感氛围）",
    "key_turning_point": "关键转折（本卷最重要的剧情转折）",
    "chapter_start": {new_ch_start},
    "chapter_end": {new_ch_start + 29},
    "internal_rhythm": "内部节奏（本卷的张弛安排）",
    "volume_hook": "卷末钩子（本卷结尾的悬念，驱动读者看下一卷）"
}}

## 要求
1. 概要和核心事件要基于总纲和上一卷的剧情自然衔接
2. chapter_end 可以根据实际剧情需要调整（20-40章之间）
3. 情感基调要与前文有递进变化，避免重复"""

    system = format_prompt("volume_outline", count=1, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=2048)
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
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """INSERT INTO volume_outlines
               (project_id, volume_number, volume_name, summary, core_events,
                emotional_tone, key_turning_point, chapter_start, chapter_end,
                internal_rhythm, volume_hook)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, next_vol_number,
             data.get("volume_name", f"第{next_vol_number}卷"),
             data.get("summary"), data.get("core_events"),
             data.get("emotional_tone"), data.get("key_turning_point"),
             data.get("chapter_start", new_ch_start),
             data.get("chapter_end", new_ch_start + 29),
             data.get("internal_rhythm"), data.get("volume_hook")),
        )
        await db.commit()
        vol_id = cursor.lastrowid

    return {
        "id": vol_id,
        "volume_number": next_vol_number,
        **data,
    }
