"""生成小说续写系统 - 系统架构图"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(1, 1, figsize=(14, 9), dpi=150)
ax.set_xlim(0, 14)
ax.set_ylim(0, 9)
ax.axis('off')
fig.patch.set_facecolor('#FAFBFC')

# 颜色方案
colors = {
    'frontend': '#E3F2FD',
    'frontend_border': '#1565C0',
    'backend': '#E8F5E9',
    'backend_border': '#2E7D32',
    'ai': '#FFF3E0',
    'ai_border': '#E65100',
    'data': '#F3E5F5',
    'data_border': '#6A1B9A',
    'arrow': '#455A64',
    'title': '#263238',
}

def draw_box(ax, x, y, w, h, label, color, border_color, fontsize=10, bold=False):
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1",
                         facecolor=color, edgecolor=border_color, linewidth=2)
    ax.add_patch(box)
    weight = 'bold' if bold else 'normal'
    ax.text(x + w/2, y + h/2, label, ha='center', va='center',
            fontsize=fontsize, fontweight=weight, color=border_color)

def draw_section(ax, x, y, w, h, title, color, border_color):
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.15",
                         facecolor=color, edgecolor=border_color, linewidth=2.5, linestyle='--')
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.2, title, ha='center', va='top',
            fontsize=11, fontweight='bold', color=border_color)

def draw_arrow(ax, x1, y1, x2, y2, color='#455A64'):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=2,
                               connectionstyle='arc3,rad=0'))

# ===== 标题 =====
ax.text(7, 8.6, '小说续写系统 — 系统架构图', ha='center', va='center',
        fontsize=18, fontweight='bold', color=colors['title'])
ax.text(7, 8.25, 'Novel Continuation Agent — System Architecture', ha='center', va='center',
        fontsize=10, color='#78909C')

# ===== 前端层 =====
draw_section(ax, 0.5, 5.8, 13, 2.2, '[ 前端 ]  React + TailwindCSS + Vite', colors['frontend'], colors['frontend_border'])

fe_items = [
    (1.0, 6.1, 2.2, 0.7, '项目管理'),
    (3.5, 6.1, 2.2, 0.7, '章纲编辑'),
    (6.0, 6.1, 2.2, 0.7, '续写向导'),
    (8.5, 6.1, 2.2, 0.7, '角色/风格'),
    (11.0, 6.1, 2.2, 0.7, '伏笔/时间线'),
    (1.0, 6.95, 2.8, 0.7, '辅助对话 (Chat)'),
    (4.2, 6.95, 2.8, 0.7, '设置 (Provider)'),
    (7.4, 6.95, 2.8, 0.7, '章节导入'),
    (10.6, 6.95, 2.5, 0.7, '文件上传'),
]
for x, y, w, h, label in fe_items:
    draw_box(ax, x, y, w, h, label, '#BBDEFB', colors['frontend_border'], fontsize=9)

# ===== 后端层 =====
draw_section(ax, 0.5, 2.8, 13, 2.7, '[ 后端 ]  Python FastAPI + SQLite', colors['backend'], colors['backend_border'])

be_items = [
    (1.0, 3.1, 2.5, 0.65, '项目/章节 CRUD'),
    (3.8, 3.1, 2.5, 0.65, '章纲生成服务'),
    (6.6, 3.1, 2.5, 0.65, '续写引擎'),
    (9.4, 3.1, 2.5, 0.65, '元数据提取'),
    (1.0, 3.9, 2.5, 0.65, '上下文组装器'),
    (3.8, 3.9, 2.5, 0.65, '风格分析'),
    (6.6, 3.9, 2.5, 0.65, 'LLM 客户端'),
    (9.4, 3.9, 2.5, 0.65, '对话服务'),
]
for x, y, w, h, label in be_items:
    draw_box(ax, x, y, w, h, label, '#C8E6C9', colors['backend_border'], fontsize=9)

# ===== AI 模型层 =====
draw_section(ax, 0.5, 0.5, 6, 1.9, '[ AI 模型层 ]', colors['ai'], colors['ai_border'])

ai_items = [
    (1.0, 0.7, 2.5, 0.7, 'DeepSeek'),
    (3.8, 0.7, 2.5, 0.7, 'MiMo'),
    (1.0, 1.5, 2.5, 0.7, 'OpenAI 兼容'),
    (3.8, 1.5, 2.5, 0.7, '多 Provider 切换'),
]
for x, y, w, h, label in ai_items:
    draw_box(ax, x, y, w, h, label, '#FFE0B2', colors['ai_border'], fontsize=9)

# ===== 数据层 =====
draw_section(ax, 7, 0.5, 6.5, 1.9, '[ 数据层 ]  SQLite', colors['data'], colors['data_border'])

data_items = [
    (7.5, 0.7, 1.8, 0.7, '项目'),
    (9.6, 0.7, 1.8, 0.7, '章节'),
    (11.7, 0.7, 1.5, 0.7, '章纲'),
    (7.5, 1.5, 1.8, 0.7, '角色'),
    (9.6, 1.5, 1.8, 0.7, '伏笔'),
    (11.7, 1.5, 1.5, 0.7, '时间线'),
]
for x, y, w, h, label in data_items:
    draw_box(ax, x, y, w, h, label, '#E1BEE7', colors['data_border'], fontsize=9)

# ===== 连接箭头 =====
# 前端 → 后端
for x in [3, 7, 11]:
    draw_arrow(ax, x, 5.8, x, 5.55, colors['arrow'])

# 后端 → AI
draw_arrow(ax, 7.8, 2.8, 4, 2.45, colors['ai_border'])
# 后端 → 数据
draw_arrow(ax, 9, 2.8, 10, 2.45, colors['data_border'])

# ===== 图例说明 =====
ax.text(0.5, 8.6, '●', fontsize=8, color='#1565C0', ha='right')
ax.text(0.6, 8.6, '前端', fontsize=8, color='#1565C0', ha='left', va='center')

plt.tight_layout()
plt.savefig('C:/Users/ADMIN/Desktop/novel-continuation-main/docs/architecture.png',
            dpi=150, bbox_inches='tight', facecolor='#FAFBFC')
print("architecture.png saved")
