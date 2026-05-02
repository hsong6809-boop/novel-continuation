"""统一的 settings.json 缓存管理"""
import json
import logging
import os
import time
from pathlib import Path
from config import BASE_DIR

logger = logging.getLogger(__name__)

SETTINGS_FILE = BASE_DIR / "data" / "settings.json"

_cache = {"data": None, "mtime": 0}


def load_settings() -> dict:
    """加载 settings.json，带文件修改时间缓存"""
    if SETTINGS_FILE.exists():
        try:
            mtime = SETTINGS_FILE.stat().st_mtime
            if _cache["data"] is not None and _cache["mtime"] == mtime:
                return _cache["data"]
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _cache["data"] = data
            _cache["mtime"] = mtime
            return data
        except Exception:
            logger.warning("settings.json 解析失败", exc_info=True)
    return {}


def invalidate_cache():
    """手动失效缓存（用于 settings 保存后）"""
    _cache["mtime"] = 0
