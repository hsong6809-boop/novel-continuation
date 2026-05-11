import { useState, useEffect } from 'react';
import { Plus, Save, Wand2, Loader2, Trash2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import {
  listVolumeOutlines, createVolumeOutline, updateVolumeOutline,
  deleteVolumeOutline, generateVolumeOutlines,
} from '../api/client';
import { useToast } from './ui/Toast';

export default function VolumeOutlinePanel({ project }) {
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editName, setEditName] = useState('');
  const [editChapterStart, setEditChapterStart] = useState('');
  const [editChapterEnd, setEditChapterEnd] = useState('');
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVolume, setNewVolume] = useState({ volume_number: 1, name: '' });
  const toast = useToast();

  useEffect(() => { loadVolumes(); }, [project.id]);

  async function loadVolumes() {
    setLoading(true);
    try {
      const data = await listVolumeOutlines(project.id);
      setVolumes(data);
    } catch {
      setVolumes([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAIGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateVolumeOutlines(project.id);
      await loadVolumes();
    } catch (e) {
      setError('AI 生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd() {
    try {
      await createVolumeOutline(project.id, {
        volume_number: newVolume.volume_number,
        name: newVolume.name,
      });
      setShowAddForm(false);
      setNewVolume({ volume_number: volumes.length + 2, name: '' });
      await loadVolumes();
    } catch (e) {
      setError('创建失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  function startEdit(vol) {
    setEditingId(vol.id);
    setEditText(vol.summary || '');
    setEditName(vol.volume_name || '');
    setEditChapterStart(vol.chapter_start ? String(vol.chapter_start) : '');
    setEditChapterEnd(vol.chapter_end ? String(vol.chapter_end) : '');
  }

  async function handleSaveEdit() {
    try {
      await updateVolumeOutline(project.id, editingId, {
        name: editName,
        summary: editText,
        chapter_start: editChapterStart ? Number(editChapterStart) : null,
        chapter_end: editChapterEnd ? Number(editChapterEnd) : null,
      });
      setEditingId(null);
      await loadVolumes();
    } catch (e) {
      setError('保存失败');
    }
  }

  async function handleDelete(vol) {
    if (!await toast.confirm(`确定删除「${vol.volume_name || '第' + vol.volume_number + '卷'}」？`)) return;
    try {
      await deleteVolumeOutline(project.id, vol.id);
      await loadVolumes();
    } catch {
      setError('删除失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-ink-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-500">
          {volumes.length > 0 ? `共 ${volumes.length} 个分卷` : '尚未设置分卷'}
        </span>
        <div className="flex gap-2">
          <button onClick={() => { setShowAddForm(!showAddForm); setNewVolume({ volume_number: volumes.length + 1, name: '' }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-3 hover:bg-black/[0.06] text-ink-700 border border-border-subtle rounded-lg text-sm transition">
            <Plus className="w-3.5 h-3.5" />新增分卷
          </button>
          <button onClick={handleAIGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-inkblue-500 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm transition shadow-lg shadow-purple-600/15">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            生成下一卷
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      {/* 新增分卷表单 */}
      {showAddForm && (
        <div className="bg-surface-1 border border-border-default rounded-lg p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-400 block mb-1">卷号</label>
              <input type="number" value={newVolume.volume_number}
                onChange={e => setNewVolume({ ...newVolume, volume_number: Number(e.target.value) })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1">卷名</label>
              <input value={newVolume.name} placeholder="如：风起云涌"
                onChange={e => setNewVolume({ ...newVolume, name: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-ink-500 hover:text-ink-700 text-sm">取消</button>
            <button onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15">
              <Plus className="w-3.5 h-3.5" />创建
            </button>
          </div>
        </div>
      )}

      {/* AI 生成中 */}
      {generating && (
        <div className="flex items-center justify-center py-8 text-ink-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          <div>
            <div className="text-sm font-medium">AI 正在生成下一卷大纲...</div>
            <div className="text-xs mt-1">基于总纲和上一卷正文生成，可能需要 30-60 秒</div>
          </div>
        </div>
      )}

      {/* 分卷列表 — 单框编辑 */}
      {volumes.length === 0 && !generating && (
        <div className="text-center py-8 text-ink-400">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无分卷大纲</p>
          <p className="text-sm mt-1">点击「生成下一卷」基于总纲和前文自动生成，或手动新增</p>
        </div>
      )}

      {volumes.map(vol => (
        <div key={vol.id} className="bg-surface-1 border border-border-subtle rounded-xl overflow-hidden">
          {editingId === vol.id ? (
            /* 编辑模式 — 简洁单框 */
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-ink-400 block mb-1">卷名</label>
                  <input value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                </div>
                <div>
                  <label className="text-xs text-ink-400 block mb-1">起始章节</label>
                  <input type="number" value={editChapterStart}
                    onChange={e => setEditChapterStart(e.target.value)}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                </div>
                <div>
                  <label className="text-xs text-ink-400 block mb-1">结束章节</label>
                  <input type="number" value={editChapterEnd}
                    onChange={e => setEditChapterEnd(e.target.value)}
                    className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-400 block mb-1">卷纲内容</label>
                <textarea value={editText} rows={8}
                  onChange={e => setEditText(e.target.value)}
                  placeholder="本卷的概要、核心事件、情感基调、关键转折..."
                  className="w-full input-surface border border-border-default rounded-lg px-4 py-3 text-sm leading-relaxed focus:ring-1 focus:ring-vermillion-500/40 resize-y font-mono" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-ink-500 hover:text-ink-700 text-sm">取消</button>
                <button onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15">
                  <Save className="w-3.5 h-3.5" />保存
                </button>
              </div>
            </div>
          ) : (
            /* 展示模式 — 单框 */
            <div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-inkblue-600 bg-inkblue-500/[0.12] px-2 py-0.5 rounded border border-inkblue-500/25 shrink-0">
                    V{vol.volume_number}
                  </span>
                  <span className="text-sm font-medium truncate">{vol.volume_name || '未命名卷'}</span>
                  {vol.chapter_start && vol.chapter_end && (
                    <span className="text-xs text-ink-400 shrink-0">
                      第 {vol.chapter_start}-{vol.chapter_end} 章
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(vol)}
                    className="px-2 py-1 text-xs text-ink-500 hover:text-ink-900 hover:bg-surface-3 rounded transition">
                    编辑
                  </button>
                  <button onClick={() => handleDelete(vol)}
                    className="px-2 py-1 text-xs text-ink-500 hover:text-red-400 hover:bg-surface-3 rounded transition">
                    删除
                  </button>
                </div>
              </div>
              {vol.summary && (
                <div className="px-4 pb-4">
                  <div className="bg-surface-0 rounded-lg p-3 text-sm text-ink-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {vol.summary}
                  </div>
                </div>
              )}
              {!vol.summary && (
                <div className="px-4 pb-4">
                  <div className="text-xs text-ink-400 italic">暂无内容，点击编辑添加</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
