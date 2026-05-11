"""对话服务 - 与 AI 进行项目相关的辅助对话（带完整上下文）"""
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.prompt_manager import format_prompt
from utils.cache import get_cached, set_cached, project_key, characters_key, foreshadowing_key

logger = logging.getLogger(__name__)

# 预设讨论模式
DISCUSSION_MODES = {
    "plot": {
        "label": "剧情讨论",
        "focus": """你专注于剧情设计和故事结构分析。请重点讨论：
- 情节的因果链和逻辑性
- 伏笔的埋设和回收策略
- 节奏控制和高潮安排
- 转折点的设计
- 与已有剧情的一致性""",
    },
    "character": {
        "label": "角色分析",
        "focus": """你专注于角色塑造和人物关系分析。请重点讨论：
- 角色性格的一致性和成长弧线
- 人物对话的个性化
- 角色之间的关系动态
- 角色动机的合理性
- 配角的立体化""",
    },
    "worldview": {
        "label": "世界观构建",
        "focus": """你专注于世界观设定和背景构建。请重点讨论：
- 设定的内在逻辑一致性
- 世界观的深度和广度
- 社会制度、文化、地理等设定
- 设定与剧情的有机融合
- 避免设定漏洞""",
    },
    "style": {
        "label": "风格指导",
        "focus": """你专注于写作风格和文学技巧分析。请重点讨论：
- 叙事视角的选择和运用
- 描写的密度和节奏
- 对话的自然度和功能
- 语言风格的一致性
- 修辞手法和意象运用""",
    },
}


async def handle_chat(project_id: int, message: str, mode: str = None) -> dict:
    """处理对话请求，注入完整项目上下文"""
    if not message or not message.strip():
        return {"reply": "消息不能为空", "history": []}

    # 1. 项目信息（优先从缓存读取）
    project = get_cached(project_key(project_id))

    # 2. 角色信息（优先从缓存读取）
    characters = get_cached(characters_key(project_id))

    # 3. 伏笔信息（优先从缓存读取）
    foreshadowings = get_cached(foreshadowing_key(project_id))

    async with get_db_ctx() as db:
        # 4. 加载对话历史
        cursor = await db.execute(
            "SELECT role, content FROM (SELECT role, content, created_at FROM chat_history WHERE project_id=? ORDER BY created_at DESC LIMIT 20) AS recent ORDER BY created_at",
            (project_id,),
        )
        history = [dict(r) for r in await cursor.fetchall()]

        # 5. 项目信息（缓存未命中时从 DB 加载）
        if project is None:
            cursor = await db.execute(
                "SELECT id, name, genre, description, model_provider, model_name, "
                "target_words, current_words, current_chapter, style_notes, "
                "volume_summaries, platform, notes, created_at, updated_at "
                "FROM projects WHERE id=?", (project_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return {"reply": "项目不存在", "history": []}
            project = dict(row)
            set_cached(project_key(project_id), project)

        # 6. 角色信息（缓存未命中时从 DB 加载）
        if characters is None:
            cursor = await db.execute(
                "SELECT name, role, personality, appearance, background, relationships, speech_style FROM characters WHERE project_id=?",
                (project_id,),
            )
            characters = [dict(r) for r in await cursor.fetchall()]
            set_cached(characters_key(project_id), characters)

        # 7. 伏笔信息（缓存未命中时从 DB 加载）
        if foreshadowings is None:
            cursor = await db.execute(
                "SELECT description, planted_chapter, expected_reveal_chapter, status, importance FROM foreshadowing WHERE project_id=? ORDER BY planted_chapter",
                (project_id,),
            )
            foreshadowings = [dict(r) for r in await cursor.fetchall()]
            set_cached(foreshadowing_key(project_id), foreshadowings)

        # 8. 加载时间线（最近10章）
        cursor = await db.execute(
            "SELECT chapter_number, story_time_description, summary FROM timeline WHERE project_id=? ORDER BY chapter_number DESC LIMIT 10",
            (project_id,),
        )
        timeline = [dict(r) for r in await cursor.fetchall()]
        timeline.reverse()

        # 9. 加载最近5章内容摘要
        cursor = await db.execute(
            "SELECT chapter_number, title, content, summary FROM chapters WHERE project_id=? ORDER BY chapter_number DESC LIMIT 5",
            (project_id,),
        )
        recent_chapters = [dict(r) for r in await cursor.fetchall()]
        recent_chapters.reverse()

        # 10. 加载章纲
        cursor = await db.execute(
            "SELECT chapter_number, title, core_objective, emotional_arc, hooks FROM chapter_outlines WHERE project_id=? ORDER BY chapter_number DESC LIMIT 10",
            (project_id,),
        )
        outlines = [dict(r) for r in await cursor.fetchall()]
        outlines.reverse()

    # 构建系统提示（连接已关闭，在内存中操作）
    context = f"""## 项目信息
- 书名：{project.get('name', '未命名')}
- 类型：{project.get('genre', '未指定')}
- 简介：{project.get('description', '暂无')}
- 当前进度：第{project.get('current_chapter', 0)}章，约{project.get('current_words', 0)}字
"""

    if characters:
        context += "\n## 主要角色\n"
        for c in characters:
            context += f"- {c['name']}（{c.get('role', '未知')}）：{c.get('personality', '')}，外貌：{c.get('appearance', '')}，背景：{c.get('background', '')}，关系：{c.get('relationships', '')}，说话风格：{c.get('speech_style', '')}\n"

    if foreshadowings:
        context += "\n## 伏笔线索\n"
        for f in foreshadowings:
            status = '已回收' if f.get('status') == 'resolved' else '待回收'
            context += f"- [{status}] {f['description']}（埋设于第{f.get('planted_chapter', '?')}章，预计第{f.get('expected_reveal_chapter', '?')}章回收）\n"

    if timeline:
        context += "\n## 最近时间线\n"
        for t in timeline:
            context += f"- 第{t['chapter_number']}章：{t.get('story_time_description', '')} - {t.get('summary', '')}\n"

    if recent_chapters:
        context += "\n## 最近章节内容\n"
        for ch in recent_chapters:
            content_preview = ch.get('content', '')[:500]
            context += f"### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content_preview}...\n\n"

    if outlines:
        context += "\n## 最近章纲\n"
        for o in outlines:
            context += f"### 第{o['chapter_number']}章 {o.get('title', '')}\n- 核心目标：{o.get('core_objective', '')}\n- 情感弧线：{o.get('emotional_arc', '')}\n- 钩子：{o.get('hooks', '')}\n\n"

    system_prompt = format_prompt("chat_system", context=context)

    # 注入讨论模式焦点
    if mode and mode in DISCUSSION_MODES:
        system_prompt += f"\n\n## 当前讨论模式：{DISCUSSION_MODES[mode]['label']}\n{DISCUSSION_MODES[mode]['focus']}"

    messages = [{"role": "system", "content": system_prompt}]
    for h in history[-20:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    # 调用 LLM
    reasoning = ""
    try:
        response = await chat_completion(messages, temperature=0.7, max_tokens=2048)
        reply = extract_content(response)
        # 提取思考过程
        try:
            reasoning = response["choices"][0]["message"].get("reasoning_content", "") or ""
        except (KeyError, IndexError):
            pass
    except ValueError as e:
        reply = f"⚠️ 配置错误：{str(e)}"
    except Exception as e:
        logger.error("对话 LLM 调用失败: project=%s", project_id, exc_info=True)
        reply = f"⚠️ 调用失败：{str(e)}"

    # 保存到历史（错误消息不保存，避免污染上下文）
    is_error = reply.startswith("⚠️")
    async with get_db_ctx() as db:
        await db.execute(
            "INSERT INTO chat_history (project_id, role, content) VALUES (?, ?, ?)",
            (project_id, "user", message),
        )
        if not is_error:
            await db.execute(
                "INSERT INTO chat_history (project_id, role, content) VALUES (?, ?, ?)",
                (project_id, "assistant", reply),
            )
        # 清理旧记录，保留最近200条
        await db.execute(
            """DELETE FROM chat_history WHERE project_id=? AND id NOT IN
               (SELECT id FROM chat_history WHERE project_id=?
                ORDER BY created_at DESC LIMIT 200)""",
            (project_id, project_id),
        )
        await db.commit()

    return {"reply": reply, "reasoning": reasoning, "history": []}
