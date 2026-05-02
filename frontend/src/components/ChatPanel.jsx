import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Loader2, Bot, User, Sparkles, Users, Globe, Palette } from 'lucide-react';
import { listChat, sendChat } from '../api/client';

let msgIdCounter = 0;
function generateMsgId() { return `msg_${Date.now()}_${++msgIdCounter}`; }

// 清洗 markdown 语法，转为纯文本
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')      // # 标题
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **加粗**
    .replace(/\*(.+?)\*/g, '$1')      // *斜体*
    .replace(/`{3}[\s\S]*?`{3}/g, m => m.replace(/`{3}\w*\n?/g, '').trim()) // 代码块
    .replace(/`(.+?)`/g, '$1')        // `行内代码`
    .replace(/^[-*+]\s+/gm, '· ')     // 列表标记
    .replace(/^\d+\.\s+/gm, (m) => m) // 有序列表保留
    .replace(/^>\s+/gm, '')           // 引用
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // 链接
    .replace(/!\[.*?\]\(.+?\)/g, '')  // 图片
    .replace(/---+/g, '——')           // 分割线
    .trim();
}

const MODES = [
  { key: null, label: '自由对话', icon: MessageCircle, color: 'gray' },
  { key: 'plot', label: '剧情讨论', icon: Sparkles, color: 'amber' },
  { key: 'character', label: '角色分析', icon: Users, color: 'blue' },
  { key: 'worldview', label: '世界观', icon: Globe, color: 'green' },
  { key: 'style', label: '风格指导', icon: Palette, color: 'purple' },
];

export default function ChatPanel({ project }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { load(); }, [project.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function load() {
    try {
      const data = await listChat(project.id);
      setMessages(data);
    } catch (e) {
      console.error('加载对话失败:', e);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    // 先添加用户消息到界面
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString(), _id: generateMsgId() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await sendChat(project.id, text, mode);
      const assistantMsg = {
        role: 'assistant',
        content: res.reply,
        created_at: new Date().toISOString(),
        _id: generateMsgId(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg = {
        role: 'assistant',
        content: '⚠️ 发送失败: ' + (e.response?.data?.detail || e.message),
        created_at: new Date().toISOString(),
        _id: generateMsgId(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      {/* 标题 + 模式选择 */}
      <div className="px-6 py-4 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <MessageCircle className="w-6 h-6 text-vermillion-600" />
          <h1 className="text-xl font-bold">辅助对话</h1>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {MODES.map(m => {
            const Icon = m.icon;
            const isActive = mode === m.key;
            return (
              <button key={m.key || 'free'} onClick={() => setMode(m.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition border ${
                  isActive
                    ? 'bg-vermillion-600/[0.12] text-vermillion-600 border-vermillion-600/25'
                    : 'border-transparent text-ink-500 hover:text-ink-700 hover:input-surface'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="text-center py-12 text-ink-400">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>开始对话吧</p>
            <p className="text-sm mt-1">可以问 AI 关于剧情、角色、世界观的任何问题</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg._id || msg.id || `fallback_${msg.created_at}`}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="w-8 h-8 rounded-full bg-vermillion-600/[0.15] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-vermillion-600" />
              </div>
            )}
            <div
              className={`${msg.role === 'user' ? 'max-w-[75%]' : 'max-w-[85%]'} rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-amber-100 to-amber-50 text-ink-900 shadow-lg shadow-vermillion-600/10'
                  : 'input-surface border border-border-subtle text-ink-900'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.role === 'assistant' ? stripMarkdown(msg.content) : msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-vermillion-600/[0.12] flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-vermillion-600" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-vermillion-600/[0.15] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-vermillion-600" />
            </div>
            <div className="input-surface border border-border-subtle rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-vermillion-600" />
              <span className="text-sm text-ink-400">思考中...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-6 py-4 border-t border-border-subtle shrink-0">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={2}
            className="flex-1 input-surface border border-border-default rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="self-end px-4 py-2.5 bg-vermillion-600 hover:bg-vermillion-500 disabled:bg-surface-3 disabled:cursor-not-allowed rounded-xl transition shadow-lg shadow-vermillion-600/15 hover:shadow-vermillion-600/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
