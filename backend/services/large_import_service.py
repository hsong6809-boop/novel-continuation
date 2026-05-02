"""大文件导入处理服务 - 支持30万字分块处理"""
import json
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.json_parser import extract_json

logger = logging.getLogger(__name__)

CHUNK_SIZE = 50000  # 5万字一个chunk


def group_chapters_into_chunks(chapters: list, chunk_size: int = CHUNK_SIZE) -> list:
    """将章节按字数分组为chunks"""
    chunks = []
    current_chunk = []
    current_size = 0

    for ch in chapters:
        ch_len = len(ch.get("content", ""))
        if current_size + ch_len > chunk_size and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_size = 0
        current_chunk.append(ch)
        current_size += ch_len

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


async def process_chunk_outlines(project_id: int, chunk: list, chunk_index: int, total_chunks: int) -> dict:
    """处理单个chunk：生成章纲 + 提取元数据"""
    # 构建chunk内容文本
    chapters_text = ""
    for ch in chunk:
        title = ch.get("title") or f"第{ch['chapter_number']}章"
        content = ch["content"][:3000]  # 每章取前3000字
        chapters_text += f"\n\n【第{ch['chapter_number']}章】{title}\n{content}\n"

    context = f"""## 处理进度
正在处理第 {chunk_index + 1}/{total_chunks} 个分块
本分块包含第 {chunk[0]['chapter_number']} 章 到 第 {chunk[-1]['chapter_number']} 章，共 {len(chunk)} 章

## 章节内容
{chapters_text}

## 输出格式
请以 JSON 格式输出：
{{
    "outlines": [
        {{
            "chapter_number": 1,
            "title": "章节标题",
            "plot_description": "情节描述（3-4句话，描述本章主要发生的事情）",
            "chapter_hook": "章末钩子（1句话，本章结尾的悬念或转折）"
        }}
    ],
    "characters": [
        {{
            "name": "角色名",
            "role": "主角/配角/反派/龙套",
            "personality": "性格特征"
        }}
    ],
    "foreshadowings": [
        {{
            "description": "伏笔描述",
            "planted_chapter": 埋设章节号,
            "importance": "high/normal/low"
        }}
    ],
    "timeline": [
        {{
            "chapter_number": 1,
            "story_time_description": "时间描述",
            "summary": "本章时间线摘要"
        }}
    ],
    "settings_library": [
        {{
            "category": "设定类别（如：地理/势力/魔法体系/科技/社会制度/历史/生物/道具等）",
            "name": "设定名称",
            "description": "简要描述",
            "importance": "high/normal/low"
        }}
    ]
}}

## 要求
1. plot_description 要具体描述本章的主要情节发展，3-4句话
2. chapter_hook 要简洁有力，1句话概括本章留下的悬念
3. 只提取确实存在的信息，不要编造
4. 角色只提取有名字的重要角色
5. 设定库提取世界观设定、势力体系、关键规则、重要物品等，每条设定归类到合适的类别"""

    messages = [{"role": "user", "content": context}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=8192)
        raw = extract_content(response)
    except Exception as e:
        logger.error("分块处理 AI 调用失败: chunk=%d/%d", chunk_index + 1, total_chunks, exc_info=True)
        return {"error": f"AI 调用失败: {str(e)}"}

    try:
        data = extract_json(raw)
    except Exception:
        logger.error("分块处理 JSON 解析失败: chunk=%d/%d", chunk_index + 1, total_chunks, exc_info=True)
        return {"error": f"JSON 解析失败: {raw[:300]}"}

    return data


async def large_import_and_process(project_id: int) -> dict:
    """对已导入的所有章节执行分块处理（章纲+元数据）"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT chapter_number, title, content, word_count
               FROM chapters WHERE project_id=? AND content != ''
               ORDER BY chapter_number""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]

    if not chapters:
        return {"error": "没有可处理的章节"}

    total_chars = sum(len(ch.get("content", "")) for ch in chapters)
    chunks = group_chapters_into_chunks(chapters)

    result = {
        "total_chapters": len(chapters),
        "total_chars": total_chars,
        "total_chunks": len(chunks),
        "outlines": 0,
        "characters": 0,
        "foreshadowings": 0,
        "timeline": 0,
        "settings": 0,
        "chunk_results": [],
    }

    for i, chunk in enumerate(chunks):
        logger.info("处理分块 %d/%d: 第%d-%d章", i + 1, len(chunks),
                    chunk[0]["chapter_number"], chunk[-1]["chapter_number"])

        data = await process_chunk_outlines(project_id, chunk, i, len(chunks))

        if "error" in data:
            result["chunk_results"].append({
                "chunk": i + 1,
                "error": data["error"],
                "chapters": f"{chunk[0]['chapter_number']}-{chunk[-1]['chapter_number']}"
            })
            continue

        # 保存到数据库
        async with get_db_ctx() as db:
            # 保存章纲（简化格式：title + core_objective + hooks）
            for o in data.get("outlines", []):
                ch_num = o.get("chapter_number", 0)
                await db.execute(
                    """INSERT INTO chapter_outlines
                       (project_id, chapter_number, title, core_objective, hooks, source)
                       VALUES (?, ?, ?, ?, ?, 'extracted')
                       ON CONFLICT(project_id, chapter_number) DO UPDATE SET
                       title=excluded.title,
                       core_objective=excluded.core_objective,
                       hooks=excluded.hooks,
                       source='extracted'
                       WHERE source != 'manual'""",
                    (project_id, ch_num, o.get("title"),
                     o.get("plot_description"), o.get("chapter_hook")),
                )
                result["outlines"] += 1

            # 保存角色
            for c in data.get("characters", []):
                if not c.get("name"):
                    continue
                await db.execute(
                    """INSERT INTO characters
                       (project_id, name, role, personality)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(project_id, name) DO UPDATE SET
                       role=excluded.role, personality=excluded.personality""",
                    (project_id, c["name"], c.get("role"), c.get("personality")),
                )
                result["characters"] += 1

            # 保存伏笔
            for fs in data.get("foreshadowings", []):
                if not fs.get("description"):
                    continue
                # 检查是否已存在相同描述的伏笔（避免重复）
                cursor = await db.execute(
                    "SELECT id FROM foreshadowing WHERE project_id=? AND description=?",
                    (project_id, fs["description"]),
                )
                if not await cursor.fetchone():
                    await db.execute(
                        """INSERT INTO foreshadowing
                           (project_id, description, planted_chapter, importance, status)
                           VALUES (?, ?, ?, ?, 'active')""",
                        (project_id, fs["description"],
                         fs.get("planted_chapter", chunk[0]["chapter_number"]),
                         fs.get("importance", "normal")),
                    )
                    result["foreshadowings"] += 1

            # 保存时间线
            for t in data.get("timeline", []):
                if not t.get("story_time_description"):
                    continue
                await db.execute(
                    """INSERT INTO timeline
                       (project_id, chapter_number, story_time_description, summary)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(project_id, chapter_number)
                       DO UPDATE SET story_time_description=excluded.story_time_description,
                       summary=excluded.summary""",
                    (project_id, t["chapter_number"],
                     t["story_time_description"], t.get("summary")),
                )
                result["timeline"] += 1

            # 保存设定库
            for s in data.get("settings_library", []):
                if not s.get("name") or not s.get("category"):
                    continue
                await db.execute(
                    """INSERT INTO settings_library
                       (project_id, category, name, description, importance)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(project_id, category, name)
                       DO UPDATE SET description=excluded.description,
                       importance=excluded.importance,
                       updated_at=CURRENT_TIMESTAMP""",
                    (project_id, s["category"], s["name"],
                     s.get("description", ""), s.get("importance", "normal")),
                )
                result["settings"] += 1

            await db.commit()

        result["chunk_results"].append({
            "chunk": i + 1,
            "chapters": f"{chunk[0]['chapter_number']}-{chunk[-1]['chapter_number']}",
            "outlines": len(data.get("outlines", [])),
            "characters": len(data.get("characters", [])),
            "foreshadowings": len(data.get("foreshadowings", [])),
            "timeline": len(data.get("timeline", [])),
            "settings": len(data.get("settings_library", [])),
        })

    return result
