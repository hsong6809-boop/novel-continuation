import { useState } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

export default function MetaConfirmPanel({ resultMeta }) {
  const [expanded, setExpanded] = useState(true);
  const [confirmedForeshadows, setConfirmedForeshadows] = useState(() => {
    const fs = {};
    (resultMeta?.new_foreshadowings || []).forEach((_, i) => { fs[i] = true; });
    return fs;
  });
  const [confirmedTimeline, setConfirmedTimeline] = useState(() => {
    const tl = {};
    (resultMeta?.timeline_updates || []).forEach((_, i) => { tl[i] = true; });
    return tl;
  });

  if (!resultMeta) return null;
  const { new_foreshadowings = [], resolved_foreshadowings = [], timeline_updates = [] } = resultMeta;
  if (new_foreshadowings.length === 0 && resolved_foreshadowings.length === 0 && timeline_updates.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-surface-1 transition"
      >
        <span className="font-medium text-ink-700 text-sm">元数据提取结果</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-ink-400" /> : <ChevronUp className="w-4 h-4 text-ink-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-3 space-y-3 animate-fade-in max-h-48 overflow-y-auto">
          {new_foreshadowings.length > 0 && (
            <div>
              <div className="text-sm font-medium text-vermillion-600 mb-1.5">新伏笔</div>
              <div className="space-y-1">
                {new_foreshadowings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <button
                      onClick={() => setConfirmedForeshadows(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition text-xs ${
                        confirmedForeshadows[i]
                          ? 'bg-vermillion-600/20 border-vermillion-600/50 text-vermillion-600'
                          : 'border-border-default text-transparent hover:border-gray-500'
                      }`}
                    >
                      {confirmedForeshadows[i] && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className="text-sm text-ink-700">
                      {f.keyword || `伏笔${i + 1}`}
                      {f.description && <span className="text-ink-400"> — {f.description}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolved_foreshadowings.length > 0 && (
            <div>
              <div className="text-sm font-medium text-jade-600 mb-1.5">伏笔回收</div>
              <div className="space-y-0.5">
                {resolved_foreshadowings.map((f, i) => (
                  <div key={i} className="text-sm text-ink-500 ml-5">· {f.keyword || f.description}</div>
                ))}
              </div>
            </div>
          )}

          {timeline_updates.length > 0 && (
            <div>
              <div className="text-sm font-medium text-inkblue-600 mb-1.5">时间线更新</div>
              <div className="space-y-1">
                {timeline_updates.map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <button
                      onClick={() => setConfirmedTimeline(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition text-xs ${
                        confirmedTimeline[i]
                          ? 'bg-inkblue-500/20 border-cyan-500/50 text-inkblue-600'
                          : 'border-border-default text-transparent hover:border-gray-500'
                      }`}
                    >
                      {confirmedTimeline[i] && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-ink-700">{t.event_description}</span>
                      {t.in_chapter_time && <span className="text-sm text-inkblue-600/70 ml-2">{t.in_chapter_time}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
