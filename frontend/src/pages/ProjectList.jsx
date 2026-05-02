import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, BookOpen, Calendar, FileText, BarChart3, X, Feather, PenTool, Scroll } from 'lucide-react';
import { listProjects, createProject, deleteProject } from '../api/client';
import ProgressBar from '../components/ui/ProgressBar';
import { useToast } from '../components/ui/Toast';

export default function ProjectList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', genre: '', description: '', target_words: 200000, platform: '', notes: '' });
  const toast = useToast();

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
      toast.error('创建失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  async function handleDelete(id, name) {
    if (!await toast.confirm(`确定删除项目「${name}」？此操作不可恢复。`)) return;
    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (e) {
      toast.error('删除失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-ink-400 animate-shimmer px-8 py-2 rounded-lg">加载中...</div>
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

      {/* Hero 区 — 诗意介绍 */}
      <div className="text-center mb-12">
        <div className="relative inline-block mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-vermillion-600/10 to-vermillion-600/5 flex items-center justify-center mx-auto">
            <Feather className="w-9 h-9 text-vermillion-600/70" />
          </div>
          <div className="absolute -inset-6 bg-vermillion-600/[0.03] rounded-full blur-2xl" />
        </div>

        <h1 className="text-h1 text-gradient-ink mb-3 tracking-wide">笔下寸心</h1>
        <div className="ink-divider mx-auto w-56 mb-5" />

        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-lg text-ink-700 leading-relaxed">
            这不是一个全自动化的小说工厂。
          </p>
          <p className="text-body text-ink-500 leading-relaxed">
            它是一个<span className="text-vermillion-600 font-medium">写作助手</span>——AI 帮你铺展纸墨，但笔始终在你手中。
            你可以审阅每一章的大纲，修改每一段的文字，决定每一个伏笔的去留。
            机器负责速度，你负责灵魂。
          </p>
          <p className="text-caption italic mt-5">
            "文章千古事，得失寸心知。"
          </p>
        </div>
      </div>

      {/* 功能亮点 */}
      {projects.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="ink-card rounded-xl p-5 text-center">
            <div className="w-10 h-10 rounded-lg bg-jade-500/10 flex items-center justify-center mx-auto mb-3">
              <Scroll className="w-5 h-5 text-jade-600" />
            </div>
            <h3 className="text-h3 text-ink-700 mb-2">大纲规划</h3>
            <p className="text-sm text-ink-500 leading-relaxed">从总纲到分卷到章纲，层层递进。AI 生成，你来审定。</p>
          </div>
          <div className="ink-card rounded-xl p-5 text-center">
            <div className="w-10 h-10 rounded-lg bg-vermillion-600/10 flex items-center justify-center mx-auto mb-3">
              <PenTool className="w-5 h-5 text-vermillion-600" />
            </div>
            <h3 className="text-h3 text-ink-700 mb-2">智能续写</h3>
            <p className="text-sm text-ink-500 leading-relaxed">基于上下文、角色、伏笔的精准续写。生成即编辑，改到满意为止。</p>
          </div>
          <div className="ink-card rounded-xl p-5 text-center">
            <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-5 h-5 text-gold-600" />
            </div>
            <h3 className="text-h3 text-ink-700 mb-2">全程可控</h3>
            <p className="text-sm text-ink-500 leading-relaxed">角色档案、伏笔管理、时间线追踪。每个细节都在你的掌控之中。</p>
          </div>
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-8">
        {projects.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-ink-400">
            <span>{projects.length} 项目</span>
            <span className="text-ink-900">·</span>
            <span>{totalChapters} 章</span>
            <span className="text-ink-900">·</span>
            <span>{totalWords.toLocaleString()} 字</span>
            <span className="text-ink-900">·</span>
            <span className="text-vermillion-600">{avgProgress}% 进度</span>
          </div>
        )}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg transition text-sm font-medium shadow-lg shadow-vermillion-600/10 hover:shadow-vermillion-600/15 press-effect"
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
              <h2 className="text-lg font-semibold text-ink-900">新建项目</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-surface-3 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-ink-500 mb-1.5">项目名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="如：修仙长篇"
                  className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ink-500 mb-1.5">题材</label>
                  <input
                    type="text"
                    value={form.genre}
                    onChange={e => setForm({ ...form, genre: e.target.value })}
                    placeholder="如：玄幻、都市、科幻"
                    className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-ink-500 mb-1.5">目标字数</label>
                  <input
                    type="number"
                    value={form.target_words}
                    onChange={e => setForm({ ...form, target_words: parseInt(e.target.value) || 200000 })}
                    className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-ink-500 mb-1.5">简介</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="简要描述故事背景和主线..."
                  rows={3}
                  className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ink-500 mb-1.5">发布平台</label>
                  <input
                    type="text"
                    value={form.platform}
                    onChange={e => setForm({ ...form, platform: e.target.value })}
                    placeholder="如：起点、番茄、晋江"
                    className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-ink-500 mb-1.5">注意事项</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="如：日更4000字、避免敏感词"
                    className="w-full input-surface border border-border-default rounded-lg px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 transition"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-ink-500 hover:text-ink-900 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className="px-5 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm font-medium transition shadow-lg shadow-vermillion-600/10"
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
        <div className="text-center py-16">
          <p className="text-sm text-ink-500 mb-2">还没有项目</p>
          <p className="text-xs text-ink-400">点击「新建项目」，开始你的第一个故事</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => {
            const progress = Math.min(100, Math.round(((p.current_words || 0) / (p.target_words || 200000)) * 100));
            return (
              <Link
                key={p.id}
                to={`/project/${p.id}`}
                className="block ink-card ink-card-accent rounded-xl p-5 pl-6 card-hover group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-vermillion-600/[0.12] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-vermillion-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold group-hover:text-vermillion-600 transition truncate text-ink-900">
                        {p.name}
                      </h3>
                      {p.genre && (
                        <span className="text-xs text-ink-400">{p.genre}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(p.id, p.name); }}
                    className="p-1.5 text-ink-400 hover:text-red-500 hover:bg-surface-3 rounded-lg transition opacity-0 group-hover:opacity-100"
                    title="删除项目"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {p.description && (
                  <p className="text-sm text-ink-400 line-clamp-2 mb-3 leading-relaxed">{p.description}</p>
                )}
                {/* 进度条 */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-400">{(p.current_words || 0).toLocaleString()} / {(p.target_words || 200000).toLocaleString()} 字</span>
                    <span className="text-vermillion-600">{progress}%</span>
                  </div>
                  <ProgressBar value={progress} />
                </div>
                <div className="flex items-center justify-between text-xs text-ink-400 pt-2 border-t border-border-subtle">
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
