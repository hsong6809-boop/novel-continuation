import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Clipboard, SplitSquareHorizontal, Loader2, Check, AlertCircle, Trash2, Brain, Eye, Pencil, Save, X, Search, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { batchImportChapters, importFile, preprocessProject, largeProcessImport, listChapters, getChapter, updateChapter } from '../api/client';
import { useToast } from './ui/Toast';

// 中文数字转阿拉伯数字
function chineseToArabic(text) {
  if (!text) return null;
  if (/^\d+$/.test(text)) { const v = parseInt(text); return v > 0 ? v : null; }
  const digitMap = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const unitMap = { '十': 10, '百': 100, '千': 1000 };
  let result = 0, current = 0;
  for (const ch of text) {
    if (ch in digitMap) { current = digitMap[ch]; }
    else if (ch in unitMap) {
      const unit = unitMap[ch];
      if (current === 0 && unit === 10) current = 1;
      result += current * unit;
      current = 0;
    } else if (/\d/.test(ch)) { current = parseInt(ch); }
    else { return null; }
  }
  result += current;
  return result > 0 ? result : null;
}

// 字数统计：去除空白后的总字符数（与后端 count_chinese_words 一致）
function countWords(text) {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

// 智能拆分正则（组件外部，避免每次渲染重建）
const CHAPTER_PATTERNS = [
  /第[一二三四五六七八九十百千\d]+章\s*[：:\s]*(.*)/,
  /第[一二三四五六七八九十百千\d]+节\s*[：:\s]*(.*)/,
  /Chapter\s+(\d+)\s*[：:\s]*(.*)/i,
  /^\d+[\.、]\s*(.*)/,
  /【第[一二三四五六七八九十百千\d]+章】\s*(.*)/,
];
const COMBINED_CHAPTER_RE = new RegExp(CHAPTER_PATTERNS.map(p => `(${p.source})`).join('|'), 'gm');

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
  const toast = useToast();

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
    const combined = COMBINED_CHAPTER_RE;
    combined.lastIndex = 0; // 重置正则状态

    const splits = [];
    let m;
    while ((m = combined.exec(text)) !== null) {
      splits.push({ pos: m.index, header: m[0].trim() });
    }

    if (splits.length === 0) {
      return [{ chapter_number: 1, title: null, content: text.trim(), charCount: countWords(text) }];
    }

    const chapters = [];
    for (let i = 0; i < splits.length; i++) {
      const header = splits[i].header;
      // 提取章节号：优先 "第X章" 中文/阿拉伯，再 "Chapter X"，再 "X."
      let chNum = null;
      const cnMatch = header.match(/第([一二三四五六七八九十百千零\d]+)[章节]/);
      if (cnMatch) chNum = chineseToArabic(cnMatch[1]);
      if (chNum === null) {
        const numMatch = header.match(/(\d+)/);
        chNum = numMatch ? parseInt(numMatch[1]) : null;
      }
      if (chNum === null) {
        chNum = chapters.length > 0 ? chapters[chapters.length - 1].chapter_number + 1 : i + 1;
      }

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
        chapters.push({ chapter_number: chNum, title, content, charCount: countWords(content) });
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

      // 首次导入时自动预处理
      if (project.current_chapter === 0 && res.imported > 0) {
        if (res.total_words > 50000) {
          // 大文件（>5万字）：使用分块处理
          setTimeout(() => handleLargeProcess(), 500);
        } else {
          // 小文件：使用原有预处理
          setTimeout(() => handlePreprocess(), 500);
        }
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

  // ========== 大文件分块处理 ==========
  async function handleLargeProcess() {
    setPreprocessStatus('running');
    setError(null);
    try {
      const res = await largeProcessImport(project.id);
      setPreprocessResult(res);
      setPreprocessStatus('done');
      if (onImported) onImported();
    } catch (e) {
      setPreprocessStatus('error');
      setError('分块处理失败: ' + (e.response?.data?.detail || e.message));
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
      toast.error('保存失败: ' + (e.response?.data?.detail || e.message));
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

  const isLargeImport = result && (result.total_words || 0) > 50000;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* 已有章节（始终显示，可折叠） */}
      <div className="bg-surface-1 border border-border-subtle rounded-xl overflow-hidden">
        <button
          onClick={() => setChaptersExpanded(!chaptersExpanded)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-3 transition"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-jade-700" />
            <h3 className="font-medium">已有章节</h3>
            <span className="text-xs text-ink-400">（共 {chaptersList.length} 章）</span>
          </div>
          {chaptersExpanded
            ? <ChevronUp className="w-4 h-4 text-ink-400" />
            : <ChevronDown className="w-4 h-4 text-ink-400" />
          }
        </button>

        {chaptersExpanded && (
          <div className="px-5 pb-4 border-t border-border-subtle space-y-3">
            {/* 搜索 */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                value={chapterSearch}
                onChange={e => setChapterSearch(e.target.value)}
                placeholder="按章节号跳转..."
                type="number"
                min="1"
                className="w-full input-surface border border-border-default rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition"
              />
            </div>

            {chaptersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-ink-400 animate-spin" />
              </div>
            ) : chaptersList.length === 0 ? (
              <div className="text-center py-6 text-ink-400 text-sm">暂无已导入章节</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {chaptersList
                  .filter(ch => !chapterSearch || ch.chapter_number === parseInt(chapterSearch))
                  .map(ch => (
                  <div key={ch.chapter_number} className="input-surface rounded-lg overflow-hidden">
                    {/* 章节标题行 */}
                    <button
                      onClick={() => handleExpandChapter(ch.chapter_number)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition text-left"
                    >
                      <span className="text-xs text-ink-400 w-12 shrink-0 font-mono">#{ch.chapter_number}</span>
                      <span className="text-sm text-ink-900 flex-1 truncate">{ch.title || '（无标题）'}</span>
                      <span className="text-xs text-ink-400 shrink-0">{(ch.word_count || 0).toLocaleString()} 字</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        ch.status === 'draft' ? 'bg-yellow-600/[0.10] text-gold-600' : 'bg-surface-3 text-ink-500'
                      }`}>
                        {ch.status === 'draft' ? '草稿' : ch.status || '已导入'}
                      </span>
                      {expandedChapter === ch.chapter_number
                        ? <Eye className="w-3.5 h-3.5 text-vermillion-600 shrink-0" />
                        : <Eye className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      }
                    </button>

                    {/* 展开内容 */}
                    {expandedChapter === ch.chapter_number && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border-subtle animate-fade-in">
                        {editingChapter === ch.chapter_number ? (
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            className="w-full bg-surface-0 border border-border-default rounded-lg p-3 text-sm leading-relaxed focus:ring-1 focus:ring-vermillion-500/40 resize-y min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap font-mono transition"
                          />
                        ) : (
                          <div className="bg-surface-0 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                            {expandedContent || '（无内容）'}
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          {editingChapter === ch.chapter_number ? (
                            <>
                              <button
                                onClick={() => handleSaveChapter(ch.chapter_number)}
                                disabled={savingChapter}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded-lg transition shadow-lg shadow-green-600/15"
                              >
                                {savingChapter ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                保存
                              </button>
                              <button
                                onClick={() => { setEditingChapter(null); setEditContent(expandedContent); }}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-3 hover:bg-black/[0.05] rounded-lg transition"
                              >
                                <X className="w-3 h-3" />
                                取消
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setEditingChapter(ch.chapter_number); setEditContent(expandedContent); }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-3 hover:bg-black/[0.05] rounded-lg transition"
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
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <SplitSquareHorizontal className="w-5 h-5 text-inkblue-600" />
          <h3 className="font-medium">导入新章节</h3>
        </div>

        {!mode && !result && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('paste')}
              className="flex flex-col items-center gap-3 p-6 input-surface hover:bg-surface-3 border border-border-subtle hover:border-amber-500/30 rounded-xl transition group"
            >
              <Clipboard className="w-8 h-8 text-ink-400 group-hover:text-vermillion-600 transition" />
              <div className="text-center">
                <div className="text-sm font-medium">粘贴文本</div>
                <div className="text-xs text-ink-400 mt-1">3~5 章，直接粘贴内容</div>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 input-surface hover:bg-surface-3 border border-border-subtle hover:border-purple-500/50 rounded-xl transition group"
            >
              <Upload className="w-8 h-8 text-ink-400 group-hover:text-inkblue-600 transition" />
              <div className="text-center">
                <div className="text-sm font-medium">上传文件</div>
                <div className="text-xs text-ink-400 mt-1">几十万字的大文件</div>
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
              <span className="text-sm text-ink-500">粘贴小说内容（自动识别章节标题）</span>
              <button onClick={reset} className="text-xs text-ink-400 hover:text-ink-700">返回</button>
            </div>
            <textarea
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPreviewChapters([]); }}
              placeholder={'在此粘贴小说内容...\n\n支持的章节标题格式：\n第1章 标题\n第一章 标题\nChapter 1 标题\n1. 标题'}
              rows={10}
              className="w-full input-surface border border-border-default rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none font-mono transition"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-400">
                {pasteText.length > 0 ? `${pasteText.length.toLocaleString()} 字符` : ''}
              </span>
              <button
                onClick={previewPaste}
                disabled={!pasteText.trim()}
                className="px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 disabled:opacity-40 rounded-lg text-sm transition shadow-lg shadow-vermillion-600/10"
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
                <FileText className="w-4 h-4 text-inkblue-600" />
                <span className="text-sm">{fileRef.current.name}</span>
                <span className="text-xs text-ink-400">({(fileRef.current.size / 1024 / 1024).toFixed(1)} MB)</span>
              </div>
              <button onClick={reset} className="text-xs text-ink-400 hover:text-ink-700">重新选择</button>
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

            <div className="max-h-64 overflow-y-auto space-y-1 input-surface border border-border-subtle rounded-lg p-3">
              {previewChapters.map((ch, i) => (
                <div key={i} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-ink-400 w-16 shrink-0">第{ch.chapter_number}章</span>
                  <span className="flex-1 truncate text-ink-700">{ch.title || '（无标题）'}</span>
                  <span className="text-ink-400 text-xs shrink-0">{ch.charCount.toLocaleString()} 字</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm transition shadow-lg shadow-green-600/15"
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
            <div className="bg-green-600/[0.08] border border-green-600/25 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-jade-700">
                <Check className="w-5 h-5" />
                <span className="font-medium">导入完成</span>
              </div>
              <div className="text-sm text-ink-500 space-y-1">
                <p>成功导入 <span className="text-jade-700">{result.imported}</span> 章</p>
                {result.skipped > 0 && <p>跳过 <span className="text-gold-600">{result.skipped}</span> 章（已存在）</p>}
                <p>当前总字数：<span className="text-ink-900">{(result.total_words || 0).toLocaleString()}</span> 字</p>
                <p>最新章节：第 {result.max_chapter} 章</p>
              </div>
            </div>

            {/* 预处理区域 */}
            {preprocessStatus === null && (
              <div className="bg-vermillion-600/[0.06] border border-amber-500/15 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-vermillion-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-vermillion-600">
                      {isLargeImport ? '建议：执行大文件分块处理' : '建议：执行智能预处理'}
                    </div>
                    <p className="text-xs text-ink-500 mt-1">
                      {isLargeImport
                        ? 'AI 将按 5 万字分块处理，逐块生成章纲（情节描述+章末钩子），并提取角色、伏笔、时间线。大文件处理可能需要较长时间。'
                        : 'AI 将分析所有已导入章节，自动提取角色档案、伏笔线索、时间线，并生成分卷大纲。这将大幅提升后续续写的一致性。'}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={isLargeImport ? handleLargeProcess : handlePreprocess}
                        className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm transition shadow-lg shadow-vermillion-600/10"
                      >
                        <Brain className="w-4 h-4" />
                        {isLargeImport ? '开始分块处理' : '开始预处理'}
                      </button>
                      <button
                        onClick={reset}
                        className="px-4 py-2 bg-surface-3 hover:bg-black/[0.05] text-ink-500 rounded-lg text-sm transition"
                      >
                        跳过，稍后手动处理
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {preprocessStatus === 'running' && (
              <div className="bg-vermillion-600/[0.06] border border-amber-500/15 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-vermillion-600 animate-spin" />
                  <div>
                    <div className="text-sm font-medium text-vermillion-600">正在预处理...</div>
                    <p className="text-xs text-ink-400">
                      {isLargeImport
                        ? 'AI 正在按分块处理大文件，生成章纲并提取角色/伏笔/时间线，可能需要较长时间'
                        : 'AI 正在分析角色、伏笔、时间线，可能需要 30-60 秒'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {preprocessStatus === 'done' && preprocessResult && (
              <div className="bg-green-600/[0.08] border border-green-600/25 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-jade-700">
                  <Brain className="w-5 h-5" />
                  <span className="font-medium">
                    {preprocessResult.total_chunks ? '分块处理完成' : '预处理完成'}
                  </span>
                </div>
                <div className="text-sm text-ink-500 space-y-1">
                  {preprocessResult.total_chunks && (
                    <>
                      <p>总章节 <span className="text-jade-700">{preprocessResult.total_chapters}</span> 章，
                        共 <span className="text-jade-700">{(preprocessResult.total_chars || 0).toLocaleString()}</span> 字</p>
                      <p>分块数 <span className="text-jade-700">{preprocessResult.total_chunks}</span> 个</p>
                    </>
                  )}
                  <p>生成章纲 <span className="text-jade-700">{preprocessResult.outlines || 0}</span> 条</p>
                  <p>识别角色 <span className="text-jade-700">{preprocessResult.characters}</span> 个</p>
                  <p>提取伏笔 <span className="text-jade-700">{preprocessResult.foreshadowings}</span> 条</p>
                  <p>建立时间线 <span className="text-jade-700">{preprocessResult.timeline}</span> 条</p>
                  {preprocessResult.settings !== undefined && (
                    <p>提取设定 <span className="text-jade-700">{preprocessResult.settings}</span> 条</p>
                  )}
                  {preprocessResult.outline !== undefined && !preprocessResult.total_chunks && (
                    <p>分卷大纲：{preprocessResult.outline ? <span className="text-jade-700">已生成</span> : <span className="text-ink-400">未生成</span>}</p>
                  )}
                </div>
                {preprocessResult.chunk_results && preprocessResult.chunk_results.some(c => c.error) && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gold-600">部分分块处理异常：</p>
                    {preprocessResult.chunk_results.filter(c => c.error).map(c => (
                      <p key={c.chunk} className="text-xs text-gold-600">
                        分块 {c.chunk}（第{c.chapters}章）：{c.error}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-ink-400 mt-2">可到「角色」「伏笔」「时间线」「大纲」面板查看和编辑</p>
              </div>
            )}

            <button onClick={reset} className="px-4 py-2 bg-surface-3 hover:bg-black/[0.05] rounded-lg text-sm text-vermillion-600 transition">继续导入</button>
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
