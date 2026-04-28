import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, Users, Palette, Clock, ChevronLeft,
  Sparkles, Eye, Upload, MessageCircle, Download
} from 'lucide-react';
import { getProject } from '../api/client';
import OutlinePanel from '../components/OutlinePanel';
import CharacterPanel from '../components/CharacterPanel';
import StylePanel from '../components/StylePanel';
import ForeshadowPanel from '../components/ForeshadowPanel';
import TimelinePanel from '../components/TimelinePanel';
import WriteWizard from '../components/WriteWizard';
import ImportPanel from '../components/ImportPanel';
import ChatPanel from '../components/ChatPanel';

const TABS = [
  { key: 'write', label: '续写向导', icon: Sparkles },
  { key: 'import', label: '导入前文', icon: Upload },
  { key: 'outline', label: '大纲', icon: FileText },
  { key: 'characters', label: '角色', icon: Users },
  { key: 'style', label: '风格', icon: Palette },
  { key: 'foreshadow', label: '伏笔', icon: Eye },
    { key: 'timeline', label: '时间线', icon: Clock },
  { key: 'chat', label: '辅助对话', icon: MessageCircle },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('write');
  const [focusChapter, setFocusChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
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
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">项目不存在</p>
        <button onClick={() => navigate('/')} className="text-blue-400 hover:underline text-sm">
          返回项目列表
        </button>
      </div>
    );
  }

  function handleSwitchTab(tab) {
    setActiveTab(tab);
    // 切换到非大纲页时清除 focusChapter
    if (tab !== 'outline') {
      setFocusChapter(null);
    }
  }

  function renderPanel() {
    switch (activeTab) {
      case 'write':
        return <WriteWizard project={project} onRefresh={loadProject} onSwitchTab={handleSwitchTab} onSetFocusChapter={setFocusChapter} />;
      case 'import':
        return (
          <div className="max-w-3xl mx-auto px-6 py-8">
            <ImportPanel project={project} onImported={loadProject} />
          </div>
        );
      case 'outline':
        return <OutlinePanel project={project} onRefresh={loadProject} focusChapter={focusChapter} />;
      case 'characters':
        return <CharacterPanel project={project} onRefresh={loadProject} />;
      case 'style':
        return <StylePanel project={project} onRefresh={loadProject} />;
      case 'foreshadow':
        return <ForeshadowPanel project={project} />;
            case 'timeline':
        return <TimelinePanel project={project} />;
      case 'chat':
        return <ChatPanel project={project} />;
      default:
        return null;
    }
  }

  return (
    <div className="flex h-[calc(100vh-52px)]">
      {/* 左侧导航栏 */}
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* 返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition border-b border-gray-800"
        >
          <ChevronLeft className="w-4 h-4" />
          项目列表
        </button>

        {/* 项目信息 */}
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-sm truncate">{project.name}</h2>
          <div className="text-xs text-gray-500 mt-1">
            {project.current_chapter} 章 · {(project.current_words || 0).toLocaleString()} 字
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => handleSwitchTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                  activeTab === tab.key
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* 底部进度 */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="text-xs text-gray-500 mb-1">写作进度</div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(100, ((project.current_words || 0) / (project.target_words || 200000)) * 100)}%`
              }}
            />
          </div>
                    <div className="text-xs text-gray-600 mt-1">
            {Math.round(((project.current_words || 0) / (project.target_words || 200000)) * 100)}%
          </div>
        </div>

        {/* 导出按钮 */}
        <div className="px-4 py-3 border-t border-gray-800 space-y-2">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Download className="w-3 h-3" /> 导出
          </div>
          <div className="flex gap-1">
            {[
              { fmt: 'txt', label: 'TXT' },
              { fmt: 'docx', label: 'DOCX' },
              { fmt: 'epub', label: 'EPUB' },
            ].map(({ fmt, label }) => (
              <button
                key={fmt}
                onClick={() => window.open(`/api/projects/${project.id}/export/${fmt}`, '_blank')}
                className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded transition"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex-1 overflow-auto">
        {renderPanel()}
      </div>
    </div>
  );
}
