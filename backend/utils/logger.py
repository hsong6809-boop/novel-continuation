"""统一日志配置"""
import logging
import sys
from config import BASE_DIR

# 创建日志目录
log_dir = BASE_DIR / "data"
log_dir.mkdir(exist_ok=True)

# 配置根日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_dir / "app.log", encoding="utf-8"),
    ],
)


def get_logger(name: str) -> logging.Logger:
    """获取模块日志器"""
    return logging.getLogger(name)
