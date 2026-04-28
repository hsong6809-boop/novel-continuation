import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { BookOpen, Settings, ChevronDown } from 'lucide-react';
import { getSettings } from '../api/client';

export default function Layout() {
  const location = useLocation();
  const [activeProvider, setActiveProvider] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadSettings();
  }, [location.pathname]); // 每次路由变化时刷新（从设置页返回时自动更新）

    async function loadSettings() {
    try {
      const data = await getSettings();
      const provider = data.active_provider || '';
      let model = data.active_model || '';
      // fallback: 如果 active_model 为空，用 provider 的 default_model
      if (!model && provider && data.api_providers?.[provider]?.default_model) {
        model = data.api_providers[provider].default_model;
      }
      setActiveProvider(provider);
      setActiveModel(model);
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasModel = !!activeModel;
  const displayText = hasModel
    ? `${activeProvider ? activeProvider + ' / ' : ''}${activeModel}`
    : '未选用';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition">
          <BookOpen className="w-6 h-6 text-blue-400" />
          <span className="text-lg font-bold">小说续写 Agent</span>
        </Link>
        <div className="flex items-center gap-4">
          {/* 当前模型显示 */}
          <Link
            to="/settings"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition border ${
              hasModel
                ? 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
                : 'bg-gray-800/50 hover:bg-gray-700 border-gray-700/50 text-gray-500'
            }`}
            title={hasModel ? `当前模型：${activeModel}（点击进入设置）` : '未配置模型（点击进入设置）'}
          >
            <span>{displayText}</span>
            {!hasModel && (
              <span className="text-xs text-yellow-500/80 ml-1">⚠</span>
            )}
          </Link>
          <Link to="/settings" className="p-2 rounded-lg hover:bg-gray-800 transition" title="设置">
            <Settings className="w-5 h-5 text-gray-400" />
          </Link>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
