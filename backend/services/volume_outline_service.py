"""分卷大纲管理服务"""
import json
import logging
from fastapi import HTTPException
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)


async def list_volume_outlines(project_id: int) -> list:
    """获取项目所有分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT * FROM volume_outlines WHERE project_id=?
               ORDER BY volume_number""",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_volume_outline(project_id: int, volume_id: int) -> dict:
    """获取单个分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "分卷大纲不存在")
        return dict(row)


async def create_volume_outline(project_id: int, data: dict) -> dict:
    """新建分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT COALESCE(MAX(volume_number), 0) + 1 FROM volume_outlines WHERE project_id=?",
            (project_id,),
        )
        next_num = (await cursor.fetchone())[0]

        cursor = await db.execute(
            """INSERT INTO volume_outlines
               (project_id, volume_number, volume_name, summary, core_events,
                emotional_tone, key_turning_point, chapter_start, chapter_end)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, next_num,
             data.get("volume_name", f"第{next_num}卷"),
             data.get("summary", ""),
             data.get("core_events", ""),
             data.get("emotional_tone", ""),
             data.get("key_turning_point", ""),
             data.get("chapter_start"),
             data.get("chapter_end")),
        )
        await db.commit()
        new_id = cursor.lastrowid

    return await get_volume_outline(project_id, new_id)


async def update_volume_outline(project_id: int, volume_id: int, data: dict) -> dict:
    """更新分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT id FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "分卷大纲不存在")

        fields = []
        values = []
        for key in ("volume_number", "volume_name", "summary", "core_events",
                     "emotional_tone", "key_turning_point", "chapter_start", "chapter_end"):
            if key in data:
                fields.append(f"{key}=?")
                values.append(data[key])

        if fields:
            fields.append("updated_at=CURRENT_TIMESTAMP")
            values.extend([project_id, volume_id])
            await db.execute(
                f"UPDATE volume_outlines SET {', '.join(fields)} WHERE project_id=? AND id=?",
                values,
            )
            await db.commit()

    return await get_volume_outline(project_id, volume_id)


async def delete_volume_outline(project_id: int, volume_id: int):
    """删除分卷大纲"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "DELETE FROM volume_outlines WHERE project_id=? AND id=?",
            (project_id, volume_id),
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "分卷大纲不存在")


async def generate_volume_outlines(project_id: int, count: int = 5,
                                   custom_instructions: str = None) -> dict:
    """AI 基于总纲自动规划前 N 卷"""
    async with get_db_ctx() as db:
        # 项目信息
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())

        # 总纲
        overall = {}
        raw = project.get("volume_summaries")
        if raw:
            try:
                overall = json.loads(raw)
            except json.JSONDecodeError:
                pass

        # 角色
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

        # 已有章纲
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective
               FROM chapter_outlines WHERE project_id=?
               ORDER BY chapter_number""",
            (project_id,),
        )
        outlines = [dict(r) for r in await cursor.fetchall()]

        # 最近 10 章正文
        cursor = await db.execute(
            """SELECT chapter_number, title, content, summary
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number DESC LIMIT 10""",
            (project_id,),
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
                   WHERE project_id=?
                   GROUP BY character_name
               ) latest ON cs.character_name=latest.character_name
                      AND cs.chapter_number=latest.max_ch
               WHERE cs.project_id=?
               ORDER BY cs.character_name""",
            (project_id, project_id),
        )
        snapshots = [dict(r) for r in await cursor.fetchall()]

        # 时间线
        cursor = await db.execute(
            "SELECT chapter_number, story_time_description, summary FROM timeline WHERE project_id=? ORDER BY chapter_number DESC LIMIT 10",
            (project_id,),
        )
        timeline = [dict(r) for r in reversed(await cursor.fetchall())]

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 目标字数：{project.get('target_words', 200000)}"""

    if overall:
        context += f"\n\n## 总纲\n{json.dumps(overall, ensure_ascii=False, indent=2)}"

    if characters:
        context += "\n\n## 主要角色"
        for c in characters:
            context += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    if outlines:
        context += "\n\n## 已有章纲"
        for o in outlines:
            context += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    if recent_chapters:
        context += "\n\n## 前文内容（最近 10 章）"
        for ch in recent_chapters:
            summary = ch.get("summary") or ch.get("content", "")[:300]
            context += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"

    if foreshadowings:
        context += "\n\n## 活跃伏笔"
        for f in foreshadowings:
            context += f"\n- {f['description']}（埋设于第{f.get('planted_chapter', '?')}章，预计第{f.get('expected_reveal_chapter', '?')}章回收，重要性: {f.get('importance', 'normal')}）"

    if snapshots:
        context += "\n\n## 角色最新状态"
        for s in snapshots:
            context += f"\n- {s['character_name']}: {s['current_state']}（第{s['chapter_number']}章）"

    if timeline:
        context += "\n\n## 时间线"
        for t in timeline:
            context += f"\n- 第{t['chapter_number']}章：{t.get('story_time_description', '')} - {t.get('summary', '')}"

    context += f"""

## 要求
1. 规划前 {count} 卷，每卷包含 20-40 章（根据剧情需要灵活调整）
2. 不要预设全书总卷数，只规划当前这 {count} 卷
3. 每卷要有明确的核心事件和转折点
4. 卷与卷之间要有递进关系
5. 最后一卷可以是开放式结尾，为后续卷留空间

## 输出格式
请以 JSON 格式输出：
{{
    "volumes": [
        {{
            "volume_number": 1,
            "volume_name": "卷名",
            "summary": "本卷概要（2-3句话）",
            "core_events": "本卷核心事件描述",
            "emotional_tone": "情感基调",
            "key_turning_point": "关键转折点",
            "chapter_start": 1,
            "chapter_end": 30
        }}
    ]
}}"""

    if custom_instructions:
        context += f"\n\n## 额外要求\n{custom_instructions}"

    system = format_prompt("volume_outline", count=count, context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.5, max_tokens=8192)
        raw_text = extract_content(response)
    except Exception as e:
        logger.error("分卷大纲生成 AI 调用失败: project=%s", project_id, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    try:
        data = extract_json(raw_text)
    except Exception:
        logger.error("分卷大纲 JSON 解析失败: project=%s", project_id, exc_info=True)
        return {"error": f"JSON 解析失败: {raw_text[:300]}"}

    volumes = data.get("volumes", [])
    if not volumes:
        return {"error": "AI 未返回有效的卷数据"}

    async with get_db_ctx() as db:
        await db.execute(
            "DELETE FROM volume_outlines WHERE project_id=?", (project_id,)
        )
        for v in volumes:
            await db.execute(
                """INSERT INTO volume_outlines
                   (project_id, volume_number, volume_name, summary, core_events,
                    emotional_tone, key_turning_point, chapter_start, chapter_end)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (project_id, v.get("volume_number", 0), v.get("volume_name", ""),
                 v.get("summary", ""), v.get("core_events", ""),
                 v.get("emotional_tone", ""), v.get("key_turning_point", ""),
                 v.get("chapter_start"), v.get("chapter_end")),
            )
        await db.commit()

    return {"volumes": volumes, "count": len(volumes)}
