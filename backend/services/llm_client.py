"""通用 LLM 调用客户端 - 从 settings.json 读取 API 配置"""
import json
import asyncio
import httpx
from pathlib import Path
from config import BASE_DIR

SETTINGS_FILE = BASE_DIR / "data" / "settings.json"

MAX_RETRIES = 2
RETRY_BASE_DELAY = 1.0  # 秒


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def get_active_config() -> dict:
    """返回当前激活的 provider 配置: { base_url, api_key, model }"""
    settings = _load_settings()
    provider_name = settings.get("active_provider", "")
    model_name = settings.get("active_model", "")
    providers = settings.get("api_providers", {})
    cfg = providers.get(provider_name, {})
    return {
        "base_url": cfg.get("base_url", ""),
        "api_key": cfg.get("api_key", ""),
        "model": model_name or cfg.get("default_model", ""),
    }


def get_model_for_feature(feature: str) -> dict:
    """返回指定功能的模型配置。如果该功能未配置独立模型，fallback 到全局配置。

    Args:
        feature: 功能标识，如 'continuation', 'chapter_outline', 'meta_extraction' 等

    Returns:
        { base_url, api_key, model } — 与 get_active_config 格式一致
    """
    settings = _load_settings()
    feature_cfg = settings.get("model_configs", {}).get(feature, {})
    provider_name = feature_cfg.get("provider")
    model_name = feature_cfg.get("model")

    # 如果功能未配置独立 provider/model，使用全局配置
    if not provider_name:
        provider_name = settings.get("active_provider", "")
    if not model_name:
        model_name = settings.get("active_model", "")

    providers = settings.get("api_providers", {})
    cfg = providers.get(provider_name, {})
    return {
        "base_url": cfg.get("base_url", ""),
        "api_key": cfg.get("api_key", ""),
        "model": model_name or cfg.get("default_model", ""),
    }


async def chat_completion(messages: list, model: str = None,
                          temperature: float = 0.7,
                          max_tokens: int = 4096,
                          feature: str = None) -> dict:
    """调用 OpenAI 兼容的 chat/completions 接口（带指数退避重试）

    Args:
        feature: 功能标识，用于按功能选择不同模型。None 时使用全局模型。
    """
    cfg = get_model_for_feature(feature) if feature else get_active_config()
    if not cfg["base_url"] or not cfg["api_key"]:
        raise ValueError("未配置 API Provider，请在设置页面填写 Base URL 和 API Key")
    if not cfg["model"]:
        raise ValueError("未选择模型，请在设置页面选择一个默认模型")

    use_model = model or cfg["model"]
    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": use_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                # 429 或 5xx 错误时重试
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500 and e.response.status_code != 429:
                    raise
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
            else:
                raise


def extract_content(response: dict) -> str:
    """从 chat completion 响应中提取文本内容"""
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        return ""


async def chat_completion_stream(messages: list, model: str = None,
                                 temperature: float = 0.7,
                                 max_tokens: int = 4096,
                                 feature: str = None):
    """流式调用 OpenAI 兼容的 chat/completions 接口，yield 每个 chunk 的文本（带重试）

    Args:
        feature: 功能标识，用于按功能选择不同模型。None 时使用全局模型。
    """
    cfg = get_model_for_feature(feature) if feature else get_active_config()
    if not cfg["base_url"] or not cfg["api_key"]:
        raise ValueError("未配置 API Provider，请在设置页面填写 Base URL 和 API Key")
    if not cfg["model"]:
        raise ValueError("未选择模型，请在设置页面选择一个默认模型")

    use_model = model or cfg["model"]
    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": use_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0].get("delta", {})
                            text = delta.get("content", "")
                            if text:
                                yield text
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
            return  # 成功完成，退出重试循环
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500 and e.response.status_code != 429:
                    raise
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
            else:
                raise
