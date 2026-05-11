import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { BookOpen, Settings, AlertTriangle } from 'lucide-react';
import { getSettings } from '../api/client';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const location = useLocation();
  const [activeProvider, setActiveProvider] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 只在挂载时加载一次设置
  useEffect(() => {
    loadSettings();
  }, []);

  // 监听设置变更事件（SettingsPage 保存后触发）
  useEffect(() => {
    function handleSettingsChanged() {
      loadSettings();
    }
    window.addEventListener('settings-changed', handleSettingsChanged);
    return () => window.removeEventListener('settings-changed', handleSettingsChanged);
  }, []);

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
    <div className="min-h-screen bg-surface-0 text-ink-900 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="glass-strong border-b border-border-subtle px-6 py-3 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
          <BookOpen className="w-5 h-5 text-vermillion-600" />
          <span className="text-xl font-bold text-gradient-ink">笔下寸心</span>
        </Link>
        <div className="flex items-center gap-3">
          {/* 当前模型显示 */}
          <Link
            to="/settings"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition border ${
              hasModel
                ? 'bg-surface-2 hover:bg-surface-3 border-border-subtle text-ink-700'
                : 'bg-surface-1 hover:bg-surface-2 border-border-subtle text-ink-400'
            }`}
            title={hasModel ? `当前模型：${activeModel}（点击进入设置）` : '未配置模型（点击进入设置）'}
          >
            <span className="truncate max-w-[200px]">{displayText}</span>
            {!hasModel && (
              <AlertTriangle className="w-3.5 h-3.5 text-gold-500 ml-1" />
            )}
          </Link>
          <ThemeToggle />
          <Link to="/settings" className="p-2 rounded-lg hover:bg-surface-2 transition text-ink-500 hover:text-ink-700" title="设置">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto animate-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
