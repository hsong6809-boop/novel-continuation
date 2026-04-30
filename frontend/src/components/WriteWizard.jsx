import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, FileText, Wand2, Loader2, Save, RotateCcw, Pencil, Check, X, ChevronDown, ChevronUp, MessageCircle, Send, Bot, User, BookOpen, Globe, Target, AlertTriangle, History } from 'lucide-react';
import { writePreview, generateChapter, generateChapterStream, getOutline, getStyle, getChapter, updateChapter, listChat, sendChat, listChapterVersions, restoreChapterVersion } from '../api/client';

export default function WriteWizard({ project, onRefresh, onSwitchTab, onSetFocusChapter }) {
  const [nextChapter, setNextChapter] = useState((project.current_chapter || 0) + 1);
  const [preview, setPreview] = useState(null);
  const [outline, setOutline] = useState(null);
  const [style, setStyle] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMeta, setResultMeta] = useState(null);
  const [customInstructions, setCustomInstructions] = useState('');

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 元数据确认面板
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [confirmedForeshadows, setConfirmedForeshadows] = useState({});
  const [confirmedTimeline, setConfirmedTimeline] = useState({});

  // 折叠对话
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef(null);
  const outputRef = useRef(null);

  // 版本历史
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // 上下文预览折叠
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => {
    loadPreview();
  }, [nextChapter]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadPreview() {
    try {
      const [prev, outl, stl] = await Promise.all([
        writePreview(project.id, nextChapter).catch(() => null),
        getOutline(project.id, nextChapter).catch(() => null),
        getStyle(project.id).catch(() => null),
      ]);
      setPreview(prev);
      setOutline(outl);
      setStyle(stl);
    } catch (e) {
      console.error('加载预览失败:', e);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    setEditContent('');
    setResultMeta(null);
    setEditing(false);
    setConfirmedForeshadows({});
    setConfirmedTimeline({});
    try {
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      const stream = generateChapterStream(project.id, nextChapter, {
        custom_instructions: customInstructions || null,
      });
      let fullText = '';
      for await (const evt of stream) {
        if (evt.type === 'chunk') {
          fullText += evt.content;
          setResult(fullText);
          setEditContent(fullText);
          outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else if (evt.type === 'done' && evt.meta) {
          const res = evt.meta;
          setResultMeta({
            word_count: res.word_count,
            new_foreshadowings: res.new_foreshadowings || [],
            resolved_foreshadowings: res.resolved_foreshadowings || [],
            timeline_updates: res.timeline_updates || [],
          });
          const fs = {};
          (res.new_foreshadowings || []).forEach((f, i) => { fs[i] = true; });
          setConfirmedForeshadows(fs);
          const tl = {};
          (res.timeline_updates || []).forEach((t, i) => { tl[i] = true; });
          setConfirmedTimeline(tl);
          onRefresh();
          setTimeout(() => loadPreview(), 500);
        } else if (evt.type === 'error') {
          throw new Error(evt.message);
        }
      }
    } catch (e) {
      alert('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await updateChapter(project.id, nextChapter, { content: editContent });
      setResult(editContent);
      setEditing(false);
      onRefresh();
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const data = await listChapterVersions(project.id, nextChapter);
      setVersions(data);
    } catch (e) {
      console.error('加载版本历史失败:', e);
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  function toggleVersions() {
    const next = !versionsOpen;
    setVersionsOpen(next);
    if (next) loadVersions();
  }

  async function handleRestore(versionId) {
    if (!confirm('确定要回退到此版本吗？当前内容会先被保存为新版本。')) return;
    setRestoring(true);
    try {
      const res = await restoreChapterVersion(project.id, nextChapter, versionId);
      setResult(res.content);
      setEditContent(res.content);
      setEditing(false);
      alert(`已回退到版本，共 ${res.word_count} 字`);
      loadVersions();
      onRefresh();
    } catch (e) {
      alert('回退失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setRestoring(false);
    }
  }

  async function loadChat() {
    try {
      const data = await listChat(project.id);
      setMessages(data);
    } catch (e) {
      console.error('加载对话失败:', e);
    }
  }

  function toggleChat() {
    const next = !chatOpen;
    setChatOpen(next);
    if (next && messages.length === 0) {
      loadChat();
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput('');
    setChatSending(true);
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await sendChat(project.id, text);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, created_at: new Date().toISOString() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '发送失败: ' + (e.response?.data?.detail || e.message), created_at: new Date().toISOString() }]);
    } finally {
      setChatSending(false);
    }
  }

  function handleChatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 ink-wash-bg">

      {/* 书籍信息 — 紧凑横条 */}
      <div className="border-gradient ink-card rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-amber-400/70" />
            <h2 className="text-lg font-semibold text-gray-200">{project.name || '未命名项目'}</h2>
            {project.genre && (
              <span className="text-xs px-2 py-0.5 bg-amber-500/[0.08] text-amber-400/60 border border-amber-500/10 rounded-full">{project.genre}</span>
            )}
          </div>
          <div className="flex items-center gap-5 text-sm">
            {project.platform && (
              <span className="text-xs text-gray-500">{project.platform}</span>
            )}
            <span className="text-gray-300">{(project.current_words || 0).toLocaleString()} <span className="text-xs text-gray-500">字</span></span>
            <span className="text-gray-700">/</span>
            <span className="text-gray-400">{(project.target_words || 200000).toLocaleString()} <span className="text-xs text-gray-500">目标</span></span>
            <span className="text-gray-700">·</span>
            <span className="text-gray-300">{project.current_chapter || 0} <span className="text-xs text-gray-500">章</span></span>
          </div>
        </div>
        {project.notes && (
          <div className="flex items-start gap-2 mt-3 p-2.5 bg-amber-500/[0.04] border border-amber-500/[0.08] rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/50">{project.notes}</p>
          </div>
        )}
      </div>

      {/* 两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ===== 左栏：配置 ===== */}
        <div className="ink-card ink-wash-bg rounded-xl overflow-hidden">

          {/* 区段一：章节控制条 */}
          <div className="px-5 py-4 flex items-center gap-4 flex-wrap">
            <label className="text-sm text-gray-400">续写章节</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNextChapter(Math.max(1, nextChapter - 1))}
                className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-border-subtle rounded-md text-sm transition"
              >
                -
              </button>
              <span className="text-lg font-mono font-bold w-14 text-center text-gradient-ink">第{nextChapter}章</span>
              <button
                onClick={() => setNextChapter(nextChapter + 1)}
                className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-border-subtle rounded-md text-sm transition"
              >
                +
              </button>
            </div>
            <span className="text-xs text-gray-600">已完成 {project.current_chapter} 章</span>
          </div>

          {/* 分隔线 */}
          <div className="ink-divider mx-5" />

          {/* 区段二：上下文预览（可折叠） */}
          <button
            onClick={() => setContextOpen(!contextOpen)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition text-left"
          >
            <span className="text-sm font-medium text-gray-400">上下文预览</span>
            {contextOpen
              ? <ChevronUp className="w-4 h-4 text-gray-600" />
              : <ChevronDown className="w-4 h-4 text-gray-600" />
            }
          </button>

          {contextOpen && (
            <div className="px-5 pb-4 space-y-3 animate-fade-in">
              {/* 章纲预览 */}
              {outline && (
                <div className="bg-white/[0.02] border border-border-subtle rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400/70" />
                      <span className="text-sm font-medium text-emerald-400/70">章纲预览</span>
                    </div>
                    {onSwitchTab && (
                      <button onClick={() => { onSetFocusChapter?.(nextChapter); onSwitchTab('outline'); }}
                        className="text-xs text-emerald-400/60 hover:text-emerald-300 transition">
                        前往编辑 →
                      </button>
                    )}
                  </div>
                  {outline.title && (
                    <div className="text-sm mb-1"><span className="text-gray-500">标题：</span><span className="text-gray-300">{outline.title}</span></div>
                  )}
                  {outline.core_objective && (
                    <div className="text-sm mb-1"><span className="text-gray-500">核心目标：</span><span className="text-gray-300">{outline.core_objective}</span></div>
                  )}
                  {outline.emotional_arc && (
                    <div className="text-sm mb-1"><span className="text-gray-500">情感走向：</span><span className="text-gray-300">{outline.emotional_arc}</span></div>
                  )}
                  {outline.hooks && (
                    <div className="text-sm"><span className="text-gray-500">章末钩子：</span><span className="text-gray-300">{outline.hooks}</span></div>
                  )}
                  {!outline.title && !outline.core_objective && (
                    <div className="text-sm text-gray-600 italic">暂无章纲，建议先在「大纲」页生成</div>
                  )}
                </div>
              )}

              {/* 风格参数 */}
              {style && (
                <div className="bg-white/[0.02] border border-border-subtle rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-amber-400/70">当前风格</span>
                    {onSwitchTab && (
                      <button onClick={() => onSwitchTab('style')}
                        className="text-xs text-amber-400/60 hover:text-amber-300 transition">
                        前往调整 →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">描写密度</span>
                      <span className="text-gray-300">{style.default_description_density || 3}/5</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">对话占比</span>
                      <span className="text-gray-300">{style.default_dialogue_ratio || 3}/5</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">叙事节奏</span>
                      <span className="text-gray-300">{{ slow: '慢', medium: '正常', fast: '快' }[style.default_pacing || 'medium']}</span>
                    </div>
                  </div>
                </div>
              )}

              {!outline && !style && (
                <div className="text-sm text-gray-600 italic text-center py-2">加载中...</div>
              )}
            </div>
          )}

          {/* 分隔线 */}
          <div className="ink-divider mx-5" />

          {/* 区段三：自定义指令 */}
          <div className="px-5 py-4">
            <label className="text-sm text-gray-400 block mb-2">自定义指令 <span className="text-gray-600">（可选）</span></label>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="如：本章重点描写主角内心挣扎，结尾留一个大悬念..."
              rows={3}
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
            />
          </div>

          {/* 分隔线 + 操作区 */}
          <div className="ink-divider mx-5" />
          <div className="px-5 py-4 flex gap-3 items-center sticky bottom-0 bg-surface-1/80 backdrop-blur-sm">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition ${
                generating
                  ? 'bg-white/[0.04] text-gray-400 cursor-not-allowed border border-border-subtle'
                  : 'bg-amber-600/80 hover:bg-amber-500/80 text-white shadow-lg shadow-amber-500/15 hover:shadow-amber-500/25 animate-pulse-glow'
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在续写...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  开始续写
                </>
              )}
            </button>
            <button
              onClick={loadPreview}
              className="flex items-center gap-2 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-border-subtle rounded-lg text-sm text-gray-400 hover:text-gray-300 transition"
            >
              <RotateCcw className="w-4 h-4" />
              刷新
            </button>
          </div>
        </div>

        {/* ===== 右栏：输出 ===== */}
        <div className="space-y-6 lg:sticky lg:top-4">

          {/* 输出区域 */}
          <div ref={outputRef} className="ink-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-amber-400/70" />
              <span className="text-sm font-medium text-gray-300">续写输出</span>
              {generating && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400/70 ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  生成中...
                </span>
              )}
              {resultMeta && !generating && (
                <span className="text-xs text-gray-500 ml-auto">{resultMeta.word_count} 字</span>
              )}
            </div>

            {result ? (
              <>
                {/* 编辑按钮 */}
                <div className="flex items-center justify-end gap-2 mb-2">
                  {resultMeta && !generating && (
                    <span className="text-sm text-gray-500">{resultMeta.word_count} 字</span>
                  )}
                  {!editing ? (
                    <button
                      onClick={() => { setEditing(true); setEditContent(result); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-border-subtle rounded-lg transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      编辑
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-500/80 rounded-lg transition shadow-lg shadow-emerald-500/10"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        保存
                      </button>
                      <button
                        onClick={() => { setEditing(false); setEditContent(result); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-border-subtle rounded-lg transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        取消
                      </button>
                    </>
                  )}
                </div>

                {/* 正文内容 */}
                {editing ? (
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full bg-white/[0.03] border border-border-default rounded-lg p-4 text-sm leading-relaxed focus:ring-1 focus:ring-amber-500/30 resize-y min-h-[300px] max-h-[600px] overflow-y-auto whitespace-pre-wrap"
                    style={{ fontFamily: 'inherit' }}
                  />
                ) : (
                  <div
                    className="bg-white/[0.02] border border-border-subtle rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed cursor-text hover:border-border-hover transition"
                    onClick={() => { setEditing(true); setEditContent(result); }}
                    title="点击编辑"
                  >
                    {result}
                  </div>
                )}

                {/* 元数据确认面板 */}
                {resultMeta && (resultMeta.new_foreshadowings?.length > 0 || resultMeta.resolved_foreshadowings?.length > 0 || resultMeta.timeline_updates?.length > 0) && (
                  <div className="mt-4 border border-border-subtle rounded-lg overflow-hidden">
                    <button
                      onClick={() => setMetaExpanded(!metaExpanded)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition text-sm"
                    >
                      <span className="font-medium text-gray-300">元数据提取结果</span>
                      {metaExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </button>

                    {metaExpanded && (
                      <div className="p-4 space-y-4 animate-fade-in">
                        {resultMeta.new_foreshadowings?.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-amber-400/80 mb-2">新伏笔（点击确认是否保留）</div>
                            <div className="space-y-1.5">
                              {resultMeta.new_foreshadowings.map((f, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <button
                                    onClick={() => setConfirmedForeshadows({ ...confirmedForeshadows, [i]: !confirmedForeshadows[i] })}
                                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${
                                      confirmedForeshadows[i]
                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                        : 'border-border-default text-transparent hover:border-gray-500'
                                    }`}
                                  >
                                    {confirmedForeshadows[i] && <Check className="w-3 h-3" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-gray-300">{f.keyword || `伏笔${i + 1}`}</span>
                                    {f.description && <span className="text-sm text-gray-500 ml-2">— {f.description}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {resultMeta.resolved_foreshadowings?.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-emerald-400/80 mb-2">伏笔回收</div>
                            <div className="space-y-1">
                              {resultMeta.resolved_foreshadowings.map((f, i) => (
                                <div key={i} className="text-sm text-gray-400 ml-7">· {f.keyword || f.description}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        {resultMeta.timeline_updates?.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-cyan-400/70 mb-2">时间线更新（点击确认）</div>
                            <div className="space-y-1.5">
                              {resultMeta.timeline_updates.map((t, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <button
                                    onClick={() => setConfirmedTimeline({ ...confirmedTimeline, [i]: !confirmedTimeline[i] })}
                                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${
                                      confirmedTimeline[i]
                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                        : 'border-border-default text-transparent hover:border-gray-500'
                                    }`}
                                  >
                                    {confirmedTimeline[i] && <Check className="w-3 h-3" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      {t.in_chapter_time && (
                                        <span className="text-xs font-mono text-cyan-400/70">{t.in_chapter_time}</span>
                                      )}
                                      {t.real_world_time && (
                                        <span className="text-xs text-gray-600">（{t.real_world_time}）</span>
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-300">{t.event_description}</span>
                                    {t.characters_involved && (
                                      <span className="text-xs text-gray-500 ml-2">涉及：{t.characters_involved}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="relative inline-block mb-4">
                  <Sparkles className="w-10 h-10 mx-auto text-gray-700 opacity-30" />
                  <div className="absolute -inset-6 bg-amber-500/[0.02] rounded-full blur-xl" />
                </div>
                <p className="text-sm text-gray-600">
                  {generating ? '墨落纸上，字句流淌中...' : '点击「开始续写」，落笔成章'}
                </p>
              </div>
            )}
          </div>

          {/* 版本历史 */}
          <div className="ink-card rounded-xl overflow-hidden">
            <button
              onClick={toggleVersions}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition text-left"
            >
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-4 bg-amber-500/50 rounded-full" />
                <History className="w-4 h-4 text-amber-400/70" />
                <span className="text-sm font-medium text-gray-300">版本历史</span>
                <span className="text-xs text-gray-600">— 查看和回退历史版本</span>
              </div>
              {versionsOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            {versionsOpen && (
              <div className="border-t border-border-subtle px-5 py-3 animate-fade-in">
                {versionsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">加载中...</span>
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-6 text-gray-600">
                    <p className="text-sm">暂无历史版本（续写后旧版本会自动保存）</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between py-2 px-3 bg-white/[0.02] border border-border-subtle rounded-lg">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-mono text-amber-400/70 shrink-0">v{v.version}</span>
                          <span className="text-sm text-gray-300 shrink-0">{v.word_count} 字</span>
                          {v.title && <span className="text-xs text-gray-500 truncate">{v.title}</span>}
                          <span className="text-xs text-gray-600 shrink-0">{v.created_at}</span>
                        </div>
                        <button
                          onClick={() => handleRestore(v.id)}
                          disabled={restoring}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-500/[0.08] hover:bg-amber-500/[0.15] disabled:bg-white/[0.04] border border-amber-500/20 rounded transition text-amber-400/80"
                        >
                          {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          回退
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 折叠对话区 */}
          <div className="ink-card rounded-xl overflow-hidden">
            <button
              onClick={toggleChat}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition text-left"
            >
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-4 bg-rose-500/40 rounded-full" />
                <MessageCircle className="w-4 h-4 text-rose-400/60" />
                <span className="text-sm font-medium text-gray-300">辅助对话</span>
                <span className="text-xs text-gray-600">— 与 AI 讨论剧情</span>
              </div>
              {chatOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            {chatOpen && (
              <div className="border-t border-border-subtle animate-fade-in">
                {/* 消息区 */}
                <div className="max-h-80 overflow-y-auto px-5 py-3 space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-8 text-gray-600">
                      <p className="text-sm">开始对话吧，可以问 AI 关于剧情、角色的任何问题</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role !== 'user' && (
                        <div className="w-6 h-6 rounded-full bg-rose-500/[0.1] flex items-center justify-center shrink-0">
                          <Bot className="w-3 h-3 text-rose-400/70" />
                        </div>
                      )}
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-amber-700/60 to-amber-800/60 text-white shadow-lg shadow-amber-500/10'
                          : 'bg-white/[0.03] border border-border-subtle text-gray-200'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-6 h-6 rounded-full bg-amber-500/[0.1] flex items-center justify-center shrink-0">
                          <User className="w-3 h-3 text-amber-400/70" />
                        </div>
                      )}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="flex gap-2 justify-start">
                      <div className="w-6 h-6 rounded-full bg-rose-500/[0.1] flex items-center justify-center shrink-0">
                        <Bot className="w-3 h-3 text-rose-400/70" />
                      </div>
                      <div className="bg-white/[0.03] border border-border-subtle rounded-xl px-3 py-2 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-rose-400/60" />
                        <span className="text-xs text-gray-500">思考中...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* 输入区 */}
                <div className="px-5 py-3 border-t border-border-subtle">
                  <div className="flex gap-2">
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="输入消息... (Enter 发送)"
                      rows={1}
                      className="flex-1 bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none transition"
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={!chatInput.trim() || chatSending}
                      className="self-end px-3 py-2 bg-rose-600/60 hover:bg-rose-500/60 disabled:bg-white/[0.04] disabled:cursor-not-allowed rounded-lg transition shadow-lg shadow-rose-500/10"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
        {/* ===== 右栏结束 ===== */}
      </div>
      {/* ===== 两栏布局结束 ===== */}
    </div>
  );
}
