import { useState, useEffect, useRef } from 'react';
import {
  FileText, Save, Wand2, ChevronDown, ChevronRight, Loader2, Shield, Plus, Trash2,
} from 'lucide-react';
import {
  listOutlines, getOutline, updateOutline, generateOutline,
  listVolumeOutlines, batchGenerateOutlines, generateNextOutlines, deleteOutline,
} from '../api/client';
import { useToast } from './ui/Toast';

const SOURCE_LABELS = {
  extracted: { text: '已提取', color: 'text-jade-700', bg: 'bg-green-500/10' },
  generated: { text: 'AI生成', color: 'text-inkblue-600', bg: 'bg-inkblue-500/10' },
  manual:    { text: '手动',   color: 'text-ink-400',   bg: 'bg-surface-3' },
};

function SourceBadge({ source }) {
  const cfg = SOURCE_LABELS[source] || SOURCE_LABELS.extracted;
  return (
    <span className={`text-[10px] px-1 py-0 rounded ${cfg.bg} ${cfg.color}`}>
      {cfg.text}
    </span>
  );
}

export default function ChapterOutlinePanel({ project, focusChapter, outlines: propOutlines, onOutlinesChange }) {
  const [volumes, setVolumes] = useState([]);
  const [outlines, setOutlines] = useState(propOutlines || []);
  const [expanded, setExpanded] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generatingCh, setGeneratingCh] = useState(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVolumeId, setSelectedVolumeId] = useState(null);
  const [batchInstructions, setBatchInstructions] = useState('');
  const [nextCount, setNextCount] = useState(5);
  const focusRef = useRef(null);
  const userTriggeredRef = useRef(false);
  const toast = useToast();

  useEffect(() => { loadData(); }, [project.id]);

  useEffect(() => {
    if (focusChapter && outlines.length > 0 && !userTriggeredRef.current) {
      const vol = volumes.find(v => v.chapter_start <= focusChapter && v.chapter_end >= focusChapter);
      if (vol) setSelectedVolumeId(vol.id);
      const target = outlines.find(o => o.chapter_number === focusChapter);
      if (target) {
        toggleExpand(focusChapter);
        setTimeout(() => {
          focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
    userTriggeredRef.current = false;
  }, [focusChapter]);

  async function loadData() {
    try {
      const vols = await listVolumeOutlines(project.id);
      setVolumes(vols);
      // 始终从 API 刷新章纲列表，确保生成后能显示最新数据
      const outs = await listOutlines(project.id);
      setOutlines(outs);
      onOutlinesChange?.(outs);
      if (vols.length > 0 && !selectedVolumeId) {
        setSelectedVolumeId(vols[0].id);
      }
    } catch {
      console.error('加载数据失败');
    }
  }

  function getMissingCount(vol) {
    if (!vol || !vol.chapter_start || !vol.chapter_end) return 0;
    const existing = new Set(outlines.map(o => o.chapter_number));
    let missing = 0;
    for (let ch = vol.chapter_start; ch <= vol.chapter_end; ch++) {
      if (!existing.has(ch)) missing++;
    }
    return missing;
  }

  function getOutlinesByVolume() {
    const outlineMap = {};
    outlines.forEach(o => { outlineMap[o.chapter_number] = o; });
    const grouped = [];
    const assigned = new Set();
    volumes.forEach(vol => {
      const chs = [];
      for (let ch = vol.chapter_start || 1; ch <= (vol.chapter_end || 30); ch++) {
        if (outlineMap[ch]) {
          chs.push(outlineMap[ch]);
          assigned.add(ch);
        }
      }
      grouped.push({ volume: vol, chapters: chs });
    });
    const unassigned = outlines.filter(o => !assigned.has(o.chapter_number));
    if (unassigned.length > 0) grouped.push({ volume: null, chapters: unassigned });
    return grouped;
  }

  async function toggleExpand(ch) {
    userTriggeredRef.current = true;
    if (expanded === ch) { setExpanded(null); setEditForm(null); return; }
    setExpanded(ch);
    try {
      const d = await getOutline(project.id, ch);
      const o = d.outline || {};
      setEditForm({
        title: o.title || '',
        core_objective: o.core_objective || '',
        hooks: o.hooks || '',
        info_delivery: o.info_delivery || '',
        character_development: o.character_development || '',
        setup_for_future: o.setup_for_future || '',
      });
    } catch { setEditForm(null); }
  }

  async function handleGenerate(ch) {
    const existing = outlines.find(o => o.chapter_number === ch);
    if (existing) {
      const src = SOURCE_LABELS[existing.source]?.text || '未知';
      if (!await toast.confirm(`该章纲来源为「${src}」，重新生成将覆盖，确定？`)) return;
    }
    setGeneratingCh(ch);
    try {
      await generateOutline(project.id, ch, {});
      await loadData();
      await toggleExpand(ch);
    } catch (e) {
      toast.error('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGeneratingCh(null);
    }
  }

  async function handleGenerateNext() {
    if (nextCount < 1 || nextCount > 50) {
      toast.warning('章节数量需在 1~50 之间');
      return;
    }
    setBatchGenerating(true);
    setError(null);
    try {
      const res = await generateNextOutlines(project.id, nextCount, batchInstructions ? { custom_instructions: batchInstructions } : null);
      await loadData();
      toast.success(`已生成第 ${res.start_chapter} ~ 第 ${res.end_chapter} 章的章纲（共 ${res.count} 章）`);
    } catch (e) {
      setError('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBatchGenerating(false);
    }
  }

  async function handleBatchGenerate(volumeId) {
    const missing = getMissingCount(volumes.find(v => v.id === volumeId));
    if (missing === 0) {
      toast.warning('本卷章纲已完整，无需生成');
      return;
    }
    setBatchGenerating(true);
    setError(null);
    try {
      const res = await batchGenerateOutlines(project.id, volumeId, batchInstructions ? { custom_instructions: batchInstructions } : null);
      await loadData();
      if (res.skipped > 0) {
        toast.success(`已跳过 ${res.skipped} 个已有章纲，新生成 ${res.count} 个`);
      }
    } catch (e) {
      setError('批量生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBatchGenerating(false);
    }
  }

  async function handleSave(ch) {
    try {
      await updateOutline(project.id, ch, {
        title: editForm.title,
        core_objective: editForm.core_objective,
        hooks: editForm.hooks,
        info_delivery: editForm.info_delivery,
        character_development: editForm.character_development,
        setup_for_future: editForm.setup_for_future,
      });
      await loadData();
      toast.success('保存成功');
    } catch { toast.error('保存失败'); }
  }

  async function handleDelete(ch) {
    if (!await toast.confirm(`确定删除第${ch}章的章纲？`)) return;
    try {
      await deleteOutline(project.id, ch);
      await loadData();
      if (expanded === ch) { setExpanded(null); setEditForm(null); }
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  const grouped = getOutlinesByVolume();
  const filteredGrouped = selectedVolumeId
    ? grouped.filter(g => g.volume?.id === selectedVolumeId)
    : grouped;
  const selectedVolume = volumes.find(v => v.id === selectedVolumeId);
  const selectedMissing = selectedVolume ? getMissingCount(selectedVolume) : 0;

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      {/* 生成后续章纲 */}
      <div className="bg-surface-1 border border-border-subtle rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-ink-500 shrink-0">生成后续</label>
          <input
            type="number"
            min={1}
            max={50}
            value={nextCount}
            onChange={e => setNextCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            className="w-20 input-surface border border-border-default rounded-lg px-3 py-2 text-sm text-center focus:ring-1 focus:ring-inkblue-500/40"
          />
          <label className="text-sm text-ink-500 shrink-0">章章纲</label>
          <input
            value={batchInstructions}
            onChange={e => setBatchInstructions(e.target.value)}
            placeholder="自定义指令（可选）：如本段重点铺设世界观..."
            className="flex-1 input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-inkblue-500/40"
          />
          <button
            onClick={handleGenerateNext}
            disabled={batchGenerating}
            className="flex items-center gap-1.5 px-4 py-2 bg-inkblue-500 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-sm transition shrink-0 shadow-lg shadow-purple-600/15"
          >
            {batchGenerating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />}
            生成
          </button>
        </div>

        {/* 按卷生成缺失章纲（保留原有功能） */}
        {volumes.length > 0 && selectedVolume && selectedMissing > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
            <span className="text-xs text-ink-400">或按卷补全：</span>
            <select
              value={selectedVolumeId || ''}
              onChange={e => setSelectedVolumeId(Number(e.target.value) || null)}
              className="flex-1 input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-inkblue-500/40"
            >
              {volumes.map(v => (
                <option key={v.id} value={v.id}>
                  V{v.volume_number} {v.volume_name || '未命名卷'} ({getMissingCount(v)}章缺失)
                </option>
              ))}
            </select>
            <button
              onClick={() => handleBatchGenerate(selectedVolumeId)}
              disabled={batchGenerating}
              className="flex items-center gap-1 px-3 py-1.5 bg-inkblue-500/80 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs transition shadow-lg shadow-purple-600/10"
            >
              {batchGenerating
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Wand2 className="w-3 h-3" />}
              补全缺失 ({selectedMissing})
            </button>
          </div>
        )}
      </div>

      {outlines.length === 0 && (
        <div className="text-center py-8 text-ink-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无章纲</p>
          <p className="text-sm mt-1">导入前文后自动生成，或点击上方「生成」按钮</p>
        </div>
      )}

      {filteredGrouped.map((group, gi) => {
        const volMissing = group.volume ? getMissingCount(group.volume) : 0;
        return (
          <div key={gi} className="bg-surface-1 border border-border-subtle rounded-xl overflow-hidden">
            {/* 卷标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-1 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                {group.volume ? (
                  <>
                    <span className="text-xs font-mono text-inkblue-600 bg-inkblue-500/[0.12] px-2 py-0.5 rounded border border-inkblue-500/25">
                      V{group.volume.volume_number}
                    </span>
                    <span className="text-sm font-medium">{group.volume.volume_name || '未命名卷'}</span>
                    <span className="text-xs text-ink-400">({group.chapters.length} 章{volMissing > 0 ? `，${volMissing}章缺失` : ''})</span>
                  </>
                ) : (
                  <span className="text-sm text-ink-500">未分卷章节 ({group.chapters.length} 章)</span>
                )}
              </div>
            </div>

            {/* 章纲列表 */}
            {group.chapters.map(o => (
              <div key={o.chapter_number} ref={focusChapter === o.chapter_number ? focusRef : undefined}>
                <div
                  className={`grid grid-cols-[80px_100px_1fr_1fr_60px_70px] gap-2 px-4 py-3 cursor-pointer hover:bg-surface-1 transition border-b border-border-subtle/50 ${
                    expanded === o.chapter_number ? 'bg-surface-1' : ''
                  } ${focusChapter === o.chapter_number ? 'ring-1 ring-jade-500/30 bg-green-500/[0.03]' : ''}`}
                  onClick={() => toggleExpand(o.chapter_number)}
                >
                  <div className="flex items-center gap-1">
                    {expanded === o.chapter_number
                      ? <ChevronDown className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
                    <span className="text-sm font-mono text-ink-500">{o.chapter_number}</span>
                  </div>
                  <div className="text-sm truncate">{o.title || '—'}</div>
                  <div className="text-sm text-ink-500 truncate">{o.core_objective || '—'}</div>
                  <div className="text-sm text-ink-400 truncate">{o.hooks || '—'}</div>
                  <div><SourceBadge source={o.source} /></div>
                  <div className="flex justify-end gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handleGenerate(o.chapter_number); }}
                      disabled={generatingCh !== null}
                      className="p-1.5 text-gold-600 hover:bg-surface-3 rounded transition" title="AI 生成章纲">
                      {generatingCh === o.chapter_number ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(o.chapter_number); }}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition" title="删除章纲">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 展开编辑区 — 7 字段 */}
                {expanded === o.chapter_number && editForm && (
                  <div className="border-b border-border-subtle px-5 py-4 space-y-4 bg-black/[0.015] animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-ink-400 block mb-1">标题</label>
                        <input value={editForm.title}
                          onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="章节标题"
                          className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                      </div>
                      <div>
                        <label className="text-xs text-ink-400 block mb-1">章末钩子</label>
                        <input value={editForm.hooks}
                          onChange={e => setEditForm({ ...editForm, hooks: e.target.value })}
                          placeholder="本章结尾的悬念或转折"
                          className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-ink-400 block mb-1">情节描述</label>
                      <textarea value={editForm.core_objective}
                        onChange={e => setEditForm({ ...editForm, core_objective: e.target.value })}
                        placeholder="描述本章主要情节走向..."
                        rows={3}
                        className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-ink-400 block mb-1">信息传递</label>
                        <textarea value={editForm.info_delivery}
                          onChange={e => setEditForm({ ...editForm, info_delivery: e.target.value })}
                          placeholder="本章要传递给读者的关键信息..."
                          rows={2}
                          className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
                      </div>
                      <div>
                        <label className="text-xs text-ink-400 block mb-1">角色变化</label>
                        <textarea value={editForm.character_development}
                          onChange={e => setEditForm({ ...editForm, character_development: e.target.value })}
                          placeholder="本章角色变化（心态/关系/实力）..."
                          rows={2}
                          className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-ink-400 block mb-1">后续铺垫</label>
                      <input value={editForm.setup_for_future}
                        onChange={e => setEditForm({ ...editForm, setup_for_future: e.target.value })}
                        placeholder="本章为后续章节做的铺垫或埋的伏笔（可为空）"
                        className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                    </div>
                    <div className="flex justify-end gap-2">
                      {o.source !== 'manual' && (
                        <span className="text-xs text-ink-400 mr-auto flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          来源：{SOURCE_LABELS[o.source]?.text || '未知'}，编辑后变为「手动」
                        </span>
                      )}
                      <button onClick={() => handleSave(o.chapter_number)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15">
                        <Save className="w-4 h-4" />保存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
