import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Bot, User, Loader2, Send } from 'lucide-react';
import { listChat, sendChat } from '../../api/client';

let sidebarMsgIdCounter = 0;
function generateSidebarMsgId() { return `smsg_${Date.now()}_${++sidebarMsgIdCounter}`; }

export default function SidebarChat({ projectId }) {
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef(null);
  useEffect(() => {
    loadChat();
  }, [projectId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadChat() {
    try {
      const data = await listChat(projectId);
      setMessages(data);
    } catch (e) {
      console.error('加载对话失败:', e);
    }
  }

  async function handleSend() {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput('');
    setChatSending(true);
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString(), _id: generateSidebarMsgId() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await sendChat(projectId, text);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply, created_at: new Date().toISOString(), _id: generateSidebarMsgId() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '发送失败: ' + (e.response?.data?.detail || e.message), created_at: new Date().toISOString(), _id: generateSidebarMsgId() }]);
    } finally {
      setChatSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16 text-ink-400">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">与 AI 讨论剧情、角色、设定</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg._id || msg.id || `fallback_${msg.created_at}`} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="w-6 h-6 rounded-full bg-vermillion-100/[0.12] flex items-center justify-center shrink-0">
                <Bot className="w-3 h-3 text-vermillion-600" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-amber-100 to-amber-50 text-ink-900'
                : 'input-surface border border-border-subtle text-ink-900'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-vermillion-600/[0.12] flex items-center justify-center shrink-0">
                <User className="w-3 h-3 text-vermillion-600" />
              </div>
            )}
          </div>
        ))}
        {chatSending && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-vermillion-100/[0.12] flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-vermillion-600" />
            </div>
            <div className="input-surface border border-border-subtle rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-vermillion-600" />
              <span className="text-sm text-ink-400">思考中...</span>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-border-subtle">
        <div className="flex gap-2">
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 input-surface border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none transition"
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim() || chatSending}
            className="self-end px-3 py-2 bg-vermillion-600/70 hover:bg-vermillion-100/70 disabled:bg-surface-3 disabled:cursor-not-allowed rounded-lg transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
