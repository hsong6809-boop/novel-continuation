import { useState, useEffect } from 'react';
import { Palette, Save, Loader2, Sparkles, BarChart3, Sliders, FileEdit, Anchor, BookOpen } from 'lucide-react';
import { getStyle, updateStyleParams, analyzeStyle, updateProject } from '../api/client';
import { useToast } from './ui/Toast';

export default function StylePanel({ project, onRefresh }) {
  const [style, setStyle] = useState(null);
  const [density, setDensity] = useState(3);
  const [dialogueRatio, setDialogueRatio] = useState(3);
  const [pacing, setPacing] = useState('medium');
  const [humanNotes, setHumanNotes] = useState('');
  const [styleRefChapters, setStyleRefChapters] = useState('');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    try {
      const data = await getStyle(project.id);
      setStyle(data);
      setDensity(data.default_description_density || 3);
      setDialogueRatio(data.default_dialogue_ratio || 3);
      setPacing(data.default_pacing || 'medium');
      setHumanNotes(data.human_notes || '');
    } catch {
      setStyle(null);
    }
    setStyleRefChapters(project.style_ref_chapters || '1,2,3');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStyleParams(project.id, {
        default_description_density: density,
        default_dialogue_ratio: dialogueRatio,
        default_pacing: pacing,
        human_notes: humanNotes,
      });
      // 保存风格参考章节到 project
      const ref = styleRefChapters.trim() || '1,2,3';
      await updateProject(project.id, { style_ref_chapters: ref });
      toast.success('风格设置已保存');
      onRefresh();
    } catch (e) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  }

  const pacingLabels = { slow: '慢节奏 · 细腻铺陈', medium: '正常节奏 · 张弛有度', fast: '快节奏 · 紧凑推进' };
  const densityLabels = { 1: '极简 · 白描速写', 2: '简洁 · 点到为止', 3: '适中 · 详略得当', 4: '细腻 · 画面感强', 5: '电影化 · 极致细节' };
  const dialogueLabels = { 1: '极少对话 · 纯叙述', 2: '偏少 · 以叙事为主', 3: '均衡 · 叙述与对话并重', 4: '偏多 · 对话驱动', 5: '大量对话 · 剧本感' };

  // 解析当前参考章节
  const refNums = (styleRefChapters || '1,2,3').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Palette className="w-6 h-6 text-inkblue-600" />
        <h1 className="text-xl font-bold">风格控制</h1>
      </div>

      {/* 风格参考章节 — 最重要的配置 */}
      <div className="bg-surface-1 border border-amber-500/20 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-ink-700 mb-1 flex items-center gap-1.5">
          <Anchor className="w-4 h-4 text-amber-500" />
          风格参考章节
        </h2>
        <p className="text-xs text-ink-400 mb-3">
          每次续写时，AI 会参考这些章节的文风来对齐笔调。默认使用前三章，你可以改为风格最稳定的章节。
        </p>
        <div className="flex items-center gap-3">
          <input
            value={styleRefChapters}
            onChange={e => setStyleRefChapters(e.target.value)}
            placeholder="1,2,3"
            className="flex-1 input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/40 font-mono"
          />
          <span className="text-xs text-ink-400 shrink-0">逗号分隔的章节号</span>
        </div>
        {refNums.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {refNums.map(n => (
              <span key={n} className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />第{n}章
              </span>
            ))}
            <span className="text-xs text-ink-400">→ AI 将对齐这些章节的句式、用词、节奏</span>
          </div>
        )}
      </div>

      {/* AI 风格分析 */}
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-ink-500 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" />AI 风格分析</h2>
          <button
            onClick={async () => {
              setAnalyzing(true);
              try {
                const data = await analyzeStyle(project.id);
                setStyle(data);
                toast.success('风格分析完成');
              } catch (e) {
                toast.error('分析失败：' + (e.response?.data?.detail || e.message));
              } finally {
                setAnalyzing(false);
              }
            }}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-inkblue-500/20 hover:bg-inkblue-500/30 disabled:bg-surface-3 border border-purple-500/30 rounded-lg transition shadow-lg shadow-inkblue-500/10"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {analyzing ? '分析中...' : 'AI 自动分析'}
          </button>
        </div>
        {style?.base_analysis ? (
          <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">{style.base_analysis}</div>
        ) : (
          <div className="text-sm text-ink-400 italic">点击"AI 自动分析"按钮，自动分析已有章节的写作风格</div>
        )}
      </div>

      {/* 参数调节 — 辅助微调 */}
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-5 mb-6 space-y-6">
        <h2 className="text-sm font-medium text-ink-500 flex items-center gap-1.5">
          <Sliders className="w-4 h-4" />辅助微调参数
          <span className="text-xs text-ink-400 font-normal ml-1">（风格参考章节已覆盖主要风格，以下为补充调整）</span>
        </h2>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm">描写密度</label>
            <span className="text-sm text-inkblue-600 font-mono">{density}/5</span>
          </div>
          <input type="range" min="1" max="5" value={density} onChange={e => setDensity(parseInt(e.target.value))} className="w-full accent-purple-500" />
          <div className="text-xs text-ink-400 mt-1">{densityLabels[density]}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm">对话占比</label>
            <span className="text-sm text-inkblue-600 font-mono">{dialogueRatio}/5</span>
          </div>
          <input type="range" min="1" max="5" value={dialogueRatio} onChange={e => setDialogueRatio(parseInt(e.target.value))} className="w-full accent-purple-500" />
          <div className="text-xs text-ink-400 mt-1">{dialogueLabels[dialogueRatio]}</div>
        </div>

        <div>
          <label className="text-sm block mb-2">叙事节奏</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {['slow', 'medium', 'fast'].map(p => (
              <button key={p} onClick={() => setPacing(p)}
                className={`px-4 py-3 rounded-lg text-sm transition border ${
                  pacing === p
                    ? 'bg-inkblue-500/20 border-purple-500 text-purple-500 shadow-lg shadow-inkblue-500/10'
                    : 'input-surface border-border-default text-ink-500 hover:border-border-hover'
                }`}>
                {pacingLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 风格备注 */}
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-ink-500 mb-2 flex items-center gap-1.5"><FileEdit className="w-4 h-4" />风格备注</h2>
        <textarea
          value={humanNotes} onChange={e => setHumanNotes(e.target.value)}
          placeholder="补充你对文风的要求，如：多用短句、避免成语堆砌、对话要口语化..."
          rows={3}
          className="w-full input-surface border border-border-default rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-inkblue-500/40 resize-none transition"
        />
      </div>

      {/* 保存 */}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 mt-2 bg-inkblue-500 hover:bg-purple-500 disabled:bg-surface-3 rounded-lg font-medium transition shadow-lg shadow-inkblue-500/15 hover:shadow-purple-500/30">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        保存风格设置
      </button>
    </div>
  );
}
