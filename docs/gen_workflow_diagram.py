"""生成小说续写系统 - 核心逻辑流程图（续写链路闭环）"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(1, 1, figsize=(14, 8), dpi=150)
ax.set_xlim(0, 14)
ax.set_ylim(0, 8)
ax.axis('off')
fig.patch.set_facecolor('#FAFBFC')

# 颜色
C = {
    'start': '#1565C0',
    'process': '#2E7D32',
    'ai': '#E65100',
    'data': '#6A1B9A',
    'decision': '#C62828',
    'end': '#00695C',
    'bg_start': '#E3F2FD',
    'bg_process': '#E8F5E9',
    'bg_ai': '#FFF3E0',
    'bg_data': '#F3E5F5',
    'bg_decision': '#FFEBEE',
    'bg_end': '#E0F2F1',
}

def draw_rounded(ax, x, y, w, h, text, color, bg, fontsize=9, bold=False):
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08",
                         facecolor=bg, edgecolor=color, linewidth=2)
    ax.add_patch(box)
    ax.text(x + w/2, y + h/2, text, ha='center', va='center',
            fontsize=fontsize, fontweight='bold' if bold else 'normal',
            color=color, wrap=True)

def draw_diamond(ax, cx, cy, w, h, text, color, bg):
    diamond = plt.Polygon([(cx, cy+h/2), (cx+w/2, cy), (cx, cy-h/2), (cx-w/2, cy)],
                          facecolor=bg, edgecolor=color, linewidth=2)
    ax.add_patch(diamond)
    ax.text(cx, cy, text, ha='center', va='center', fontsize=8,
            fontweight='bold', color=color)

def arrow(ax, x1, y1, x2, y2, color='#455A64', label='', label_side='right'):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=2))
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        offset = (0.15, 0) if label_side == 'right' else (-0.15, 0)
        ax.text(mx + offset[0], my + offset[1], label, fontsize=7,
                color=color, ha='left' if label_side == 'right' else 'right',
                va='center', fontstyle='italic')

# ===== 标题 =====
ax.text(7, 7.6, '小说续写系统 — 核心逻辑流程图', ha='center', va='center',
        fontsize=18, fontweight='bold', color='#263238')
ax.text(7, 7.25, 'Core Logic Flow — Context Assembly → Generation → Metadata Extraction Loop',
        ha='center', va='center', fontsize=9, color='#78909C')

# ===== 第一行：触发 → 上下文组装 =====
# 1. 用户触发
draw_rounded(ax, 0.3, 5.8, 2.2, 0.9, '用户点击\n「续写第N章」', C['start'], C['bg_start'], 10, True)

# 2. 检查章纲
draw_diamond(ax, 4.0, 6.25, 2.0, 0.8, '章纲\n是否存在？', C['decision'], C['bg_decision'])

# 3. AI生成章纲
draw_rounded(ax, 3.0, 4.5, 2.0, 0.8, 'AI 自动生成\n章纲+场景要点', C['ai'], C['bg_ai'], 9, True)

# 4. 上下文组装
draw_rounded(ax, 6.0, 5.8, 2.8, 0.9, '上下文分层组装\n(5层数据聚合)', C['process'], C['bg_process'], 10, True)

# 5. 组装细节
detail_items = [
    '① 分卷概要 (全局方向)',
    '② 章纲+场景 (本章规划)',
    '③ 角色档案 (人物设定)',
    '④ 风格参数 (密度/节奏)',
    '⑤ 活跃伏笔+近5章全文',
]
for i, item in enumerate(detail_items):
    ax.text(6.2, 5.55 - i*0.18, item, fontsize=6.5, color='#37474F', va='center')

# 6. LLM生成
draw_rounded(ax, 9.5, 5.8, 2.5, 0.9, 'LLM 流式生成\n章节正文', C['ai'], C['bg_ai'], 10, True)

# 7. 保存章节
draw_rounded(ax, 12.3, 5.8, 1.5, 0.9, '保存\n章节', C['data'], C['bg_data'], 9, True)

# 箭头：第一行
arrow(ax, 2.5, 6.25, 3.0, 6.25, C['start'])
arrow(ax, 5.0, 6.25, 6.0, 6.25, C['process'], '是', 'right')
arrow(ax, 8.8, 6.25, 9.5, 6.25, C['ai'])
arrow(ax, 12.0, 6.25, 12.3, 6.25, C['data'])

# 箭头：章纲不存在 → AI生成 → 回到判断
arrow(ax, 4.0, 5.85, 4.0, 5.35, C['decision'], '否', 'right')
arrow(ax, 5.0, 4.9, 5.8, 4.9, C['ai'])
arrow(ax, 5.8, 4.9, 5.8, 5.8, C['process'])
arrow(ax, 5.8, 6.25, 6.0, 6.25, C['process'])

# ===== 第二行：元数据提取闭环 =====
# 8. 元数据提取
draw_rounded(ax, 9.5, 3.5, 2.5, 0.9, 'AI 自动提取\n元数据', C['ai'], C['bg_ai'], 10, True)

# 9. 提取内容
extract_items = [
    '• 新伏笔 → 标记「活跃」',
    '• 时间线事件',
    '• 角色状态变化',
]
for i, item in enumerate(extract_items):
    ax.text(9.7, 3.25 - i*0.2, item, fontsize=6.5, color='#37474F', va='center')

# 10. 写回数据库
draw_rounded(ax, 6.0, 3.5, 2.8, 0.9, '写回数据库\n(伏笔/时间线/角色)', C['data'], C['bg_data'], 9, True)

# 11. 伏笔管理
draw_rounded(ax, 2.5, 3.5, 2.8, 0.9, '伏笔生命周期\n活跃→回收/废弃', C['process'], C['bg_process'], 9, True)

# 箭头：第二行
arrow(ax, 10.75, 5.8, 10.75, 4.45, C['ai'])
arrow(ax, 9.5, 3.95, 8.8, 3.95, C['data'])
arrow(ax, 6.0, 3.95, 5.3, 3.95, C['process'])

# ===== 第三行：闭环 =====
# 12. 下一章
draw_rounded(ax, 2.5, 1.5, 2.8, 0.9, '第N+1章续写时\n自动注入上下文', C['end'], C['bg_end'], 9, True)

# 闭环箭头
arrow(ax, 3.9, 3.5, 3.9, 2.45, C['end'])
arrow(ax, 3.9, 1.5, 0.5, 1.5, C['end'])
arrow(ax, 0.5, 1.5, 0.5, 5.8, C['start'], '闭环\n自增强', 'right')

# ===== 右侧标注 =====
ax.text(13.5, 4.2, '自增强\n循环', fontsize=11, fontweight='bold',
        color=C['end'], ha='center', va='center',
        bbox=dict(boxstyle='round,pad=0.3', facecolor=C['bg_end'], edgecolor=C['end'], linewidth=1.5))
ax.annotate('', xy=(13.5, 6.25), xytext=(13.5, 3.5),
            arrowprops=dict(arrowstyle='<->', color=C['end'], lw=2, linestyle='dashed'))

plt.tight_layout()
plt.savefig('C:/Users/ADMIN/Desktop/novel-continuation-main/docs/workflow.png',
            dpi=150, bbox_inches='tight', facecolor='#FAFBFC')
print("workflow.png saved")
