import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, BookOpen, Calendar } from 'lucide-react';
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
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">我的项目</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* 新建项目表单 */}
      {showCreate && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新建项目</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">项目名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="如：修仙长篇"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">题材</label>
                <input
                  type="text"
                  value={form.genre}
                  onChange={e => setForm({ ...form, genre: e.target.value })}
                  placeholder="如：玄幻、都市、科幻"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">目标字数</label>
                <input
                  type="number"
                  value={form.target_words}
                  onChange={e => setForm({ ...form, target_words: parseInt(e.target.value) || 200000 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">简介</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="简要描述故事背景和主线..."
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">发布平台</label>
                <input
                  type="text"
                  value={form.platform}
                  onChange={e => setForm({ ...form, platform: e.target.value })}
                  placeholder="如：起点、番茄、晋江"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">注意事项</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="如：日更4000字、避免敏感词"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">还没有项目</p>
          <p className="text-sm">点击「新建项目」开始你的创作</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map(p => (
            <Link
              key={p.id}
              to={`/project/${p.id}`}
              className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 transition group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold group-hover:text-blue-400 transition truncate">
                      {p.name}
                    </h3>
                    {p.genre && (
                      <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full shrink-0">
                        {p.genre}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description}</p>
                  )}
                  <div className="flex items-center gap-6 text-xs text-gray-600">
                    <span>{p.current_chapter} 章</span>
                    <span>{(p.current_words || 0).toLocaleString()} 字</span>
                    <span>目标 {(p.target_words || 200000).toLocaleString()} 字</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(p.updated_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(p.id, p.name); }}
                  className="p-2 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title="删除项目"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
