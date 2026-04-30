import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, Plus, Save, Trash2, Loader2 } from 'lucide-react';
import { listForeshadowing, updateForeshadowing } from '../api/client';
import api from '../api/client';

const STATUS_CONFIG = {
  active: { label: '活跃', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  resolved: { label: '已回收', color: 'text-green-400', bg: 'bg-green-400/10' },
  abandoned: { label: '已废弃', color: 'text-gray-500', bg: 'bg-gray-500/10' },
};

const IMPORTANCE_CONFIG = {
  high: { label: '高', color: 'text-red-400', bg: 'bg-red-400/10' },
  medium: { label: '中', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  low: { label: '低', color: 'text-gray-400', bg: 'bg-gray-400/10' },
};

export default function ForeshadowPanel({ project }) {
  const [foreshadows, setForeshadows] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ keyword: '', description: '', importance: 'medium', expected_reveal_chapter: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [project.id, filter]);

  async function load() {
    setLoading(true);
    try {
      const data = await listForeshadowing(project.id, filter);
      setForeshadows(data);
    } catch (e) {
      console.error('加载伏笔失败:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await updateForeshadowing(project.id, id, { status: newStatus });
      await load();
    } catch (e) {
      alert('更新失败');
    }
  }

  async function handleCreate() {
    if (!newForm.keyword.trim()) { alert('伏笔关键词不能为空'); return; }
    setSaving(true);
    try {
      await api.post(`/projects/${project.id}/foreshadowing`, {
        keyword: newForm.keyword,
        description: newForm.description,
        importance: newForm.importance,
        expected_reveal_chapter: newForm.expected_reveal_chapter ? parseInt(newForm.expected_reveal_chapter) : null,
        status: 'active',
      });
      setShowNewForm(false);
      setNewForm({ keyword: '', description: '', importance: 'medium', expected_reveal_chapter: '' });
      await load();
    } catch (e) {
      alert('创建失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateField(id, field, value) {
    try {
      await updateForeshadowing(project.id, id, { [field]: value });
      await load();
    } catch (e) {
      alert('更新失败');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* 工具栏：标题 + 筛选 + 新建 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-yellow-400" />
          <h1 className="text-xl font-bold">伏笔管理</h1>
          <div className="flex gap-1.5 ml-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition border ${
                  filter === key
                    ? `${cfg.bg} border-current ${cfg.color}`
                    : 'bg-white/[0.02] border-border-subtle text-gray-500 hover:text-gray-300'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg text-sm transition shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
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
              <label className="text-xs text-gray-500 block mb-1">关键词 *</label>
              <input
                value={newForm.keyword}
                onChange={e => setNewForm({ ...newForm, keyword: e.target.value })}
                placeholder="如：神秘玉佩"
                className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">重要性</label>
              <select
                value={newForm.importance}
                onChange={e => setNewForm({ ...newForm, importance: e.target.value })}
                className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">描述</label>
            <textarea
              value={newForm.description}
              onChange={e => setNewForm({ ...newForm, description: e.target.value })}
              placeholder="伏笔的具体内容..."
              rows={2}
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">预期揭示章节</label>
            <input
              type="number"
              value={newForm.expected_reveal_chapter}
              onChange={e => setNewForm({ ...newForm, expected_reveal_chapter: e.target.value })}
              placeholder="如：15"
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewForm(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">取消</button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-500/20"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存
            </button>
          </div>
        </div>
      )}


      {/* 伏笔列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : foreshadows.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
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
                            <div key={f.id} className="bg-white/[0.02] border border-border-subtle rounded-xl p-4 group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${impCfg.bg} ${impCfg.color}`}>
                        重要性：{impCfg.label}
                      </span>
                      <span className="text-xs text-gray-600">第{f.planted_chapter}章埋下</span>
                      {f.resolved_chapter && (
                        <span className="text-xs text-gray-600">· 第{f.resolved_chapter}章回收</span>
                      )}
                      {f.expected_reveal_chapter && (
                        <span className="text-xs text-cyan-600">· 预期第{f.expected_reveal_chapter}章揭示</span>
                      )}
                    </div>
                    <p className="text-sm font-medium mb-1">{f.keyword}</p>
                    {f.description && (
                      <p className="text-sm text-gray-400">{f.description}</p>
                    )}
                  </div>

                  {/* 操作 */}
                  <div className="flex flex-row gap-1.5 shrink-0">
                    {f.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(f.id, 'resolved')}
                          className="px-2 py-1 text-xs bg-green-500/[0.08] text-green-400 hover:bg-green-500/[0.15] rounded transition"
                        >
                          ✅ 回收
                        </button>
                        <button
                          onClick={() => handleStatusChange(f.id, 'abandoned')}
                          className="px-2 py-1 text-xs bg-white/[0.04] text-gray-400 hover:bg-white/[0.06] rounded transition"
                        >
                          废弃
                        </button>
                      </>
                    )}
                    {f.status !== 'active' && (
                      <button
                        onClick={() => handleStatusChange(f.id, 'active')}
                        className="px-2 py-1 text-xs bg-yellow-500/[0.08] text-yellow-400 hover:bg-yellow-500/[0.15] rounded transition"
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
