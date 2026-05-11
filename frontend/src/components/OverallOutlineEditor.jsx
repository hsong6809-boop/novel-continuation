import { useState, useEffect } from 'react';
import { Save, Wand2, Loader2, BookOpen } from 'lucide-react';
import { getOverallOutline, generateOverallOutline, updateOverallOutline } from '../api/client';

// 将 JSON 结构化数据格式化为可读纯文本
function formatOutlineToText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  // 处理 { content: "..." } 格式（保存后的纯文本）
  if (data.content && typeof data.content === 'string') return data.content;
  const fieldLabels = {
    start_point: '起点',
    core_mainline: '核心主线',
    end_point: '终点方向',
    world_type: '世界观类型',
    themes: '核心主题',
    main_conflict: '主要矛盾',
  };
  const keyInfoLabels = {
    world_setting: '世界观设定',
    power_system: '力量体系',
    faction_landscape: '势力格局',
    core_selling_point: '核心卖点',
    main_characters: '角色关系网',
    first_crisis: '第一个危机',
    early_goals: '前期目标',
    key_items: '关键道具/金手指',
  };
  const lines = [];
  for (const [key, label] of Object.entries(fieldLabels)) {
    if (data[key]) {
      lines.push(`【${label}】\n${data[key]}`);
    }
  }
  // 处理结构化的 key_info
  const ki = data.key_info;
  if (ki && typeof ki === 'object') {
    const kiLines = [];
    for (const [key, label] of Object.entries(keyInfoLabels)) {
      if (ki[key]) {
        kiLines.push(`  ${label}：${ki[key]}`);
      }
    }
    if (kiLines.length > 0) {
      lines.push(`【关键信息】\n${kiLines.join('\n')}`);
    }
  } else if (ki && typeof ki === 'string') {
    lines.push(`【关键信息】\n${ki}`);
  }
  // 兼容旧格式
  if (data.premise && !data.start_point) {
    lines.push(`【故事前提】\n${data.premise}`);
  }
  if (data.character_arcs && !data.core_mainline) {
    lines.push(`【角色弧线】\n${data.character_arcs}`);
  }
  return lines.join('\n\n');
}

export default function OverallOutlineEditor({ project }) {
  const [outlineData, setOutlineData] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadOutline(); }, [project.id]);

  async function loadOutline() {
    setLoading(true);
    setError(null);
    try {
      const data = await getOverallOutline(project.id);
      if (data && Object.keys(data).length > 0) {
        setOutlineData(data);
        setText(formatOutlineToText(data));
      } else {
        setOutlineData(null);
        setText('');
      }
    } catch {
      setOutlineData(null);
      setText('');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await generateOverallOutline(project.id);
      if (data.error) {
        setError(data.error);
      } else {
        setOutlineData(data);
        setText(formatOutlineToText(data));
      }
    } catch (e) {
      setError('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateOverallOutline(project.id, { content: text });
      await loadOutline();
    } catch (e) {
      setError('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
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
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-500">
          {outlineData ? '已生成总纲，可直接编辑或重新生成' : '尚未生成总纲'}
        </span>
        <div className="flex gap-2">
          {text.trim() && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm transition shadow-lg shadow-green-600/15">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存
            </button>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-inkblue-500 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm transition shadow-lg shadow-purple-600/15">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {outlineData ? '重新生成' : 'AI 生成总纲'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="在此输入或编辑总纲内容，也可点击「AI 生成总纲」自动生成..."
        className="w-full h-96 input-surface border border-border-default rounded-lg px-4 py-3 text-sm leading-relaxed focus:ring-1 focus:ring-vermillion-500/40 resize-y"
      />

      {!outlineData && !generating && !text.trim() && (
        <div className="text-center py-4 text-ink-400">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无总纲，点击「AI 生成总纲」自动生成</p>
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-center py-6 text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">AI 正在生成总纲，请稍候...</span>
        </div>
      )}
    </div>
  );
}
