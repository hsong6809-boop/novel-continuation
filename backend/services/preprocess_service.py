"""导入后预处理服务 - 从已导入章节中批量提取角色、伏笔、时间线"""
import json
from models.database import get_db
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json
from utils.prompt_manager import format_prompt


async def preprocess_imported_chapters(project_id: int) -> dict:
    """对所有已导入章节执行一次性预处理：角色档案 + 伏笔 + 时间线 + 分卷大纲"""
    # 加载项目信息
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())
    finally:
        await db.close()

    # 加载所有章节
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT chapter_number, title, content, word_count
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    if not chapters:
        return {"error": "没有可预处理的章节"}

    # 拼接所有章节内容（每章取前2000字，避免超长）
    chapters_text = ""
    for ch in chapters:
        title = ch.get("title") or f"第{ch['chapter_number']}章"
        content_preview = ch["content"][:2000]
        chapters_text += f"\n\n{'='*40}\n【第{ch['chapter_number']}章】{title}\n{'='*40}\n{content_preview}\n"

    # 限制总长度
    if len(chapters_text) > 30000:
        chapters_text = chapters_text[:30000]

    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '暂无')}
- 共 {len(chapters)} 章，从第{chapters[0]['chapter_number']}章到第{chapters[-1]['chapter_number']}章

## 分析要求

请从以下维度分析，并以 JSON 格式输出：

### 1. 角色档案 (characters)
识别所有有名字的角色，提取：
- name: 角色名
- role: 角色定位（主角/配角/反派/龙套等）
- personality: 性格特征（简短描述）
- appearance: 外貌特征（如有提及）
- background: 背景信息（如有提及）
- relationships: 与其他角色的关系
- speech_style: 说话风格（如有特色）

### 2. 伏笔 (foreshadowings)
识别文本中埋下的伏笔/悬念：
- description: 伏笔描述
- planted_chapter: 埋设章节号
- importance: 重要程度 (high/normal/low)

### 3. 时间线 (timeline)
每个章节的时间信息：
- chapter_number: 章节号
- story_time_description: 故事内时间描述（如"清晨"、"三天后"、"2024年冬天"）
- summary: 本章时间线摘要

### 4. 分卷大纲 (volume_outline)
基于已有内容，生成整体故事大纲：
- premise: 故事前提/核心设定
- main_conflict: 主要矛盾/冲突
- character_arcs: 主要角色弧线
- story_structure: 故事结构概述
- volumes: 分卷建议（每卷包含：卷名、起止章节、核心事件、情感基调）

## 章节内容
{chapters_text}"""

    system = format_prompt("preprocess", context=context)

    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=4096)
        raw = extract_content(response)
    except Exception as e:
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        data = extract_json(raw)
    except Exception:
        return {"error": f"JSON 解析失败: {raw[:300]}"}

    result = {"characters": 0, "foreshadowings": 0, "timeline": 0, "outline": False}

    # 保存角色档案
    characters = data.get("characters", [])
    if characters:
        db = await get_db()
        try:
            for c in characters:
                if not c.get("name"):
                    continue
                await db.execute(
                    """INSERT OR REPLACE INTO characters
                       (project_id, name, role, personality, appearance, background, relationships, speech_style)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (project_id, c["name"], c.get("role"), c.get("personality"),
                     c.get("appearance"), c.get("background"),
                     c.get("relationships"), c.get("speech_style")),
                )
                result["characters"] += 1
            await db.commit()
        finally:
            await db.close()

    # 保存伏笔
    foreshadowings = data.get("foreshadowings", [])
    if foreshadowings:
        db = await get_db()
        try:
            for fs in foreshadowings:
                if not fs.get("description"):
                    continue
                await db.execute(
                    """INSERT INTO foreshadowing
                       (project_id, description, planted_chapter, importance, status)
                       VALUES (?, ?, ?, ?, 'active')""",
                    (project_id, fs["description"],
                     fs.get("planted_chapter", chapters[0]["chapter_number"]),
                     fs.get("importance", "normal")),
                )
                result["foreshadowings"] += 1
            await db.commit()
        finally:
            await db.close()

    # 保存时间线
    timeline = data.get("timeline", [])
    if timeline:
        db = await get_db()
        try:
            for t in timeline:
                if not t.get("story_time_description"):
                    continue
                await db.execute(
                    """INSERT INTO timeline (project_id, chapter_number, story_time_description, summary)
                       VALUES (?, ?, ?, ?)""",
                    (project_id, t["chapter_number"],
                     t["story_time_description"], t.get("summary")),
                )
                result["timeline"] += 1
            await db.commit()
        finally:
            await db.close()

    # 保存分卷大纲到 project.volume_summaries
    volume_outline = data.get("volume_outline") or data.get("volumes")
    if volume_outline:
        outline_text = json.dumps(volume_outline, ensure_ascii=False, indent=2)
        db = await get_db()
        try:
            await db.execute(
                "UPDATE projects SET volume_summaries=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (outline_text, project_id),
            )
            await db.commit()
            result["outline"] = True
        finally:
            await db.close()

    return result
