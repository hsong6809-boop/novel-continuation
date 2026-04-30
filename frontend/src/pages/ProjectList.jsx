import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, BookOpen, Calendar, FileText, BarChart3, X } from 'lucide-react';
import { listProjects, createProject, deleteProject } from '../api/client';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', genre: '', description: '', target_words: 200000, platform: '', notes: '' });

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (e) {
      console.error('加载项目失败:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    try {
      const project = await createProject(form);
      setProjects([project, ...projects]);
      setForm({ name: '', genre: '', description: '', target_words: 200000, platform: '', notes: '' });
      setShowCreate(false);
    } catch (e) {
      alert('创建失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`确定删除项目「${name}」？此操作不可恢复。`)) return;
    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (e) {
      alert('删除失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-shimmer px-8 py-2 rounded-lg">加载中...</div>
      </div>
    );
  }

  const totalChapters = projects.reduce((s, p) => s + (p.current_chapter || 0), 0);
  const totalWords = projects.reduce((s, p) => s + (p.current_words || 0), 0);
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + ((p.current_words || 0) / (p.target_words || 200000)), 0) / projects.length * 100)
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 ink-wash-bg">

      {/* Hero 区 */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gradient-ink mb-2 tracking-wide">我的项目</h1>
        <div className="ink-divider mx-auto w-48 mb-3" />
        <p className="text-sm text-gray-500">笔耕不辍，墨香长存</p>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-8">
        {/* 内联统计 */}
        {projects.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{projects.length} 项目</span>
            <span className="text-gray-700">·</span>
            <span>{totalChapters} 章</span>
            <span className="text-gray-700">·</span>
            <span>{totalWords.toLocaleString()} 字</span>
            <span className="text-gray-700">·</span>
            <span className="text-amber-400/70">{avgProgress}% 进度</span>
          </div>
        )}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg transition text-sm font-medium shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* 新建项目 — Modal Overlay */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative border-gradient bg-surface-1 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/50 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-200">新建项目</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">项目名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="如：修仙长篇"
                  className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">题材</label>
                  <input
                    type="text"
                    value={form.genre}
                    onChange={e => setForm({ ...form, genre: e.target.value })}
                    placeholder="如：玄幻、都市、科幻"
                    className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">目标字数</label>
                  <input
                    type="number"
                    value={form.target_words}
                    onChange={e => setForm({ ...form, target_words: parseInt(e.target.value) || 200000 })}
                    className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">简介</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="简要描述故事背景和主线..."
                  rows={3}
                  className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">发布平台</label>
                  <input
                    type="text"
                    value={form.platform}
                    onChange={e => setForm({ ...form, platform: e.target.value })}
                    placeholder="如：起点、番茄、晋江"
                    className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">注意事项</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="如：日更4000字、避免敏感词"
                    className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className="px-5 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg text-sm font-medium transition shadow-lg shadow-amber-500/10"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 项目网格 */}
      {projects.length === 0 ? (
        <div className="text-center py-24">
          <div className="relative inline-block mb-6">
            <BookOpen className="w-16 h-16 mx-auto text-gray-700 opacity-40" />
            <div className="absolute -inset-8 bg-amber-500/[0.03] rounded-full blur-2xl" />
          </div>
          <p className="text-lg text-gray-400 mb-2">尚无篇章</p>
          <p className="text-sm text-gray-600">点击「新建项目」，落笔生花</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => {
            const progress = Math.min(100, Math.round(((p.current_words || 0) / (p.target_words || 200000)) * 100));
            return (
              <Link
                key={p.id}
                to={`/project/${p.id}`}
                className="block ink-card ink-card-accent rounded-xl p-5 pl-6 transition-all group hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 hover:border-border-hover"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/[0.1] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-amber-400/70" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold group-hover:text-amber-300/90 transition truncate text-gray-200">
                        {p.name}
                      </h3>
                      {p.genre && (
                        <span className="text-xs text-gray-500">{p.genre}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(p.id, p.name); }}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-white/[0.04] rounded-lg transition opacity-0 group-hover:opacity-100"
                    title="删除项目"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3 leading-relaxed">{p.description}</p>
                )}
                {/* 进度条 */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">{(p.current_words || 0).toLocaleString()} / {(p.target_words || 200000).toLocaleString()} 字</span>
                    <span className="text-amber-400/60">{progress}%</span>
                  </div>
                  <div className="w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #c05030, #b8860b)',
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-border-subtle">
                  <span>{p.current_chapter || 0} 章</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(p.updated_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
