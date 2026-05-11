"""笔下寸心 - 桌面应用入口
PyWebView 窗口 + FastAPI 后端（后台线程）
"""
import sys
import os
import threading
import logging
import socket
import time

# ============================================================
# 路径处理：兼容 PyInstaller 打包和开发环境
# ============================================================
if getattr(sys, 'frozen', False):
    # PyInstaller 打包后
    BASE_DIR = os.path.dirname(sys.executable)
    BUNDLE_DIR = sys._MEIPASS  # PyInstaller 解压临时目录（包含打包的代码和资源）
else:
    # 开发环境
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR

BACKEND_DIR = os.path.join(BUNDLE_DIR, "backend")  # 后端代码在临时目录
FRONTEND_DIST = os.path.join(BUNDLE_DIR, "frontend", "dist")  # 前端 dist 也在临时目录

# 打包模式下，后端代码在临时目录中
if getattr(sys, 'frozen', False):
    # 把打包的 backend 加入 sys.path
    bundled_backend = os.path.join(BUNDLE_DIR, "backend")
    if bundled_backend not in sys.path:
        sys.path.insert(0, bundled_backend)
    # 设置 backend 的工作目录，让 config.py 能找到 data/
    os.chdir(bundled_backend)
else:
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    os.chdir(BACKEND_DIR)

# 设置环境变量，让后端知道前端 dist 的位置
os.environ["NOVEL_FRONTEND_DIST"] = FRONTEND_DIST
os.environ["NOVEL_DATA_DIR"] = os.path.join(BASE_DIR, "data")  # 数据目录在 exe 旁边

# ============================================================
# 日志配置
# ============================================================
log_dir = os.path.join(BASE_DIR, "logs")
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(log_dir, "app.log"), encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("笔下寸心")


# ============================================================
# 端口检测
# ============================================================
def find_free_port(start=8000, end=8100):
    """从 start 开始找一个可用端口"""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return None


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


PORT = 8000


# ============================================================
# 后端启动
# ============================================================
def start_backend(port: int):
    """在后台线程启动 FastAPI"""
    import uvicorn
    from main import app

    # 动态修改静态文件路径（打包后路径不同）
    _patch_static_paths(app, port)

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


def _patch_static_paths(app, port: int):
    """修正静态文件路径，确保打包后能找到前端 dist"""
    import starlette.staticfiles
    import starlette.responses

    dist = FRONTEND_DIST
    if not os.path.isdir(dist):
        logger.warning("前端 dist 目录不存在: %s", dist)
        return

    # 移除旧的静态文件路由（如果存在），重新挂载
    # PyWebView 模式下不需要静态文件服务，窗口直接加载 URL
    # 但保留 API 路由
    logger.info("前端 dist: %s", dist)


# ============================================================
# PyWebView 窗口
# ============================================================
def create_window(port: int):
    """创建桌面窗口"""
    import webview

    url = f"http://127.0.0.1:{port}"

    # 等待后端就绪
    logger.info("等待后端启动...")
    for i in range(30):  # 最多等 30 秒
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect(("127.0.0.1", port))
                logger.info("后端已就绪 (端口 %d)", port)
                break
        except (ConnectionRefusedError, OSError):
            time.sleep(0.5)
    else:
        logger.error("后端启动超时")
        return

    window = webview.create_window(
        title="笔下寸心",
        url=url,
        width=1400,
        height=900,
        min_size=(960, 640),
        resizable=True,
        zoomable=True,
        text_select=True,
    )

    # 关闭窗口时的回调
    def on_closed():
        logger.info("窗口已关闭，程序退出")
        os._exit(0)  # 强制退出所有线程

    window.events.closed += on_closed

    logger.info("启动桌面窗口...")
    webview.start(debug=False)


# ============================================================
# 主入口
# ============================================================
def main():
    global PORT

    logger.info("=" * 50)
    logger.info("笔下寸心 启动中...")
    logger.info("BASE_DIR: %s", BASE_DIR)
    logger.info("BACKEND_DIR: %s", BACKEND_DIR)
    logger.info("FRONTEND_DIST: %s", FRONTEND_DIST)
    logger.info("=" * 50)

    # 检测端口
    if is_port_in_use(8000):
        PORT = find_free_port(8000, 8100)
        if PORT is None:
            logger.error("没有可用端口 (8000-8099)")
            input("按回车退出...")
            return
        logger.warning("端口 8000 被占用，使用端口 %d", PORT)
    else:
        PORT = 8000

    # 后台启动 FastAPI
    backend_thread = threading.Thread(target=start_backend, args=(PORT,), daemon=True)
    backend_thread.start()

    # 主线程启动 PyWebView（阻塞）
    create_window(PORT)


if __name__ == "__main__":
    main()
