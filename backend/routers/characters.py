"""角色管理路由"""
import logging
from fastapi import APIRouter, HTTPException
from typing import List
from models.database import get_db_ctx
from models.schemas import CharacterCreate, CharacterUpdate, CharacterOut, CharacterSnapshotOut
from ._common import _filter_fields, CHARACTER_FIELDS
from utils.cache import invalidate_project, get_cached, set_cached, characters_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["characters"])


@router.get("/{project_id}/characters", response_model=List[CharacterOut])
async def list_characters(project_id: int):
    cached = get_cached(characters_key(project_id))
    if cached is not None:
        return cached
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT * FROM characters WHERE project_id=? ORDER BY name", (project_id,)
        )
        result = [dict(r) for r in await cursor.fetchall()]
        set_cached(characters_key(project_id), result)
        return result


@router.get("/{project_id}/characters/by-volume")
async def list_characters_by_volume(project_id: int, chapter: int = None):
    """按卷分组返回角色，附带当前卷信息"""
    async with get_db_ctx() as db:
        # 加载所有角色
        cursor = await db.execute(
            "SELECT * FROM characters WHERE project_id=?", (project_id,)
        )
        all_chars = [dict(r) for r in await cursor.fetchall()]

        # 加载分卷大纲
        cursor = await db.execute(
            "SELECT id, volume_number, chapter_start, chapter_end FROM volume_outlines WHERE project_id=? ORDER BY volume_number",
            (project_id,),
        )
        volumes = [dict(r) for r in await cursor.fetchall()]

        # 确定当前卷号
        current_volume = None
        if chapter:
            for v in volumes:
                if v["chapter_start"] is not None and v["chapter_end"] is not None                         and v["chapter_start"] <= chapter <= v["chapter_end"]:
                    current_volume = v["volume_number"]
                    break
        if current_volume is None and volumes:
            # 没有指定章节或找不到对应卷，取最后一卷
            current_volume = volumes[-1]["volume_number"]

        # 加载角色快照，用于判断角色属于哪些卷
        cursor = await db.execute(
            "SELECT DISTINCT character_name, chapter_number FROM character_snapshots WHERE project_id=?",
            (project_id,),
        )
        snapshots = [dict(r) for r in await cursor.fetchall()]

    # 构建角色→卷号集合的映射
    char_volumes = {}  # name -> set of volume_numbers
    for s in snapshots:
        ch = s["chapter_number"]
        name = s["character_name"]
        for v in volumes:
            if v["chapter_start"] is not None and v["chapter_end"] is not None                     and v["chapter_start"] <= ch <= v["chapter_end"]:
                char_volumes.setdefault(name, set()).add(v["volume_number"])

    # 分组
    ROLE_ORDER = {'男主': 0, '女主': 1, '反派': 2, '男配': 3, '女配': 3, '配角': 3, '导师': 3, '伙伴': 3, '龙套': 4, '路人': 4}

    def sort_key(c):
        role = c.get('role') or ''
        for k, v in ROLE_ORDER.items():
            if k in role:
                return (v, c.get('name', ''))
        return (3, c.get('name', ''))

    spans_all = sorted([c for c in all_chars if c.get("spans_all_volumes")], key=sort_key)
    spans_all_names = {c["name"] for c in spans_all}

    # 剩余角色按卷分组
    volume_groups = {}  # volume_number -> [chars]
    assigned = set()
    for c in all_chars:
        if c["name"] in spans_all_names:
            continue
        vols = char_volumes.get(c["name"], set())
        if not vols:
            # 没有快照的角色，归入当前卷（如果有）
            if current_volume:
                volume_groups.setdefault(current_volume, []).append(c)
            else:
                volume_groups.setdefault(0, []).append(c)  # 0 = 未分卷
        else:
            for v in sorted(vols):
                volume_groups.setdefault(v, []).append(c)

    # 每个卷内排序
    for v in volume_groups:
        volume_groups[v].sort(key=sort_key)

    return {
        "spans_all": spans_all,
        "volume_groups": {str(v): chars for v, chars in sorted(volume_groups.items())},
        "current_volume": current_volume,
        "volumes": [{"volume_number": v["volume_number"], "chapter_start": v["chapter_start"], "chapter_end": v["chapter_end"]} for v in volumes],
    }


@router.post("/{project_id}/characters", response_model=CharacterOut, status_code=201)
async def create_character(project_id: int, data: CharacterCreate):
    async with get_db_ctx() as db:
        # 验证项目存在
        cursor = await db.execute("SELECT id FROM projects WHERE id=?", (project_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "项目不存在")
        cursor = await db.execute(
            """INSERT INTO characters (project_id, name, role, age, personality,
               speech_style, appearance, background, relationships, character_arc_summary, spans_all_volumes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, data.name, data.role, data.age, data.personality,
             data.speech_style, data.appearance, data.background,
             data.relationships, data.character_arc_summary,
             1 if data.spans_all_volumes else 0),
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute("SELECT * FROM characters WHERE id=?", (cursor.lastrowid,))
        return dict(await cursor.fetchone())


@router.put("/{project_id}/characters/{name}", response_model=CharacterOut)
async def update_character(project_id: int, name: str, data: CharacterUpdate):
    async with get_db_ctx() as db:
        fields = _filter_fields(data.model_dump(exclude_unset=True), CHARACTER_FIELDS)
        if not fields:
            raise HTTPException(400, "没有需要更新的字段")
        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [project_id, name]
        await db.execute(
            f"UPDATE characters SET {set_clause} WHERE project_id=? AND name=?", values
        )
        await db.commit()
        invalidate_project(project_id)
        cursor = await db.execute(
            "SELECT * FROM characters WHERE project_id=? AND name=?", (project_id, name)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "角色不存在")
        return dict(row)


@router.delete("/{project_id}/characters/{name}", status_code=204)
async def delete_character(project_id: int, name: str):
    async with get_db_ctx() as db:
        cursor = await db.execute(
            "SELECT id FROM characters WHERE project_id=? AND name=?",
            (project_id, name),
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "角色不存在")
        await db.execute(
            "DELETE FROM characters WHERE project_id=? AND name=?",
            (project_id, name),
        )
        await db.commit()
        invalidate_project(project_id)

@router.get("/{project_id}/character-snapshots", response_model=List[CharacterSnapshotOut])
async def list_snapshots(project_id: int, chapter: int = None):
    async with get_db_ctx() as db:
        if chapter is not None:
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
