"""自审服务 - 续写完成后自动审查章节质量"""
import logging
from models.database import get_db_ctx
from services.llm_client import chat_completion, extract_content
from utils.prompt_manager import format_prompt

logger = logging.getLogger(__name__)

REVIEW_PROMPT = """你是一个专业的小说编辑。请审查以下章节内容，检查是否存在以下问题：

1. **人物不一致**：角色性格、说话方式与之前不一致
2. **剧情矛盾**：与前文设定或已埋伏笔矛盾
3. **节奏问题**：过快/过慢、过渡生硬
4. **文笔问题**：重复用词、病句、描写单薄
5. **悬念处理**：钩子不够、伏笔遗忘

## 审查要求
- 如果没有问题，overall_verdict 为 "pass"
- 如果有小问题但不影响发布，overall_verdict 为 "minor_issues"
- 如果有严重问题需要修改，overall_verdict 为 "needs_revision"
- issues 数组中只列出确实存在的问题，不要编造

请以 JSON 格式输出：
{{
    "overall_verdict": "pass/minor_issues/needs_revision",
    "issues": [
        {{
            "type": "人物不一致/剧情矛盾/节奏问题/文笔问题/悬念处理",
            "severity": "high/medium/low",
            "description": "问题描述",
            "suggestion": "修改建议"
        }}
    ],
    "summary": "总体评价（1-2句话）"
}}"""


async def review_chapter(project_id: int, chapter: int) -> dict:
    """审查指定章节"""
    async with get_db_ctx() as db:
        # 加载章节内容
        cursor = await db.execute(
            "SELECT content, title FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        ch_row = await cursor.fetchone()
        if not ch_row or not ch_row["content"]:
            return {"error": "章节不存在或无内容"}

        content = ch_row["content"]
        title = ch_row["title"] or ""

        # 加载章纲
        cursor = await db.execute(
            "SELECT id, chapter_number, title, core_objective, emotional_arc, "
            "hooks, rhythm_type, chapter_opening FROM chapter_outlines "
            "WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline_row = await cursor.fetchone()
        outline = dict(outline_row) if outline_row else {}

        # 加载前 3 章摘要
        cursor = await db.execute(
            """SELECT chapter_number, title, summary FROM chapters
               WHERE project_id=? AND content != '' AND chapter_number < ?
               ORDER BY chapter_number DESC LIMIT 3""",
            (project_id, chapter),
        )
        prev_chapters = [dict(r) for r in reversed(await cursor.fetchall())]

        # 加载角色信息
        cursor = await db.execute(
            "SELECT name, personality, speech_style FROM characters WHERE project_id=?",
            (project_id,),
        )
        characters = [dict(r) for r in await cursor.fetchall()]

    # 构建审查上下文
    context = f"""## 章节信息
- 章节号：第{chapter}章
- 标题：{title}

## 章纲要求
- 核心目标：{outline.get('core_objective', '无')}
- 情感弧线：{outline.get('emotional_arc', '无')}
- 钩子/悬念：{outline.get('hooks', '无')}
- 节奏类型：{outline.get('rhythm_type', '未指定')}"""

    if prev_chapters:
        context += "\n\n## 前文摘要"
        for ch in prev_chapters:
            context += f"\n- 第{ch['chapter_number']}章 {ch.get('title', '')}: {ch.get('summary', '无摘要')}"

    if characters:
        context += "\n\n## 角色设定"
        for c in characters:
            context += f"\n- {c['name']}: 性格={c.get('personality', '')}, 说话风格={c.get('speech_style', '')}"

    context += f"\n\n## 章节正文\n{content}"

    system = REVIEW_PROMPT
    messages = [{"role": "user", "content": f"{system}\n\n{context}"}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=2048)
        raw = extract_content(response)
    except Exception as e:
        logger.error("自审 AI 调用失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": f"AI 审查失败: {str(e)}"}

    # 解析 JSON
    from utils.json_parser import extract_json
    try:
        data = extract_json(raw)
    except Exception:
        logger.error("自审 JSON 解析失败: project=%s chapter=%s", project_id, chapter, exc_info=True)
        return {"error": f"JSON 解析失败: {raw[:200]}"}

    # 保存审查状态
    verdict = data.get("overall_verdict", "pass")
    async with get_db_ctx() as db:
        await db.execute(
            "UPDATE chapters SET self_review_status=? WHERE project_id=? AND chapter_number=?",
            (verdict, project_id, chapter),
        )
        await db.commit()

    invalidate_project(project_id)
    return data
