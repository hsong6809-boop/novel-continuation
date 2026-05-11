import { useState, useEffect, memo } from 'react';
import { FileText, Users, Zap, RotateCcw, Star, Save, Loader2 } from 'lucide-react';
import { updateOutline } from '../../api/client';
import { useToast } from '../ui/Toast';

function SidebarOutlineContext({
  projectId, nextChapter, outlineData, characters, foreshadowing,
  styleParams, contextRange, estimatedTokens, contextSummary,
  customInstructions, onCustomInstructionsChange,
  onSwitchTab, onSetFocusChapter, onRefreshPreview,
}) {
  // 章纲编辑状态
  const [editForm, setEditForm] = useState({ title: '', core_objective: '', hooks: '', info_delivery: '', character_development: '', setup_for_future: '' });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const toast = useToast();

  // outlineData 变化时同步到编辑表单
  useEffect(() => {
    if (outlineData) {
      setEditForm({
        title: outlineData.title || '',
        core_objective: outlineData.core_objective || '',
        hooks: outlineData.hooks || '',
        info_delivery: outlineData.info_delivery || '',
        character_development: outlineData.character_development || '',
        setup_for_future: outlineData.setup_for_future || '',
      });
      setHasChanges(false);
    } else {
      setEditForm({ title: '', core_objective: '', hooks: '', info_delivery: '', character_development: '', setup_for_future: '' });
      setHasChanges(false);
    }
  }, [outlineData]);

  function handleChange(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateOutline(projectId, nextChapter, editForm);
      setHasChanges(false);
      onRefreshPreview?.();
    } catch (e) {
      toast.error('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">

        {/* === 章纲（可编辑） === */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-700">第{nextChapter}章 纲要</h3>
          {onSwitchTab && (
            <button
              onClick={() => { onSetFocusChapter?.(nextChapter); onSwitchTab('outline'); }}
              className="text-xs text-jade-600 hover:text-jade-500 transition"
            >
              详情 →
            </button>
          )}
        </div>

        {outlineData ? (
          <div className="space-y-2">
            <input
              value={editForm.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="章节标题"
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-sm font-medium text-ink-900 focus:ring-1 focus:ring-vermillion-500/40 transition"
            />
            <textarea
              value={editForm.core_objective}
              onChange={e => handleChange('core_objective', e.target.value)}
              placeholder="核心目标 / 情节描述..."
              rows={6}
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs text-ink-600 leading-relaxed focus:ring-1 focus:ring-vermillion-500/40 resize-y transition"
            />
            <textarea
              value={editForm.hooks}
              onChange={e => handleChange('hooks', e.target.value)}
              placeholder="🪝 章末钩子 / 悬念"
              rows={2}
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 resize-y transition"
            />
            <textarea
              value={editForm.info_delivery}
              onChange={e => handleChange('info_delivery', e.target.value)}
              placeholder="📢 本章要传递给读者的关键信息..."
              rows={2}
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 resize-y transition"
            />
            <textarea
              value={editForm.character_development}
              onChange={e => handleChange('character_development', e.target.value)}
              placeholder="👤 本章角色变化（心态/关系/实力）..."
              rows={2}
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 resize-y transition"
            />
            <textarea
              value={editForm.setup_for_future}
              onChange={e => handleChange('setup_for_future', e.target.value)}
              placeholder="🔮 本章为后续做的铺垫..."
              rows={2}
              className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs text-ink-400 focus:ring-1 focus:ring-vermillion-500/40 resize-y transition"
            />
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-jade-600 hover:bg-jade-500 disabled:opacity-50 text-white rounded-lg transition shadow-sm"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                保存章纲
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-ink-400 mb-2">暂无章纲</p>
            {onSwitchTab && (
              <button
                onClick={() => { onSetFocusChapter?.(nextChapter); onSwitchTab('outline'); }}
                className="text-xs text-jade-600 hover:text-jade-500 transition"
              >
                前往大纲 →
              </button>
            )}
          </div>
        )}

        <div className="ink-divider" />

        {/* === 自定义指令 === */}
        <div>
          <label className="text-xs text-ink-500 block mb-1 font-medium">自定义指令</label>
          <textarea
            value={customInstructions}
            onChange={e => onCustomInstructionsChange(e.target.value)}
            placeholder="如：本章重点描写主角内心挣扎..."
            rows={2}
            className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
          />
        </div>

        {/* === 风格参考 — 替代旧的滑块参数 === */}
        {styleParams && (
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span>描写 {styleParams.default_description_density || 3}/5</span>
            <span className="text-ink-300">·</span>
            <span>对话 {styleParams.default_dialogue_ratio || 3}/5</span>
            <span className="text-ink-300">·</span>
            <span>{{ slow: '慢速', medium: '正常', fast: '快节奏' }[styleParams.default_pacing || 'medium']}</span>
            {onSwitchTab && (
              <button onClick={() => onSwitchTab('style')} className="ml-auto text-vermillion-600 hover:text-amber-600 transition">调整</button>
            )}
          </div>
        )}

        {/* 角色 — 只显示当前卷主要角色 */}
        {characters.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5 text-inkblue-600" />
              <span className="text-xs font-medium text-ink-700">主要角色</span>
              <span className="text-xs text-ink-400">({characters.filter(c => c.spans_all_volumes || !/龙套|路人/.test(c.role || '')).length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {characters
                .filter(c => c.spans_all_volumes || !/龙套|路人/.test(c.role || ''))
                .sort((a, b) => {
                  const order = { '男主': 0, '女主': 1, '反派': 2 };
                  const getO = c => { if (c.spans_all_volumes) return -1; for (const [k, v] of Object.entries(order)) { if ((c.role || '').includes(k)) return v; } return 3; };
                  return getO(a) - getO(b);
                })
                .map((c, i) => (
                  <span key={i} className="text-xs bg-surface-1 border border-border-subtle rounded px-1.5 py-0.5">
                    {c.name}{c.role && <span className="text-ink-400">/{c.role}</span>}
                    {c.spans_all_volumes ? <Star className="w-2.5 h-2.5 text-amber-500 inline ml-0.5" /> : null}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* === 伏笔 === */}
        {foreshadowing.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Zap className="w-3.5 h-3.5 text-vermillion-600" />
              <span className="text-xs font-medium text-ink-700">伏笔</span>
              <span className="text-xs text-ink-400">({foreshadowing.length})</span>
            </div>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {foreshadowing.map((f, i) => (
                <div key={i} className="text-xs text-ink-600 truncate">
                  {f.description}
                  {f.importance !== 'normal' && <span className="text-ink-400 ml-1">[{f.importance}]</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ink-divider" />

        {/* === 上下文构成摘要 === */}
        <div>
          <div className="text-xs font-medium text-ink-700 mb-2">发送给AI的上下文</div>
          {contextSummary && contextSummary.length > 0 ? (
            <div className="space-y-1">
              {contextSummary.filter(item => item.name !== '总计').map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-ink-600">{item.name}</span>
                  <span className="text-ink-400">{item.detail}</span>
                </div>
              ))}
              {/* 总计行高亮 */}
              {contextSummary.filter(item => item.name === '总计').map((item, i) => (
                <div key={`total-${i}`} className="flex items-center justify-between text-xs pt-1 mt-1 border-t border-border-subtle">
                  <span className="font-medium text-ink-700">合计</span>
                  <span className="font-medium text-vermillion-600">{item.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400">刷新后显示</p>
          )}
        </div>

        {/* 刷新按钮 */}
        <button
          onClick={onRefreshPreview}
          className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs bg-surface-3 hover:bg-black/[0.06] border border-border-subtle rounded-lg transition text-ink-500"
        >
          <RotateCcw className="w-3 h-3" /> 刷新
        </button>
      </div>
    </div>
  );
}

export default memo(SidebarOutlineContext);
