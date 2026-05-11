"""时间线管理路由"""
import logging
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db_ctx
from models.schemas import TimelineCreate, TimelineUpdate, TimelineOut
from ._common import _filter_fields, TIMELINE_FIELDS
from utils.cache import invalidate_project, get_cached, set_cached, timeline_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["timeline"])


@router.get("/{project_id}/timeline", response_model=List[TimelineOut])
async def list_timeline(project_id: int):
    cached = get_cached(timeline_key(project_id))
    if cached is not None:
        return cached
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM timeline WHERE project_id=? ORDER BY chapter_number",
            (project_id,),
        )
        result = [dict(r) for r in await cursor.fetchall()]
        set_cached(timeline_key(project_id), result)
        return result


@router.post("/{project_id}/timeline", response_model=TimelineOut, status_code=201)
async def create_timeline_event(project_id: int, data: TimelineCreate):
    async with get_db_ctx() as db:
        # 验证项目存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "项目不存在")
        # 如果未提供 chapter_number，自动分配一个负数（手动事件不关联具体章节）
        ch_num = data.chapter_number
        if ch_num is None:
            cursor = await db.execute(
                "SELECT MIN(chapter_number) FROM timeline WHERE project_id=?",
                (project_id,),
            )
            row = await cursor.fetchone()
            ch_num = (row[0] - 1) if row and row[0] is not None and row[0] <= 0 else -1
        cursor = await db.execute(
            """INSERT INTO timeline (project_id, chapter_number, story_time_description, story_date, duration, summary)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, ch_num, data.story_time_description,
             data.story_date, data.duration, data.summary),
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute("SELECT * FROM timeline WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())


@router.put("/{project_id}/timeline/{event_id}", response_model=TimelineOut)
async def update_timeline_event(project_id: int, event_id: int, data: TimelineUpdate):
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), TIMELINE_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [event_id, project_id]
        await db.execute(
            f"UPDATE timeline SET {set_clause} WHERE id=? AND project_id=?",
            values,
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute("SELECT * FROM timeline WHERE id=? AND project_id=?", (event_id, project_id))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "时间线事件不存在")
        return dict(row)


@router.delete("/{project_id}/timeline/{event_id}", status_code=204)
async def delete_timeline_event(project_id: int, event_id: int):
    async with get_db_ctx() as db:
        cursor = await db.execute("DELETE FROM timeline WHERE id=? AND project_id=?", (event_id, project_id))
        await db.commit()
        invalidate_project(project_id)
        if cursor.rowcount == 0:
            raise HTTPException(404, "时间线事件不存在")
