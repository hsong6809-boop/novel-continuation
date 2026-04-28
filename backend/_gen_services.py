"""一次性脚本：生成所有缺失的 service 文件"""
import os

SERVICES_DIR = os.path.join(os.path.dirname(__file__), "services")

files = {}

files["llm_client.py"] = r'''"""通用 LLM 调用客户端 - 从 settings.json 读取 API 配置"""
import json
import httpx
from pathlib import Path
from config import BASE_DIR

SETTINGS_FILE = BASE_DIR / "data" / "settings.json"


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def get_active_config() -> dict:
    """返回当前激活的 provider 配置: { base_url, api_key, model }"""
    settings = _load_settings()
    provider_name = settings.get("active_provider", "")
    model_name = settings.get("active_model", "")
    providers = settings.get("api_providers", {})
    cfg = providers.get(provider_name, {})
    return {
        "base_url": cfg.get("base_url", ""),
        "api_key": cfg.get("api_key", ""),
        "model": model_name or cfg.get("default_model", ""),
    }


async def chat_completion(messages: list, model: str = None,
                          temperature: float = 0.7,
                          max_tokens: int = 4096) -> dict:
    """调用 OpenAI 兼容的 chat/completions 接口"""
    cfg = get_active_config()
    if not cfg["base_url"] or not cfg["api_key"]:
        raise ValueError("未配置 API Provider，请在设置页面填写 Base URL 和 API Key")
    if not cfg["model"]:
        raise ValueError("未选择模型，请在设置页面选择一个默认模型")

    use_model = model or cfg["model"]
    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": use_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


def extract_content(response: dict) -> str:
    """从 chat completion 响应中提取文本内容"""
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        return ""
'''

files["chat_service.py"] = r'''"""对话服务 - 与 AI 进行项目相关的辅助对话"""
from models.database import get_db
from services.llm_client import chat_completion, extract_content, get_active_config


async def handle_chat(project_id: int, message: str) -> dict:
    """处理对话请求"""
    # 1. 加载对话历史
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT role, content FROM chat_history WHERE project_id=? ORDER BY created_at",
            (project_id,),
        )
        history = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    # 2. 加载项目信息
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())
    finally:
        await db.close()

    # 3. 构建系统提示
    system_prompt = f"""你是一个专业的小说创作助手，正在帮助作者进行小说续写。
当前项目：{project.get('name', '未命名')}
类型：{project.get('genre', '未指定')}
简介：{project.get('description', '暂无')}
当前进度：第{project.get('current_chapter', 0)}章，约{project.get('current_words', 0)}字

你可以帮助作者讨论：
- 剧情走向和情节设计
- 角色塑造和人物关系
- 世界观设定
- 写作风格和技巧
- 章节大纲和结构

请用专业但友好的语气回答，给出具体可操作的建议。"""

    # 4. 构建消息列表
    messages = [{"role": "system", "content": system_prompt}]
    # 取最近20条历史
    for h in history[-20:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    # 5. 调用 LLM
    try:
        response = await chat_completion(messages, temperature=0.7, max_tokens=2048)
        reply = extract_content(response)
    except ValueError as e:
        reply = f"⚠️ 配置错误：{str(e)}"
    except Exception as e:
        reply = f"⚠️ 调用失败：{str(e)}"

    # 6. 保存到历史
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO chat_history (project_id, role, content) VALUES (?, ?, ?)",
            (project_id, "user", message),
        )
        await db.execute(
            "INSERT INTO chat_history (project_id, role, content) VALUES (?, ?, ?)",
            (project_id, "assistant", reply),
        )
        await db.commit()
    finally:
        await db.close()

    return {"reply": reply, "history": []}
'''

files["context_service.py"] = r'''"""上下文构建服务 - 为续写和章纲生成提供上下文"""
from models.database import get_db


async def _load_project(project_id: int) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        return dict(row) if row else {}
    finally:
        await db.close()


async def _load_recent_chapters(project_id: int, count: int = 5) -> list:
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


async def build_write_preview(project_id: int, chapter: int) -> dict:
    """构建续写向导的预览信息"""
    project = await _load_project(project_id)
    outline = await _load_outline(project_id, chapter)
    scenes = await _load_scenes(project_id, chapter)
    recent = await _load_recent_chapters(project_id, 5)
    style = await _load_style(project_id)
    foreshadowing = await _load_active_foreshadowing(project_id)
    timeline = await _load_timeline(project_id)
    characters = await _load_characters(project_id)

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
        "character_snapshots": [],
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

    system = f"""你是一个专业的小说续写 AI。请根据以下信息续写小说。

## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 目标字数：{project.get('target_words', 200000)}字

## 当前任务
续写第{chapter}章"""

    outline = preview.get("outline")
    if outline:
        system += f"""

## 第{chapter}章大纲
- 标题：{outline.get('title', '未定')}
- 核心目标：{outline.get('core_objective', '无')}
- 情感弧线：{outline.get('emotional_arc', '无')}
- 钩子/悬念：{outline.get('hooks', '无')}"""

    scenes = preview.get("scenes", [])
    if scenes:
        system += "\n\n## 场景要点"
        for s in scenes:
            system += f"\n- 场景{s['scene_order']}: {s.get('mission', '')} (氛围: {s.get('atmosphere', '')})"

    characters = preview.get("characters", [])
    if characters:
        system += "\n\n## 主要角色"
        for c in characters:
            system += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    style = preview.get("style_params")
    if style:
        system += f"""

## 风格要求
- 描写密度：{style.get('default_description_density', 3)}/5
- 对话比例：{style.get('default_dialogue_ratio', 3)}/5
- 节奏：{style.get('default_pacing', 'medium')}"""

    foreshadowing = preview.get("active_foreshadowing", [])
    if foreshadowing:
        system += "\n\n## 需要呼应的伏笔"
        for f in foreshadowing:
            system += f"\n- {f['description']} (重要性: {f.get('importance', 'normal')})"

    recent = preview.get("recent_chapters", [])
    if recent:
        system += "\n\n## 前文回顾"
        for ch in recent:
            summary = ch.get("summary") or ch.get("content", "")[:200]
            system += f"\n### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{summary}\n"

    if custom_instructions:
        system += f"\n\n## 额外要求\n{custom_instructions}"

    system += "\n\n请直接续写正文内容，不要输出章节标题或编号。保持与前文一致的风格和人物性格。目标字数约2500字。"

    messages = [{"role": "system", "content": system}]
    return messages
'''

files["continuation_service.py"] = r'''"""续写服务 - 生成章节正文"""
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from models.database import get_db
from services.llm_client import chat_completion, extract_content, get_active_config
from services.context_service import build_continuation_messages, build_write_preview


async def generate_chapter_content(project_id: int, chapter: int, data) -> dict:
    """执行正式续写"""
    # 检查章纲是否存在
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline = await cursor.fetchone()
    finally:
        await db.close()

    if not outline:
        raise HTTPException(400, f"第{chapter}章的章纲不存在，请先生成章纲")

    # 构建消息
    messages = await build_continuation_messages(
        project_id, chapter, data.custom_instructions
    )

    # 调用 LLM
    try:
        response = await chat_completion(messages, temperature=0.8, max_tokens=4096)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI 调用失败: {str(e)}")

    if not content:
        raise HTTPException(500, "AI 返回了空内容")

    word_count = len(content)

    # 保存或更新章节
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute(
                "UPDATE chapters SET content=?, word_count=?, status='draft' WHERE project_id=? AND chapter_number=?",
                (content, word_count, project_id, chapter),
            )
        else:
            await db.execute(
                """INSERT INTO chapters (project_id, chapter_number, content, word_count, status)
                   VALUES (?, ?, ?, ?, 'draft')""",
                (project_id, chapter, content, word_count),
            )
        await db.commit()

        # 更新项目进度
        cursor = await db.execute(
            "SELECT MAX(chapter_number) as max_ch FROM chapters WHERE project_id=? AND word_count > 0",
            (project_id,),
        )
        row = await cursor.fetchone()
        max_ch = row["max_ch"] if row else 0

        cursor = await db.execute(
            "SELECT SUM(word_count) as total FROM chapters WHERE project_id=?",
            (project_id,),
        )
        row = await cursor.fetchone()
        total_words = row["total"] or 0

        await db.execute(
            "UPDATE projects SET current_chapter=?, current_words=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (max_ch, total_words, project_id),
        )
        await db.commit()
    finally:
        await db.close()

    return {
        "chapter_number": chapter,
        "content": content,
        "word_count": word_count,
        "status": "draft",
    }
'''

files["outline_service.py"] = r'''"""章纲生成服务"""
import json
from fastapi import HTTPException
from models.database import get_db
from services.llm_client import chat_completion, extract_content


async def generate_outline_for_chapter(project_id: int, chapter: int,
                                       custom_instructions: str = None) -> dict:
    """AI 生成章纲 + 场景要点"""
    # 加载项目信息
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        project = dict(await cursor.fetchone())
    finally:
        await db.close()

    # 加载前几章的章纲作为上下文
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT chapter_number, title, core_objective, emotional_arc, hooks
               FROM chapter_outlines WHERE project_id=? AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 5""",
            (project_id, chapter),
        )
        prev_outlines = [dict(r) for r in await cursor.fetchall()]
        prev_outlines.reverse()
    finally:
        await db.close()

    # 加载角色信息
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name, role, personality FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    # 构建提示
    system = f"""你是一个专业的小说大纲策划师。请为第{chapter}章生成详细的章纲。

## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '')}
- 当前进度：第{project.get('current_chapter', 0)}章"""

    if prev_outlines:
        system += "\n\n## 前几章大纲"
        for o in prev_outlines:
            system += f"\n- 第{o['chapter_number']}章 {o.get('title', '')}: {o.get('core_objective', '')}"

    if characters:
        system += "\n\n## 主要角色"
        for c in characters:
            system += f"\n- {c['name']}({c.get('role', '')}): {c.get('personality', '')}"

    system += """

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
}

请直接输出 JSON，不要加 markdown 代码块标记。"""

    if custom_instructions:
        system += f"\n\n## 额外要求\n{custom_instructions}"

    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.7, max_tokens=2048)
        content = extract_content(response)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI 调用失败: {str(e)}")

    # 解析 JSON
    try:
        # 去除可能的 markdown 代码块标记
        clean = content.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1]
        if clean.endswith("```"):
            clean = clean.rsplit("```", 1)[0]
        clean = clean.strip()
        data = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(500, f"AI 返回的内容无法解析为 JSON: {content[:200]}")

    # 保存章纲
    db = await get_db()
    try:
        # 删除旧章纲
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

        # 保存场景要点
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
    finally:
        await db.close()

    return {
        "title": data.get("title"),
        "core_objective": data.get("core_objective"),
        "emotional_arc": data.get("emotional_arc"),
        "hooks": data.get("hooks"),
        "scenes": data.get("scenes", []),
    }
'''

files["meta_service.py"] = r'''"""元数据提取服务 - 从章节内容中提取角色状态、伏笔等"""
import json
from models.database import get_db
from services.llm_client import chat_completion, extract_content


async def extract_chapter_meta(project_id: int, chapter: int) -> dict:
    """从章节正文中提取元数据"""
    # 加载章节内容
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT content, title FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            return {"error": "章节不存在或无内容"}
        content = row["content"]
        title = row["title"] or ""
    finally:
        await db.close()

    if not content or len(content) < 100:
        return {"error": "章节内容过短，无法提取元数据"}

    # 加载角色列表
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT name, role FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()

    char_names = [c["name"] for c in characters] if characters else []

    system = f"""你是一个小说分析助手。请从以下章节内容中提取元数据。

## 章节信息
- 章节号：第{chapter}章
- 标题：{title}

## 已知角色
{', '.join(char_names) if char_names else '暂无角色信息'}

## 输出格式
请以 JSON 格式输出：
{{
    "character_snapshots": {{
        "角色名": "角色在本章的状态变化描述"
    }},
    "new_foreshadowings": [
        {{
            "description": "伏笔描述",
            "importance": "high/normal/low"
        }}
    ],
    "resolved_foreshadowings": [
        {{
            "description": "被解决的伏笔描述"
        }}
    ],
    "timeline": {{
        "story_time_description": "本章的时间描述",
        "summary": "本章时间线摘要"
    }}
}}

只提取确实存在的信息，不要编造。如果某项为空，返回空数组或空对象。
请直接输出 JSON，不要加 markdown 代码块标记。

## 章节内容（前3000字）
{content[:3000]}"""

    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=2048)
        raw = extract_content(response)
    except Exception as e:
        return {"error": f"AI 调用失败: {str(e)}"}

    # 解析 JSON
    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1]
        if clean.endswith("```"):
            clean = clean.rsplit("```", 1)[0]
        data = json.loads(clean.strip())
    except json.JSONDecodeError:
        return {"error": f"JSON 解析失败: {raw[:200]}"}

    # 保存角色快照
    snapshots = data.get("character_snapshots", {})
    if snapshots:
        db = await get_db()
        try:
            for char_name, state in snapshots.items():
                if state:
                    await db.execute(
                        """INSERT OR REPLACE INTO character_snapshots
                           (project_id, chapter_number, character_name, current_state)
                           VALUES (?, ?, ?, ?)""",
                        (project_id, chapter, char_name, state),
                    )
            await db.commit()
        finally:
            await db.close()

    # 保存伏笔
    new_foreshadowings = data.get("new_foreshadowings", [])
    if new_foreshadowings:
        db = await get_db()
        try:
            for fs in new_foreshadowings:
                await db.execute(
                    """INSERT INTO foreshadowing
                       (project_id, description, planted_chapter, importance, status)
                       VALUES (?, ?, ?, ?, 'active')""",
                    (project_id, fs["description"], chapter, fs.get("importance", "normal")),
                )
            await db.commit()
        finally:
            await db.close()

    # 保存时间线
    timeline = data.get("timeline", {})
    if timeline and timeline.get("story_time_description"):
        db = await get_db()
        try:
            await db.execute(
                """INSERT INTO timeline (project_id, chapter_number, story_time_description, summary)
                   VALUES (?, ?, ?, ?)""",
                (project_id, chapter, timeline["story_time_description"], timeline.get("summary")),
            )
            await db.commit()
        finally:
            await db.close()

    return data
'''

for fname, content in files.items():
    path = os.path.join(SERVICES_DIR, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  Created {fname} ({len(content)} bytes)")

print("All service files created!")
