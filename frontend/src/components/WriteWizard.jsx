import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2, BookOpen, FileText, MessageCircle, History, PanelLeftClose, PanelLeft, X, Brain, ChevronUp, ChevronDown } from 'lucide-react';
import { writePreview, generateChapterStream, updateChapter, getChapter } from '../api/client';
import { useToast } from './ui/Toast';
import EditorArea from './WriteWizard/EditorArea';
import MetaConfirmPanel from './WriteWizard/MetaConfirmPanel';
import SidebarOutlineContext from './WriteWizard/SidebarOutlineContext';
import SidebarChat from './WriteWizard/SidebarChat';
import SidebarVersions from './WriteWizard/SidebarVersions';

const EMPTY_ARRAY = [];

export default function WriteWizard({ project, onRefresh, onSwitchTab, onSetFocusChapter }) {
  const [nextChapter, setNextChapter] = useState(project.current_chapter || 1);
  const [preview, setPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMeta, setResultMeta] = useState(null);
  const [reasoningContent, setReasoningContent] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const resultRef = useRef(result);
  resultRef.current = result;

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 对比模式
  const [compareMode, setCompareMode] = useState(false);
  const [oldContent, setOldContent] = useState('');
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);

  // 侧边栏
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('outline-context'); // outline-context | chat | versions

  const editorRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const streamRef = useRef(null);   // AbortController for current stream
  const rafRef = useRef(null);      // requestAnimationFrame ID for cleanup
  const toast = useToast();

  // 当 project 数据更新时，默认停在最后一个有正文的章节（方便回顾前文）
  useEffect(() => {
    setNextChapter(project.current_chapter || 1);
  }, [project.current_chapter]);

  // 稳定回调引用
  const handleEdit = useCallback(() => { setEditing(true); setEditContent(resultRef.current); }, []);
  const handleCancelEdit = useCallback(() => { setEditing(false); setEditContent(resultRef.current); }, []);

  // 切换章节时加载预览 + 已有章节内容
  useEffect(() => {
    let cancelled = false;

    // 内部定义，通过闭包访问 cancelled 变量
    async function doLoadPreview() {
      try {
        const data = await writePreview(project.id, nextChapter);
        if (cancelled) return;
        setPreview(data);
      } catch (e) {
        console.error('加载预览失败:', e);
      }
    }

    async function doLoadChapterContent() {
      try {
        const data = await getChapter(project.id, nextChapter);
        if (cancelled) return;
        if (data && data.content) {
          setResult(data.content);
          setEditContent(data.content);
        } else {
          setResult(null);
          setEditContent('');
        }
      } catch {
        // 章节不存在，清空
        if (!cancelled) {
          setResult(null);
          setEditContent('');
        }
      }
    }

    doLoadPreview();
    doLoadChapterContent();
    // 退出对比模式
    setCompareMode(false);
    setOldContent('');
    setResultMeta(null);
    setEditing(false);
    setShowOverwriteDialog(false);  // 防止 result 为 null 时弹窗 crash
    // 终止进行中的生成
    if (streamRef.current) {
      streamRef.current.abort();
      streamRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.abort();
        streamRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [nextChapter, project.id]);

  // 清理 setTimeout
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  // 外部引用用的版本（doGenerate 中 setTimeout、SidebarOutlineContext 的 onRefreshPreview）
  async function loadPreview() {
    try {
      const data = await writePreview(project.id, nextChapter);
      setPreview(data);
    } catch (e) {
      console.error('加载预览失败:', e);
    }
  }

  // 防抖锁：防止快速重复点击（generating 状态更新前存在窗口期）
  const generatingLock = useRef(false);

  // 点击续写：有内容时弹窗，无内容时直接生成
  function handleGenerateClick() {
    if (generating || generatingLock.current) return;
    generatingLock.current = true;
    if (result && result.trim()) {
      setShowOverwriteDialog(true);
    } else {
      doGenerate();
    }
  }

  // 覆盖模式
  function handleOverwrite() {
    setShowOverwriteDialog(false);
    doGenerate('overwrite');
  }

  // 并行对比模式
  function handleCompare() {
    setShowOverwriteDialog(false);
    setOldContent(result);
    setCompareMode(true);
    doGenerate('compare');
  }

  async function doGenerate(mode = 'overwrite') {
    setGenerating(true);
    setEditing(false);
    if (mode === 'overwrite') {
      setResult(null);
      setEditContent('');
    }
    setResultMeta(null);
    setReasoningContent('');
    try {
      const stream = generateChapterStream(project.id, nextChapter, {
        custom_instructions: customInstructions || null,
      });
      streamRef.current = stream;
      let fullText = '';
      let reasoningText = '';
      const fullTextRef = { current: '' };
      const reasoningTextRef = { current: '' };
      const flushState = () => {
        setResult(fullTextRef.current);
        setEditContent(fullTextRef.current);
        setReasoningContent(reasoningTextRef.current);
        rafRef.current = null;
      };
      for await (const evt of stream) {
        if (evt.type === 'reasoning') {
          reasoningText += evt.content;
          reasoningTextRef.current = reasoningText;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(flushState);
          }
        } else if (evt.type === 'chunk') {
          fullText += evt.content;
          fullTextRef.current = fullText;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(flushState);
          }
        } else if (evt.type === 'done' && evt.meta) {
          setResultMeta({
            word_count: evt.meta.word_count,
            new_foreshadowings: evt.meta.new_foreshadowings || [],
            resolved_foreshadowings: evt.meta.resolved_foreshadowings || [],
            timeline_updates: evt.meta.timeline_updates || [],
          });
          onRefresh();
          previewTimeoutRef.current = setTimeout(() => loadPreview(), 500);
          break;  // 收到 done 后跳出循环，不再等待后续 info 事件
        } else if (evt.type === 'error') {
          throw new Error(evt.message);
        }
      }
      // 最终同步一次确保完整
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setResult(fullText);
      setEditContent(fullText);
    } catch (e) {
      if (e.name === 'AbortError') return;  // 用户切换章节，静默退出
      toast.error('生成失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      streamRef.current = null;
      setGenerating(false);
      generatingLock.current = false;
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
      toast.error('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  // 对比模式：选择保留某一边
  function handlePickSide(side) {
    const picked = side === 'left' ? oldContent : (editContent || result);
    setCompareMode(false);
    setOldContent('');
    setResult(picked);
    setEditContent(picked);
    setEditing(true);
  }

  function switchSidebarTab(tab) {
    if (sidebarTab === tab && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setSidebarTab(tab);
      setSidebarOpen(true);
    }
  }

  // 从 preview 中提取数据
  const outlineData = preview?.outline || null;
  const scenes = preview?.scenes || EMPTY_ARRAY;
  const characters = preview?.characters || EMPTY_ARRAY;
  const foreshadowing = preview?.active_foreshadowing || EMPTY_ARRAY;
  const timeline = preview?.recent_timeline || EMPTY_ARRAY;
  const styleParams = preview?.style_params || null;
  const contextRange = preview?.context_range || '暂无前文';
  const estimatedTokens = preview?.estimated_tokens || 0;

  return (
    <div className="h-[calc(100vh-52px)] flex flex-col ink-wash-bg overflow-hidden">

      {/* 覆盖/对比弹窗 — Portal 到 body 确保视口居中 */}
      {showOverwriteDialog && createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowOverwriteDialog(false)}>
          <div className="bg-surface-1 border border-border-subtle rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" style={{ animation: 'dialog-pop 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
            <style>{`@keyframes dialog-pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
            {/* 标题区 */}
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-bold text-ink-800">第{nextChapter}章 已有内容</h3>
              <p className="text-sm text-ink-400 mt-1">当前章节已有 <span className="text-ink-700 font-medium">{result.length}</span> 字，选择处理方式</p>
            </div>

            {/* 选项卡片 */}
            <div className="px-6 pb-4 space-y-3">
              <button
                onClick={handleOverwrite}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-border-subtle hover:border-vermillion-600/30 hover:bg-vermillion-600/[0.04] transition group text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-vermillion-600/[0.08] flex items-center justify-center shrink-0 group-hover:bg-vermillion-600/15 transition">
                  <Sparkles className="w-5 h-5 text-vermillion-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-800">覆盖续写</div>
                  <div className="text-xs text-ink-400 mt-0.5">丢弃旧内容，AI 重新生成本章</div>
                </div>
              </button>

              <button
                onClick={handleCompare}
                className="w-full flex items-start gap-4 p-4 rounded-xl border border-border-subtle hover:border-inkblue-500/30 hover:bg-inkblue-500/[0.04] transition group text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-inkblue-500/[0.08] flex items-center justify-center shrink-0 group-hover:bg-inkblue-500/15 transition">
                  <FileText className="w-5 h-5 text-inkblue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-800">并行对比</div>
                  <div className="text-xs text-ink-400 mt-0.5">左右对照旧文与新文，二选一保留</div>
                </div>
              </button>
            </div>

            {/* 底部取消 */}
            <div className="px-6 py-3 border-t border-border-subtle bg-surface-2/30">
              <button
                onClick={() => setShowOverwriteDialog(false)}
                className="w-full py-1.5 text-sm text-ink-400 hover:text-ink-700 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 顶部工具栏 */}
      <div className="shrink-0 border-b border-border-subtle bg-surface-1/60 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BookOpen className="w-4 h-4 text-vermillion-600 shrink-0" />
          <span className="text-base font-semibold text-ink-900 truncate">{project.name || '未命名'}</span>
          {project.genre && (
            <span className="text-xs px-2 py-0.5 bg-vermillion-600/[0.10] text-vermillion-600 border border-vermillion-600/15 rounded-full shrink-0">{project.genre}</span>
          )}
          <span className="text-sm text-ink-400 shrink-0">{(project.current_words || 0).toLocaleString()} 字 / {project.current_chapter || 0} 章</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 章节选择器 */}
          <div className="flex items-center gap-1 input-surface border border-border-subtle rounded-lg px-2 py-1.5">
            <button
              onClick={() => setNextChapter(Math.max(1, nextChapter - 1))}
              className="px-2 py-0.5 hover:bg-black/[0.06] rounded text-base text-ink-500 transition"
            >-</button>
            <span className="text-base font-mono font-bold text-gradient-ink px-2">第{nextChapter}章</span>
            <button
              onClick={() => setNextChapter(nextChapter + 1)}
              className="px-2 py-0.5 hover:bg-black/[0.06] rounded text-base text-ink-500 transition"
            >+</button>
          </div>

          {/* 生成按钮 */}
          <button
            onClick={handleGenerateClick}
            disabled={generating}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition ${
              generating
                ? 'bg-surface-3 text-ink-500 cursor-not-allowed border border-border-subtle'
                : 'bg-vermillion-600 hover:bg-vermillion-500 text-white shadow-lg shadow-vermillion-600/10 hover:shadow-vermillion-600/15'
            }`}
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 续写中...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> 续写</>
            )}
          </button>

          {/* 侧边栏切换 */}
          <div className="flex items-center gap-0.5 border-l border-border-subtle pl-2 ml-1">
            <button
              onClick={() => switchSidebarTab('outline-context')}
              className={`p-1.5 rounded-md transition ${sidebarTab === 'outline-context' && sidebarOpen ? 'bg-jade-500/10 text-jade-600' : 'text-ink-400 hover:text-ink-700 hover:bg-surface-3'}`}
              title="本章纲要与上下文"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => switchSidebarTab('chat')}
              className={`p-1.5 rounded-md transition ${sidebarTab === 'chat' && sidebarOpen ? 'bg-vermillion-100/10 text-vermillion-600' : 'text-ink-400 hover:text-ink-700 hover:bg-surface-3'}`}
              title="辅助对话"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => switchSidebarTab('versions')}
              className={`p-1.5 rounded-md transition ${sidebarTab === 'versions' && sidebarOpen ? 'bg-vermillion-600/10 text-vermillion-600' : 'text-ink-400 hover:text-ink-700 hover:bg-surface-3'}`}
              title="版本历史"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 主体区域：编辑器 + 侧边栏 */}
      <div className="flex-1 flex overflow-hidden">

        {/* ===== 主编辑区 ===== */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 深度思考折叠区 */}
          {reasoningContent && (
            <div className="border-b border-border-subtle">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-ink-400 hover:text-ink-600 hover:bg-surface-1 transition"
              >
                <span className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  深度思考 {generating && <Loader2 className="w-3 h-3 animate-spin" />}
                </span>
                {showReasoning ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showReasoning && (
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-ink-400 leading-relaxed whitespace-pre-wrap font-mono">
                    {reasoningContent}
                  </pre>
                </div>
              )}
            </div>
          )}
          <EditorArea
            result={result}
            generating={generating}
            editing={editing}
            editContent={editContent}
            saving={saving}
            resultMeta={resultMeta}
            editorRef={editorRef}
            compareMode={compareMode}
            oldContent={oldContent}
            onEdit={handleEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onContentChange={setEditContent}
            onPickSide={handlePickSide}
          />
          <MetaConfirmPanel resultMeta={resultMeta} />
        </div>

        {/* ===== 侧边栏 ===== */}
        {sidebarOpen && (
          <>
            <div className="xl:hidden fixed inset-0 bg-black/30 z-30" onClick={() => setSidebarOpen(false)} />
            <div className="w-[360px] max-w-[80vw] xl:max-w-none shrink-0 border-l border-border-subtle bg-surface-1/40 flex flex-col overflow-hidden animate-fade-in">

            {sidebarTab === 'outline-context' && (
              <SidebarOutlineContext
                projectId={project.id}
                nextChapter={nextChapter}
                outlineData={outlineData}
                characters={characters}
                foreshadowing={foreshadowing}
                styleParams={styleParams}
                contextRange={contextRange}
                estimatedTokens={estimatedTokens}
                contextSummary={preview?.context_summary || []}
                customInstructions={customInstructions}
                onCustomInstructionsChange={setCustomInstructions}
                onSwitchTab={onSwitchTab}
                onSetFocusChapter={onSetFocusChapter}
                onRefreshPreview={loadPreview}
              />
            )}

            {sidebarTab === 'chat' && (
              <SidebarChat projectId={project.id} />
            )}

            {sidebarTab === 'versions' && (
              <SidebarVersions
                projectId={project.id}
                nextChapter={nextChapter}
                onContentRestored={(content) => {
                  setResult(content);
                  setEditContent(content);
                  setEditing(false);
                  onRefresh();
                }}
              />
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
