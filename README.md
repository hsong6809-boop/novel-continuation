# 笔下寸心

> *文章千古事，得失寸心知。*

AI 辅助小说创作工具。AI 铺展纸墨，你负责灵魂——审阅大纲、修改文字、决定伏笔去留，笔始终在你手中。

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 这是什么

一个本地运行的长篇小说续写工作站。你导入已有章节，AI 帮你：

- **续写** — 基于前文风格和大纲，流式生成下一章
- **管理** — 三层大纲体系（总纲 → 分卷 → 章纲）层层递进
- **追踪** — 角色档案、伏笔状态、时间线自动维护
- **导出** — TXT / DOCX / EPUB 一键输出

支持 DeepSeek、MiMo 等任意 OpenAI 兼容 API。

---

## 🏗️ 技术架构

| 层 | 技术 |
|---|------|
| 后端 | Python 3.11+ · FastAPI · SQLite (aiosqlite) · Pydantic v2 |
| 前端 | React 19 · Vite 6 · TailwindCSS 4 · React Router 7 |
| AI | OpenAI 兼容 API（SSE 流式输出） |
| 主题 | 水墨国风 — 宣纸底色 `#f7f3eb` · 墨色文字 `#3c3c3c` · 朱砂强调 `#c05030` |
| 字体 | Noto Serif SC（宋体）+ Noto Sans SC（黑体） |

---

## 📖 核心功能

### 三层大纲体系

```
总纲（故事骨架）
 └─ 分卷大纲（增量生成，不一次性铺完）
     └─ 逐章章纲（标题 · 核心目标 · 情感走向 · 章末钩子）
```

总纲指导分卷，分卷约束章纲，章纲驱动续写。三层联动，故事不会跑偏。

### 智能续写引擎

- **流式输出** — SSE 实时生成，写到哪改到哪
- **风格锚定** — 指定参考章节（默认前3章），AI 学习你的句式、用词、节奏
- **上下文自动组装** — 前15章全文 + 风格参考 + 章纲 + 角色 + 伏笔 + 世界观 + FTS5 早期片段
- **Token 精确预估** — 逐项累加实际发送内容，每项显示字数
- **续写自审** — 生成后自动检查一致性

### 角色档案系统

- 贯穿全文角色（男主/女主/核心配角）始终置顶
- 反派、配角、龙套按卷分组，当前卷展开、历史卷折叠
- 角色快照：自动追踪每章结束时的角色状态变化

### 元数据自动提取

| 类型 | 能力 |
|------|------|
| 伏笔 | 自动提取，状态追踪（活跃 → 已回收/已废弃） |
| 时间线 | 自动提取事件，支持去重 |
| 设定库 | 导入时自动提取世界观设定（地理/势力/魔法体系等） |

### 章节导入

- 智能拆分：支持「第X章」「Chapter X」「X. 标题」等多种格式
- 中文数字正确解析（第一章、第三十五章……）
- 大文件处理：30万字+ 按5万字分块，逐块生成章纲 + 提取元数据

### 风格控制

- **风格参考章节** — 指定特定章节作为文风锚点，每次续写注入全文
- **AI 风格分析** — 一键分析原文风格特征
- **辅助微调** — 描写密度、对话占比、叙事节奏滑块
- **人工风格备注** — 补充 AI 无法捕捉的风格意图

### 导出

TXT / DOCX / EPUB 三种格式，自动清理 AI 生成痕迹（待补充标记、分隔线等），中文文件名编码完美支持。

---

## 🚀 快速开始

### 1. 后端

```bash
cd backend
pip install -r requirements.txt
python main.py
# → http://localhost:8000
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 3. 配置 AI

启动后进入**设置页面**，配置 API Provider（Base URL + API Key + 模型名称）。支持为续写、章纲、总纲、对话等不同任务分别指定不同的模型。

---

## 📂 项目结构

```
novel-continuation-main/
├── backend/
│   ├── main.py                    # FastAPI 入口
│   ├── config.py                  # 全局配置
│   ├── models/                    # 数据库 + Pydantic 模型
│   ├── routers/                   # API 路由（13个模块）
│   ├── services/                  # 业务逻辑（15个服务）
│   └── utils/                     # 工具函数
├── frontend/
│   └── src/
│       ├── pages/                 # 页面（项目列表/详情/设置）
│       ├── components/            # 组件（编辑器/大纲/角色/对话等）
│       └── api/                   # API 客户端
├── start.bat                      # Windows 一键启动
└── README.md
```

---

## 🎨 设计语言

水墨国风浅色主题。宣纸米白底色，浓墨文字，朱砂红作强调色。SVG 噪点纹理模拟宣纸质感，多层径向渐变营造水墨晕染氛围。

正文 15px，编辑区 17px（行高 2），标题/正文/标签/注释四级字号层次分明。

---

## 📝 更新日志

### v3.0（2026-05-02）

全面审查修复 + 大纲重构 + 角色系统 + 风格参考。77 个文件变更，+8681/-3420 行。

- 新增：风格参考章节锚定、角色按卷分组、设定库、续写自审
- 重构：大纲三层体系、上下文组装引擎、Token 预估
- 优化：大文件导入、FTS5 全文检索、12个性能索引

---

## 致谢

本项目由 **小米 MiMo Orbit 创造者激励计划** 提供赞助支持。

MiMo 模型在中文小说续写场景中展现出优秀的语义理解和长文本生成能力，是本项目的核心 AI 引擎之一。

---

## License

MIT
