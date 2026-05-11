"""项目元数据内存缓存 - 减少频繁的 DB 查询

缓存项目基本信息、角色列表、伏笔列表等高频读取数据。
通过 TTL 自动过期 + 手动失效机制保证一致性。

注意：本模块假设在 asyncio 单线程事件循环下运行，模块级 _cache 字典
不具备线程安全。若未来引入多线程，需替换为 threading.Lock 保护。
"""
import time
from typing import Any

# 缓存结构: {cache_key: {"data": Any, "expires_at": float}}
_cache: dict[str, dict] = {}

# 默认 TTL（秒）
DEFAULT_TTL = 60


def get_cached(key: str) -> Any | None:
    """获取缓存值，过期返回 None（同时清理过期条目）"""
    entry = _cache.get(key)
    if entry is None:
        return None
    if entry["expires_at"] <= time.monotonic():
        del _cache[key]
        return None
    return entry["data"]


def set_cached(key: str, data: Any, ttl: int = DEFAULT_TTL):
    """设置缓存值"""
    if len(_cache) > 500:
        now = time.monotonic()
        # 先清理过期条目
        expired = [k for k, v in _cache.items() if v.get("expires_at", 0) < now]
        for k in expired:
            del _cache[k]
        # 如果仍然超过上限，按过期时间淘汰最早的
        if len(_cache) > 500:
            sorted_keys = sorted(_cache, key=lambda k: _cache[k].get("expires_at", 0))
            for k in sorted_keys[:len(_cache) - 400]:
                del _cache[k]
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


def characters_ctx_key(project_id: int) -> str:
    return f"project:{project_id}:characters:ctx"


def foreshadowing_key(project_id: int) -> str:
    return f"project:{project_id}:foreshadowing"


def foreshadowing_active_key(project_id: int) -> str:
    return f"project:{project_id}:foreshadowing:active"


def style_key(project_id: int) -> str:
    return f"project:{project_id}:style"


def timeline_key(project_id: int) -> str:
    return f"project:{project_id}:timeline"


def outlines_key(project_id: int) -> str:
    return f"project:{project_id}:outlines"


def chapters_key(project_id: int) -> str:
    return f"project:{project_id}:chapters"


def projects_list_key() -> str:
    return "projects:list"
