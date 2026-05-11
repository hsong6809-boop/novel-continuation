"""路由层共享工具"""
import logging

logger = logging.getLogger(__name__)

def _filter_fields(data: dict, whitelist: set) -> dict:
    """过滤字段，只保留白名单中的字段。

    Pydantic 的 model_dump(exclude_unset=True) 只包含用户显式传入的字段，
    未传入的字段不会出现，所以这里不需要检查 None。
    """
    return {k: v for k, v in data.items() if k in whitelist}


# ========== 字段白名单 ==========

PROJECT_FIELDS = {"name", "genre", "description", "model_provider", "model_name",
                  "target_words", "volume_summaries", "style_notes", "platform", "notes",
                  "style_ref_chapters"}
CHAPTER_OUTLINE_FIELDS = {"title", "core_objective", "emotional_arc", "hooks", "rhythm_type", "chapter_opening",
                         "plot_points", "core_conflict", "info_delivery", "character_development", "setup_for_future"}
CHAPTER_FIELDS = {"title", "content", "status", "volume_label", "arc_label"}
CHARACTER_FIELDS = {"name", "role", "age", "personality", "speech_style", "appearance",
                    "background", "relationships", "character_arc_summary", "spans_all_volumes"}
STYLE_FIELDS = {"base_analysis", "human_notes", "default_description_density",
                "default_dialogue_ratio", "default_pacing"}
FORESHADOW_FIELDS = {"description", "planted_chapter", "expected_reveal_chapter",
                     "actual_reveal_chapter", "importance", "notes", "status"}
TIMELINE_FIELDS = {"chapter_number", "story_time_description", "story_date", "duration", "summary"}
