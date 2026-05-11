import { useState, useEffect } from 'react';
import { Eye, EyeOff, Plus, Save, Trash2, Loader2 } from 'lucide-react';
import { listForeshadowing, updateForeshadowing, createForeshadowing } from '../api/client';
import { useToast } from './ui/Toast';

const STATUS_CONFIG = {
  active: { label: '活跃', color: 'text-gold-600', bg: 'bg-gold-500/10' },
  resolved: { label: '已回收', color: 'text-jade-700', bg: 'bg-green-400/10' },
  abandoned: { label: '已废弃', color: 'text-ink-400', bg: 'bg-gray-500/10', apiStatus: 'dropped' },
};

// API 返回的 dropped 状态映射回前端 abandoned
const API_STATUS_MAP = { dropped: 'abandoned' };

// 活跃伏笔排序：重要性权重 → 章节号
const IMPORTANCE_ORDER = { high: 0, normal: 1, medium: 1, low: 2 };

const IMPORTANCE_CONFIG = {
  high: { label: '高', color: 'text-red-400', bg: 'bg-red-400/10' },
  medium: { label: '中', color: 'text-gold-600', bg: 'bg-gold-500/10' },
  low: { label: '低', color: 'text-ink-500', bg: 'bg-gray-400/10' },
};

export default function ForeshadowPanel({ project }) {
  const [foreshadows, setForeshadows] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ description: '', importance: 'normal', expected_reveal_chapter: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [project.id, filter]);

  function getApiStatus(statusKey) {
    return STATUS_CONFIG[statusKey]?.apiStatus || statusKey;
  }

  async function load() {
    setLoading(true);
    try {
      let data = await listForeshadowing(project.id, getApiStatus(filter));

      // API 状态映射（dropped → abandoned）
      data = data.map(f => ({
        ...f,
        status: API_STATUS_MAP[f.status] || f.status,
      }));

      if (filter === 'active') {
        // 活跃伏笔：按描述去重（保留最早埋下的）
        const seen = new Map();
        for (const f of data) {
          const key = f.description.trim();
          if (!seen.has(key) || f.planted_chapter < seen.get(key).planted_chapter) {
            seen.set(key, f);
          }
        }
        data = Array.from(seen.values());
        // 排序：重要性（高→中→低）→ 章节号
        data.sort((a, b) => {
          const ia = IMPORTANCE_ORDER[a.importance] ?? 1;
          const ib = IMPORTANCE_ORDER[b.importance] ?? 1;
          if (ia !== ib) return ia - ib;
          return (a.planted_chapter || 0) - (b.planted_chapter || 0);
        });
      } else {
        // 已回收/已废弃：按章节顺序
        data.sort((a, b) => (a.planted_chapter || 0) - (b.planted_chapter || 0));
      }

      setForeshadows(data);
    } catch (e) {
      console.error('加载伏笔失败:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await updateForeshadowing(project.id, id, { status: getApiStatus(newStatus) });
      await load();
    } catch (e) {
      toast.error('更新失败');
    }
  }

  async function handleCreate() {
    if (!newForm.description.trim()) { toast.warning('伏笔描述不能为空'); return; }
    setSaving(true);
    try {
      await createForeshadowing(project.id, {
        description: newForm.description,
        importance: newForm.importance,
        expected_reveal_chapter: newForm.expected_reveal_chapter ? parseInt(newForm.expected_reveal_chapter) : null,
      });
      setShowNewForm(false);
      setNewForm({ description: '', importance: 'normal', expected_reveal_chapter: '' });
      await load();
    } catch (e) {
      toast.error('创建失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateField(id, field, value) {
    try {
      await updateForeshadowing(project.id, id, { [field]: value });
      await load();
    } catch (e) {
      toast.error('更新失败');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* 工具栏：标题 + 筛选 + 新建 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-gold-600" />
          <h1 className="text-xl font-bold">伏笔管理</h1>
          <div className="flex gap-1.5 ml-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition border ${
                  filter === key
                    ? `${cfg.bg} border-current ${cfg.color}`
                    : 'bg-surface-1 border-border-subtle text-ink-400 hover:text-ink-700'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm transition shadow-lg shadow-vermillion-600/10 hover:shadow-vermillion-600/15"
        >
          <Plus className="w-4 h-4" />
          新建伏笔
        </button>
      </div>

      {/* 新建伏笔表单 */}
      {showNewForm && (
        <div className="border-gradient bg-surface-1 rounded-xl p-5 mb-6 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-400 block mb-1">伏笔描述 *</label>
              <textarea
                value={newForm.description}
                onChange={e => setNewForm({ ...newForm, description: e.target.value })}
                placeholder="如：主角发现一枚神秘玉佩，上面刻着未知符文..."
                rows={2}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
              />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1">重要性</label>
              <select
                value={newForm.importance}
                onChange={e => setNewForm({ ...newForm, importance: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition"
              >
                <option value="high">高</option>
                <option value="normal">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-400 block mb-1">预期揭示章节</label>
            <input
              type="number"
              value={newForm.expected_reveal_chapter}
              onChange={e => setNewForm({ ...newForm, expected_reveal_chapter: e.target.value })}
              placeholder="如：15"
              className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewForm(false)} className="px-3 py-1.5 text-sm text-ink-500 hover:text-ink-900">取消</button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存
            </button>
          </div>
        </div>
      )}


      {/* 伏笔列表 */}
      {loading ? (
        <div className="text-center py-12 text-ink-400">加载中...</div>
      ) : foreshadows.length === 0 ? (
        <div className="text-center py-16 text-ink-400">
          <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无{STATUS_CONFIG[filter].label}伏笔</p>
          <p className="text-sm mt-1">续写后 AI 会自动提取，也可手动新建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {foreshadows.map(f => {
            const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.active;
            const impCfg = IMPORTANCE_CONFIG[f.importance] || IMPORTANCE_CONFIG.medium;
            return (
                            <div key={f.id} className="bg-surface-1 border border-border-subtle rounded-xl p-4 group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${impCfg.bg} ${impCfg.color}`}>
                        重要性：{impCfg.label}
                      </span>
                      <span className="text-xs text-ink-400">第{f.planted_chapter}章埋下</span>
                      {f.actual_reveal_chapter && (
                        <span className="text-xs text-ink-400">· 第{f.actual_reveal_chapter}章回收</span>
                      )}
                      {f.expected_reveal_chapter && (
                        <span className="text-xs text-inkblue-600">· 预期第{f.expected_reveal_chapter}章揭示</span>
                      )}
                    </div>
                    <p className="text-sm font-medium mb-1">{f.description}</p>
                  </div>

                  {/* 操作 */}
                  <div className="flex flex-row gap-1.5 shrink-0">
                    {f.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(f.id, 'resolved')}
                          className="px-2 py-1 text-xs bg-green-600/[0.10] text-jade-700 hover:bg-green-600/[0.15] rounded transition"
                        >
                          ✅ 回收
                        </button>
                        <button
                          onClick={() => handleStatusChange(f.id, 'abandoned')}
                          className="px-2 py-1 text-xs bg-surface-3 text-ink-500 hover:bg-black/[0.05] rounded transition"
                        >
                          废弃
                        </button>
                      </>
                    )}
                    {f.status !== 'active' && (
                      <button
                        onClick={() => handleStatusChange(f.id, 'active')}
                        className="px-2 py-1 text-xs bg-yellow-600/[0.10] text-gold-600 hover:bg-yellow-600/[0.15] rounded transition"
                      >
                        恢复
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
