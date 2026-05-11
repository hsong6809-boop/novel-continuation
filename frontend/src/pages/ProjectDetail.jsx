import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, Users, Palette, Clock, ChevronLeft, Menu,
  Sparkles, Eye, Upload, MessageCircle, Download, Library
} from 'lucide-react';
import { getProject } from '../api/client';
import { useToast } from '../components/ui/Toast';
import OutlinePanel from '../components/OutlinePanel';
import CharacterPanel from '../components/CharacterPanel';
import StylePanel from '../components/StylePanel';
import ForeshadowPanel from '../components/ForeshadowPanel';
import TimelinePanel from '../components/TimelinePanel';
import WriteWizard from '../components/WriteWizard';
import ImportPanel from '../components/ImportPanel';
import ChatPanel from '../components/ChatPanel';
import SettingsLibraryPanel from '../components/SettingsLibraryPanel';
import ProgressBar from '../components/ui/ProgressBar';

const TABS = [
  { key: 'write', label: '续写向导', icon: Sparkles },
  { key: 'import', label: '导入前文', icon: Upload },
  { key: 'outline', label: '大纲', icon: FileText },
  { key: 'characters', label: '角色', icon: Users },
  { key: 'style', label: '风格', icon: Palette },
  { key: 'foreshadow', label: '伏笔', icon: Eye },
    { key: 'timeline', label: '时间线', icon: Clock },
  { key: 'settings', label: '设定库', icon: Library },
  { key: 'chat', label: '辅助对话', icon: MessageCircle },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('write');
  const [focusChapter, setFocusChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // LRU 标签页缓存：最多同时挂载 5 个标签页，超出时卸载最久未访问的
  const MAX_VISITED_TABS = 5;
  const [visitedTabs, setVisitedTabs] = useState(['write']);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    getProject(id).then(data => { if (!cancelled) setProject(data); })
      .catch(e => { if (!cancelled) console.error(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function loadProject() {
    try {
      const data = await getProject(id);
      setProject(data);
    } catch (e) {
      console.error('加载项目失败:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-ink-400 animate-shimmer px-8 py-2 rounded-lg">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-ink-400">项目不存在</p>
        <button onClick={() => navigate('/')} className="text-vermillion-600 hover:text-amber-300 text-sm transition">
          返回项目列表
        </button>
      </div>
    );
  }

  function handleSwitchTab(tab) {
    setActiveTab(tab);
    // LRU：将当前 tab 移到末尾（最近访问），超出上限时移除最旧的
    setVisitedTabs(prev => {
      const filtered = prev.filter(t => t !== tab);
      filtered.push(tab);
      if (filtered.length > MAX_VISITED_TABS) {
        filtered.shift();
      }
      return filtered;
    });
    if (tab !== 'outline') {
      setFocusChapter(null);
    }
  }

  async function handleExport(fmt) {
    try {
      const resp = await fetch(`/api/projects/${project.id}/export/${fmt}`);
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name || 'novel'}.${fmt === 'epub' ? 'epub' : fmt === 'docx' ? 'docx' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('导出失败: ' + e.message);
    }
  }

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* 左侧导航栏 */}
      <aside className={`${sidebarOpen ? 'w-52' : 'w-0'} lg:w-52 transition-all duration-300 overflow-hidden glass border-r border-border-subtle flex flex-col shrink-0 ink-wash-bg`}>
        {/* 返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-3 text-sm text-ink-500 hover:text-ink-900 hover:input-surface transition border-b border-border-subtle"
        >
          <ChevronLeft className="w-4 h-4" />
          项目列表
        </button>

        {/* 项目信息 */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-bold text-lg truncate text-ink-900">{project.name}</h2>
          <div className="text-sm text-ink-400 mt-1">
            {project.current_chapter} 章 · {(project.current_words || 0).toLocaleString()} 字
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-1.5 px-2 space-y-0.5">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => handleSwitchTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg transition ${
                  activeTab === tab.key
                    ? 'bg-black/[0.05] text-vermillion-600 shadow-[inset_2px_0_0] shadow-amber-500/60'
                    : 'text-ink-500 hover:text-ink-900 hover:input-surface'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* 底部进度 */}
        <div className="px-4 py-3 border-t border-border-subtle">
          <div className="text-xs text-ink-400 mb-1.5">写作进度</div>
          <ProgressBar value={project.current_words || 0} max={project.target_words || 200000} />
          <div className="text-xs text-ink-400 mt-1">
            {Math.round(((project.current_words || 0) / (project.target_words || 200000)) * 100)}%
          </div>
        </div>

        {/* 导出按钮 */}
        <div className="px-4 py-3 space-y-2">
          <div className="text-xs text-ink-400 mb-2 flex items-center gap-1">
            <Download className="w-3 h-3" /> 导出
          </div>
          <div className="flex gap-1.5">
            {[
              { fmt: 'txt', label: 'TXT' },
              { fmt: 'docx', label: 'DOCX' },
              { fmt: 'epub', label: 'EPUB' },
            ].map(({ fmt, label }) => (
              <button
                key={fmt}
                onClick={() => handleExport(fmt)}
                className="flex-1 text-xs py-1.5 input-surface hover:bg-black/[0.05] text-ink-500 hover:text-ink-900 rounded-md border border-border-subtle hover:border-border-hover transition"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* 侧边栏浮动切换按钮 - 仅在小屏幕显示 */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-40 p-2.5 bg-vermillion-600 text-white rounded-full shadow-lg shadow-vermillion-600/20 hover:bg-vermillion-500 transition">
        <Menu className="w-5 h-5" />
      </button>

      {/* 主工作区 - 用 visitedTabs + display:none 保留已访问标签页的状态 */}
      <div className="flex-1 overflow-auto">
        {visitedTabs.includes('write') && (
          <div style={{ display: activeTab === 'write' ? 'block' : 'none' }}>
            <WriteWizard project={project} onRefresh={loadProject} onSwitchTab={handleSwitchTab} onSetFocusChapter={setFocusChapter} />
          </div>
        )}
        {visitedTabs.includes('import') && (
          <div style={{ display: activeTab === 'import' ? 'block' : 'none' }}>
            <ImportPanel project={project} onImported={loadProject} />
          </div>
        )}
        {visitedTabs.includes('outline') && (
          <div style={{ display: activeTab === 'outline' ? 'block' : 'none' }}>
            <OutlinePanel project={project} onRefresh={loadProject} focusChapter={focusChapter} />
          </div>
        )}
        {visitedTabs.includes('characters') && (
          <div style={{ display: activeTab === 'characters' ? 'block' : 'none' }}>
            <CharacterPanel project={project} onRefresh={loadProject} />
          </div>
        )}
        {visitedTabs.includes('style') && (
          <div style={{ display: activeTab === 'style' ? 'block' : 'none' }}>
            <StylePanel project={project} onRefresh={loadProject} />
          </div>
        )}
        {visitedTabs.includes('foreshadow') && (
          <div style={{ display: activeTab === 'foreshadow' ? 'block' : 'none' }}>
            <ForeshadowPanel project={project} />
          </div>
        )}
        {visitedTabs.includes('timeline') && (
          <div style={{ display: activeTab === 'timeline' ? 'block' : 'none' }}>
            <TimelinePanel project={project} />
          </div>
        )}
        {visitedTabs.includes('settings') && (
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <SettingsLibraryPanel project={project} />
          </div>
        )}
        {visitedTabs.includes('chat') && (
          <div style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
            <ChatPanel project={project} />
          </div>
        )}
      </div>
    </div>
  );
}
