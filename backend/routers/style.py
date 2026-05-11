"""风格管理路由"""
import logging
from fastapi import APIRouter, HTTPException
from models.database import get_db_ctx
from models.schemas import StyleProfileOut, StyleParamsUpdate
from ._common import _filter_fields, STYLE_FIELDS
from utils.cache import invalidate_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["style"])


@router.get("/{project_id}/style", response_model=StyleProfileOut)
async def get_style(project_id: int):
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "风格档案不存在")
        return dict(row)


@router.put("/{project_id}/style/params", response_model=StyleProfileOut)
async def update_style_params(project_id: int, data: StyleParamsUpdate):
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), STYLE_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id]
        await db.execute(
            f"UPDATE style_profiles SET {set_clause} WHERE project_id=?", values
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        return dict(row)


@router.post("/{project_id}/style/analyze")
async def analyze_style(project_id: int):
    """AI 自动分析已有章节的写作风格"""
    from services.llm_client import chat_completion, extract_content
    from utils.prompt_manager import format_prompt

    async with get_db_ctx() as db:
        # 加载项目信息
        cursor = await db.execute("SELECT name, genre FROM projects WHERE id=?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise HTTPException(404, "项目不存在")

        # 取前3章有内容的章节作为分析样本
        cursor = await db.execute(
            """SELECT chapter_number, title, content FROM chapters
               WHERE project_id=? AND content != '' AND word_count > 200
               ORDER BY chapter_number LIMIT 3""",
            (project_id,),
        )
        chapters = [dict(r) for r in await cursor.fetchall()]

    if not chapters:
        raise HTTPException(400, "没有足够的章节内容进行风格分析，请先导入或续写至少一章")

    # 构建分析上下文
    context = f"## 项目信息\n- 书名：{project['name']}\n- 类型：{project['genre'] or '未指定'}\n\n"
    context += "## 样本章节\n"
    for ch in chapters:
        content = ch["content"][:2000]  # 每章取前2000字
        context += f"### 第{ch['chapter_number']}章 {ch.get('title', '')}\n{content}\n\n"

    system = format_prompt("style_analysis", context=context)
    messages = [{"role": "user", "content": system}]

    try:
        response = await chat_completion(messages, temperature=0.3, max_tokens=1024)
        analysis = extract_content(response)
    except Exception as e:
        logger.error("AI 风格分析失败: project=%s", project_id, exc_info=True)
        raise HTTPException(500, "AI 风格分析失败，请稍后重试")

    # 保存分析结果
    async with get_db_ctx() as db:
        await db.execute(
            "UPDATE style_profiles SET base_analysis=?, updated_at=CURRENT_TIMESTAMP WHERE project_id=?",
            (analysis, project_id),
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        return dict(row)


@router.get("/{project_id}/style/baselines")
async def list_style_baselines(project_id: int):
    """获取所有卷的风格基线"""
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """SELECT * FROM style_baselines WHERE project_id=?
               ORDER BY volume_number""",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


@router.post("/{project_id}/style/baselines/{volume_number}")
async def analyze_volume_style(project_id: int, volume_number: int):
    """手动触发指定卷的风格分析"""
    from services.style_service import analyze_volume_style as analyze
    result = await analyze(project_id, volume_number)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result
