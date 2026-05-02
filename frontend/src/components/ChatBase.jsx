import { useState, useEffect, useRef, useCallback } from 'react';
import { listChat, sendChat } from '../api/client';

/**
 * 共享聊天逻辑 Hook
 * ChatPanel 和 SidebarChat 的公共数据逻辑
 */
let chatMsgIdCounter = 0;
function generateChatMsgId() { return `cmsg_${Date.now()}_${++chatMsgIdCounter}`; }

export function useChatLogic(projectId, mode = null) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    load();
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function load() {
    try {
      const data = await listChat(projectId);
      // 为加载的消息也附加 _id
      const withIds = data.map(m => ({ ...m, _id: m._id || m.id || generateChatMsgId() }));
      setMessages(withIds);
    } catch (e) {
      console.error('加载对话失败:', e);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString(), _id: generateChatMsgId() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await sendChat(projectId, text, mode);
      const assistantMsg = {
        role: 'assistant',
        content: res.reply,
        created_at: new Date().toISOString(),
        _id: generateChatMsgId(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg = {
        role: 'assistant',
        content: '⚠️ 发送失败: ' + (e.response?.data?.detail || e.message),
        created_at: new Date().toISOString(),
        _id: generateChatMsgId(),
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

  return {
    messages,
    input,
    setInput,
    sending,
    bottomRef,
    handleSend,
    handleKeyDown,
  };
}
