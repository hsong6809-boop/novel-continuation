"""应用配置"""
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent

# 数据库（优先使用环境变量，支持打包模式）
_data_dir = os.environ.get("NOVEL_DATA_DIR")
DATABASE_DIR = Path(_data_dir) if _data_dir else BASE_DIR / "data"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_DIR}/novel.db"

# AI 模型配置
AI_PROVIDERS = {
    "deepseek": {
        "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
        "default_model": "deepseek-chat",
    },
    "mimo": {
        "base_url": os.getenv("MIMO_BASE_URL", "https://api.mimo.xiaomi.com/v1"),
        "api_key": os.getenv("MIMO_API_KEY", ""),
        "default_model": "mimo-chat",
    },
}

# 续写配置
CONTINUATION = {
    "target_words_per_chapter": 2500,
    "context": {
        "recent_chapters_full": 15,
        "retrieval_enabled": True,
        "max_retrieval_snippets": 5,
        "snippet_length": 400,
    },
}
