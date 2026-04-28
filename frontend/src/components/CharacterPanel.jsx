import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Save, ChevronDown, ChevronRight, User } from 'lucide-react';
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
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        ) : (
          <input
            value={form[field] || ''}
            onChange={e => setForm({ ...form, [field]: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-orange-400" />
          <h1 className="text-xl font-bold">角色档案</h1>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition"
        >
          <Plus className="w-4 h-4" />
          新增角色
        </button>
      </div>

      {/* 新建表单 */}
      {isNew && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-5 mb-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
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
            <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
              <Save className="w-3.5 h-3.5" /> 保存
            </button>
          </div>
        </div>
      )}

      {/* 角色列表 */}
      {characters.length === 0 && !isNew && (
        <div className="text-center py-16 text-gray-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>暂无角色档案</p>
          <p className="text-sm mt-1">添加角色后，续写时 AI 会自动参考</p>
        </div>
      )}

      <div className="space-y-2">
        {characters.map(c => (
                    <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition"
              onClick={() => expanded === c.id ? setExpanded(null) : startEdit(c)}
            >
              {expanded === c.id
                ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
              }
              <span className="font-medium text-sm">{c.name}</span>
              {c.role && <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">{c.role}</span>}
              {c.relationships && <span className="text-xs text-gray-600 truncate max-w-xs hidden md:block">🔗 {c.relationships}</span>}
              {!c.relationships && c.personality && <span className="text-xs text-gray-600 truncate flex-1 hidden md:block">{c.personality}</span>}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }}
                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-700 rounded transition opacity-0 group-hover:opacity-100"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {expanded === c.id && !isNew && (
              <div className="border-t border-gray-800 px-5 py-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="角色名" field="name" />
                  <Field label="角色定位" field="role" />
                  <Field label="年龄" field="age" />
                </div>
                <Field label="性格" field="personality" multiline />
                <Field label="说话风格" field="speech_style" />
                <Field label="外貌" field="appearance" multiline />
                <Field label="背景" field="background" multiline />
                <Field label="角色弧线" field="character_arc_summary" multiline />
                <Field label="人物关系" field="relationships" multiline />
                <div className="flex justify-end">
                  <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
                    <Save className="w-3.5 h-3.5" /> 保存
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
