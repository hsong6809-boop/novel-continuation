"""Pydantic 数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ========== 项目 ==========
class ProjectCreate(BaseModel):
    model_config = {'protected_namespaces': ()}
    name: str
    genre: Optional[str] = None
    description: Optional[str] = None
    model_provider: str = "deepseek"
    model_name: str = "deepseek-chat"
    target_words: int = 200000
    volume_summaries: Optional[str] = None
    style_notes: Optional[str] = None
    platform: Optional[str] = None
    notes: Optional[str] = None


class ProjectUpdate(BaseModel):
    model_config = {'protected_namespaces': ()}
    name: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    target_words: Optional[int] = None
    volume_summaries: Optional[str] = None
    style_notes: Optional[str] = None
    platform: Optional[str] = None
    notes: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = {'protected_namespaces': ()}
    id: int
    name: str
    genre: Optional[str] = None
    description: Optional[str] = None
    model_provider: str
    model_name: str
    target_words: int
    current_words: int
    current_chapter: int
    style_notes: Optional[str] = None
    volume_summaries: Optional[str] = None
    platform: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


# ========== 章纲 ==========
class ChapterOutlineOut(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    title: Optional[str] = None
    core_objective: Optional[str] = None
    emotional_arc: Optional[str] = None
    hooks: Optional[str] = None
    version: int
    created_at: str


class ChapterOutlineUpdate(BaseModel):
    title: Optional[str] = None
    core_objective: Optional[str] = None
    emotional_arc: Optional[str] = None
    hooks: Optional[str] = None


# ========== 场景要点 ==========
class ScenePointCreate(BaseModel):
    scene_order: int
    mission: Optional[str] = None
    key_dialogue_hint: Optional[str] = None
    atmosphere: Optional[str] = None
    target_words_ratio: float = 0.25


class ScenePointUpdate(BaseModel):
    mission: Optional[str] = None
    key_dialogue_hint: Optional[str] = None
    atmosphere: Optional[str] = None
    target_words_ratio: Optional[float] = None


class ScenePointOut(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    scene_order: int
    mission: Optional[str] = None
    key_dialogue_hint: Optional[str] = None
    atmosphere: Optional[str] = None
    target_words_ratio: float


# ========== 章节 ==========
class ChapterOut(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    title: Optional[str] = None
    content: str
    word_count: int
    summary: Optional[str] = None
    status: str
    volume_label: Optional[str] = None
    arc_label: Optional[str] = None
    created_at: str


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    volume_label: Optional[str] = None
    arc_label: Optional[str] = None


# ========== 角色 ==========
class CharacterCreate(BaseModel):
    name: str
    role: Optional[str] = None
    age: Optional[str] = None
    personality: Optional[str] = None
    speech_style: Optional[str] = None
    appearance: Optional[str] = None
    background: Optional[str] = None
    relationships: Optional[str] = None
    character_arc_summary: Optional[str] = None


class CharacterUpdate(BaseModel):
    role: Optional[str] = None
    age: Optional[str] = None
    personality: Optional[str] = None
    speech_style: Optional[str] = None
    appearance: Optional[str] = None
    background: Optional[str] = None
    relationships: Optional[str] = None
    character_arc_summary: Optional[str] = None


class CharacterOut(BaseModel):
    id: int
    project_id: int
    name: str
    role: Optional[str] = None
    age: Optional[str] = None
    personality: Optional[str] = None
    speech_style: Optional[str] = None
    appearance: Optional[str] = None
    background: Optional[str] = None
    relationships: Optional[str] = None
    character_arc_summary: Optional[str] = None
    created_at: str


# ========== 角色快照 ==========
class CharacterSnapshotOut(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    character_name: str
    current_state: str
    extracted_at: str


# ========== 风格 ==========
class StyleProfileOut(BaseModel):
    id: int
    project_id: int
    base_analysis: Optional[str] = None
    human_notes: Optional[str] = None
    default_description_density: int
    default_dialogue_ratio: int
    default_pacing: str
    created_at: str
    updated_at: str


class StyleParamsUpdate(BaseModel):
    default_description_density: Optional[int] = Field(None, ge=1, le=5)
    default_dialogue_ratio: Optional[int] = Field(None, ge=1, le=5)
    default_pacing: Optional[str] = None
    human_notes: Optional[str] = None


# ========== 伏笔 ==========
class ForeshadowingOut(BaseModel):
    id: int
    project_id: int
    description: str
    planted_chapter: int
    expected_reveal_chapter: Optional[int] = None
    actual_reveal_chapter: Optional[int] = None
    status: str
    importance: str
    notes: Optional[str] = None
    created_at: str


class ForeshadowingUpdate(BaseModel):
    status: Optional[str] = None
    actual_reveal_chapter: Optional[int] = None
    importance: Optional[str] = None
    notes: Optional[str] = None


# ========== 时间线 ==========
class TimelineOut(BaseModel):
    id: int
    project_id: int
    chapter_number: int
    story_time_description: str
    story_date: Optional[str] = None
    duration: Optional[str] = None
    summary: Optional[str] = None
    created_at: str


# ========== 对话 ==========
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    history: List[ChatMessage] = []


# ========== 续写向导 ==========
class WritePreview(BaseModel):
    chapter_number: int
    outline: Optional[ChapterOutlineOut] = None
    scenes: List[ScenePointOut] = []
    style_params: Optional[StyleProfileOut] = None
    active_foreshadowing: List[ForeshadowingOut] = []
    recent_timeline: List[TimelineOut] = []
    character_snapshots: List[CharacterSnapshotOut] = []
    context_range: str  # 如 "第86章 ~ 第100章"
    estimated_tokens: int


class GenerateRequest(BaseModel):
    """续写生成请求"""
    style_overrides: Optional[StyleParamsUpdate] = None
    custom_instructions: Optional[str] = None


# ========== AI 大纲生成 ==========
class OutlineGenerateRequest(BaseModel):
    chapter_number: Optional[int] = None
    custom_instructions: Optional[str] = None


class OutlineGenerateResponse(BaseModel):
    title: Optional[str] = None
    core_objective: Optional[str] = None
    emotional_arc: Optional[str] = None
    hooks: Optional[str] = None
    scenes: List[dict] = []


# ========== 元数据提取结果 ==========
class ExtractedMeta(BaseModel):
    new_foreshadowings: List[dict] = []
    resolved_foreshadowings: List[dict] = []
    timeline_updates: Optional[dict] = None
    character_snapshots: Optional[dict] = None
