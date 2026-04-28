"""全局设置路由"""
import json
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import BASE_DIR

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTINGS_FILE = BASE_DIR / "data" / "settings.json"

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
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


def _save(data: dict):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class ProviderUpdate(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    default_model: Optional[str] = None


class SettingsUpdate(BaseModel):
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
    provider: Optional[str] = None  # 要更新哪个 provider 的配置
    provider_config: Optional[ProviderUpdate] = None
    model_configs: Optional[dict] = None
    prompts: Optional[dict] = None


@router.get("")
async def get_settings():
    data = _load()
    # 隐藏 API key 中间部分，只显示前4后4
    safe = json.loads(json.dumps(data))
    for pname, pcfg in safe.get("api_providers", {}).items():
        key = pcfg.get("api_key", "")
        if len(key) > 8:
            pcfg["api_key_masked"] = key[:4] + "****" + key[-4:]
        else:
            pcfg["api_key_masked"] = "****" if key else ""
    return safe


@router.put("")
async def update_settings(data: SettingsUpdate):
    settings = _load()

    # 先更新 provider 配置（如果有）
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
        if data.provider_config.api_key is not None:
            pcfg["api_key"] = data.provider_config.api_key
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

    # 自动同步：active_model 必须与 active_provider 的 default_model 一致
    ap = settings.get("active_provider", "")
    providers = settings.get("api_providers", {})
    if ap in providers:
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
    api_key: str


@router.post("/models")
async def fetch_available_models(req: FetchModelsRequest):
    """根据 base_url 和 api_key 自动拉取模型列表（OpenAI 兼容格式：{base_url}/models）"""
    base = req.base_url.rstrip("/")
    models_url = base + "/models"

    headers = {"Authorization": f"Bearer {req.api_key}"} if req.api_key else {}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(models_url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(400, f"无法连接到 {models_url}，请检查 Base URL")
    except httpx.HTTPStatusError as e:
        raise HTTPException(400, f"API 返回错误 {e.response.status_code}，请检查 API Key")
    except Exception as e:
        raise HTTPException(400, f"请求失败: {str(e)}")

    # 解析模型列表，兼容 OpenAI 格式 {"data": [{"id": "xxx", ...}]}
    models = []
    if isinstance(data, dict) and "data" in data:
        for item in data["data"]:
            mid = item.get("id", "")
            if mid:
                models.append(mid)
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, str):
                models.append(item)
            elif isinstance(item, dict) and "id" in item:
                models.append(item["id"])

    # 去重并排序
    models = sorted(set(models))

    if not models:
        raise HTTPException(400, "API 返回的模型列表为空，请检查 API Key 是否有效")

    return {"models": models}
