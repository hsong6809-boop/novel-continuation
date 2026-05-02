"""对话路由"""
import logging
from fastapi import APIRouter
from typing import List
from models.database import get_db_ctx
from models.schemas import ChatRequest, ChatResponse, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["chat"])


@router.get("/{project_id}/chat", response_model=List[ChatMessage])
async def list_chat_history(project_id: int):
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT role, content FROM chat_history WHERE project_id=? ORDER BY created_at",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


@router.post("/{project_id}/chat", response_model=ChatResponse)
async def chat(project_id: int, data: ChatRequest):
    from services.chat_service import handle_chat
    return await handle_chat(project_id, data.message, mode=data.mode)


@router.get("/{project_id}/chat/modes")
async def list_chat_modes():
    """获取可用的讨论模式"""
    from services.chat_service import DISCUSSION_MODES
    return [{"key": k, "label": v["label"]} for k, v in DISCUSSION_MODES.items()]
