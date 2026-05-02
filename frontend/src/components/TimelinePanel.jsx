import { useState, useEffect } from 'react';
import { Clock, Calendar, Plus, Save, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import { listTimeline } from '../api/client';
import api from '../api/client';
import { useToast } from './ui/Toast';

function EventForm({ form, setForm, onSave, onCancel, saving }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-400 block mb-1">故事内时间 *</label>
          <input
            value={form.story_time_description || ''}
            onChange={e => setForm({ ...form, story_time_description: e.target.value })}
            placeholder="如：第三天傍晚"
            className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition"
          />
        </div>
        <div>
          <label className="text-xs text-ink-400 block mb-1">故事日期</label>
          <input
            value={form.story_date || ''}
            onChange={e => setForm({ ...form, story_date: e.target.value })}
            placeholder="如：2024年3月"
            className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-ink-400 block mb-1">事件摘要</label>
        <textarea
          value={form.summary || ''}
          onChange={e => setForm({ ...form, summary: e.target.value })}
          placeholder="发生了什么..."
          rows={2}
          className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-ink-500 hover:text-ink-900">取消</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          保存
        </button>
      </div>
    </div>
  );
}

export default function TimelinePanel({ project }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ story_time_description: '', story_date: '', summary: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    try {
      const data = await listTimeline(project.id);
      setEvents(data);
    } catch (e) {
      console.error('加载时间线失败:', e);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(ev) {
    setEditingId(ev.id);
    setEditForm({
      story_time_description: ev.story_time_description || '',
      story_date: ev.story_date || '',
      summary: ev.summary || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    try {
      await api.put(`/projects/${project.id}/timeline/${id}`, editForm);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newForm.story_time_description.trim()) { toast.warning('时间描述不能为空'); return; }
    setSaving(true);
    try {
      await api.post(`/projects/${project.id}/timeline`, newForm);
      setShowNewForm(false);
      setNewForm({ story_time_description: '', story_date: '', summary: '' });
      await load();
    } catch (e) {
      toast.error('创建失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!await toast.confirm('确定删除此时间线事件？')) return;
    try {
      await api.delete(`/projects/${project.id}/timeline/${id}`);
      await load();
    } catch (e) {
      toast.error('删除失败');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-inkblue-600" />
          <h1 className="text-xl font-bold">时间线</h1>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm transition shadow-lg shadow-vermillion-600/10 hover:shadow-vermillion-600/15"
        >
          <Plus className="w-4 h-4" />
          新增事件
        </button>
      </div>

      {/* 新建表单 */}
      {showNewForm && (
        <div className="border-gradient bg-surface-1 rounded-xl p-5 mb-6 animate-fade-in">
          <EventForm
            form={newForm}
            setForm={setNewForm}
            onSave={handleCreate}
            onCancel={() => { setShowNewForm(false); setNewForm({ story_time_description: '', story_date: '', summary: '' }); }}
            saving={saving}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-ink-400">加载中...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-ink-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无时间线事件</p>
          <p className="text-sm mt-1">续写后 AI 会自动提取，也可手动新增</p>
        </div>
      ) : (
        <div className="relative">
          {/* 时间线轴 */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border-subtle" />

          <div className="space-y-4">
            {events.map((ev, i) => (
              <div key={ev.id || i} className="relative pl-12 group">
                {/* 节点 */}
                <div className="absolute left-[21px] top-3 w-3 h-3 rounded-full bg-inkblue-500 border-2 border-gray-200 z-10" />

                <div className="bg-surface-1 border border-border-subtle border-l-2 border-l-inkblue-500/50 rounded-xl p-4">
                  {editingId === ev.id ? (
                    <EventForm
                      form={editForm}
                      setForm={setEditForm}
                      onSave={() => handleSaveEdit(ev.id)}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-mono text-inkblue-600">{ev.story_time_description || '?'}</span>
                          {ev.story_date && (
                            <span className="text-xs text-ink-400">（{ev.story_date}）</span>
                          )}
                        </div>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition">
                          <button
                            onClick={() => startEdit(ev)}
                            className="p-1 text-ink-400 hover:text-vermillion-600 hover:bg-surface-3 rounded transition"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ev.id)}
                            className="p-1 text-ink-400 hover:text-red-500 hover:bg-surface-3 rounded transition"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {ev.summary && <p className="text-sm">{ev.summary}</p>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
