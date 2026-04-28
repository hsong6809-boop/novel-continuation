import { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, Save, Wand2, ChevronDown, ChevronRight, Loader2,
  BookOpen, Edit3, Trash2, GripVertical, Layers
} from 'lucide-react';
import {
  listOutlines, getOutline, updateOutline, generateOutline, updateScenes,
  getOverallOutline, generateOverallOutline, updateOverallOutline,
  listVolumeOutlines, createVolumeOutline, updateVolumeOutline,
  deleteVolumeOutline, generateVolumeOutlines, batchGenerateOutlines,
} from '../api/client';

// ============================================================
// 总纲编辑器（不含分卷，分卷独立管理）
// ============================================================
function OverallOutlineEditor({ project }) {
  const [outline, setOutline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => { loadOutline(); }, [project.id]);

  async function loadOutline() {
    setLoading(true);
    setError(null);
    try {
      const data = await getOverallOutline(project.id);
      setOutline(data && Object.keys(data).length > 0 ? data : null);
    } catch {
      setOutline(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await generateOverallOutline(project.id);
      if (data.error) setError(data.error);
      else setOutline(data);
    } catch (e) {
      setError('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  function startEdit() {
    setEditText(JSON.stringify(outline, null, 2));
    setEditing(true);
  }

  async function handleSave() {
    try {
      const parsed = JSON.parse(editText);
      await updateOverallOutline(project.id, parsed);
      setOutline(parsed);
      setEditing(false);
    } catch (e) {
      if (e instanceof SyntaxError) setError('JSON 格式错误，请检查');
      else setError('保存失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {outline ? '已生成总纲，可编辑或重新生成' : '尚未生成总纲'}
        </span>
        <div className="flex gap-2">
          {outline && !editing && (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
              <Edit3 className="w-3.5 h-3.5" />编辑
            </button>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm transition">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {outline ? '重新生成' : 'AI 生成总纲'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</div>}

      {editing && (
        <div className="space-y-2">
          <textarea value={editText} onChange={e => setEditText(e.target.value)}
            className="w-full h-96 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-blue-500 resize-y" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition">取消</button>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
              <Save className="w-3.5 h-3.5" />保存
            </button>
          </div>
        </div>
      )}

      {!editing && outline && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {outline.premise && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">故事前提</div>
                <div className="text-sm text-gray-300">{outline.premise}</div>
              </div>
            )}
            {outline.main_conflict && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">主要矛盾</div>
                <div className="text-sm text-gray-300">{outline.main_conflict}</div>
              </div>
            )}
            {outline.themes && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">核心主题</div>
                <div className="text-sm text-gray-300">{outline.themes}</div>
              </div>
            )}
            {outline.character_arcs && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">角色弧线</div>
                <div className="text-sm text-gray-300">{outline.character_arcs}</div>
              </div>
            )}
          </div>
          {outline.story_structure && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">故事结构</div>
              <div className="text-sm text-gray-300">{outline.story_structure}</div>
            </div>
          )}
          {outline.future_directions && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">后续方向</div>
              <div className="text-sm text-gray-300">{outline.future_directions}</div>
            </div>
          )}
        </div>
      )}

      {!editing && !outline && !generating && (
        <div className="text-center py-12 text-gray-500">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>暂无总纲</p>
          <p className="text-sm mt-1">点击「AI 生成总纲」，AI 将根据项目信息和已有章节自动规划</p>
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          <div>
            <div className="text-sm font-medium">AI 正在生成总纲...</div>
            <div className="text-xs mt-1">分析项目信息、角色、伏笔，可能需要 30-60 秒</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 分卷大纲编辑器
// ============================================================
function VolumeOutlinePanel({ project }) {
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVolume, setNewVolume] = useState({ volume_number: 1, volume_name: '' });

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
        volume_name: newVolume.volume_name,
      });
      setShowAddForm(false);
      setNewVolume({ volume_number: volumes.length + 1, volume_name: '' });
      await loadVolumes();
    } catch (e) {
      setError('创建失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  function startEdit(vol) {
    setEditingId(vol.id);
    setEditForm({
      volume_name: vol.volume_name || '',
      summary: vol.summary || '',
      chapter_start: vol.chapter_start || '',
      chapter_end: vol.chapter_end || '',
      core_events: vol.core_events || '',
      emotional_tone: vol.emotional_tone || '',
      key_turning_point: vol.key_turning_point || '',
    });
  }

  async function handleSaveEdit() {
    try {
      await updateVolumeOutline(project.id, editingId, {
        ...editForm,
        chapter_start: editForm.chapter_start ? Number(editForm.chapter_start) : null,
        chapter_end: editForm.chapter_end ? Number(editForm.chapter_end) : null,
      });
      setEditingId(null);
      await loadVolumes();
    } catch (e) {
      setError('保存失败');
    }
  }

  async function handleDelete(vol) {
    if (!confirm(`确定删除「${vol.volume_name || '第' + vol.volume_number + '卷'}」？`)) return;
    try {
      await deleteVolumeOutline(project.id, vol.id);
      await loadVolumes();
    } catch {
      setError('删除失败');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {volumes.length > 0 ? `共 ${volumes.length} 个分卷` : '尚未设置分卷'}
        </span>
        <div className="flex gap-2">
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
            <Plus className="w-3.5 h-3.5" />新增分卷
          </button>
          <button onClick={handleAIGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm transition">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            AI 生成分卷
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</div>}

      {/* 新增分卷表单 */}
      {showAddForm && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">卷号</label>
              <input type="number" value={newVolume.volume_number}
                onChange={e => setNewVolume({ ...newVolume, volume_number: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">卷名</label>
              <input value={newVolume.volume_name} placeholder="如：风起云涌"
                onChange={e => setNewVolume({ ...newVolume, volume_name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-gray-400 hover:text-gray-300 text-sm">取消</button>
            <button onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
              <Plus className="w-3.5 h-3.5" />创建
            </button>
          </div>
        </div>
      )}

      {/* 分卷列表 */}
      {volumes.length === 0 && !generating && (
        <div className="text-center py-12 text-gray-500">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>暂无分卷大纲</p>
          <p className="text-sm mt-1">点击「AI 生成分卷」自动规划，或手动新增</p>
        </div>
      )}

      {volumes.map(vol => (
        <div key={vol.id} className="bg-gray-800/30 border border-gray-800 rounded-lg overflow-hidden">
          {editingId === vol.id ? (
            /* 编辑模式 */
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">卷名</label>
                  <input value={editForm.volume_name}
                    onChange={e => setEditForm({ ...editForm, volume_name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">起始章节</label>
                  <input type="number" value={editForm.chapter_start}
                    onChange={e => setEditForm({ ...editForm, chapter_start: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">结束章节</label>
                  <input type="number" value={editForm.chapter_end}
                    onChange={e => setEditForm({ ...editForm, chapter_end: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">概要</label>
                <textarea value={editForm.summary} rows={2}
                  onChange={e => setEditForm({ ...editForm, summary: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">核心事件</label>
                <textarea value={editForm.core_events} rows={2}
                  onChange={e => setEditForm({ ...editForm, core_events: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">情感基调</label>
                  <input value={editForm.emotional_tone}
                    onChange={e => setEditForm({ ...editForm, emotional_tone: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">关键转折</label>
                  <input value={editForm.key_turning_point}
                    onChange={e => setEditForm({ ...editForm, key_turning_point: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-gray-400 hover:text-gray-300 text-sm">取消</button>
                <button onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
                  <Save className="w-3.5 h-3.5" />保存
                </button>
              </div>
            </div>
          ) : (
            /* 展示模式 */
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                    V{vol.volume_number}
                  </span>
                  <span className="text-sm font-medium">{vol.volume_name || '未命名卷'}</span>
                  {vol.chapter_start && vol.chapter_end && (
                    <span className="text-xs text-gray-500">
                      第 {vol.chapter_start}-{vol.chapter_end} 章
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(vol)}
                    className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition"
                    title="编辑">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(vol)}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition"
                    title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {vol.summary && (
                <div className="text-sm text-gray-400 mb-2">{vol.summary}</div>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                {vol.core_events && <span>核心事件：{vol.core_events}</span>}
                {vol.emotional_tone && <span>基调：{vol.emotional_tone}</span>}
                {vol.key_turning_point && <span>转折：{vol.key_turning_point}</span>}
              </div>
            </div>
          )}
        </div>
      ))}

      {generating && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          <div>
            <div className="text-sm font-medium">AI 正在生成分卷大纲...</div>
            <div className="text-xs mt-1">分析项目结构，规划分卷，可能需要 30-60 秒</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 逐章章纲（按卷分组展示 + 批量生成 + 单章编辑）
// ============================================================
function ChapterOutlinePanel({ project, focusChapter }) {
  const [volumes, setVolumes] = useState([]);
  const [outlines, setOutlines] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(null); // volume_id
  const [error, setError] = useState(null);
  const [selectedVolumeId, setSelectedVolumeId] = useState(null);
  const [batchInstructions, setBatchInstructions] = useState('');
  const focusRef = useRef(null);

  useEffect(() => { loadData(); }, [project.id]);

  // 自动聚焦到指定章节
  useEffect(() => {
    if (focusChapter && outlines.length > 0) {
      // 找到包含该章节的卷并选中
      const vol = volumes.find(v => v.chapter_start <= focusChapter && v.chapter_end >= focusChapter);
      if (vol) {
        setSelectedVolumeId(vol.id);
      }
      // 自动展开该章节
      const target = outlines.find(o => o.chapter_number === focusChapter);
      if (target) {
        toggleExpand(focusChapter);
        // 延迟滚动到该位置
        setTimeout(() => {
          focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [focusChapter, outlines, volumes]);

  async function loadData() {
    try {
      const [vols, outs] = await Promise.all([
        listVolumeOutlines(project.id),
        listOutlines(project.id),
      ]);
      setVolumes(vols);
      setOutlines(outs);
      // 自动选中第一个分卷
      if (vols.length > 0 && !selectedVolumeId) {
        setSelectedVolumeId(vols[0].id);
      }
    } catch {
      console.error('加载数据失败');
    }
  }

  // 按卷分组章纲
  function getOutlinesByVolume() {
    const outlineMap = {};
    outlines.forEach(o => { outlineMap[o.chapter_number] = o; });

    const grouped = [];
    const assigned = new Set();

    // 有分卷的章节
    volumes.forEach(vol => {
      const chs = [];
      for (let ch = vol.chapter_start || 1; ch <= (vol.chapter_end || 30); ch++) {
        if (outlineMap[ch]) {
          chs.push(outlineMap[ch]);
          assigned.add(ch);
        }
      }
      if (chs.length > 0) {
        grouped.push({ volume: vol, chapters: chs });
      }
    });

    // 未分配的章节
    const unassigned = outlines.filter(o => !assigned.has(o.chapter_number));
    if (unassigned.length > 0) {
      grouped.push({ volume: null, chapters: unassigned });
    }

    return grouped;
  }

  async function toggleExpand(ch) {
    if (expanded === ch) { setExpanded(null); setDetail(null); setEditForm(null); return; }
    setExpanded(ch);
    try {
      const d = await getOutline(project.id, ch);
      setDetail(d);
      setEditForm({
        title: d.outline?.title || '',
        core_objective: d.outline?.core_objective || '',
        emotional_arc: d.outline?.emotional_arc || '',
        hooks: d.outline?.hooks || '',
        scenes: d.scenes || [],
      });
    } catch { setDetail(null); setEditForm(null); }
  }

  async function handleGenerate(ch) {
    setGenerating(true);
    try {
      await generateOutline(project.id, ch, {});
      await loadData();
      await toggleExpand(ch);
    } catch (e) {
      alert('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  async function handleBatchGenerate(volumeId) {
    setBatchGenerating(volumeId);
    setError(null);
    try {
      await batchGenerateOutlines(project.id, volumeId, batchInstructions ? { custom_instructions: batchInstructions } : null);
      await loadData();
    } catch (e) {
      setError('批量生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBatchGenerating(null);
    }
  }

  async function handleSave(ch) {
    try {
      await updateOutline(project.id, ch, {
        title: editForm.title,
        core_objective: editForm.core_objective,
        emotional_arc: editForm.emotional_arc,
        hooks: editForm.hooks,
      });
      if (editForm.scenes?.length > 0) {
        await updateScenes(project.id, ch, editForm.scenes);
      }
      await loadData();
      alert('保存成功');
    } catch { alert('保存失败'); }
  }

  function addScene() {
    const scenes = editForm.scenes || [];
    setEditForm({
      ...editForm,
      scenes: [...scenes, {
        scene_order: scenes.length + 1, mission: '', key_dialogue_hint: '', atmosphere: '', target_words_ratio: 0.25,
      }],
    });
  }

  function updateScene(idx, field, value) {
    const scenes = [...editForm.scenes];
    scenes[idx] = { ...scenes[idx], [field]: value };
    setEditForm({ ...editForm, scenes });
  }

  function removeScene(idx) {
    setEditForm({ ...editForm, scenes: editForm.scenes.filter((_, i) => i !== idx) });
  }

  const grouped = getOutlinesByVolume();
  // 按选中分卷过滤
  const filteredGrouped = selectedVolumeId
    ? grouped.filter(g => g.volume?.id === selectedVolumeId)
    : grouped;

  const selectedVolume = volumes.find(v => v.id === selectedVolumeId);

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</div>}

      {/* 分卷选择器 + 批量生成 */}
      {volumes.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 shrink-0">选择分卷：</label>
            <select
              value={selectedVolumeId || ''}
              onChange={e => setSelectedVolumeId(Number(e.target.value) || null)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            >
              {volumes.map(v => (
                <option key={v.id} value={v.id}>
                  V{v.volume_number} {v.volume_name || '未命名卷'} {v.chapter_start && v.chapter_end ? `(第${v.chapter_start}-${v.chapter_end}章)` : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedVolume && (
            <div className="flex items-center gap-3">
              <input
                value={batchInstructions}
                onChange={e => setBatchInstructions(e.target.value)}
                placeholder="自定义指令（可选）：如本卷重点铺设世界观..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={() => handleBatchGenerate(selectedVolumeId)}
                disabled={batchGenerating === selectedVolumeId}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm transition shrink-0"
              >
                {batchGenerating === selectedVolumeId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Wand2 className="w-3.5 h-3.5" />}
                批量生成本卷章纲
              </button>
            </div>
          )}
        </div>
      )}

      {outlines.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>暂无章纲</p>
          <p className="text-sm mt-1">请先在「分卷大纲」中创建分卷，然后使用批量生成</p>
        </div>
      )}

      {filteredGrouped.map((group, gi) => (
        <div key={gi} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* 卷标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-800">
            <div className="flex items-center gap-2">
              {group.volume ? (
                <>
                  <span className="text-xs font-mono text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                    V{group.volume.volume_number}
                  </span>
                  <span className="text-sm font-medium">{group.volume.volume_name || '未命名卷'}</span>
                  <span className="text-xs text-gray-500">({group.chapters.length} 章)</span>
                </>
              ) : (
                <span className="text-sm text-gray-400">未分卷章节 ({group.chapters.length} 章)</span>
              )}
            </div>
            {group.volume && (
              <button onClick={() => handleBatchGenerate(group.volume.id)} disabled={batchGenerating === group.volume.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-xs transition">
                {batchGenerating === group.volume.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Wand2 className="w-3 h-3" />}
                批量生成章纲
              </button>
            )}
          </div>

          {/* 章纲列表 */}
          {group.chapters.map(o => (
            <div key={o.chapter_number} ref={focusChapter === o.chapter_number ? focusRef : undefined}>
              <div
                className={`grid grid-cols-[80px_1fr_1fr_1fr_100px] gap-2 px-4 py-3 cursor-pointer hover:bg-gray-800/30 transition border-b border-gray-800/50 ${
                  expanded === o.chapter_number ? 'bg-gray-800/50' : ''
                } ${focusChapter === o.chapter_number ? 'ring-1 ring-green-500/30' : ''}`}
                onClick={() => toggleExpand(o.chapter_number)}
              >
                <div className="flex items-center gap-1.5">
                  {expanded === o.chapter_number
                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                  <span className="text-sm font-mono text-gray-400">第{o.chapter_number}章</span>
                </div>
                <div className="text-sm truncate">{o.title || '（无标题）'}</div>
                <div className="text-sm text-gray-400 truncate">{o.core_objective || '—'}</div>
                <div className="text-sm text-gray-500 truncate">{o.hooks || '—'}</div>
                <div className="flex justify-end">
                  <button onClick={(e) => { e.stopPropagation(); handleGenerate(o.chapter_number); }}
                    disabled={generating}
                    className="p-1.5 text-yellow-400 hover:bg-gray-700 rounded transition" title="AI 生成章纲">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 展开编辑区 */}
              {expanded === o.chapter_number && editForm && (
                <div className="border-b border-gray-800 px-5 py-4 space-y-4 bg-gray-900/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">标题</label>
                      <input value={editForm.title}
                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">核心目标</label>
                      <input value={editForm.core_objective}
                        onChange={e => setEditForm({ ...editForm, core_objective: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">情感走向</label>
                    <input value={editForm.emotional_arc}
                      onChange={e => setEditForm({ ...editForm, emotional_arc: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">章末钩子</label>
                    <input value={editForm.hooks}
                      onChange={e => setEditForm({ ...editForm, hooks: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-500">场景要点</label>
                      <button onClick={addScene} className="text-xs text-blue-400 hover:text-blue-300">+ 添加场景</button>
                    </div>
                    {editForm.scenes?.map((s, i) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg p-3 mb-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">场景 {i + 1}</span>
                          <button onClick={() => removeScene(i)} className="text-xs text-red-400 hover:text-red-300">删除</button>
                        </div>
                        <input value={s.mission || ''} onChange={e => updateScene(i, 'mission', e.target.value)}
                          placeholder="场景任务"
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={s.key_dialogue_hint || ''} onChange={e => updateScene(i, 'key_dialogue_hint', e.target.value)}
                            placeholder="关键对话提示"
                            className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                          <input value={s.atmosphere || ''} onChange={e => updateScene(i, 'atmosphere', e.target.value)}
                            placeholder="氛围要点"
                            className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-gray-500">情节密度（篇幅占比）</label>
                            <span className="text-xs text-purple-400 font-mono">{Math.round((s.target_words_ratio || 0.25) * 100)}%</span>
                          </div>
                          <input
                            type="range" min="0.1" max="0.5" step="0.05"
                            value={s.target_words_ratio || 0.25}
                            onChange={e => updateScene(i, 'target_words_ratio', parseFloat(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => handleSave(o.chapter_number)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition">
                      <Save className="w-4 h-4" />保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 主组件：三栏切换
// ============================================================
export default function OutlinePanel({ project, onRefresh, focusChapter }) {
  const [activeSection, setActiveSection] = useState('overall');
  const [outlines, setOutlines] = useState([]);

  useEffect(() => {
    listOutlines(project.id).then(setOutlines).catch(() => {});
  }, [project.id]);

  const tabs = [
    { key: 'overall', label: '总纲', icon: BookOpen, color: 'purple' },
    { key: 'volumes', label: '分卷大纲', icon: Layers, color: 'blue' },
    { key: 'chapters', label: '逐章章纲', icon: FileText, color: 'green' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-green-400" />
        <h1 className="text-xl font-bold">大纲管理</h1>
      </div>

      {/* 三栏切换 */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-lg p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeSection === t.key;
          return (
            <button key={t.key} onClick={() => setActiveSection(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm transition ${
                isActive
                  ? `bg-${t.color}-600/20 text-${t.color}-400 border border-${t.color}-500/30`
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={isActive ? {
                backgroundColor: t.color === 'purple' ? 'rgba(147,51,234,0.15)' :
                  t.color === 'blue' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
                color: t.color === 'purple' ? '#c084fc' :
                  t.color === 'blue' ? '#60a5fa' : '#4ade80',
                borderColor: t.color === 'purple' ? 'rgba(147,51,234,0.3)' :
                  t.color === 'blue' ? 'rgba(59,130,246,0.3)' : 'rgba(34,197,94,0.3)',
                borderWidth: '1px',
              } : {}}>
              <Icon className="w-4 h-4" />
              {t.label}
              {t.key === 'chapters' && outlines.length > 0 && (
                <span className="text-xs bg-gray-800 px-1.5 py-0.5 rounded-full">{outlines.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {activeSection === 'overall' && <OverallOutlineEditor project={project} />}
        {activeSection === 'volumes' && <VolumeOutlinePanel project={project} />}
        {activeSection === 'chapters' && <ChapterOutlinePanel project={project} focusChapter={focusChapter} />}
      </div>
    </div>
  );
}
