"""统一日志配置"""
import logging
import sys
from config import BASE_DIR

# 创建日志目录（惰性：避免 import 时在只读环境中失败）
_log_dir = None


def _ensure_log_dir():
    global _log_dir
    if _log_dir is None:
        _log_dir = BASE_DIR / "data"
        try:
            _log_dir.mkdir(exist_ok=True)
        except OSError:
            pass


_ensure_log_dir()

# 配置根日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_log_dir / "app.log", encoding="utf-8"),
    ],
)


