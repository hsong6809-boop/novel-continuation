# 笔下寸心

一个 AI 辅助小说创作工具。AI 负责铺展纸墨，你负责灵魂——审阅大纲、修改文字、决定伏笔去留，笔始终在你手中。

## 技术栈

- **后端**: Python FastAPI + SQLite (aiosqlite) + Pydantic v2
- **前端**: React 19 + Vite 6 + TailwindCSS 4 + React Router 7 + lucide-react
- **AI**: OpenAI 兼容 API（支持 DeepSeek、MiMo 等多 Provider 切换）
- **主题**: 水墨国风浅色主题（宣纸底色 + 墨色文字 + 朱砂/靛蓝/翠绿功能色）
- **字体**: Noto Serif SC（宋体）+ Noto Sans SC（黑体），分层字号系统

## 核心功能

### 大纲体系（三层递进）

- **总纲**：整体故事结构、核心冲突、起承转合
- **分卷大纲**：基于总纲 + 上一卷正文增量生成下一卷，不一次性生成全部
- **逐章章纲**：每章标题、核心目标、情感走向、章末钩子、场景要点
- **章纲来源保护**：从前文提取的章纲标记为 `extracted`，批量生成时自动跳过已有章纲，只补缺失章节
- 三层联动：总纲指导分卷，分卷约束章纲，章纲驱动续写

### 写作助手

- **编辑器为主布局**：全屏主编辑区 + 360px 侧边栏（纲要/上下文/对话/版本 四标签）
- **流式续写**：SSE 实时输出，生成即编辑，改到满意为止
- **上下文自动组装**：前15章全文 + 风格参考章节 + 章纲 + 角色 + 伏笔 + 世界观设定 + FTS5 早期片段
- **风格参考锚定**：以指定章节（默认前3章）的文风作为续写锚点，AI 严格对齐句式/用词/节奏，取代抽象的"描写密度3/5"参数
- **章节版本回退**：每次保存自动归档，支持一键恢复历史版本
- **Token 精确预估**：逐项累加实际发送内容，每项显示字数，底部合计高亮

### 角色档案

- **贯穿全文角色**：男主/女主/核心配角始终展示在顶层，不随卷折叠
- **按卷分组**：反派、配角、龙套按所属卷分组展示，当前卷默认展开，过去卷默认折叠
- **角色排序**：男主 > 女主 > 反派 > 配角 > 龙套，前后端双重排序保障
- **角色定位**：男主/女主/反派/男配/女配/导师/伙伴/龙套/路人
- **角色快照**：自动追踪每章结束时的角色状态变化
- **续写侧边栏**：只显示当前卷主要角色，过滤龙套/路人

### 元数据管理

- **伏笔管理**：自动提取，状态追踪（活跃 → 已回收/已废弃）
- **时间线**：自动提取时间线事件，支持 ON CONFLICT 去重
- **设定库**：导入预处理时自动提取世界观设定（地理/势力/魔法体系/科技/社会制度等）

### 章节导入

- **智能拆分**：支持"第X章"、"Chapter X"、"X. 标题"等多种格式
- **中文数字解析**：第一章、第十一章、第三十五章等中文数字正确转换
- **大文件处理**：支持30万字以上大文件，按5万字分块处理，逐块生成章纲 + 提取元数据
- **设定库提取**：导入时自动从文本中提取世界观设定

### 风格控制

- **风格参考章节**：指定特定章节（默认前3章）作为文风锚点，每次续写时注入全文，AI 直接学习句式/用词/节奏
- **AI 风格分析**：一键分析原文风格特征
- **辅助微调**：描写密度、对话占比、叙事节奏滑块（作为补充调整）
- **人工风格备注**：补充 AI 无法捕捉的风格意图

### 辅助对话

- 与 AI 讨论剧情、角色、世界观
- 上下文感知，自动注入项目信息
- 纯文本输出（提示词 + 前端双重清洗，去掉 markdown 语法）

### 导出

- 支持 TXT / DOCX / EPUB 三种格式
- 自动清理 AI 生成痕迹（待补充标记、分隔线等）
- 中文文件名编码支持

## 项目结构

```
novel-continuation-main/
├── backend/
│   ├── main.py                          # FastAPI 入口（CORS、全局异常、上传限制）
│   ├── config.py                        # 全局配置
│   ├── models/
│   │   ├── database.py                  # SQLite 建表 + 迁移（含12个性能索引 + FTS5）
│   │   └── schemas.py                   # Pydantic 请求/响应模型
│   ├── routers/
│   │   ├── projects.py                  # 项目 CRUD + 流式续写 + 版本端点
│   │   ├── outlines.py                  # 大纲三层路由（总纲/分卷/章纲）
│   │   ├── chapters.py                  # 章节管理 + 元数据提取
│   │   ├── characters.py                # 角色 CRUD + by-volume 分组端点
│   │   ├── foreshadowing.py             # 伏笔管理
│   │   ├── timeline.py                  # 时间线管理
│   │   ├── chat.py                      # 辅助对话
│   │   ├── style.py                     # 风格分析
│   │   ├── settings_library.py          # 设定库
│   │   ├── settings.py                  # 系统设置 + Provider 配置
│   │   ├── import_chapters.py           # 章节导入（粘贴/文件/大文件分块）
│   │   ├── export.py                    # 导出 TXT/DOCX/EPUB
│   │   └── _common.py                   # 字段白名单 + 公共工具
│   ├── services/
│   │   ├── llm_client.py                # LLM 调用封装（指数退避重试）
│   │   ├── context_service.py           # 续写上下文组装（风格参考+全文前文+精确token预估）
│   │   ├── continuation_service.py      # 流式续写生成（SSE + 动态温度）
│   │   ├── chapter_service.py           # 章节保存 + 版本归档/回退
│   │   ├── outline_service.py           # 章纲生成（跳过已有 + source 标记）
│   │   ├── volume_outline_service.py    # 分卷大纲（增量生成下一卷）
│   │   ├── overall_outline_service.py   # 总纲生成
│   │   ├── meta_service.py              # 元数据提取（伏笔/时间线/角色快照/设定库）
│   │   ├── chat_service.py              # 辅助对话（纯文本输出）
│   │   ├── fts_service.py               # FTS5 全文检索
│   │   ├── preprocess_service.py        # 导入后预处理（角色/伏笔/时间线/设定库）
│   │   ├── large_import_service.py      # 大文件分块处理
│   │   ├── self_review_service.py       # 续写自审
│   │   ├── style_service.py             # 风格分析
│   │   └── settings_library_service.py  # 设定库服务
│   ├── utils/
│   │   ├── prompt_manager.py            # 提示词模板管理（mtime 缓存）
│   │   ├── json_parser.py               # 通用 JSON 提取
│   │   ├── text_utils.py                # 字数统计（去空白总字符数）
│   │   ├── chinese_num.py               # 中文数字转阿拉伯数字
│   │   ├── cache.py                     # 项目元数据缓存
│   │   ├── settings_cache.py            # 设置文件缓存
│   │   └── logger.py                    # 统一日志
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── index.css                    # 水墨国风设计系统
│   │   ├── api/
│   │   │   └── client.js                # API 客户端
│   │   ├── pages/
│   │   │   ├── ProjectList.jsx          # 首页：诗意 Hero + 项目卡片
│   │   │   ├── ProjectDetail.jsx        # 项目详情（9 tab 导航）
│   │   │   └── SettingsPage.jsx         # 设置页（Provider + 分任务模型）
│   │   ├── components/
│   │   │   ├── Layout.jsx               # 全局布局
│   │   │   ├── WriteWizard.jsx          # 写作助手（编辑器 + 4 tab 侧边栏）
│   │   │   ├── OutlinePanel.jsx         # 大纲管理（总纲/分卷/章纲三栏）
│   │   │   ├── OverallOutlineEditor.jsx # 总纲编辑器
│   │   │   ├── VolumeOutlinePanel.jsx   # 分卷大纲（生成下一卷）
│   │   │   ├── ChapterOutlinePanel.jsx  # 章纲（来源标签 + 生成缺失章纲）
│   │   │   ├── ImportPanel.jsx          # 章节导入（中文数字 + 大文件处理）
│   │   │   ├── CharacterPanel.jsx       # 角色档案（贯穿全文 + 按卷分组）
│   │   │   ├── StylePanel.jsx           # 风格控制（风格参考章节配置）
│   │   │   ├── ForeshadowPanel.jsx      # 伏笔管理
│   │   │   ├── TimelinePanel.jsx        # 时间线
│   │   │   ├── ChatPanel.jsx            # 辅助对话（纯文本输出）
│   │   │   ├── SettingsLibraryPanel.jsx # 设定库
│   │   │   ├── ErrorBoundary.jsx        # 全局错误边界
│   │   │   └── WriteWizard/
│   │   │       ├── EditorArea.jsx       # 编辑区
│   │   │       ├── SidebarOutlineContext.jsx  # 侧边栏纲要+上下文摘要
│   │   │       ├── SidebarChat.jsx      # 侧边栏对话
│   │   │       ├── SidebarVersions.jsx  # 侧边栏版本历史
│   │   │       └── MetaConfirmPanel.jsx # 元数据确认面板
│   │   ├── contexts/
│   │   │   └── ThemeContext.jsx          # 主题上下文
│   │   └── components/ui/
│   │       ├── Toast.jsx                # Toast 通知
│   │       ├── FormField.jsx            # 表单字段
│   │       └── ProgressBar.jsx          # 进度条
│   └── package.json
└── 项目推进日志.txt
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 启动后端

```bash
cd backend
python main.py
# 运行在 http://localhost:8000
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
# 运行在 http://localhost:5173
```

### 4. 配置 AI 模型

启动后进入设置页面，配置 AI API Provider（Base URL + API Key + 模型名称）。支持为不同任务（续写、章纲、总纲、对话等）分别指定不同的 Provider 和模型。

## 设计风格

水墨国风浅色主题——宣纸米白底色 `#f7f3eb`，浓墨文字 `#3c3c3c`，朱砂红 `#c05030` 作强调色。SVG 噪点纹理模拟宣纸质感，多层径向渐变营造水墨晕染氛围。

字体采用 Noto Serif SC（宋体）与 Noto Sans SC（黑体），正文 15px，编辑区 17px（行高 2），标题/正文/标签/注释四级字号层次分明。

## 致谢

本项目由 **小米 MiMo Orbit 创造者激励计划** 提供赞助支持。

感谢小米 MiMo 大模型团队提供的技术与资源支持，让这个项目得以从构想走向实现。MiMo 模型在中文小说续写场景中展现出优秀的语义理解和长文本生成能力，是本项目的核心 AI 引擎之一。

> *文章千古事，得失寸心知。*
> 
> AI 辅助创作不是替代作者，而是让作者从繁琐的文字铺陈中解放出来，专注于故事的灵魂——人物的命运、情节的张力、情感的真实。笔，始终在你手中。
