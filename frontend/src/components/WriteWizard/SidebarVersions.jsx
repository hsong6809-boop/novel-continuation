import { useState, useEffect, useRef } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { listChapterVersions, restoreChapterVersion } from '../../api/client';
import { useToast } from '../ui/Toast';

export default function SidebarVersions({ projectId, nextChapter, onContentRestored }) {
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const toast = useToast();
  useEffect(() => {
    loadVersions();
  }, [projectId, nextChapter]);

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const data = await listChapterVersions(projectId, nextChapter);
      setVersions(data);
    } catch (e) {
      console.error('加载版本历史失败:', e);
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestore(versionId) {
    if (!await toast.confirm('确定要回退到此版本吗？当前内容会先被保存为新版本。')) return;
    setRestoring(true);
    try {
      const res = await restoreChapterVersion(projectId, nextChapter, versionId);
      onContentRestored(res.content);
      toast.success(`已回退到版本，共 ${res.word_count} 字`);
      await loadVersions();
    } catch (e) {
      toast.error('回退失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 space-y-3">
        <h3 className="text-base font-semibold text-ink-700">版本历史</h3>
        {versionsLoading ? (
          <div className="flex items-center gap-2 py-12 justify-center text-ink-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-16 text-ink-400">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无历史版本</p>
            <p className="text-xs mt-1">续写后旧版本会自动保存</p>
          </div>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="bg-surface-1 border border-border-subtle rounded-lg p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-vermillion-600">v{v.version}</span>
                    <span className="text-sm text-ink-500">{v.word_count} 字</span>
                  </div>
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-vermillion-600/[0.10] hover:bg-amber-500/[0.15] disabled:bg-surface-3 border border-vermillion-600/25 rounded transition text-gold-600"
                  >
                    {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    回退
                  </button>
                </div>
                {v.title && <div className="text-sm text-ink-700 truncate">{v.title}</div>}
                <div className="text-xs text-ink-400 mt-1">{v.created_at}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
