"""项目元数据内存缓存 - 减少频繁的 DB 查询

缓存项目基本信息、角色列表、伏笔列表等高频读取数据。
通过 TTL 自动过期 + 手动失效机制保证一致性。
"""
import time
from typing import Any

# 缓存结构: {cache_key: {"data": Any, "expires_at": float}}
_cache: dict[str, dict] = {}

# 默认 TTL（秒）
DEFAULT_TTL = 60


def get_cached(key: str) -> Any | None:
    """获取缓存值，过期返回 None"""
    entry = _cache.get(key)
    if entry and entry["expires_at"] > time.monotonic():
        return entry["data"]
    return None


def set_cached(key: str, data: Any, ttl: int = DEFAULT_TTL):
    """设置缓存值"""
    _cache[key] = {
        "data": data,
        "expires_at": time.monotonic() + ttl,
    }


def invalidate_project(project_id: int):
    """使指定项目的所有缓存失效（项目数据变更时调用）"""
    prefix = f"project:{project_id}:"
    keys_to_remove = [k for k in _cache if k.startswith(prefix)]
    for k in keys_to_remove:
        del _cache[k]


def invalidate_all():
    """清除所有缓存"""
    _cache.clear()


# 便捷的缓存键生成
def project_key(project_id: int) -> str:
    return f"project:{project_id}:info"


def characters_key(project_id: int) -> str:
    return f"project:{project_id}:characters"


def foreshadowing_key(project_id: int) -> str:
    return f"project:{project_id}:foreshadowing"


def style_key(project_id: int) -> str:
    return f"project:{project_id}:style"
