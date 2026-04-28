"""项目管理路由"""
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db
from models.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut,
    ChapterOutlineOut, ChapterOutlineUpdate,
    ScenePointCreate, ScenePointUpdate, ScenePointOut,
    ChapterOut, ChapterUpdate,
    CharacterCreate, CharacterUpdate, CharacterOut,
    CharacterSnapshotOut,
    StyleProfileOut, StyleParamsUpdate,
    ForeshadowingOut, ForeshadowingUpdate,
    TimelineOut,
    ChatRequest, ChatResponse, ChatMessage,
    WritePreview, GenerateRequest,
    OutlineGenerateRequest, OutlineGenerateResponse,
    ExtractedMeta,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ========== 项目 CRUD ==========

@router.get("", response_model=List[ProjectOut])
async def list_projects():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects ORDER BY updated_at DESC")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(data: ProjectCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO projects (name, genre, description, model_provider, model_name,
               target_words, volume_summaries, style_notes, platform, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.name, data.genre, data.description, data.model_provider,
             data.model_name, data.target_words, data.volume_summaries, data.style_notes,
             data.platform, data.notes),
        )
        await db.commit()
        project_id = cursor.lastrowid
        # 同时创建风格档案
        await db.execute(
            "INSERT INTO style_profiles (project_id) VALUES (?)", (project_id,)
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        return dict(row)
    finally:
        await db.close()


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        return dict(row)
    finally:
        await db.close()


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, data: ProjectUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        fields["updated_at"] = "CURRENT_TIMESTAMP"
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id]
        await db.execute(f"UPDATE projects SET {set_clause} WHERE id=?", values)
        await db.commit()
        cursor = await db.execute("SELECT * FROM projects WHERE id=?", (project_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        return dict(row)
    finally:
        await db.close()


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM projects WHERE id=?", (project_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "项目不存在")
    finally:
        await db.close()


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
async def create_volume_outline(project_id: int, data: dict):
    """新建分卷大纲"""
    from services.volume_outline_service import create_volume_outline
    return await create_volume_outline(project_id, data)


@router.get("/{project_id}/outlines/volumes/{volume_id}")
async def get_volume_outline(project_id: int, volume_id: int):
    """获取单个分卷大纲"""
    from services.volume_outline_service import get_volume_outline
    return await get_volume_outline(project_id, volume_id)


@router.put("/{project_id}/outlines/volumes/{volume_id}")
async def update_volume_outline(project_id: int, volume_id: int, data: dict):
    """更新分卷大纲"""
    from services.volume_outline_service import update_volume_outline
    return await update_volume_outline(project_id, volume_id, data)


@router.delete("/{project_id}/outlines/volumes/{volume_id}")
async def delete_volume_outline(project_id: int, volume_id: int):
    """删除分卷大纲"""
    from services.volume_outline_service import delete_volume_outline
    await delete_volume_outline(project_id, volume_id)
    return {"ok": True}


@router.post("/{project_id}/outlines/volumes/generate")
async def generate_volume_outlines(project_id: int, data: OutlineGenerateRequest):
    """AI 基于总纲自动规划分卷大纲"""
    from services.volume_outline_service import generate_volume_outlines
    result = await generate_volume_outlines(project_id, custom_instructions=data.custom_instructions)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


# ========== 章纲管理 ==========

@router.get("/{project_id}/outlines/chapters", response_model=List[ChapterOutlineOut])
async def list_outlines(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapter_outlines WHERE project_id=? ORDER BY chapter_number",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.get("/{project_id}/outlines/chapters/{chapter}")
async def get_outline(project_id: int, chapter: int):
    db = await get_db()
    try:
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
    finally:
        await db.close()


@router.put("/{project_id}/outlines/chapters/{chapter}")
async def update_outline(project_id: int, chapter: int, data: ChapterOutlineUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
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
    finally:
        await db.close()


@router.post("/{project_id}/outlines/chapters/{chapter}/generate", response_model=OutlineGenerateResponse)
async def generate_outline(project_id: int, chapter: int, data: OutlineGenerateRequest):
    """AI 生成单章章纲+场景要点"""
    from services.outline_service import generate_outline_for_chapter
    return await generate_outline_for_chapter(project_id, chapter, data.custom_instructions)


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


@router.post("/{project_id}/outlines/chapters/{chapter}/scenes", response_model=ScenePointOut)
async def add_scene_point(project_id: int, chapter: int, data: ScenePointCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO scene_points (project_id, chapter_number, scene_order,
               mission, key_dialogue_hint, atmosphere, target_words_ratio)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (project_id, chapter, data.scene_order, data.mission,
             data.key_dialogue_hint, data.atmosphere, data.target_words_ratio),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM scene_points WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())
    finally:
        await db.close()


@router.put("/{project_id}/outlines/chapters/{chapter}/scenes")
async def replace_scenes(project_id: int, chapter: int, data: List[dict]):
    """批量替换某章的所有场景要点（先删后插）"""
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM scene_points WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        for s in data:
            await db.execute(
                """INSERT INTO scene_points (project_id, chapter_number, scene_order,
                   mission, key_dialogue_hint, atmosphere, target_words_ratio)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (project_id, chapter, s.get("scene_order", 0),
                 s.get("mission"), s.get("key_dialogue_hint"),
                 s.get("atmosphere"), s.get("target_words_ratio", 0.25)),
            )
        await db.commit()
        # 返回更新后的场景列表
        cursor = await db.execute(
            "SELECT * FROM scene_points WHERE project_id=? AND chapter_number=? ORDER BY scene_order",
            (project_id, chapter),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.delete("/{project_id}/outlines/chapters/{chapter}/scenes/{order}")
async def delete_scene_point(project_id: int, chapter: int, order: int):
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM scene_points WHERE project_id=? AND chapter_number=? AND scene_order=?",
            (project_id, chapter, order),
        )
        await db.commit()
    finally:
        await db.close()


# ========== 章节续写 ==========

@router.get("/{project_id}/chapters", response_model=List[ChapterOut])
async def list_chapters(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapters WHERE project_id=? ORDER BY chapter_number",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.get("/{project_id}/chapters/{chapter}", response_model=ChapterOut)
async def get_chapter(project_id: int, chapter: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "章节不存在")
        return dict(row)
    finally:
        await db.close()


@router.put("/{project_id}/chapters/{chapter}", response_model=ChapterOut)
async def update_chapter(project_id: int, chapter: int, data: ChapterUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        if "content" in fields:
            fields["word_count"] = len(fields["content"])
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id, chapter]
        await db.execute(
            f"UPDATE chapters SET {set_clause} WHERE project_id=? AND chapter_number=?",
            values,
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM chapters WHERE project_id=? AND chapter_number=?",
            (project_id, chapter),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "章节不存在")
        return dict(row)
    finally:
        await db.close()


@router.post("/{project_id}/chapters/{chapter}/write")
async def write_preview(project_id: int, chapter: int):
    """续写向导：返回预览信息"""
    from services.context_service import build_write_preview
    return await build_write_preview(project_id, chapter)


@router.post("/{project_id}/chapters/{chapter}/generate")
async def generate_chapter(project_id: int, chapter: int, data: GenerateRequest):
    """执行正式续写（非流式回退）"""
    from services.continuation_service import generate_chapter_content
    return await generate_chapter_content(project_id, chapter, data)


@router.post("/{project_id}/chapters/{chapter}/generate-stream")
async def generate_chapter_stream(project_id: int, chapter: int, data: GenerateRequest):
    """执行正式续写（SSE 流式输出）"""
    from fastapi.responses import StreamingResponse
    from services.context_service import build_continuation_messages
    from services.llm_client import chat_completion_stream
    import json

    messages = await build_continuation_messages(
        project_id, chapter, data.custom_instructions
    )

    # 预取章纲标题，供保存时使用
    chapter_title = None
    try:
        db_tmp = await get_db()
        try:
            cursor = await db_tmp.execute(
                "SELECT title FROM chapter_outlines WHERE project_id=? AND chapter_number=?",
                (project_id, chapter),
            )
            row = await cursor.fetchone()
            if row:
                chapter_title = row["title"]
        finally:
            await db_tmp.close()
    except Exception:
        pass

    async def event_generator():
        full_text = ""
        try:
            async for chunk in chat_completion_stream(messages, temperature=0.85):
                full_text += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            # 流结束，保存章节并提取元数据
            from services.chapter_service import save_chapter
            await save_chapter(project_id, chapter, full_text, title=chapter_title)
            from services.meta_service import extract_chapter_meta
            meta = await extract_chapter_meta(project_id, chapter)
            yield f"data: {json.dumps({'type': 'done', 'meta': meta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{project_id}/chapters/{chapter}/extract-meta")
async def extract_meta(project_id: int, chapter: int):
    """手动触发元数据提取"""
    from services.meta_service import extract_chapter_meta
    return await extract_chapter_meta(project_id, chapter)


# ========== 角色管理 ==========

@router.get("/{project_id}/characters", response_model=List[CharacterOut])
async def list_characters(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM characters WHERE project_id=? ORDER BY name", (project_id,)
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.post("/{project_id}/characters", response_model=CharacterOut, status_code=201)
async def create_character(project_id: int, data: CharacterCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO characters (project_id, name, role, age, personality,
               speech_style, appearance, background, relationships, character_arc_summary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, data.name, data.role, data.age, data.personality,
             data.speech_style, data.appearance, data.background,
             data.relationships, data.character_arc_summary),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM characters WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())
    finally:
        await db.close()


@router.put("/{project_id}/characters/{name}", response_model=CharacterOut)
async def update_character(project_id: int, name: str, data: CharacterUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id, name]
        await db.execute(
            f"UPDATE characters SET {set_clause} WHERE project_id=? AND name=?", values
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM characters WHERE project_id=? AND name=?", (project_id, name)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "角色不存在")
        return dict(row)
    finally:
        await db.close()


@router.delete("/{project_id}/characters/{name}", status_code=204)
async def delete_character(project_id: int, name: str):
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM characters WHERE project_id=? AND name=?", (project_id, name)
        )
        await db.commit()
    finally:
        await db.close()


@router.get("/{project_id}/characters/snapshots", response_model=List[CharacterSnapshotOut])
async def list_snapshots(project_id: int, chapter: int = None):
    db = await get_db()
    try:
        if chapter:
            cursor = await db.execute(
                "SELECT * FROM character_snapshots WHERE project_id=? AND chapter_number=? ORDER BY character_name",
                (project_id, chapter),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM character_snapshots WHERE project_id=? ORDER BY chapter_number DESC, character_name",
                (project_id,),
            )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


# ========== 风格 ==========

@router.get("/{project_id}/style", response_model=StyleProfileOut)
async def get_style(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "风格档案不存在")
        return dict(row)
    finally:
        await db.close()


@router.put("/{project_id}/style/params", response_model=StyleProfileOut)
async def update_style_params(project_id: int, data: StyleParamsUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id]
        await db.execute(
            f"UPDATE style_profiles SET {set_clause} WHERE project_id=?", values
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM style_profiles WHERE project_id=?", (project_id,)
        )
        row = await cursor.fetchone()
        return dict(row)
    finally:
        await db.close()


# ========== 伏笔 ==========

@router.get("/{project_id}/foreshadowing", response_model=List[ForeshadowingOut])
async def list_foreshadowing(project_id: int, status: str = None):
    db = await get_db()
    try:
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
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.put("/{project_id}/foreshadowing/{fid}", response_model=ForeshadowingOut)
async def update_foreshadowing(project_id: int, fid: int, data: ForeshadowingUpdate):
    db = await get_db()
    try:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [fid]
        await db.execute(
            f"UPDATE foreshadowing SET {set_clause} WHERE id=?", values
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM foreshadowing WHERE id=?", (fid,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "伏笔不存在")
        return dict(row)
    finally:
        await db.close()


# ========== 时间线 ==========

@router.get("/{project_id}/timeline", response_model=List[TimelineOut])
async def list_timeline(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM timeline WHERE project_id=? ORDER BY chapter_number",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


# ========== 对话 ==========

@router.get("/{project_id}/chat", response_model=List[ChatMessage])
async def list_chat_history(project_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT role, content FROM chat_history WHERE project_id=? ORDER BY created_at",
            (project_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


@router.post("/{project_id}/chat", response_model=ChatResponse)
async def chat(project_id: int, data: ChatRequest):
    from services.chat_service import handle_chat
    return await handle_chat(project_id, data.message)
