import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Save, ChevronDown, ChevronRight, User, X } from 'lucide-react';
import { listCharacters, createCharacter, updateCharacter, deleteCharacter } from '../api/client';

const EMPTY = { name: '', role: '', age: '', personality: '', speech_style: '', appearance: '', background: '', character_arc_summary: '', relationships: '' };

export default function CharacterPanel({ project, onRefresh }) {
  const [characters, setCharacters] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    try {
      const data = await listCharacters(project.id);
      setCharacters(data);
    } catch (e) {
      console.error('加载角色失败:', e);
    }
  }

  function startNew() {
    setIsNew(true);
    setExpanded(-1);
    setForm({ ...EMPTY });
  }

  function startEdit(c) {
    setIsNew(false);
    setExpanded(c.id);
    setForm({
      name: c.name || '',
      role: c.role || '',
      age: c.age || '',
      personality: c.personality || '',
      speech_style: c.speech_style || '',
      appearance: c.appearance || '',
      background: c.background || '',
      character_arc_summary: c.character_arc_summary || '',
      relationships: c.relationships || '',
    });
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('角色名不能为空'); return; }
    try {
      if (isNew) {
        await createCharacter(project.id, form);
      } else {
        await updateCharacter(project.id, expanded, form);
      }
      setIsNew(false);
      setExpanded(null);
      await load();
      onRefresh();
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`确定删除角色「${name}」？`)) return;
    try {
      await deleteCharacter(project.id, id);
      await load();
      onRefresh();
    } catch (e) {
      alert('删除失败');
    }
  }

  function Field({ label, field, multiline }) {
    return (
      <div>
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        {multiline ? (
          <textarea
            value={form[field] || ''}
            onChange={e => setForm({ ...form, [field]: e.target.value })}
            rows={2}
            className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
          />
        ) : (
          <input
            value={form[field] || ''}
            onChange={e => setForm({ ...form, [field]: e.target.value })}
            className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-orange-400" />
          <h1 className="text-xl font-bold">角色档案</h1>
          <span className="text-xs text-gray-500">({characters.length})</span>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg text-sm transition shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          新增角色
        </button>
      </div>

      {/* 新建/编辑表单 — 全宽 */}
      {(isNew || expanded) && (
        <div className="border-gradient bg-surface-1 rounded-xl p-5 mb-6 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-300">{isNew ? '新增角色' : `编辑：${form.name}`}</span>
            <button onClick={() => { setIsNew(false); setExpanded(null); }} className="p-1 text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] rounded transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="角色名 *" field="name" />
            <Field label="角色定位" field="role" />
            <Field label="年龄" field="age" />
          </div>
          <Field label="性格" field="personality" multiline />
          <Field label="说话风格" field="speech_style" />
          <Field label="外貌" field="appearance" multiline />
          <Field label="背景" field="background" multiline />
          <Field label="角色弧线" field="character_arc_summary" multiline />
          <Field label="人物关系" field="relationships" multiline />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setIsNew(false); setExpanded(null); }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">取消</button>
            <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-500/20">
              <Save className="w-3.5 h-3.5" /> 保存
            </button>
          </div>
        </div>
      )}

      {/* 角色网格 */}
      {characters.length === 0 && !isNew && (
        <div className="text-center py-16 text-gray-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无角色档案</p>
          <p className="text-sm mt-1">添加角色后，续写时 AI 会自动参考</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {characters.map(c => {
          const isExpanded = expanded === c.id;
          return (
            <div
              key={c.id}
              onClick={() => !isExpanded && startEdit(c)}
              className={`bg-white/[0.02] border rounded-xl p-4 cursor-pointer transition-all group ${
                isExpanded ? 'border-amber-500/30 shadow-lg shadow-amber-500/10' : 'border-border-subtle hover:border-border-hover hover:-translate-y-0.5'
              }`}
            >
              {/* 头像 + 基本信息 */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/[0.12] flex items-center justify-center shrink-0 text-orange-400 font-bold text-sm">
                  {(c.name || '?')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    {c.role && (
                      <span className="text-xs px-1.5 py-0.5 bg-white/[0.04] text-gray-400 border border-border-subrounded shrink-0">
                        {c.role}
                      </span>
                    )}
                  </div>
                  {c.age && <span className="text-xs text-gray-500">{c.age}岁</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }}
                  className="p-1 text-gray-600 hover:text-red-400 hover:bg-white/[0.04] rounded transition opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 性格摘要 */}
              {c.personality && (
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2">{c.personality}</p>
              )}

              {/* 关系 */}
              {c.relationships && (
                <p className="text-xs text-gray-600 truncate">🔗 {c.relationships}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
