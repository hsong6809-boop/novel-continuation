"""通用 LLM 调用客户端 - 从 settings.json 读取 API 配置"""
import json
import logging
import asyncio
import httpx
from pathlib import Path
from config import BASE_DIR
from utils.settings_cache import load_settings

logger = logging.getLogger(__name__)

# 模块级 HTTP 客户端（连接复用）
_http_client: httpx.AsyncClient | None = None


async def get_http_client(timeout: httpx.Timeout = None) -> httpx.AsyncClient:
    """获取复用的 httpx.AsyncClient 单例（非流式请求复用）

    单例使用宽松的默认超时，各请求通过 request-level timeout 精确控制。
    """
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(connect=30, read=300, write=30, pool=30))
    return _http_client


async def get_stream_client(timeout: httpx.Timeout = None) -> httpx.AsyncClient:
    """流式请求使用独立客户端（timeout 不同，不能复用单例）"""
    return httpx.AsyncClient(timeout=timeout or httpx.Timeout(connect=30, read=300, write=30, pool=30))


async def close_http_client():
    """关闭 HTTP 客户端（应用退出时调用）"""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


MAX_RETRIES = 2
RETRY_BASE_DELAY = 1.0  # 秒


def _load_settings() -> dict:
    return load_settings()


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


def _prepare_request(messages: list, model: str = None,
                     temperature: float = 0.7, max_tokens: int = 4096,
                     feature: str = None, stream: bool = False) -> tuple:
    """准备请求参数（共享逻辑）

    Returns:
        (url, headers, payload, timeout)
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
    if stream:
        payload["stream"] = True

    if stream:
        timeout = httpx.Timeout(connect=30, read=300, write=30, pool=30)
    else:
        timeout = httpx.Timeout(connect=30, read=120, write=30, pool=30)
    return url, headers, payload, timeout


async def _retry_loop(coro_factory, max_retries: int = MAX_RETRIES):
    """通用重试循环（带指数退避）"""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_factory()
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_error = e
            if attempt < max_retries:
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500 and e.response.status_code != 429:
                    raise
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
            else:
                raise


async def chat_completion(messages: list, model: str = None,
                          temperature: float = 0.7,
                          max_tokens: int = 4096,
                          feature: str = None) -> dict:
    """调用 OpenAI 兼容的 chat/completions 接口（带指数退避重试）

    Args:
        feature: 功能标识，用于按功能选择不同模型。None 时使用全局模型。
    """
    url, headers, payload, timeout = _prepare_request(
        messages, model, temperature, max_tokens, feature, stream=False
    )

    async def do_request():
        client = await get_http_client()
        resp = await client.post(url, json=payload, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    return await _retry_loop(do_request)


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
    url, headers, payload, timeout = _prepare_request(
        messages, model, temperature, max_tokens, feature, stream=True
    )

    async def do_request():
        client = await get_stream_client(timeout)
        try:
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
                        # 深度思考内容（reasoning_content）
                        reasoning = delta.get("reasoning_content", "")
                        if reasoning:
                            yield {"type": "reasoning", "content": reasoning}
                        # 正文内容
                        text = delta.get("content", "")
                        if text:
                            yield {"type": "content", "content": text}
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        finally:
            await client.aclose()

    # 流式重试：仅在连接建立前失败时重试（ConnectError, HTTP 429/5xx），
    # 流式传输中途断开（ReadTimeout）不重试，避免重复输出已 yield 的内容
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async for text in do_request():
                yield text
            return
        except httpx.ConnectError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
            else:
                raise
        except httpx.HTTPStatusError as e:
            last_error = e
            if e.response.status_code == 429 or e.response.status_code >= 500:
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                else:
                    raise
            else:
                raise
        except (httpx.ReadTimeout, httpx.WriteTimeout):
            # 流式中途超时不重试（部分内容已 yield，重试会重复）
            raise
