import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, ChevronLeft, Eye, EyeOff, Plus, Trash2, Check, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronRight, RotateCcw, FileText, Sliders, Server, MessageSquare } from 'lucide-react';
import { getSettings, updateSettings, fetchModels } from '../api/client';

const PROMPT_META = {
  continuation: {
    name: '续写提示词',
    description: '根据上下文续写章节正文。可用变量：{chapter} 章节号，{context} 项目信息/大纲/角色/伏笔/前文等上下文数据',
    warning: '务必保留 {context} 占位符，否则项目信息、大纲、角色、伏笔等上下文数据将丢失，导致续写质量严重下降。',
  },
  chapter_outline: {
    name: '章纲生成',
    description: '为单章生成章纲和场景要点。可用变量：{chapter} 章节号，{context} 项目信息/前几章大纲/角色信息',
    warning: '务必保留 {context} 占位符。输出格式要求（JSON schema）包含在 {context} 中，移除将导致返回格式不可控。',
  },
  batch_outline: {
    name: '批量章纲生成',
    description: '按卷一次性生成所有章节的章纲。可用变量：{ch_start} 起始章节，{ch_end} 结束章节，{context} 项目/卷/角色信息',
    warning: '务必保留 {context} 占位符。如需调整节奏要求（如小高潮间隔），可修改 {context} 末尾的"要求"部分。',
  },
  volume_outline: {
    name: '分卷大纲规划',
    description: '基于总纲规划分卷大纲。可用变量：{count} 生成卷数，{context} 项目信息/总纲/角色/已有章纲',
    warning: '务必保留 {context} 占位符。如需调整每卷章节数范围，可修改 {context} 中"要求"部分的说明。',
  },
  overall_outline: {
    name: '总纲生成',
    description: '生成整体故事结构总纲。可用变量：{context} 项目信息/已有章纲/角色/伏笔/章节摘要',
    warning: '务必保留 {context} 占位符。总纲不包含分卷规划（分卷单独生成），请勿在模板中要求输出分卷信息。',
  },
  meta_extraction: {
    name: '元数据提取',
    description: '从已写章节中提取角色状态、伏笔、时间线。可用变量：{context} 章节信息/已知角色/输出格式/章节内容',
    warning: '务必保留 {context} 占位符，其中包含章节正文内容。输出格式（JSON schema）也在 {context} 中，修改可能导致数据无法保存。',
  },
  preprocess: {
    name: '前文预处理',
    description: '从导入的前文章节中批量提取角色档案、伏笔、时间线和分卷大纲。可用变量：{context} 项目信息/分析要求/章节内容',
    warning: '务必保留 {context} 占位符，其中包含导入的章节正文。输出的 JSON 结构需与系统解析格式匹配，修改可能导致预处理失败。',
  },
  chat_system: {
    name: '辅助对话系统提示',
    description: 'AI 助手的角色设定和行为规范。可用变量：{context} 项目信息/角色/伏笔/时间线/最近章节/章纲',
    warning: '务必保留 {context} 占位符，否则 AI 助手将无法获取项目上下文信息。可调整 AI 的语气和回答风格。',
  },
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState({});

  // 每个 provider 的模型列表和加载状态
  const [modelLists, setModelLists] = useState({});   // { providerName: ['model1', 'model2'] }
  const [modelLoading, setModelLoading] = useState({}); // { providerName: true/false }
  const [modelErrors, setModelErrors] = useState({});   // { providerName: 'error msg' }

  // 提示词管理
  const [expandedPrompts, setExpandedPrompts] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await getSettings();
      // 确保 prompts 字段存在
      if (!data.prompts) data.prompts = {};
      setSettings(data);
      // 如果已有 default_model，初始化到 modelLists 里（避免下拉框显示空白）
      const initModels = {};
      for (const [name, cfg] of Object.entries(data.api_providers || {})) {
        if (cfg.default_model) {
          initModels[name] = [cfg.default_model];
        }
      }
      setModelLists(initModels);
    } catch (e) {
      console.error('加载设置失败:', e);
    } finally {
      setLoading(false);
    }
  }

    async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      // 先保存各 provider 配置
      for (const [name, cfg] of Object.entries(settings.api_providers || {})) {
        await updateSettings({
          provider: name,
          provider_config: {
            base_url: cfg.base_url,
            api_key: cfg.api_key,
            default_model: cfg.default_model,
          },
        });
      }
      // 同步 active_model：确保与 active_provider 的 default_model 一致
      const ap = settings.active_provider;
      const providerDefault = settings.api_providers?.[ap]?.default_model || '';
      const modelToSave = providerDefault || settings.active_model || '';
      await updateSettings({
        active_provider: ap,
        active_model: modelToSave,
        prompts: settings.prompts || {},
      });
      // 本地也同步，避免 Layout 显示旧值
      setSettings(prev => ({ ...prev, active_model: modelToSave }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  }

  /** 拉取某个 provider 的可用模型列表 */
  async function handleFetchModels(name) {
    const cfg = settings.api_providers?.[name];
    if (!cfg?.base_url || !cfg?.api_key) {
      setModelErrors(prev => ({ ...prev, [name]: '请先填写 Base URL 和 API Key' }));
      return;
    }
    setModelLoading(prev => ({ ...prev, [name]: true }));
    setModelErrors(prev => ({ ...prev, [name]: '' }));
    try {
      const data = await fetchModels(cfg.base_url, cfg.api_key);
      const models = data.models || [];
      setModelLists(prev => ({ ...prev, [name]: models }));
      // 如果当前 default_model 不在列表里，自动选第一个
      if (models.length > 0 && !models.includes(cfg.default_model)) {
        updateProvider(name, 'default_model', models[0]);
      }
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || '获取失败';
      setModelErrors(prev => ({ ...prev, [name]: msg }));
    } finally {
      setModelLoading(prev => ({ ...prev, [name]: false }));
    }
  }

  function updateProvider(name, field, value) {
    setSettings(prev => ({
      ...prev,
      api_providers: {
        ...prev.api_providers,
        [name]: { ...prev.api_providers[name], [field]: value },
      },
    }));
  }

  function addProvider() {
    const name = prompt('输入新 Provider 名称（英文）：');
    if (!name || !name.trim()) return;
    const key = name.trim().toLowerCase();
    if (settings.api_providers?.[key]) {
      alert('该 Provider 已存在');
      return;
    }
    setSettings(prev => ({
      ...prev,
      api_providers: {
        ...prev.api_providers,
        [key]: { base_url: '', api_key: '', default_model: '' },
      },
    }));
  }

  function removeProvider(name) {
    if (!confirm(`确定删除 Provider「${name}」？`)) return;
    const providers = { ...settings.api_providers };
    delete providers[name];
    setSettings(prev => ({
      ...prev,
      api_providers: providers,
      active_provider: prev.active_provider === name ? Object.keys(providers)[0] || '' : prev.active_provider,
    }));
    // 清理关联状态
    setModelLists(prev => { const n = { ...prev }; delete n[name]; return n; });
    setModelErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
  }

  function toggleShowKey(name) {
    setShowKeys(prev => ({ ...prev, [name]: !prev[name] }));
  }

  function updatePrompt(key, value) {
    setSettings(prev => ({
      ...prev,
      prompts: { ...prev.prompts, [key]: value },
    }));
  }

  function restorePrompt(key) {
    if (!confirm(`确定将「${PROMPT_META[key]?.name || key}」恢复为默认模板？`)) return;
    setSettings(prev => {
      const prompts = { ...prev.prompts };
      delete prompts[key];
      return { ...prev, prompts };
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-gray-500 animate-shimmer px-8 py-2 rounded-lg">加载中...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">加载设置失败</p>
        <button onClick={() => navigate('/')} className="text-amber-400/70 hover:underline text-sm">返回</button>
      </div>
    );
  }

  const models = modelLists[settings.active_provider] || [];

  return (
    <div className="min-h-screen bg-surface-0 text-gray-100">
      {/* 顶部栏 */}
      <header className="glass-strong border-b border-border-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </button>
          <div className="w-px h-6 bg-border-subtle" />
          <Settings className="w-5 h-5 text-amber-400/70" />
          <span className="text-lg font-bold">设置</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition shadow-lg ${
            saved
              ? 'bg-green-600 text-white shadow-green-500/20'
              : 'bg-amber-600/80 hover:bg-amber-500/80 text-white shadow-amber-500/10 hover:shadow-amber-500/20'
          } ${saving ? 'opacity-50' : ''}`}
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? '已保存' : saving ? '保存中...' : '保存设置'}
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* 锚点导航 */}
        <nav className="flex gap-1 bg-white/[0.02] border border-border-subtle rounded-lg p-1 mb-2">
          <a href="#model" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition">
            <Sliders className="w-3.5 h-3.5" /> 当前模型
          </a>
          <a href="#providers" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition">
            <Server className="w-3.5 h-3.5" /> Provider
          </a>
          <a href="#prompts" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition">
            <MessageSquare className="w-3.5 h-3.5" /> 提示词
          </a>
        </nav>

        {/* 当前使用的模型 */}
        <section id="model">
          <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400/70" /> 当前使用的模型
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Provider</label>
              <select
                value={settings.active_provider || ''}
                onChange={e => {
                  const provider = e.target.value;
                  const model = settings.api_providers?.[provider]?.default_model || '';
                  setSettings(prev => ({ ...prev, active_provider: provider, active_model: model }));
                }}
                className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
              >
                {Object.keys(settings.api_providers || {}).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">模型</label>
              {models.length > 0 ? (
                <select
                  value={settings.active_model || ''}
                  onChange={e => setSettings(prev => ({ ...prev, active_model: e.target.value }))}
                  className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                >
                  {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={settings.active_model || ''}
                  onChange={e => setSettings(prev => ({ ...prev, active_model: e.target.value }))}
                  placeholder="请先在下方获取模型列表"
                  className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                />
              )}
            </div>
          </div>
        </section>

        {/* Provider 配置 */}
        <section id="providers">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400/70" /> API Provider 配置
            </h2>
            <button
              onClick={addProvider}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              添加 Provider
            </button>
          </div>

          <div className="space-y-4">
            {Object.entries(settings.api_providers || {}).map(([name, cfg]) => {
              const providerModels = modelLists[name] || [];
              const isLoading = modelLoading[name];
              const errorMsg = modelErrors[name];

              return (
                <div key={name} className="bg-white/[0.02] border border-border-subtle rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{name}</span>
                      {settings.active_provider === name && (
                        <span className="text-xs px-2 py-0.5 bg-amber-600/15 text-amber-400/70 rounded-full">当前</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeProvider(name)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-white/[0.04] rounded transition"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                    <input
                      value={cfg.base_url || ''}
                      onChange={e => updateProvider(name, 'base_url', e.target.value)}
                      placeholder="https://api.deepseek.com/v1"
                      className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1">API Key</label>
                    <div className="relative">
                      <input
                        type={showKeys[name] ? 'text' : 'password'}
                        value={cfg.api_key || ''}
                        onChange={e => updateProvider(name, 'api_key', e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 pr-10 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                      />
                      <button
                        onClick={() => toggleShowKey(name)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                      >
                        {showKeys[name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 获取模型按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFetchModels(name)}
                      disabled={isLoading}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
                        isLoading
                          ? 'bg-white/[0.04] text-gray-400 cursor-not-allowed'
                          : 'bg-amber-600/15 text-amber-400/70 hover:bg-amber-600/25 shadow-lg shadow-amber-500/10'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          获取中...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          获取模型列表
                        </>
                      )}
                    </button>
                    {errorMsg && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {errorMsg}
                      </span>
                    )}
                    {providerModels.length > 0 && !isLoading && !errorMsg && (
                      <span className="text-xs text-green-400">已获取 {providerModels.length} 个模型</span>
                    )}
                  </div>

                  {/* 模型选择 */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">默认模型</label>
                    {providerModels.length > 0 ? (
                      <select
                        value={cfg.default_model || ''}
                        onChange={e => updateProvider(name, 'default_model', e.target.value)}
                        className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                      >
                        {providerModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={cfg.default_model || ''}
                        onChange={e => updateProvider(name, 'default_model', e.target.value)}
                        placeholder="点击上方按钮自动获取，或手动输入"
                        className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500/30 transition"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 提示词管理 */}
        <section id="prompts">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-amber-400/70" />
            <h2 className="text-sm font-medium text-gray-400">提示词管理</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            自定义各功能的 AI 提示词模板。模板中必须保留 {'{context}'} 占位符，否则上下文数据将丢失。
          </p>

          <div className="space-y-3">
            {Object.entries(PROMPT_META).map(([key, meta]) => {
              const isExpanded = expandedPrompts[key];
              const currentPrompt = settings.prompts?.[key] || '';
              const hasCustom = !!currentPrompt;

              return (
                <div key={key} className="bg-white/[0.02] border border-border-subtle rounded-xl overflow-hidden">
                  {/* 标题栏 */}
                  <button
                    onClick={() => setExpandedPrompts(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-gray-500" />
                        : <ChevronRight className="w-4 h-4 text-gray-500" />
                      }
                      <span className="text-sm font-medium">{meta.name}</span>
                      {hasCustom && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-600/20 text-yellow-400 rounded-full">
                          已自定义
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{key}</span>
                  </button>

                  {/* 展开内容 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 animate-fade-in">
                      <p className="text-xs text-gray-400">{meta.description}</p>

                      {/* 修改警告 */}
                      <div className="flex items-start gap-2 p-3 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-300/80">{meta.warning}</p>
                      </div>

                      <textarea
                        value={currentPrompt}
                        onChange={e => updatePrompt(key, e.target.value)}
                        placeholder="留空则使用默认模板"
                        rows={8}
                        className="w-full bg-white/[0.03] border border-border-default rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:ring-1 focus:ring-amber-500/30 resize-y transition"
                      />

                      <div className="flex justify-end">
                        <button
                          onClick={() => restorePrompt(key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] rounded-lg transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          恢复默认
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
