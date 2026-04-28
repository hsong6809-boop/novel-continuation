import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, FileText, Wand2, Loader2, Save, RotateCcw, Pencil, Check, X, ChevronDown, ChevronUp, MessageCircle, Send, Bot, User, BookOpen, Globe, Target, AlertTriangle } from 'lucide-react';
import { writePreview, generateChapter, generateChapterStream, getOutline, getStyle, getChapter, updateChapter, listChat, sendChat } from '../api/client';

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
      // 滚动到输出区域
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
          // 自动滚动到底部
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
          // 刷新下一章预览（nextChapter 会随 project.current_chapter 更新）
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

  // 折叠对话
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
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ 发送失败: ' + (e.response?.data?.detail || e.message), created_at: new Date().toISOString() }]);
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* 书籍信息卡片 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">{project.name || '未命名项目'}</h2>
          {project.genre && (
            <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">{project.genre}</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {project.platform && (
            <div>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Globe className="w-3 h-3" /> 发布平台</span>
              <span className="text-sm text-gray-300">{project.platform}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" /> 当前字数</span>
            <span className="text-sm text-gray-300">{(project.current_words || 0).toLocaleString()} 字</span>
          </div>
          <div>
            <span className="text-xs text-gray-500">目标字数</span>
            <span className="text-sm text-gray-300">{(project.target_words || 200000).toLocaleString()} 字</span>
          </div>
          <div>
            <span className="text-xs text-gray-500">已完成</span>
            <span className="text-sm text-gray-300">{project.current_chapter || 0} 章</span>
          </div>
        </div>
        {project.description && (
          <div className="mb-3">
            <span className="text-xs text-gray-500 block mb-1">简介</span>
            <p className="text-sm text-gray-400 leading-relaxed">{project.description}</p>
          </div>
        )}
        {project.notes && (
          <div className="flex items-start gap-2 p-3 bg-yellow-900/15 border border-yellow-800/25 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-yellow-400/70 block mb-0.5">注意事项</span>
              <p className="text-xs text-yellow-300/70">{project.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* 章节选择 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm text-gray-400">续写章节：</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNextChapter(Math.max(1, nextChapter - 1))}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition"
            >
              -
            </button>
            <span className="text-lg font-mono font-bold w-12 text-center">第{nextChapter}章</span>
            <button
              onClick={() => setNextChapter(nextChapter + 1)}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition"
            >
              +
            </button>
          </div>
          <span className="text-xs text-gray-600">（当前已完成 {project.current_chapter} 章）</span>
        </div>

        {/* 章纲预览 */}
        {outline && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">章纲预览</span>
              </div>
              {onSwitchTab && (
                <button onClick={() => { onSetFocusChapter?.(nextChapter); onSwitchTab('outline'); }}
                  className="text-xs text-green-400 hover:text-green-300 hover:underline">
                  前往大纲页面编辑 →
                </button>
              )}
            </div>
            {outline.title && (
              <div className="text-sm mb-1"><span className="text-gray-500">标题：</span>{outline.title}</div>
            )}
            {outline.core_objective && (
              <div className="text-sm mb-1"><span className="text-gray-500">核心目标：</span>{outline.core_objective}</div>
            )}
            {outline.emotional_arc && (
              <div className="text-sm mb-1"><span className="text-gray-500">情感走向：</span>{outline.emotional_arc}</div>
            )}
            {outline.hooks && (
              <div className="text-sm"><span className="text-gray-500">章末钩子：</span>{outline.hooks}</div>
            )}
            {!outline.title && !outline.core_objective && (
              <div className="text-sm text-gray-500 italic">暂无章纲，建议先在「大纲」页生成</div>
            )}
          </div>
        )}

        {/* 风格参数（只读摘要） */}
        {style && (
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-400">🎨 当前风格</span>
              {onSwitchTab && (
                <button onClick={() => onSwitchTab('style')}
                  className="text-xs text-purple-400 hover:text-purple-300 hover:underline">
                  前往风格面板调整 →
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
      </div>

      {/* 自定义指令 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <label className="text-sm text-gray-400 block mb-2">自定义指令（可选）</label>
        <textarea
          value={customInstructions}
          onChange={e => setCustomInstructions(e.target.value)}
          placeholder="如：本章重点描写主角内心挣扎，结尾留一个大悬念..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition"
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
          className="flex items-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
        >
          <RotateCcw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 输出区域（始终可见） */}
      <div ref={outputRef} className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-300">续写输出</span>
          {generating && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400 ml-2">
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
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  编辑
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded-lg transition"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditContent(result); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition"
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
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm leading-relaxed focus:outline-none focus:border-blue-500 resize-y min-h-[300px] max-h-[600px] overflow-y-auto whitespace-pre-wrap"
                style={{ fontFamily: 'inherit' }}
              />
            ) : (
              <div
                className="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed cursor-text"
                onClick={() => { setEditing(true); setEditContent(result); }}
                title="点击编辑"
              >
                {result}
              </div>
            )}

            {/* 元数据确认面板 */}
            {resultMeta && (resultMeta.new_foreshadowings?.length > 0 || resultMeta.resolved_foreshadowings?.length > 0 || resultMeta.timeline_updates?.length > 0) && (
              <div className="mt-4 border border-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setMetaExpanded(!metaExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800/50 hover:bg-gray-800 transition text-sm"
                >
                  <span className="font-medium text-gray-300">元数据提取结果</span>
                  {metaExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {metaExpanded && (
                  <div className="p-4 space-y-4">
                    {resultMeta.new_foreshadowings?.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-yellow-400 mb-2">新伏笔（点击确认是否保留）</div>
                        <div className="space-y-1.5">
                          {resultMeta.new_foreshadowings.map((f, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <button
                                onClick={() => setConfirmedForeshadows({ ...confirmedForeshadows, [i]: !confirmedForeshadows[i] })}
                                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${
                                  confirmedForeshadows[i]
                                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                                    : 'border-gray-700 text-transparent hover:border-gray-500'
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
                        <div className="text-sm font-medium text-green-400 mb-2">伏笔回收</div>
                        <div className="space-y-1">
                          {resultMeta.resolved_foreshadowings.map((f, i) => (
                            <div key={i} className="text-sm text-gray-400 ml-7">· {f.keyword || f.description}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {resultMeta.timeline_updates?.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-cyan-400 mb-2">时间线更新（点击确认）</div>
                        <div className="space-y-1.5">
                          {resultMeta.timeline_updates.map((t, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <button
                                onClick={() => setConfirmedTimeline({ ...confirmedTimeline, [i]: !confirmedTimeline[i] })}
                                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition ${
                                  confirmedTimeline[i]
                                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                                    : 'border-gray-700 text-transparent hover:border-gray-500'
                                }`}
                              >
                                {confirmedTimeline[i] && <Check className="w-3 h-3" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {t.in_chapter_time && (
                                    <span className="text-xs font-mono text-cyan-400">{t.in_chapter_time}</span>
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
          <div className="text-center py-16 text-gray-600">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {generating ? '正在生成中，请稍候...' : '点击「开始续写」生成章节内容'}
            </p>
          </div>
        )}
      </div>

      {/* 折叠对话区 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={toggleChat}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/50 transition"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-medium">💬 辅助对话</span>
            <span className="text-xs text-gray-600">— 与 AI 讨论剧情</span>
          </div>
          {chatOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
        </button>

        {chatOpen && (
          <div className="border-t border-gray-800">
            {/* 消息区 */}
            <div className="max-h-80 overflow-y-auto px-5 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">开始对话吧，可以问 AI 关于剧情、角色的任何问题</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role !== 'user' && (
                    <div className="w-6 h-6 rounded-full bg-pink-600/20 flex items-center justify-center shrink-0">
                      <Bot className="w-3 h-3 text-pink-400" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-200'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                      <User className="w-3 h-3 text-blue-400" />
                    </div>
                  )}
                </div>
              ))}
              {chatSending && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-full bg-pink-600/20 flex items-center justify-center shrink-0">
                    <Bot className="w-3 h-3 text-pink-400" />
                  </div>
                  <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-pink-400" />
                    <span className="text-xs text-gray-500">思考中...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* 输入区 */}
            <div className="px-5 py-3 border-t border-gray-800">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="输入消息... (Enter 发送)"
                  rows={1}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink-500 resize-none"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || chatSending}
                  className="self-end px-3 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
