"""全局设置路由"""
import json
import logging
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import DATABASE_DIR
from utils.settings_cache import load_settings, invalidate_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_FILE = DATABASE_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "api_providers": {
        "deepseek": {
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "",
            "default_model": "",
        },
        "mimo": {
            "base_url": "https://api.mimo.xiaomi.com/v1",
            "api_key": "",
            "default_model": "",
        },
        "openai-compatible": {
            "base_url": "",
            "api_key": "",
            "default_model": "",
        },
    },
    "active_provider": "deepseek",
    "active_model": "",
    "model_configs": {
        "continuation": {"provider": None, "model": None},
        "chapter_outline": {"provider": None, "model": None},
        "batch_outline": {"provider": None, "model": None},
        "volume_outline": {"provider": None, "model": None},
        "overall_outline": {"provider": None, "model": None},
        "meta_extraction": {"provider": None, "model": None},
        "preprocess": {"provider": None, "model": None},
        "chat": {"provider": None, "model": None},
    },
    "prompts": {},
}


def _load() -> dict:
    data = load_settings()
    if not data:
        return DEFAULT_SETTINGS.copy()
    return data


def _save(data: dict):
    """保存设置（原子写入，防止并发读写损坏）"""
    import tempfile
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(SETTINGS_FILE.parent), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, str(SETTINGS_FILE))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    invalidate_cache()


class ProviderUpdate(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    default_model: Optional[str] = None


class SettingsUpdate(BaseModel):
    model_config = {'protected_namespaces': ()}
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
    provider: Optional[str] = None  # 要更新哪个 provider 的配置（单个）
    provider_config: Optional[ProviderUpdate] = None
    api_providers: Optional[dict] = None  # 批量更新所有 provider
    model_configs: Optional[dict] = None
    prompts: Optional[dict] = None


@router.get("")
async def get_settings():
    data = _load()
    # 隐藏 API key 中间部分，只显示前4后4
    safe = json.loads(json.dumps(data))
    for pname, pcfg in safe.get("api_providers", {}).items():
        key = pcfg.pop("api_key", "")
        if len(key) > 8:
            pcfg["api_key_masked"] = key[:4] + "****" + key[-4:]
        else:
            pcfg["api_key_masked"] = "****" if key else ""
    return safe


@router.put("")
async def update_settings(data: SettingsUpdate):
    settings = _load()

    # 批量更新所有 provider 配置（新方式）
    if data.api_providers is not None:
        for name, cfg in data.api_providers.items():
            if name not in settings.get("api_providers", {}):
                settings.setdefault("api_providers", {})[name] = {
                    "base_url": "",
                    "api_key": "",
                    "default_model": "",
                }
            pcfg = settings["api_providers"][name]
            if cfg.get("base_url") is not None:
                pcfg["base_url"] = cfg["base_url"]
            if cfg.get("default_model") is not None:
                pcfg["default_model"] = cfg["default_model"]
            # api_key 处理：跳过空值和遮蔽值
            incoming_key = cfg.get("api_key", "")
            if incoming_key and incoming_key.strip():
                is_masked = ("****" in incoming_key and len(incoming_key) > 8
                             and incoming_key.index("****") == 4)
                if not is_masked:
                    pcfg["api_key"] = incoming_key

    # 单个 provider 更新（旧方式，保留兼容）
    if data.provider and data.provider_config:
        if data.provider not in settings.get("api_providers", {}):
            settings.setdefault("api_providers", {})[data.provider] = {
                "base_url": "",
                "api_key": "",
                "default_model": "",
            }
        pcfg = settings["api_providers"][data.provider]
        if data.provider_config.base_url is not None:
            pcfg["base_url"] = data.provider_config.base_url
        if data.provider_config.api_key is not None and data.provider_config.api_key.strip():
            incoming_key = data.provider_config.api_key
            is_masked = ("****" in incoming_key and len(incoming_key) > 8
                         and incoming_key.index("****") == 4)
            if not is_masked:
                pcfg["api_key"] = incoming_key
        if data.provider_config.default_model is not None:
            pcfg["default_model"] = data.provider_config.default_model

    # 更新 active_provider
    if data.active_provider is not None:
        settings["active_provider"] = data.active_provider

    # 更新 active_model
    if data.active_model is not None:
        settings["active_model"] = data.active_model

    # 更新 model_configs
    if data.model_configs is not None:
        settings.setdefault("model_configs", {}).update(data.model_configs)

    # 更新 prompts
    if data.prompts is not None:
        settings.setdefault("prompts", {}).update(data.prompts)

    # 自动同步：仅当用户未显式设置 active_model 且当前 active_model 为空时，才同步
    ap = settings.get("active_provider", "")
    providers = settings.get("api_providers", {})
    if ap in providers and not settings.get("active_model"):
        provider_default = providers[ap].get("default_model", "")
        if provider_default:
            settings["active_model"] = provider_default

    _save(settings)
    return {"status": "ok"}


@router.get("/providers")
async def list_providers():
    settings = _load()
    return {
        "providers": settings.get("api_providers", {}),
        "active_provider": settings.get("active_provider", "deepseek"),
        "active_model": settings.get("active_model", "deepseek-chat"),
    }


class FetchModelsRequest(BaseModel):
    base_url: str
    api_key: str = ""  # 可为空，为空时从 settings 中读取已保存的 key
    provider_name: str = ""  # 可选，用于从 settings 中查找对应的 key


@router.get("/default-prompts")
async def get_default_prompts():
    """返回所有功能的默认提示词模板"""
    from utils.prompt_manager import DEFAULT_TEMPLATES
    return DEFAULT_TEMPLATES


@router.post("/models")
async def fetch_available_models(req: FetchModelsRequest):
    """根据 base_url 和 api_key 自动拉取模型列表（OpenAI 兼容格式：{base_url}/models）"""
    # 如果 api_key 为空，尝试从 settings 中读取已保存的 key
    api_key = req.api_key
    if not api_key and req.provider_name:
        settings = _load()
        provider_cfg = settings.get("api_providers", {}).get(req.provider_name, {})
        api_key = provider_cfg.get("api_key", "")
    
    # SSRF 防护：禁止内网地址
    from urllib.parse import urlparse
    import socket
    import ipaddress
    parsed = urlparse(req.base_url)
    hostname = parsed.hostname or ""

    logger.info(f"SSRF check: hostname={hostname}, base_url={req.base_url}")

    # 允许本地地址（Cherry Studio、Ollama 等本地工具）
    local_allowed = ['localhost', '127.0.0.1', '::1']
    if hostname in local_allowed:
        # 本地地址直接放行
        pass
    else:
        # 检查是否是 IP 地址
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                logger.warning(f"SSRF blocked: private IP access attempt from {hostname}")
                raise HTTPException(400, "不允许访问内网地址")
        except ValueError:
            pass  # hostname 不是 IP，继续

        # 检查常见的保留域名
        blocked = ['metadata.google.internal', '169.254.169.254']
        if hostname in blocked:
            logger.warning(f"SSRF blocked: reserved domain attempt from {hostname}")
            raise HTTPException(400, "不允许访问保留域名")

        # DNS 解析后检查所有解析到的 IP（防 DNS Rebinding 攻击）
        try:
            results = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for family, _, _, _, sockaddr in results:
                ip = ipaddress.ip_address(sockaddr[0])
                if ip.is_private or ip.is_loopback or ip.is_link_local:
                    logger.warning(f"SSRF blocked: domain {hostname} resolved to private IP {sockaddr[0]}")
                    raise HTTPException(400, "域名解析到内网地址，已拦截")
        except socket.gaierror:
            raise HTTPException(400, "无法解析域名")

    base = req.base_url.rstrip("/")
    models_url = base + "/models"

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    # 支持分页获取全部模型
    all_data = []
    url = models_url
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            while url:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and "data" in data:
                    all_data.extend(data["data"])
                    # 检查是否有下一页（OpenAI 兼容分页格式）
                    if data.get("has_more") and data.get("next_page_token"):
                        url = f"{models_url}?page_token={data['next_page_token']}"
                    elif data.get("has_more") and data.get("after"):
                        url = f"{models_url}?after={data['after']}"
                    else:
                        break
                elif isinstance(data, list):
                    all_data.extend(data)
                    break
                else:
                    break
    except httpx.ConnectError:
        raise HTTPException(400, f"无法连接到 {models_url}，请检查 Base URL")
    except httpx.HTTPStatusError as e:
        raise HTTPException(400, f"API 返回错误 {e.response.status_code}，请检查 API Key")
    except Exception as e:
        logger.error("获取模型列表失败: url=%s", req.base_url, exc_info=True)
        raise HTTPException(500, "无法获取模型列表，请检查 API 地址和密钥")

    # 解析模型列表
    models = []
    for item in all_data:
        if isinstance(item, str):
            models.append(item)
        elif isinstance(item, dict):
            mid = item.get("id", "")
            if mid:
                models.append(mid)

    # 去重并排序
    models = sorted(set(models))

    if not models:
        raise HTTPException(400, "API 返回的模型列表为空，请检查 API Key 是否有效")

    return {"models": models}
