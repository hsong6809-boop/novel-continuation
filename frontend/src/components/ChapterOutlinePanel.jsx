import { useState, useEffect, useRef } from 'react';
import {
  FileText, Save, Wand2, ChevronDown, ChevronRight, Loader2, Shield,
} from 'lucide-react';
import {
  listOutlines, getOutline, updateOutline, generateOutline,
  listVolumeOutlines, batchGenerateOutlines,
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

export default function ChapterOutlinePanel({ project, focusChapter }) {
  const [volumes, setVolumes] = useState([]);
  const [outlines, setOutlines] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(null);
  const [error, setError] = useState(null);
  const [selectedVolumeId, setSelectedVolumeId] = useState(null);
  const [batchInstructions, setBatchInstructions] = useState('');
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
      const [vols, outs] = await Promise.all([
        listVolumeOutlines(project.id),
        listOutlines(project.id),
      ]);
      setVolumes(vols);
      setOutlines(outs);
      if (vols.length > 0 && !selectedVolumeId) {
        setSelectedVolumeId(vols[0].id);
      }
    } catch {
      console.error('加载数据失败');
    }
  }

  // 计算每个卷的缺失章纲数
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
      setEditForm({
        title: d.outline?.title || '',
        core_objective: d.outline?.core_objective || '',
        hooks: d.outline?.hooks || '',
      });
    } catch { setEditForm(null); }
  }

  async function handleGenerate(ch) {
    // 如果已有章纲，确认覆盖
    const existing = outlines.find(o => o.chapter_number === ch);
    if (existing) {
      const src = SOURCE_LABELS[existing.source]?.text || '未知';
      if (!await toast.confirm(`该章纲来源为「${src}」，重新生成将覆盖，确定？`)) return;
    }
    setGenerating(true);
    try {
      await generateOutline(project.id, ch, {});
      await loadData();
      await toggleExpand(ch);
    } catch (e) {
      toast.error('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  async function handleBatchGenerate(volumeId) {
    const missing = getMissingCount(volumes.find(v => v.id === volumeId));
    if (missing === 0) {
      toast.warning('本卷章纲已完整，无需生成');
      return;
    }
    setBatchGenerating(volumeId);
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
      setBatchGenerating(null);
    }
  }

  async function handleSave(ch) {
    try {
      await updateOutline(project.id, ch, {
        title: editForm.title,
        core_objective: editForm.core_objective,
        hooks: editForm.hooks,
      });
      await loadData();
      toast.success('保存成功');
    } catch { toast.error('保存失败'); }
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

      {/* 分卷选择器 + 批量生成 */}
      {volumes.length > 0 && (
        <div className="bg-surface-1 border border-border-subtle rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-500 shrink-0">选择分卷：</label>
            <select
              value={selectedVolumeId || ''}
              onChange={e => setSelectedVolumeId(Number(e.target.value) || null)}
              className="flex-1 input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-inkblue-500/40"
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
                className="flex-1 input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-inkblue-500/40"
              />
              <button
                onClick={() => handleBatchGenerate(selectedVolumeId)}
                disabled={batchGenerating === selectedVolumeId || selectedMissing === 0}
                title={selectedMissing === 0 ? '本卷章纲已完整' : ''}
                className="flex items-center gap-1.5 px-4 py-2 bg-inkblue-500 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-sm transition shrink-0 shadow-lg shadow-purple-600/15"
              >
                {batchGenerating === selectedVolumeId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Wand2 className="w-3.5 h-3.5" />}
                生成缺失章纲{selectedMissing > 0 ? ` (${selectedMissing}章)` : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {outlines.length === 0 && (
        <div className="text-center py-8 text-ink-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>暂无章纲</p>
          <p className="text-sm mt-1">导入前文后自动生成，或在分卷大纲中批量生成</p>
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
              {group.volume && volMissing > 0 && (
                <button onClick={() => handleBatchGenerate(group.volume.id)} disabled={batchGenerating === group.volume.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-inkblue-500/80 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs transition shadow-lg shadow-purple-600/10">
                  {batchGenerating === group.volume.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Wand2 className="w-3 h-3" />}
                  生成缺失 ({volMissing})
                </button>
              )}
            </div>

            {/* 章纲列表 */}
            {group.chapters.map(o => (
              <div key={o.chapter_number} ref={focusChapter === o.chapter_number ? focusRef : undefined}>
                <div
                  className={`grid grid-cols-[80px_100px_1fr_1fr_60px_50px] gap-2 px-4 py-3 cursor-pointer hover:bg-surface-1 transition border-b border-border-subtle/50 ${
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
                  <div className="flex justify-end">
                    <button onClick={(e) => { e.stopPropagation(); handleGenerate(o.chapter_number); }}
                      disabled={generating}
                      className="p-1.5 text-gold-600 hover:bg-surface-3 rounded transition" title="AI 生成章纲">
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 展开编辑区 */}
                {expanded === o.chapter_number && editForm && (
                  <div className="border-b border-border-subtle px-5 py-4 space-y-4 bg-black/[0.015] animate-fade-in">
                    <div>
                      <label className="text-xs text-ink-400 block mb-1">标题</label>
                      <input value={editForm.title}
                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="章节标题"
                        className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40" />
                    </div>
                    <div>
                      <label className="text-xs text-ink-400 block mb-1">情节描述</label>
                      <textarea value={editForm.core_objective}
                        onChange={e => setEditForm({ ...editForm, core_objective: e.target.value })}
                        placeholder="描述本章主要情节走向..."
                        rows={3}
                        className="w-full input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-y" />
                    </div>
                    <div>
                      <label className="text-xs text-ink-400 block mb-1">章末钩子</label>
                      <input value={editForm.hooks}
                        onChange={e => setEditForm({ ...editForm, hooks: e.target.value })}
                        placeholder="本章结尾的悬念或转折"
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
