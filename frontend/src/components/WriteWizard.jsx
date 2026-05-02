import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, BookOpen, FileText, MessageCircle, History, PanelLeftClose, PanelLeft } from 'lucide-react';
import { writePreview, generateChapterStream, updateChapter } from '../api/client';
import EditorArea from './WriteWizard/EditorArea';
import MetaConfirmPanel from './WriteWizard/MetaConfirmPanel';
import SidebarOutlineContext from './WriteWizard/SidebarOutlineContext';
import SidebarChat from './WriteWizard/SidebarChat';
import SidebarVersions from './WriteWizard/SidebarVersions';

export default function WriteWizard({ project, onRefresh, onSwitchTab, onSetFocusChapter }) {
  const [nextChapter, setNextChapter] = useState((project.current_chapter || 0) + 1);
  const [preview, setPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMeta, setResultMeta] = useState(null);
  const [customInstructions, setCustomInstructions] = useState('');

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 侧边栏
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('outline-context'); // outline-context | chat | versions

  const editorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadPreview(cancelled);
    return () => { cancelled = true; };
  }, [nextChapter]);
  async function loadPreview(cancelled = false) {
    try {
      const data = await writePreview(project.id, nextChapter);
      if (cancelled) return;
      setPreview(data);
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
    try {
      const stream = generateChapterStream(project.id, nextChapter, {
        custom_instructions: customInstructions || null,
      });
      let fullText = '';
      for await (const evt of stream) {
        if (evt.type === 'chunk') {
          fullText += evt.content;
          setResult(fullText);
          setEditContent(fullText);
        } else if (evt.type === 'done' && evt.meta) {
          setResultMeta({
            word_count: evt.meta.word_count,
            new_foreshadowings: evt.meta.new_foreshadowings || [],
            resolved_foreshadowings: evt.meta.resolved_foreshadowings || [],
            timeline_updates: evt.meta.timeline_updates || [],
          });
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
  const scenes = preview?.scenes || [];
  const characters = preview?.characters || [];
  const foreshadowing = preview?.active_foreshadowing || [];
  const timeline = preview?.recent_timeline || [];
  const styleParams = preview?.style_params || null;
  const contextRange = preview?.context_range || '暂无前文';
  const estimatedTokens = preview?.estimated_tokens || 0;

  return (
    <div className="h-[calc(100vh-52px)] flex flex-col ink-wash-bg overflow-hidden">

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
            onClick={handleGenerate}
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
          <EditorArea
            result={result}
            generating={generating}
            editing={editing}
            editContent={editContent}
            saving={saving}
            resultMeta={resultMeta}
            editorRef={editorRef}
            onEdit={() => { setEditing(true); setEditContent(result); }}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => { setEditing(false); setEditContent(result); }}
            onContentChange={setEditContent}
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
