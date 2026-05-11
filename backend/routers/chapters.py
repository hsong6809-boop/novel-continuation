"""章节路由：章节 CRUD、续写、版本管理、元数据提取、自审"""
import json
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List
from models.database import get_db_ctx
from models.schemas import ChapterOut, ChapterListOut, ChapterUpdate, GenerateRequest
from ._common import _filter_fields, CHAPTER_FIELDS
from utils.text_utils import count_chinese_words
from utils.cache import invalidate_project, invalidate_all

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["chapters"])


@router.get("/{project_id}/chapters")
async def list_chapters(project_id: int):
    """获取章节列表（不含正文，避免大响应体）"""
    try:
        async with get_db_ctx() as db:
            cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
            if not await cursor.fetchone():
                raise HTTPException(404, "项目不存在")
            cursor = await db.execute(
                "SELECT id, project_id, chapter_number, title, word_count, "
                "summary, status, volume_label, arc_label, "
                "self_review_status, emotion_peak, created_at "
                "FROM chapters WHERE project_id=? ORDER BY chapter_number",
                (project_id,),
            )
            rows = await cursor.fetchall()
            result = []
            for r in rows:
                d = dict(r)
                # 确保所有字段可 JSON 序列化
                for k, v in d.items():
                    if v is None:
                        continue
                    elif isinstance(v, (int, float, str, bool)):
                        continue
                    else:
                        d[k] = str(v)
                result.append(d)
            logger.info("list_chapters: project=%d, count=%d", project_id, len(result))
            return JSONResponse(content=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("list_chapters 失败: project=%d, error=%s", project_id, e, exc_info=True)
        raise HTTPException(500, f"获取章节列表失败: {type(e).__name__}: {e}")


@router.get("/{project_id}/chapters/{chapter}", response_model=ChapterOut)
async def get_chapter(project_id: int, chapter: int):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "章节不存在")
        return dict(row)


@router.put("/{project_id}/chapters/{chapter}", response_model=ChapterOut)
async def update_chapter(project_id: int, chapter: int, data: ChapterUpdate):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), CHAPTER_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        if "content" in fields:
            fields["word_count"] = count_chinese_words(fields["content"])
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id, chapter]
        await db.execute(
            f"UPDATE chapters SET {set_clause} WHERE project_id=? AND chapter_number=?",
            values,
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute(
            "SELECT * FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "章节不存在")
        return dict(row)


@router.post("/{project_id}/chapters/{chapter}/write")
async def write_preview(project_id: int, chapter: int):
    """续写向导：返回预览信息"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.context_service import build_write_preview
    return await build_write_preview(project_id, chapter)


@router.post("/{project_id}/chapters/{chapter}/generate")
async def generate_chapter(project_id: int, chapter: int, data: GenerateRequest):
    """执行正式续写（非流式回退）"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.continuation_service import generate_chapter_content
    return await generate_chapter_content(project_id, chapter, data)


@router.post("/{project_id}/chapters/{chapter}/generate-stream")
async def generate_chapter_stream(project_id: int, chapter: int, data: GenerateRequest):
    """执行正式续写（SSE 流式输出）"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.continuation_service import generate_stream

    async def event_generator():
        async for evt in generate_stream(project_id, chapter, data.custom_instructions):
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{project_id}/chapters/{chapter}/extract-meta")
async def extract_meta(project_id: int, chapter: int):
    """手动触发元数据提取"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.meta_service import extract_chapter_meta
    return await extract_chapter_meta(project_id, chapter)


@router.post("/{project_id}/chapters/{chapter}/review")
async def review_chapter(project_id: int, chapter: int):
    """手动触发章节自审"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.self_review_service import review_chapter as do_review
    result = await do_review(project_id, chapter)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.get("/{project_id}/chapters/{chapter}/versions")
async def list_chapter_versions(project_id: int, chapter: int):
    """获取某章的历史版本列表"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.chapter_service import list_chapter_versions
    return await list_chapter_versions(project_id, chapter)


@router.post("/{project_id}/chapters/{chapter}/versions/{version_id}/restore")
async def restore_chapter_version(project_id: int, chapter: int, version_id: int):
    """回退到指定历史版本"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.chapter_service import restore_chapter_version
    result = await restore_chapter_version(project_id, chapter, version_id)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.delete("/{project_id}/chapters/{chapter}")
async def delete_chapter(project_id: int, chapter: int):
    """删除指定章节（正文、章纲、场景要点、版本记录一并删除）"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        # 检查章节是否存在
        cursor = await db.execute(
            "SELECT id FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "章节不存在")
        # 删除关联数据
        await db.execute("DELETE FROM chapter_outlines WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        await db.execute("DELETE FROM scene_points WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        await db.execute("DELETE FROM chapter_versions WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        await db.execute("DELETE FROM character_snapshots WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        await db.execute("DELETE FROM timeline WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        await db.execute("DELETE FROM chapters WHERE project_id=? AND chapter_number=?", (project_id, chapter))
        # 更新项目进度
        from services.chapter_service import update_project_progress
        await update_project_progress(db, project_id)
        await db.commit()
        invalidate_project(project_id)
        invalidate_all()  # 清除项目列表缓存
        return {"success": True, "chapter_number": chapter}
