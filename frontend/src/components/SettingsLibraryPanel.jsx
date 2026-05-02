import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, Edit3, Loader2, Library, Search } from 'lucide-react';
import {
  listSettingsLibrary, listSettingCategories, createSetting, updateSetting, deleteSetting,
} from '../api/client';
import { useToast } from './ui/Toast';

export default function SettingsLibraryPanel({ project }) {
  const [settings, setSettings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSetting, setNewSetting] = useState({ category: '', name: '', description: '', importance: 'normal' });
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => { loadData(); }, [project.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [settingsData, catsData] = await Promise.all([
        listSettingsLibrary(project.id),
        listSettingCategories(project.id),
      ]);
      setSettings(settingsData);
      setCategories(catsData);
    } catch {
      setSettings([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFilterCategory(cat) {
    setFilterCategory(cat);
    try {
      const data = await listSettingsLibrary(project.id, cat || undefined);
      setSettings(data);
    } catch {}
  }

  async function handleAdd() {
    if (!newSetting.category.trim() || !newSetting.name.trim()) {
      setError('类别和名称为必填项');
      return;
    }
    setError(null);
    try {
      await createSetting(project.id, newSetting);
      setShowAddForm(false);
      setNewSetting({ category: '', name: '', description: '', importance: 'normal' });
      await loadData();
    } catch (e) {
      setError('创建失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditForm({
      category: s.category || '',
      name: s.name || '',
      description: s.description || '',
      details: s.details || '',
      importance: s.importance || 'normal',
    });
  }

  async function handleSaveEdit() {
    try {
      await updateSetting(project.id, editingId, editForm);
      setEditingId(null);
      await loadData();
    } catch {
      setError('保存失败');
    }
  }

  async function handleDelete(s) {
    if (!await toast.confirm(`确定删除设定「${s.name}」？`)) return;
    try {
      await deleteSetting(project.id, s.id);
      await loadData();
    } catch {
      setError('删除失败');
    }
  }

  const filtered = searchText
    ? settings.filter(s =>
        s.name.includes(searchText) ||
        (s.description || '').includes(searchText) ||
        s.category.includes(searchText)
      )
    : settings;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-ink-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Library className="w-6 h-6 text-gold-600" />
          <h1 className="text-xl font-bold">设定库</h1>
          <span className="text-xs text-ink-400">({settings.length})</span>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-vermillion-600/10 press-effect">
          <Plus className="w-4 h-4" />新增设定
        </button>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索设定..."
            className="w-full pl-9 pr-3 py-1.5 input-surface border border-border-default rounded-lg text-sm focus:ring-1 focus:ring-vermillion-500/40"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => handleFilterCategory(e.target.value)}
          className="input-surface border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-vermillion-500/40"
        >
          <option value="">全部类别</option>
          {categories.map(c => (
            <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
          ))}
        </select>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      {/* 新增表单 */}
      {showAddForm && (
        <div className="border-gradient bg-surface-1 rounded-lg p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink-400 block mb-1">类别 *</label>
              <input value={newSetting.category} placeholder="如：地理/势力/魔法体系"
                onChange={e => setNewSetting({ ...newSetting, category: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1">名称 *</label>
              <input value={newSetting.name} placeholder="设定名称"
                onChange={e => setNewSetting({ ...newSetting, name: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1">重要性</label>
              <select value={newSetting.importance}
                onChange={e => setNewSetting({ ...newSetting, importance: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40">
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-400 block mb-1">描述</label>
            <textarea value={newSetting.description} rows={2}
              onChange={e => setNewSetting({ ...newSetting, description: e.target.value })}
              placeholder="设定描述"
              className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-ink-500 hover:text-ink-700 text-sm">取消</button>
            <button onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-jade-600 hover:bg-jade-500 rounded-lg text-sm transition shadow-lg shadow-jade-600/15 press-effect">
              <Plus className="w-3.5 h-3.5" />创建
            </button>
          </div>
        </div>
      )}

      {/* 设定列表 */}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-ink-400">
          <Library className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无设定</p>
          <p className="text-sm mt-1">手动添加设定，或在元数据提取时自动从章节中识别</p>
        </div>
      )}

      {filtered.map(s => (
        <div key={s.id} className="ink-card rounded-lg overflow-hidden">
          {editingId === s.id ? (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-ink-400 block mb-1">类别</label>
                  <input value={editForm.category}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                </div>
                <div>
                  <label className="text-xs text-ink-400 block mb-1">名称</label>
                  <input value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                </div>
                <div>
                  <label className="text-xs text-ink-400 block mb-1">重要性</label>
                  <select value={editForm.importance}
                    onChange={e => setEditForm({ ...editForm, importance: e.target.value })}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40">
                    <option value="low">低</option>
                    <option value="normal">普通</option>
                    <option value="high">高</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-400 block mb-1">描述</label>
                <textarea value={editForm.description} rows={2}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-ink-500 hover:text-ink-700 text-sm">取消</button>
                <button onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-jade-600 hover:bg-jade-500 rounded-lg text-sm transition shadow-lg shadow-jade-600/15 press-effect">
                  <Save className="w-3.5 h-3.5" />保存
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-vermillion-600/[0.12] text-vermillion-600 border border-vermillion-600/20">
                    {s.category}
                  </span>
                  <span className="text-sm font-medium">{s.name}</span>
                  {s.importance === 'high' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/[0.1] text-red-500 border border-red-500/20">重要</span>
                  )}
                  {s.source_chapter && (
                    <span className="text-xs text-ink-400">第{s.source_chapter}章</span>
                  )}
                </div>
                {s.description && (
                  <div className="text-sm text-ink-500 mt-1">{s.description}</div>
                )}
              </div>
              <div className="flex gap-1 ml-3 shrink-0">
                <button onClick={() => startEdit(s)}
                  className="p-1.5 text-ink-500 hover:text-ink-900 hover:bg-surface-3 rounded transition">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(s)}
                  className="p-1.5 text-ink-500 hover:text-red-400 hover:bg-surface-3 rounded transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
