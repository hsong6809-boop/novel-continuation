"""提示词管理器 - 从 settings.json 读取提示词模板，支持变量替换"""
import json
import logging
from pathlib import Path
from config import BASE_DIR
from utils.settings_cache import load_settings

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATES = {
    "continuation": "你是一个专业的小说续写 AI。请根据以下信息续写小说。\n{context}\n\n请直接续写正文内容，不要输出章节标题或编号。保持与前文一致的风格和人物性格。目标字数约2500字。",
    "chapter_outline": "你是一个专业的小说大纲策划师。请为第{chapter}章生成详细的章纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "batch_outline": "你是一个专业的小说策划编辑。请为以下分卷一次性生成所有章节的章纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "volume_outline": "你是一个专业的小说策划编辑。请基于总纲，为这部小说规划前 {count} 卷的分卷大纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "overall_outline": "你是一个专业的小说策划编辑。请为这部小说生成总纲。\n{context}\n\n注意：不要规划分卷，分卷大纲将单独规划。总纲只关注整体故事结构和走向。\n请根据已有内容合理规划。如果小说刚开始，可以多规划未来方向；如果已有大量内容，侧重总结和后续规划。\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "meta_extraction": "你是一个小说分析助手。请从以下章节内容中提取元数据。\n{context}\n\n只提取确实存在的信息，不要编造。如果某项为空，返回空数组或空对象。\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "preprocess": "你是一个专业的小说分析助手。请对以下已导入的小说章节进行全面分析。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "chat_system": "你是一个专业的小说创作助手，正在帮助作者进行小说续写。\n你拥有当前项目的完整上下文，包括角色、伏笔、时间线、最近章节内容和章纲。\n请基于这些信息回答作者的问题，给出具体、可操作的建议。\n{context}\n\n请用专业但友好的语气回答，给出具体可操作的建议。\n重要：请用纯文本格式回复，不要使用 markdown 语法（不要用 # 标题、**加粗**、- 列表、```代码块```等）。用自然段落和换行来组织内容。",
    "style_analysis": "你是一个专业的文学风格分析师。请分析以下小说片段的写作风格。\n{context}\n\n请从以下维度进行分析，并给出简洁的总结：\n1. 叙事视角（第一人称/第三人称限制/第三人称全知等）\n2. 语言风格（简洁/华丽/口语化/文言化等）\n3. 描写特点（白描/工笔/意识流等）\n4. 对话风格（简洁/冗长/方言/书面语等）\n5. 节奏特点（快节奏/慢节奏/张弛有度等）\n6. 常用修辞手法\n7. 段落结构特点\n\n请用中文输出，控制在500字以内。",
}


def _load_settings() -> dict:
    return load_settings()


def get_prompt(feature: str) -> str:
    """获取指定功能的提示词模板。优先从 settings.json 读取，找不到则返回默认值。"""
    settings = _load_settings()
    return settings.get("prompts", {}).get(feature, DEFAULT_TEMPLATES.get(feature, ""))


def format_prompt(feature: str, **kwargs) -> str:
    """加载模板并执行变量替换。

    Args:
        feature: 功能标识
        **kwargs: 模板变量，如 chapter=10, context="..."

    Returns:
        格式化后的提示词
    """
    from collections import defaultdict
    template = get_prompt(feature)
    safe_kwargs = defaultdict(str, kwargs)
    try:
        return template.format_map(safe_kwargs)
    except (KeyError, ValueError, IndexError):
        logger.warning("提示词模板格式错误: feature=%s", feature)
        return template
