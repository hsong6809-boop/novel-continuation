"""提示词管理器 - 从 settings.json 读取提示词模板，支持变量替换"""
import json
from pathlib import Path
from config import BASE_DIR

SETTINGS_FILE = BASE_DIR / "data" / "settings.json"

DEFAULT_TEMPLATES = {
    "continuation": "你是一个专业的小说续写 AI。请根据以下信息续写小说。\n{context}\n\n请直接续写正文内容，不要输出章节标题或编号。保持与前文一致的风格和人物性格。目标字数约2500字。",
    "chapter_outline": "你是一个专业的小说大纲策划师。请为第{chapter}章生成详细的章纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "batch_outline": "你是一个专业的小说策划编辑。请为以下分卷一次性生成所有章节的章纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "volume_outline": "你是一个专业的小说策划编辑。请基于总纲，为这部小说规划前 {count} 卷的分卷大纲。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "overall_outline": "你是一个专业的小说策划编辑。请为这部小说生成总纲。\n{context}\n\n注意：不要规划分卷，分卷大纲将单独规划。总纲只关注整体故事结构和走向。\n请根据已有内容合理规划。如果小说刚开始，可以多规划未来方向；如果已有大量内容，侧重总结和后续规划。\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "meta_extraction": "你是一个小说分析助手。请从以下章节内容中提取元数据。\n{context}\n\n只提取确实存在的信息，不要编造。如果某项为空，返回空数组或空对象。\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "preprocess": "你是一个专业的小说分析助手。请对以下已导入的小说章节进行全面分析。\n{context}\n\n请直接输出 JSON，不要加 markdown 代码块标记。",
    "chat_system": "你是一个专业的小说创作助手，正在帮助作者进行小说续写。\n你拥有当前项目的完整上下文，包括角色、伏笔、时间线、最近章节内容和章纲。\n请基于这些信息回答作者的问题，给出具体、可操作的建议。\n{context}\n\n你可以帮助作者讨论：\n- 剧情走向和情节设计（基于已有伏笔和角色性格）\n- 角色塑造和人物关系（基于已有角色档案）\n- 世界观设定\n- 写作风格和技巧\n- 章节大纲和结构\n- 伏笔的埋设和回收\n- 时间线的连贯性\n\n请用专业但友好的语气回答，给出具体可操作的建议。",
    "style_analysis": "你是一个专业的文学风格分析师。请分析以下小说片段的写作风格。\n{context}\\n\n请从以下维度进行分析，并给出简洁的总结：\n1. 叙事视角（第一人称/第三人称限制/第三人称全知等）\n2. 语言风格（简洁/华丽/口语化/文言化等）\n3. 描写特点（白描/工笔/意识流等）\n4. 对话风格（简洁/冗长/方言/书面语等）\n5. 节奏特点（快节奏/慢节奏/张弛有度等）\n6. 常用修辞手法\n7. 段落结构特点\n\n请用中文输出，控制在500字以内。",
}


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


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
    template = get_prompt(feature)
    try:
        return template.format_map(kwargs)
    except (KeyError, ValueError):
        default = DEFAULT_TEMPLATES.get(feature, "")
        try:
            return default.format_map(kwargs)
        except (KeyError, ValueError):
            return default
