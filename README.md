# 小说续写系统

一个完整的 AI 辅助小说续写工具，支持章纲管理、角色档案、风格控制、伏笔追踪、时间线管理、辅助对话等功能。

## 技术栈

- **后端**: Python FastAPI + SQLite + Pydantic
- **前端**: React 19 + Vite 6 + TailwindCSS 4 + React Router 7
- **AI**: OpenAI API（可配置任意兼容端点）

## 项目结构

```
novel-continuation/
├── backend/
│   ├── main.py                    # FastAPI 入口
│   ├── config.py                  # 全局配置
│   ├── models/
│   │   ├── database.py            # SQLite 数据库连接与建表
│   │   └── schemas.py             # Pydantic 请求/响应模型
│   ├── routers/
│   │   ├── projects.py            # 项目 CRUD + 角色/章纲/风格/伏笔/时间线/对话/续写
│   │   ├── import_chapters.py     # 章节导入（粘贴/上传文件）
│   │   ├── export.py              # 导出 TXT/DOCX/EPUB
│   │   └── settings.py            # 系统设置（API Provider 管理）
│   ├── services/
│   │   ├── llm_client.py          # LLM 调用封装（带重试）
│   │   ├── context_service.py     # 续写上下文组装
│   │   ├── continuation_service.py# 续写生成
│   │   ├── chapter_service.py     # 章节保存与进度更新
│   │   ├── outline_service.py     # 章纲生成
│   │   ├── volume_outline_service.py  # 分卷大纲
│   │   ├── overall_outline_service.py # 总纲
│   │   ├── meta_service.py        # 元数据自动提取（伏笔/时间线/角色快照）
│   │   ├── chat_service.py        # 辅助对话
│   │   ├── fts_service.py         # FTS5 全文检索
│   │   └── preprocess_service.py  # 导入后预处理
│   ├── utils/
│   │   ├── prompt_manager.py      # 提示词模板管理
│   │   └── json_parser.py         # 通用 JSON 提取
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # 路由配置
│   │   ├── api/client.js          # API 客户端
│   │   ├── pages/
│   │   │   ├── ProjectList.jsx    # 项目列表
│   │   │   ├── ProjectDetail.jsx  # 项目详情（侧边栏+内容区）
│   │   │   └── SettingsPage.jsx   # 系统设置页
│   │   └── components/
│   │       ├── WriteWizard.jsx    # 续写向导
│   │       ├── OutlinePanel.jsx   # 章纲管理
│   │       ├── ImportPanel.jsx    # 章节导入
│   │       ├── CharacterPanel.jsx # 角色档案
│   │       ├── StylePanel.jsx     # 风格控制（含 AI 分析）
│   │       ├── ForeshadowPanel.jsx# 伏笔管理
│   │       ├── TimelinePanel.jsx  # 时间线
│   │       ├── ChatPanel.jsx      # 辅助对话
│   │       └── Layout.jsx         # 布局组件
│   └── package.json
├── start.bat                      # Windows 一键启动
└── README.md
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置 API Provider

启动后在设置页面配置 AI API Provider（Base URL + API Key + 模型名称），支持 OpenAI、DeepSeek 等兼容端点。

### 3. 启动后端

```bash
cd backend
python main.py
# 运行在 http://localhost:8000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
# 运行在 http://localhost:5173
```

或直接运行 `start.bat` 一键启动。

## 核心功能

### 📁 项目管理
- 创建/编辑/删除项目
- 上传 txt 文件自动拆分章节
- 项目元数据（题材、风格、字数统计）

### 📋 章纲管理
- 逐章编辑章纲（标题、核心目标、情感走向、章末钩子）
- AI 一键生成章纲（支持按卷批量生成）
- 场景要点管理（每章多个场景，含任务、对话提示、氛围、字数比例）
- 总纲 + 分卷大纲管理

### 👥 角色档案
- 创建角色（姓名、定位、年龄、性格、说话风格、外貌、背景、弧线）
- 续写时自动注入角色信息
- 角色快照自动提取

### 🎨 风格控制
- AI 自动分析原文风格
- 动态参数：描写密度(1-5)、对话占比(1-5)、叙事节奏(慢/中/快)
- 人工风格备注

### ✍️ 续写核心
- **上下文自动组装**：分卷概要 → 章纲 → 角色档案 → 风格参数 → 伏笔 → 前文 → FTS 早期片段
- **流式输出**：SSE 实时显示生成内容
- **元数据自动提取**：AI 自动识别伏笔、时间线事件、角色动态
- **多模型支持**：可为不同功能指定不同 AI 模型

### 👁️ 伏笔管理
- 自动从续写内容中提取伏笔
- 状态管理：活跃 → 已回收/已废弃
- 按状态筛选

### ⏰ 时间线
- 自动提取时间线事件
- 可视化时间轴展示

### 💬 辅助对话
- 与 AI 讨论剧情、角色、世界观
- 上下文感知（自动注入项目信息）

### 📤 导出
- 支持 TXT / DOCX / EPUB 三种格式
- 自动目录生成
