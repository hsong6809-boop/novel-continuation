"""伏笔管理路由"""
import logging
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db_ctx
from models.schemas import ForeshadowingCreate, ForeshadowingOut, ForeshadowingUpdate
from ._common import _filter_fields, FORESHADOW_FIELDS
from utils.cache import invalidate_project, get_cached, set_cached, foreshadowing_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["foreshadowing"])


@router.get("/{project_id}/foreshadowing", response_model=List[ForeshadowingOut])
async def list_foreshadowing(project_id: int, status: str = None):
    # 只缓存无筛选的列表（最常见场景）
    cache_key = foreshadowing_key(project_id) if not status else None
    if cache_key:
        cached = get_cached(cache_key)
        if cached is not None:
            return cached
    async with get_db_ctx() as db:
        if status:
            cursor = await db.execute(
                "SELECT * FROM foreshadowing WHERE project_id=? AND status=? ORDER BY planted_chapter",
                (project_id, status),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM foreshadowing WHERE project_id=? ORDER BY planted_chapter",
                (project_id,),
            )
        result = [dict(r) for r in await cursor.fetchall()]
        if cache_key:
            set_cached(cache_key, result)
        return result


@router.post("/{project_id}/foreshadowing", response_model=ForeshadowingOut, status_code=201)
async def create_foreshadowing(project_id: int, data: ForeshadowingCreate):
    async with get_db_ctx() as db:
        # 验证项目存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "项目不存在")
        cursor = await db.execute(
            """INSERT INTO foreshadowing
               (project_id, description, planted_chapter, expected_reveal_chapter, importance, notes, status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')""",
            (project_id, data.description, data.planted_chapter,
             data.expected_reveal_chapter, data.importance, data.notes),
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute("SELECT * FROM foreshadowing WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())


@router.put("/{project_id}/foreshadowing/{fid}", response_model=ForeshadowingOut)
async def update_foreshadowing(project_id: int, fid: int, data: ForeshadowingUpdate):
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), FORESHADOW_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [fid, project_id]
        await db.execute(
            f"UPDATE foreshadowing SET {set_clause} WHERE id=? AND project_id=?", values
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute("SELECT * FROM foreshadowing WHERE id=? AND project_id=?", (fid, project_id))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "伏笔不存在")
        return dict(row)
