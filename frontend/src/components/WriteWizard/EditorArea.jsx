import { Pencil, Save, X, Loader2, Sparkles } from 'lucide-react';

export default function EditorArea({
  result, generating, editing, editContent, saving,
  resultMeta, onEdit, onSaveEdit, onCancelEdit, onContentChange,
  editorRef,
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 编辑器工具栏 */}
      <div className="shrink-0 px-5 py-2 flex items-center justify-between border-b border-border-subtle bg-surface-0/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-400">
            {generating ? (
              <span className="flex items-center gap-1.5 text-vermillion-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                墨落纸上，字句流淌中...
              </span>
            ) : result ? (
              <>{resultMeta?.word_count || result.length} 字</>
            ) : (
              '点击「续写」，落笔成章'
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {result && !generating && (
            <>
              {!editing ? (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-surface-3 hover:bg-black/[0.06] border border-border-subtle rounded-md transition"
                >
                  <Pencil className="w-3.5 h-3.5" /> 编辑
                </button>
              ) : (
                <>
                  <button
                    onClick={onSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-jade-600 hover:bg-jade-500 text-white rounded-md transition shadow-sm"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-surface-3 hover:bg-black/[0.06] border border-border-subtle rounded-md transition"
                  >
                    <X className="w-3.5 h-3.5" /> 取消
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 编辑器主体 */}
      <div className="flex-1 overflow-y-auto" ref={editorRef}>
        {result ? (
          editing ? (
            <textarea
              value={editContent}
              onChange={e => onContentChange(e.target.value)}
              className="w-full h-full bg-transparent p-8 font-writing text-ink-900 focus:outline-none resize-none text-lg leading-[2]"
              style={{ minHeight: '100%' }}
            />
          ) : (
            <div
              className="p-8 font-writing text-ink-900 whitespace-pre-wrap cursor-text text-lg leading-[2]"
              onClick={onEdit}
              title="点击编辑"
            >
              {result}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="relative mb-8">
              <div className="w-24 h-24 rounded-full bg-vermillion-600/[0.06] flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-vermillion-600/40" />
              </div>
              <div className="absolute -inset-5 bg-vermillion-600/[0.03] rounded-full blur-xl" />
            </div>
            <h3 className="text-xl font-medium text-ink-500 mb-3">准备就绪</h3>
            <p className="text-base text-ink-400 max-w-lg leading-relaxed">
              选择章节，点击「续写」按钮，AI 将根据上下文为你生成章节正文。
              <br />生成后你可以直接编辑、保存，或与 AI 讨论剧情。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
