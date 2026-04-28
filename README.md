# 小说续写系统

一个完整的 AI 辅助小说续写工具，支持章纲管理、角色档案、风格控制、伏笔追踪、时间线管理、辅助对话等功能。

## 技术栈

- **后端**: Python FastAPI + SQLite + SQLAlchemy + Pydantic
- **前端**: React 19 + Vite 6 + TailwindCSS 4 + React Router 7
- **AI**: OpenAI API（可配置任意兼容端点）

## 项目结构

```
novel-continuation/
├── backend/
│   ├── main.py              # FastAPI 入口
│   ├── database.py          # 数据库连接
│   ├── models.py            # SQLAlchemy ORM 模型
│   ├── schemas.py           # Pydantic 请求/响应模型
│   ├── routers/             # API 路由
│   │   ├── projects.py      # 项目 CRUD
│   │   ├── chapters.py      # 章节管理
│   │   ├── outlines.py      # 章纲 + 场景要点
│   │   ├── characters.py    # 角色档案
│   │   ├── style.py         # 风格控制
│   │   ├── foreshadowing.py # 伏笔管理
│   │   ├── timeline.py      # 时间线
│   │   ├── chat.py          # 辅助对话
│   │   └── continuation.py  # 续写核心
│   ├── services/            # 业务逻辑
│   │   ├── context_assembler.py  # 上下文组装
│   │   ├── metadata_extractor.py # 元数据自动提取
│   │   └── llm_client.py        # LLM 调用封装
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # 路由配置
│   │   ├── api/client.js    # API 客户端
│   │   └── components/      # 页面组件
│   │       ├── ProjectList.jsx    # 项目列表
│   │       ├── ProjectDetail.jsx  # 项目详情（侧边栏+内容区）
│   │       ├── WriteWizard.jsx    # 续写向导
│   │       ├── OutlinePanel.jsx   # 章纲管理
│   │       ├── CharacterPanel.jsx # 角色档案
│   │       ├── StylePanel.jsx     # 风格控制
│   │       ├── ForeshadowPanel.jsx# 伏笔管理
│   │       ├── TimelinePanel.jsx  # 时间线
│   │       └── ChatPanel.jsx      # 辅助对话
│   └── package.json
└── README.md
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
# .env 文件
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
```

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

## 核心功能

### 📁 项目管理
- 创建/编辑/删除项目
- 上传 txt 文件自动拆分章节
- 项目元数据（题材、风格、字数统计）

### 📋 章纲管理
- 逐章编辑章纲（标题、核心目标、情感走向、章末钩子）
- AI 一键生成章纲
- 场景要点管理（每章多个场景，含任务、对话提示、氛围、字数比例）
- 分卷概要编辑

### 👥 角色档案
- 创建角色（姓名、定位、年龄、性格、说话风格、外貌、背景、弧线）
- 续写时自动注入角色信息

### 🎨 风格控制
- AI 自动分析原文风格
- 动态参数：描写密度(1-5)、对话占比(1-5)、叙事节奏(慢/中/快)
- 人工风格备注

### ✍️ 续写核心
- **上下文自动组装**：分卷概要 → 章纲 → 角色档案 → 风格参数 → 伏笔 → 前文
- **流式输出**：SSE 实时显示生成内容
- **元数据自动提取**：AI 自动识别伏笔、时间线事件、角色动态
- **字数控制**：可指定目标字数

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

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/projects` | 项目列表/创建 |
| GET/PUT/DELETE | `/api/projects/{id}` | 项目详情/更新/删除 |
| POST | `/api/projects/{id}/upload` | 上传 txt 文件 |
| GET | `/api/projects/{id}/chapters` | 章节列表 |
| GET/PUT | `/api/projects/{id}/chapters/{ch}` | 章节内容/更新 |
| GET/PUT | `/api/projects/{id}/outlines` | 章纲列表/批量更新 |
| GET/PUT | `/api/projects/{id}/outlines/{ch}` | 单章章纲 |
| POST | `/api/projects/{id}/outlines/{ch}/generate` | AI 生成章纲 |
| GET/PUT | `/api/projects/{id}/outlines/{ch}/scenes` | 场景要点 |
| GET/POST | `/api/projects/{id}/characters` | 角色列表/创建 |
| GET/PUT/DELETE | `/api/projects/{id}/characters/{cid}` | 角色详情/更新/删除 |
| GET/PUT | `/api/projects/{id}/style` | 风格参数 |
| GET | `/api/projects/{id}/foreshadowing` | 伏笔列表 |
| PUT | `/api/projects/{id}/foreshadowing/{fid}` | 更新伏笔状态 |
| GET | `/api/projects/{id}/timeline` | 时间线 |
| GET/POST | `/api/projects/{id}/chat` | 对话历史/发送消息 |
| POST | `/api/projects/{id}/continue` | 续写（流式） |
| GET | `/api/projects/{id}/stats` | 项目统计 |
