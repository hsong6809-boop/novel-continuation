import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Loader2, Bot, User } from 'lucide-react';
import { listChat, sendChat } from '../api/client';

export default function ChatPanel({ project }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await sendChat(project.id, text);
      const assistantMsg = {
        role: 'assistant',
        content: res.reply,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg = {
        role: 'assistant',
        content: '⚠️ 发送失败: ' + (e.response?.data?.detail || e.message),
        created_at: new Date().toISOString(),
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
      {/* 标题 */}
      <div className="px-6 py-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-pink-400" />
          <h1 className="text-xl font-bold">辅助对话</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">与 AI 讨论剧情、角色、世界观等问题</p>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>开始对话吧</p>
            <p className="text-sm mt-1">可以问 AI 关于剧情、角色、世界观的任何问题</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="w-8 h-8 rounded-full bg-pink-600/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-pink-400" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-blue-400" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-pink-600/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-pink-400" />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
              <span className="text-sm text-gray-500">思考中...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-6 py-4 border-t border-gray-800 shrink-0">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={2}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="self-end px-4 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
