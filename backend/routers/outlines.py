"""大纲路由：总纲、分卷大纲、章纲、场景要点"""
import logging
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db_ctx
from models.schemas import (
    ChapterOutlineOut, ChapterOutlineUpdate,
    ScenePointCreate, ScenePointReplace, ScenePointOut,
    OutlineGenerateRequest, OutlineGenerateResponse,
    VolumeOutlineCreate,
)
from ._common import _filter_fields, CHAPTER_OUTLINE_FIELDS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["outlines"])


# ========== 总纲管理 ==========

@router.get("/{project_id}/outline/overall")
async def get_overall_outline(project_id: int):
    """获取总纲/分卷大纲"""
    from services.overall_outline_service import get_overall_outline
    return await get_overall_outline(project_id)


@router.post("/{project_id}/outline/overall/generate")
async def generate_overall_outline(project_id: int, data: OutlineGenerateRequest):
    """AI 生成总纲/分卷大纲"""
    from services.overall_outline_service import generate_overall_outline
    result = await generate_overall_outline(project_id, data.custom_instructions)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.put("/{project_id}/outline/overall")
async def update_overall_outline(project_id: int, data: dict):
    """手动更新总纲"""
    from services.overall_outline_service import update_overall_outline
    return await update_overall_outline(project_id, data)


# ========== 分卷大纲管理 ==========

@router.get("/{project_id}/outlines/volumes")
async def list_volume_outlines(project_id: int):
    """获取所有分卷大纲"""
    from services.volume_outline_service import list_volume_outlines
    return await list_volume_outlines(project_id)


@router.post("/{project_id}/outlines/volumes")
async def create_volume_outline(project_id: int, data: VolumeOutlineCreate):
    """新建分卷大纲"""
    from services.volume_outline_service import create_volume_outline
    return await create_volume_outline(project_id, data.model_dump())


@router.get("/{project_id}/outlines/volumes/{volume_id}")
async def get_volume_outline(project_id: int, volume_id: int):
    """获取单个分卷大纲"""
    from services.volume_outline_service import get_volume_outline
    result = await get_volume_outline(project_id, volume_id)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


@router.put("/{project_id}/outlines/volumes/{volume_id}")
async def update_volume_outline(project_id: int, volume_id: int, data: dict):
    """更新分卷大纲"""
    from services.volume_outline_service import update_volume_outline
    result = await update_volume_outline(project_id, volume_id, data)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


@router.delete("/{project_id}/outlines/volumes/{volume_id}")
async def delete_volume_outline(project_id: int, volume_id: int):
    """删除分卷大纲"""
    from services.volume_outline_service import delete_volume_outline
    result = await delete_volume_outline(project_id, volume_id)
    if result and "error" in result:
        raise HTTPException(404, result["error"])
    return {"ok": True}


@router.post("/{project_id}/outlines/volumes/generate")
async def generate_volume_outlines(project_id: int):
    """AI 基于总纲 + 上一卷正文生成下一分卷大纲"""
    from services.volume_outline_service import generate_next_volume
    result = await generate_next_volume(project_id)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


# ========== 章纲管理 ==========

@router.get("/{project_id}/outlines/chapters", response_model=List[ChapterOutlineOut])
async def list_outlines(project_id: int):
    async with get_db_ctx() as db:
        # 验证项目存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "项目不存在")
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? ORDER BY chapter_number",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


@router.get("/{project_id}/outlines/chapters/{chapter}")
async def get_outline(project_id: int, chapter: int):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        outline = await cursor.fetchone()
        if not outline:
            raise HTTPException(404, "章纲不存在")
        # 同时返回场景要点
        cursor2 = await db.execute(
            "SELECT * FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        scenes = [dict(r) for r in await cursor2.fetchall()]
        return {"outline": dict(outline), "scenes": scenes}


@router.put("/{project_id}/outlines/chapters/{chapter}")
async def update_outline(project_id: int, chapter: int, data: ChapterOutlineUpdate):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), CHAPTER_OUTLINE_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        set_clause += ", source='manual'"
        values = list(fields.values()) + [project_id, chapter]
        await db.execute(
            f"UPDATE chapter_outlines SET {set_clause} WHERE project_id=? AND chapter_number=?",
            values,
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "章纲不存在")
        return dict(row)


@router.post("/{project_id}/outlines/chapters/{chapter}/generate", response_model=OutlineGenerateResponse)
async def generate_outline(project_id: int, chapter: int, data: OutlineGenerateRequest):
    """AI 生成单章章纲+场景要点"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    from services.outline_service import generate_outline_for_chapter
    result = await generate_outline_for_chapter(project_id, chapter, data.custom_instructions)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.post("/{project_id}/outlines/chapters/batch-generate")
async def batch_generate_outlines(project_id: int, data: dict):
    """按卷批量生成章纲：传入 volume_id，AI 为该卷所有章节生成章纲"""
    from services.outline_service import batch_generate_outlines_for_volume
    volume_id = data.get("volume_id")
    if not volume_id:
        raise HTTPException(400, "需要提供 volume_id")
    custom = data.get("custom_instructions")
    result = await batch_generate_outlines_for_volume(project_id, volume_id, custom)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


# ========== 场景要点 ==========

@router.post("/{project_id}/outlines/chapters/{chapter}/scenes", response_model=ScenePointOut)
async def add_scene_point(project_id: int, chapter: int, data: ScenePointCreate):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        cursor = await db.execute(
            """INSERT INTO scene_points (project_id, chapter_number, scene_order,
               mission, key_dialogue_hint, atmosphere, target_words_ratio, scene_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, chapter, data.scene_order, data.mission,
             data.key_dialogue_hint, data.atmosphere, data.target_words_ratio,
             getattr(data, "scene_type", None)),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM scene_points WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())


@router.put("/{project_id}/outlines/chapters/{chapter}/scenes")
async def replace_scenes(project_id: int, chapter: int, data: List[ScenePointReplace]):
    """批量替换某章的所有场景要点（先删后插）"""
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        await db.execute(
            "DELETE FROM scene_points WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        for s in data:
            await db.execute(
                """INSERT INTO scene_points (project_id, chapter_number, scene_order,
                   mission, key_dialogue_hint, atmosphere, target_words_ratio, scene_type)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (project_id, chapter, s.scene_order,
                 s.mission, s.key_dialogue_hint,
                 s.atmosphere, s.target_words_ratio,
                 getattr(s, "scene_type", None)),
            )
        await db.commit()
        # 返回更新后的场景列表
        cursor = await db.execute(
            "SELECT * FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        return [dict(r) for r in await cursor.fetchall()]


@router.delete("/{project_id}/outlines/chapters/{chapter}/scenes/{order}")
async def delete_scene_point(project_id: int, chapter: int, order: int):
    if chapter < 1:
        raise HTTPException(400, "章节号必须大于0")
    async with get_db_ctx() as db:
        await db.execute(
            "DELETE FROM scene_points WHERE project_id=? AND chapter_number=? AND scene_order=?",
            (project_id, chapter, order),
        )
        await db.commit()
