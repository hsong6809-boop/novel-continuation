import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Clipboard, SplitSquareHorizontal, Loader2, Check, AlertCircle, Trash2, Brain, Eye, Pencil, Save, X, Search, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { batchImportChapters, importFile, preprocessProject, listChapters, getChapter, updateChapter } from '../api/client';

export default function ImportPanel({ project, onImported }) {
  const [mode, setMode] = useState(null); // 'paste' | 'file'
  const [pasteText, setPasteText] = useState('');
  const [previewChapters, setPreviewChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [preprocessStatus, setPreprocessStatus] = useState(null); // null | 'running' | 'done' | 'error'
  const [preprocessResult, setPreprocessResult] = useState(null);
  const fileRef = useRef(null);

  // 章节查看/编辑
  const [chaptersList, setChaptersList] = useState([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState(null); // chapter_number or null
  const [expandedContent, setExpandedContent] = useState('');
  const [editingChapter, setEditingChapter] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chaptersExpanded, setChaptersExpanded] = useState(true);

  // 自动加载章节列表
  useEffect(() => {
    loadChapters();
  }, [project.id]);

  // ========== 粘贴模式：智能预览拆分 ==========
  function previewPaste() {
    if (!pasteText.trim()) { setError('请先粘贴内容'); return; }
    setError(null);
    const chapters = smartSplit(pasteText);
    setPreviewChapters(chapters);
  }

  function smartSplit(text) {
    const patterns = [
      /第[一二三四五六七八九十百千\d]+章\s*[：:\s]*(.*)/,
      /第[一二三四五六七八九十百千\d]+节\s*[：:\s]*(.*)/,
      /Chapter\s+(\d+)\s*[：:\s]*(.*)/i,
      /^\d+[\.、]\s*(.*)/,
      /【第[一二三四五六七八九十百千\d]+章】\s*(.*)/,
    ];
    const combined = new RegExp(patterns.map(p => `(${p.source})`).join('|'), 'gm');

    const splits = [];
    let m;
    while ((m = combined.exec(text)) !== null) {
      splits.push({ pos: m.index, header: m[0].trim() });
    }

    if (splits.length === 0) {
      return [{ chapter_number: 1, title: null, content: text.trim(), charCount: text.trim().length }];
    }

    const chapters = [];
    for (let i = 0; i < splits.length; i++) {
      const header = splits[i].header;
      const numMatch = header.match(/(\d+)/);
      const chNum = numMatch ? parseInt(numMatch[1]) : i + 1;

      let title = header
        .replace(/^第[一二三四五六七八九十百千\d]+章\s*[：:\s]*/, '')
        .replace(/^第[一二三四五六七八九十百千\d]+节\s*[：:\s]*/, '')
        .replace(/^Chapter\s+\d+\s*[：:\s]*/i, '')
        .replace(/^\d+[\.、]\s*/, '')
        .replace(/^【第[一二三四五六七八九十百千\d]+章】\s*/, '')
        .trim() || null;

      const contentStart = splits[i].pos + header.length;
      const contentEnd = i + 1 < splits.length ? splits[i + 1].pos : text.length;
      const content = text.slice(contentStart, contentEnd).trim();

      if (content) {
        chapters.push({ chapter_number: chNum, title, content, charCount: content.length });
      }
    }
    return chapters;
  }

  // ========== 文件模式 ==========
  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const text = await file.text();
      const chapters = smartSplit(text);
      setPreviewChapters(chapters);
      setMode('file');
      setPasteText('');
      fileRef.current = file;
    } catch (e) {
      setError('读取文件失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== 提交导入 ==========
  async function handleImport() {
    if (previewChapters.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let res;
      if (mode === 'file' && fileRef.current) {
        res = await importFile(project.id, fileRef.current);
      } else {
        res = await batchImportChapters(project.id, {
          chapters: previewChapters.map(ch => ({
            chapter_number: ch.chapter_number,
            title: ch.title,
            content: ch.content,
          })),
        });
      }
      setResult(res);
      if (onImported) onImported();
      loadChapters();

      // 首次导入且少量章节（≤5）时自动预处理
      if (project.current_chapter === 0 && res.imported > 0 && res.imported <= 5) {
        setTimeout(() => handlePreprocess(), 500);
      }
    } catch (e) {
      setError('导入失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  }

  // ========== 预处理 ==========
  async function handlePreprocess() {
    setPreprocessStatus('running');
    setError(null);
    try {
      const res = await preprocessProject(project.id);
      setPreprocessResult(res);
      setPreprocessStatus('done');
      if (onImported) onImported();
    } catch (e) {
      setPreprocessStatus('error');
      setError('预处理失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  // ========== 章节查看/编辑 ==========
  async function loadChapters() {
    setChaptersLoading(true);
    try {
      const data = await listChapters(project.id);
      setChaptersList(data);
    } catch (e) {
      console.error('加载章节列表失败:', e);
    } finally {
      setChaptersLoading(false);
    }
  }

  async function handleExpandChapter(ch) {
    if (expandedChapter === ch) {
      setExpandedChapter(null);
      setExpandedContent('');
      setEditingChapter(null);
      return;
    }
    try {
      const data = await getChapter(project.id, ch);
      setExpandedChapter(ch);
      setExpandedContent(data.content || '');
      setEditingChapter(null);
    } catch (e) {
      setError('加载章节内容失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  async function handleSaveChapter(ch) {
    setSavingChapter(true);
    try {
      await updateChapter(project.id, ch, { content: editContent });
      setExpandedContent(editContent);
      setEditingChapter(null);
      const data = await listChapters(project.id);
      setChaptersList(data);
      if (onImported) onImported();
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSavingChapter(false);
    }
  }

  function reset() {
    setMode(null);
    setPasteText('');
    setPreviewChapters([]);
    setResult(null);
    setError(null);
    setPreprocessStatus(null);
    setPreprocessResult(null);
    fileRef.current = null;
    setEditingChapter(null);
    setEditContent('');
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* 已有章节（始终显示，可折叠） */}
      <div className="bg-white/[0.02] border border-border-subtle rounded-xl overflow-hidden">
        <button
          onClick={() => setChaptersExpanded(!chaptersExpanded)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.04] transition"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-green-400" />
            <h3 className="font-medium">已有章节</h3>
            <span className="text-xs text-gray-500">（共 {chaptersList.length} 章）</span>
          </div>
          {chaptersExpanded
            ? <ChevronUp className="w-4 h-4 text-gray-500" />
            : <ChevronDown className="w-4 h-4 text-gray-500" />
          }
        </button>

        {chaptersExpanded && (
          <div className="px-5 pb-4 border-t border-border-subtle space-y-3">
            {/* 搜索 */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={chapterSearch}
                onChange={e => setChapterSearch(e.target.value)}
                placeholder="按章节号跳转..."
                type="number"
                min="1"
                className="w-full bg-white/[0.03] border border-border-default rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
              />
            </div>

            {chaptersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
              </div>
            ) : chaptersList.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">暂无已导入章节</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {chaptersList
                  .filter(ch => !chapterSearch || ch.chapter_number === parseInt(chapterSearch))
                  .map(ch => (
                  <div key={ch.chapter_number} className="bg-white/[0.03] rounded-lg overflow-hidden">
                    {/* 章节标题行 */}
                    <button
                      onClick={() => handleExpandChapter(ch.chapter_number)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition text-left"
                    >
                      <span className="text-xs text-gray-500 w-12 shrink-0 font-mono">#{ch.chapter_number}</span>
                      <span className="text-sm text-gray-200 flex-1 truncate">{ch.title || '（无标题）'}</span>
                      <span className="text-xs text-gray-500 shrink-0">{(ch.word_count || 0).toLocaleString()} 字</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        ch.status === 'draft' ? 'bg-yellow-500/[0.08] text-yellow-400' : 'bg-white/[0.04] text-gray-400'
                      }`}>
                        {ch.status === 'draft' ? '草稿' : ch.status || '已导入'}
                      </span>
                      {expandedChapter === ch.chapter_number
                        ? <Eye className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                        : <Eye className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      }
                    </button>

                    {/* 展开内容 */}
                    {expandedChapter === ch.chapter_number && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border-subtle animate-fade-in">
                        {editingChapter === ch.chapter_number ? (
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            className="w-full bg-surface-0 border border-border-default rounded-lg p-3 text-sm leading-relaxed focus:ring-1 focus:ring-amber-500/30 resize-y min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap font-mono transition"
                          />
                        ) : (
                          <div className="bg-surface-0 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                            {expandedContent || '（无内容）'}
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          {editingChapter === ch.chapter_number ? (
                            <>
                              <button
                                onClick={() => handleSaveChapter(ch.chapter_number)}
                                disabled={savingChapter}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded-lg transition shadow-lg shadow-green-500/20"
                              >
                                {savingChapter ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                保存
                              </button>
                              <button
                                onClick={() => { setEditingChapter(null); setEditContent(expandedContent); }}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition"
                              >
                                <X className="w-3 h-3" />
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setEditingChapter(ch.chapter_number); setEditContent(expandedContent); }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition"
                            >
                              <Pencil className="w-3 h-3" />
                              编辑
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 导入新章节 */}
      <div className="bg-white/[0.02] border border-border-subtle rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <SplitSquareHorizontal className="w-5 h-5 text-purple-400" />
          <h3 className="font-medium">导入新章节</h3>
        </div>

        {!mode && !result && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('paste')}
              className="flex flex-col items-center gap-3 p-6 bg-white/[0.03] hover:bg-white/[0.05] border border-border-subtle hover:border-amber-500/30 rounded-xl transition group"
            >
              <Clipboard className="w-8 h-8 text-gray-500 group-hover:text-amber-400/70 transition" />
              <div className="text-center">
                <div className="text-sm font-medium">粘贴文本</div>
                <div className="text-xs text-gray-500 mt-1">3~5 章，直接粘贴内容</div>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 bg-white/[0.03] hover:bg-white/[0.05] border border-border-subtle hover:border-purple-500/50 rounded-xl transition group"
            >
              <Upload className="w-8 h-8 text-gray-500 group-hover:text-purple-400 transition" />
              <div className="text-center">
                <div className="text-sm font-medium">上传文件</div>
                <div className="text-xs text-gray-500 mt-1">几十万字的大文件</div>
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* 粘贴模式 */}
        {mode === 'paste' && !result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">粘贴小说内容（自动识别章节标题）</span>
              <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300">返回</button>
            </div>
            <textarea
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPreviewChapters([]); }}
              placeholder={'在此粘贴小说内容...\n\n支持的章节标题格式：\n第1章 标题\n第一章 标题\nChapter 1 标题\n1. 标题'}
              rows={10}
              className="w-full bg-white/[0.03] border border-border-default rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-amber-500/30 resize-none font-mono transition"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {pasteText.length > 0 ? `${pasteText.length.toLocaleString()} 字符` : ''}
              </span>
              <button
                onClick={previewPaste}
                disabled={!pasteText.trim()}
                className="px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 disabled:opacity-40 rounded-lg text-sm transition shadow-lg shadow-amber-500/10"
              >
                预览拆分结果
              </button>
            </div>
          </div>
        )}

        {/* 文件模式 - 已选择文件 */}
        {mode === 'file' && !result && fileRef.current && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-sm">{fileRef.current.name}</span>
                <span className="text-xs text-gray-500">({(fileRef.current.size / 1024 / 1024).toFixed(1)} MB)</span>
              </div>
              <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300">重新选择</button>
            </div>
          </div>
        )}

        {/* 预览拆分结果 */}
        {previewChapters.length > 0 && !result && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                识别到 {previewChapters.length} 个章节，共 {previewChapters.reduce((s, c) => s + c.charCount, 0).toLocaleString()} 字
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 bg-white/[0.03] border border-border-subtle rounded-lg p-3">
              {previewChapters.map((ch, i) => (
                <div key={i} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-gray-500 w-16 shrink-0">第{ch.chapter_number}章</span>
                  <span className="flex-1 truncate text-gray-300">{ch.title || '（无标题）'}</span>
                  <span className="text-gray-600 text-xs shrink-0">{ch.charCount.toLocaleString()} 字</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm transition shadow-lg shadow-green-500/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        )}

        {/* 导入结果 + 预处理引导 */}
        {result && (
          <div className="mt-4 space-y-3">
            <div className="bg-green-500/[0.06] border border-green-500/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-5 h-5" />
                <span className="font-medium">导入完成</span>
              </div>
              <div className="text-sm text-gray-400 space-y-1">
                <p>成功导入 <span className="text-green-400">{result.imported}</span> 章</p>
                {result.skipped > 0 && <p>跳过 <span className="text-yellow-400">{result.skipped}</span> 章（已存在）</p>}
                <p>当前总字数：<span className="text-gray-200">{(result.total_words || 0).toLocaleString()}</span> 字</p>
                <p>最新章节：第 {result.max_chapter} 章</p>
              </div>
            </div>

            {/* 预处理区域 */}
            {preprocessStatus === null && (
              <div className="bg-amber-500/[0.04] border border-amber-500/15 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-amber-400/70 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-amber-300/80">建议：执行智能预处理</div>
                    <p className="text-xs text-gray-400 mt-1">
                      AI 将分析所有已导入章节，自动提取角色档案、伏笔线索、时间线，并生成分卷大纲。
                      这将大幅提升后续续写的一致性。
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handlePreprocess}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 rounded-lg text-sm transition shadow-lg shadow-amber-500/10"
                      >
                        <Brain className="w-4 h-4" />
                        开始预处理
                      </button>
                      <button
                        onClick={reset}
                        className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] text-gray-400 rounded-lg text-sm transition"
                      >
                        跳过，稍后手动处理
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {preprocessStatus === 'running' && (
              <div className="bg-amber-500/[0.04] border border-amber-500/15 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-amber-400/70 animate-spin" />
                  <div>
                    <div className="text-sm font-medium text-amber-300/80">正在预处理...</div>
                    <p className="text-xs text-gray-500">AI 正在分析角色、伏笔、时间线，可能需要 30-60 秒</p>
                  </div>
                </div>
              </div>
            )}

            {preprocessStatus === 'done' && preprocessResult && (
              <div className="bg-green-500/[0.06] border border-green-500/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-400">
                  <Brain className="w-5 h-5" />
                  <span className="font-medium">预处理完成</span>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <p>识别角色 <span className="text-green-400">{preprocessResult.characters}</span> 个</p>
                  <p>提取伏笔 <span className="text-green-400">{preprocessResult.foreshadowings}</span> 条</p>
                  <p>建立时间线 <span className="text-green-400">{preprocessResult.timeline}</span> 条</p>
                  <p>分卷大纲：{preprocessResult.outline ? <span className="text-green-400">已生成</span> : <span className="text-gray-500">未生成</span>}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">可到「角色」「伏笔」「时间线」「大纲」面板查看和编辑</p>
              </div>
            )}

            <button onClick={reset} className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-sm text-amber-400/70 transition">继续导入</button>
          </div>
        )}

        {/* 错误 */}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
