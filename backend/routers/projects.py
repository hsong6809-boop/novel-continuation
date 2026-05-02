"""项目管理路由"""
import logging
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db_ctx
from models.schemas import ProjectCreate, ProjectUpdate, ProjectOut
from ._common import _filter_fields, PROJECT_FIELDS
from utils.cache import invalidate_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

# 复用的项目列列表，避免 SELECT * 和重复字符串
_PROJECT_COLS = (
    "id, name, genre, description, model_provider, model_name, "
    "target_words, current_words, current_chapter, style_notes, "
    "volume_summaries, platform, notes, created_at, updated_at"
)


@router.get("", response_model=List[ProjectOut])
async def list_projects():
    async with get_db_ctx() as db:
        cursor = await db.execute(
            f"SELECT {_PROJECT_COLS} FROM projects ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(data: ProjectCreate):
    async with get_db_ctx() as db:
        # 检查项目名是否已存在
        cursor = await db.execute("SELECT id FROM projects WHERE name=?", (data.name.strip(),))
        if await cursor.fetchone():
            raise HTTPException(400, f"项目名 '{data.name.strip()}' 已存在")

        try:
            cursor = await db.execute(
                """INSERT INTO projects (name, genre, description, model_provider, model_name,
                   target_words, volume_summaries, style_notes, platform, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (data.name.strip(), data.genre, data.description, data.model_provider,
                 data.model_name, data.target_words, data.volume_summaries, data.style_notes,
                 data.platform, data.notes),
            )
            project_id = cursor.lastrowid
            # 同时创建风格档案
            await db.execute(
                "INSERT INTO style_profiles (project_id) VALUES (?)", (project_id,)
            )
            await db.commit()
            logger.info("创建项目: id=%s name=%s", project_id, data.name.strip())
        except Exception:
            logger.error("创建项目失败: name=%s", data.name, exc_info=True)
            raise HTTPException(500, "创建项目失败")

        cursor = await db.execute(f"SELECT {_PROJECT_COLS} FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        return dict(row)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int):
    async with get_db_ctx() as db:
        cursor = await db.execute(f"SELECT {_PROJECT_COLS} FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        return dict(row)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, data: ProjectUpdate):
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), PROJECT_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields) + ", updated_at=CURRENT_TIMESTAMP"
        values = list(fields.values()) + [project_id]
        await db.execute(f"UPDATE projects SET {set_clause} WHERE id=?", values)
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute(f"SELECT {_PROJECT_COLS} FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        return dict(row)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int):
    async with get_db_ctx() as db:
        # 先检查项目是否存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "项目不存在")
        try:
            await db.execute("DELETE FROM projects WHERE id=?", (project_id,))
            await db.commit()
            invalidate_project(project_id)
            logger.info("删除项目: id=%s", project_id)
        except Exception:
            logger.error("删除项目失败: id=%s", project_id, exc_info=True)
            raise HTTPException(500, "删除项目失败")
