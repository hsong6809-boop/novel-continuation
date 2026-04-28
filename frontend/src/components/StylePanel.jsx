import { useState, useEffect } from 'react';
import { Palette, Save, Loader2 } from 'lucide-react';
import { getStyle, updateStyleParams } from '../api/client';

export default function StylePanel({ project, onRefresh }) {
  const [style, setStyle] = useState(null);
  const [density, setDensity] = useState(3);
  const [dialogueRatio, setDialogueRatio] = useState(3);
  const [pacing, setPacing] = useState('medium');
  const [humanNotes, setHumanNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
      alert('风格参数已保存');
      onRefresh();
    } catch (e) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  const pacingLabels = { slow: '慢节奏 · 细腻铺陈', medium: '正常节奏 · 张弛有度', fast: '快节奏 · 紧凑推进' };
  const densityLabels = { 1: '极简 · 白描速写', 2: '简洁 · 点到为止', 3: '适中 · 详略得当', 4: '细腻 · 画面感强', 5: '电影化 · 极致细节' };
  const dialogueLabels = { 1: '极少对话 · 纯叙述', 2: '偏少 · 以叙事为主', 3: '均衡 · 叙述与对话并重', 4: '偏多 · 对话驱动', 5: '大量对话 · 剧本感' };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Palette className="w-6 h-6 text-purple-400" />
        <h1 className="text-xl font-bold">风格控制</h1>
      </div>

      {/* AI 风格分析 */}
      {style?.base_analysis && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-2">📊 AI 风格分析</h2>
          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{style.base_analysis}</div>
        </div>
      )}

      {/* 参数调节 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-6">
        <h2 className="text-sm font-medium text-gray-400">🎛️ 动态控制参数</h2>

        {/* 描写密度 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm">描写密度</label>
            <span className="text-sm text-purple-400 font-mono">{density}/5</span>
          </div>
          <input
            type="range" min="1" max="5" value={density}
            onChange={e => setDensity(parseInt(e.target.value))}
            className="w-full accent-purple-500"
          />
          <div className="text-xs text-gray-500 mt-1">{densityLabels[density]}</div>
        </div>

        {/* 对话占比 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm">对话占比</label>
            <span className="text-sm text-purple-400 font-mono">{dialogueRatio}/5</span>
          </div>
          <input
            type="range" min="1" max="5" value={dialogueRatio}
            onChange={e => setDialogueRatio(parseInt(e.target.value))}
            className="w-full accent-purple-500"
          />
          <div className="text-xs text-gray-500 mt-1">{dialogueLabels[dialogueRatio]}</div>
        </div>

        {/* 叙事节奏 */}
        <div>
          <label className="text-sm block mb-2">叙事节奏</label>
          <div className="grid grid-cols-3 gap-3">
            {['slow', 'medium', 'fast'].map(p => (
              <button
                key={p}
                onClick={() => setPacing(p)}
                className={`px-4 py-3 rounded-lg text-sm transition border ${
                  pacing === p
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {pacingLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 人工备注 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-2">📝 风格备注</h2>
        <textarea
          value={humanNotes}
          onChange={e => setHumanNotes(e.target.value)}
          placeholder="补充你对文风的要求，如：多用短句、避免成语堆砌、对话要口语化..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
        />
      </div>

      {/* 保存 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg font-medium transition"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        保存风格参数
      </button>
    </div>
  );
}
