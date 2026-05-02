"""设定库管理路由"""
import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["settings-library"])


@router.get("/{project_id}/settings-library")
async def list_settings_library(project_id: int, category: str = None):
    from services.settings_library_service import list_settings
    return await list_settings(project_id, category)


@router.get("/{project_id}/settings-library/categories")
async def list_setting_categories(project_id: int):
    from services.settings_library_service import get_categories
    return await get_categories(project_id)


@router.post("/{project_id}/settings-library", status_code=201)
async def create_setting(project_id: int, data: dict):
    if not data.get("category") or not data.get("name"):
        raise HTTPException(400, "category 和 name 为必填项")
    from services.settings_library_service import create_setting as create
    return await create(project_id, data)


@router.put("/{project_id}/settings-library/{setting_id}")
async def update_setting(project_id: int, setting_id: int, data: dict):
    from services.settings_library_service import update_setting as update
    result = await update(project_id, setting_id, data)
    if not result:
        raise HTTPException(404, "设定不存在")
    return result


@router.delete("/{project_id}/settings-library/{setting_id}", status_code=204)
async def delete_setting(project_id: int, setting_id: int):
    from services.settings_library_service import delete_setting as delete
    if not await delete(project_id, setting_id):
        raise HTTPException(404, "设定不存在")
