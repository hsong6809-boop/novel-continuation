import { useState, useEffect } from 'react';
import { Clock, Calendar, Plus, Save, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import { listTimeline } from '../api/client';
import api from '../api/client';

export default function TimelinePanel({ project }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ in_chapter_time: '', real_world_time: '', event_description: '', characters_involved: '' });
  const [saving, setSaving] = useState(false);

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
      in_chapter_time: ev.in_chapter_time || '',
      real_world_time: ev.real_world_time || '',
      event_description: ev.event_description || '',
      characters_involved: ev.characters_involved || '',
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
      alert('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newForm.event_description.trim()) { alert('事件描述不能为空'); return; }
    setSaving(true);
    try {
      await api.post(`/projects/${project.id}/timeline`, newForm);
      setShowNewForm(false);
      setNewForm({ in_chapter_time: '', real_world_time: '', event_description: '', characters_involved: '' });
      await load();
    } catch (e) {
      alert('创建失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除此时间线事件？')) return;
    try {
      await api.delete(`/projects/${project.id}/timeline/${id}`);
      await load();
    } catch (e) {
      alert('删除失败');
    }
  }

  function EventForm({ form, setForm, onSave, onCancel, saving }) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">故事内时间</label>
            <input
              value={form.in_chapter_time || ''}
              onChange={e => setForm({ ...form, in_chapter_time: e.target.value })}
              placeholder="如：第三天傍晚"
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">现实时间</label>
            <input
              value={form.real_world_time || ''}
              onChange={e => setForm({ ...form, real_world_time: e.target.value })}
              placeholder="如：2024年3月"
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">事件描述 *</label>
          <textarea
            value={form.event_description || ''}
            onChange={e => setForm({ ...form, event_description: e.target.value })}
            placeholder="发生了什么..."
            rows={2}
            className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">涉及角色（逗号分隔）</label>
          <input
            value={form.characters_involved || ''}
            onChange={e => setForm({ ...form, characters_involved: e.target.value })}
            placeholder="如：张三, 李四"
            className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">取消</button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-500/20"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-cyan-400" />
          <h1 className="text-xl font-bold">时间线</h1>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg text-sm transition shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
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
            onCancel={() => { setShowNewForm(false); setNewForm({ in_chapter_time: '', real_world_time: '', event_description: '', characters_involved: '' }); }}
            saving={saving}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
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
                <div className="absolute left-[21px] top-3 w-3 h-3 rounded-full bg-cyan-500 border-2 border-gray-950 z-10" />

                <div className="bg-white/[0.02] border border-border-subtle border-l-2 border-l-cyan-500/50 rounded-xl p-4">
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
                          <span className="text-xs font-mono text-cyan-400">{ev.in_chapter_time || '?'}</span>
                          {ev.real_world_time && (
                            <span className="text-xs text-gray-600">（现实：{ev.real_world_time}）</span>
                          )}
                        </div>
                        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition">
                          <button
                            onClick={() => startEdit(ev)}
                            className="p-1 text-gray-600 hover:text-amber-400/70 hover:bg-white/[0.04] rounded transition"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ev.id)}
                            className="p-1 text-gray-600 hover:text-red-400 hover:bg-white/[0.04] rounded transition"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm">{ev.event_description}</p>
                      {ev.characters_involved && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {ev.characters_involved.split(',').map((c, j) => (
                            <span key={j} className="text-xs px-2 py-0.5 bg-white/[0.04] text-gray-400 border border-border-subtle rounded-full">
                              {c.trim()}
                            </span>
                          ))}
                        </div>
                      )}
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
