"""FastAPI 应用入口"""
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from models.database import init_db
from routers import (
    projects, outlines, chapters, characters,
    foreshadowing, timeline, chat, style, settings_library,
    settings, import_chapters, export,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    await init_db()
    yield
    # 清理资源
    from models.database import close_db
    await close_db()
    from services.llm_client import close_http_client
    await close_http_client()


app = FastAPI(
    title="小说续写 Agent",
    description="AI 辅助小说续写工具",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
@app.middleware("http")
async def limit_upload_size(request, call_next):
    """限制上传文件大小为 50MB"""
    if request.url.path.endswith("/import/file"):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > 50 * 1024 * 1024:
                    return JSONResponse(status_code=413, content={"detail": "文件大小超过50MB限制"})
            except ValueError:
                pass
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# 路由 — 按领域拆分
app.include_router(projects.router)         # 项目 CRUD
app.include_router(outlines.router)         # 总纲 + 分卷 + 章纲 + 场景
app.include_router(chapters.router)         # 章节 + 续写 + 版本 + 元数据 + 自审
app.include_router(characters.router)       # 角色 + 快照
app.include_router(foreshadowing.router)    # 伏笔
app.include_router(timeline.router)         # 时间线
app.include_router(chat.router)             # 对话
app.include_router(style.router)            # 风格 + 风格基线
app.include_router(settings_library.router) # 设定库
app.include_router(settings.router)         # 系统设置
app.include_router(import_chapters.router)  # 章节导入
app.include_router(export.router)           # 导出


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理：捕获未处理的异常，返回统一格式的错误响应。

    不向客户端暴露异常类型和消息，避免泄露内部实现细节。
    """
    logger.error("未处理的异常: method=%s path=%s", request.method, request.url.path, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误，请稍后重试"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


# ---- 静态文件：提供前端 dist ----
import os
from starlette.staticfiles import StaticFiles as _StaticFiles
from starlette.responses import FileResponse as _FileResponse

_backend_dir = os.path.dirname(os.path.abspath(__file__))
# 优先使用环境变量（打包模式），否则用相对路径（开发模式）
_dist = os.environ.get("NOVEL_FRONTEND_DIST") or os.path.join(os.path.dirname(_backend_dir), "frontend", "dist")
logger.info("Static dist path: %s (exists=%s)", _dist, os.path.isdir(_dist))
if os.path.isdir(_dist):
    app.mount("/assets", _StaticFiles(directory=os.path.join(_dist, "assets")), name="static-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str):
        file_path = os.path.join(_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return _FileResponse(file_path)
        return _FileResponse(os.path.join(_dist, "index.html"))

    logger.info("Static file serving enabled for %s", _dist)
else:
    logger.warning("Frontend dist not found at %s", _dist)
