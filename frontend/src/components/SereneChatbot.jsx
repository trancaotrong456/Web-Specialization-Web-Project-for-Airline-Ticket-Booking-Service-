import { useEffect, useRef, useState } from 'react';
import './sereneChatbot.css';

const INITIAL_GREETING = {
  id: 'msg-welcome',
  sender: 'bot',
  text: `Xin chào Quý khách! Em là **Trợ lý AI của Serene Flightways** ✈️.

Em được huấn luyện trực tiếp từ **Sổ tay Quy chế & Chính sách Hành khách 2026**. Quý khách có thể hỏi em về:
• 🧳 **Hành lý:** Xách tay 7kg, ký gửi, chất lỏng, pin sạc
• ⏱️ **Giữ chỗ 15 phút:** Cơ chế khóa giá & thanh toán VNPay / payOS
• 💳 **Hủy vé & Hoàn tiền:** Điều kiện theo từng hạng vé Eco / Business
• 🛫 **Thủ tục Check-in:** Thời gian mở/đóng quầy tại sân bay & online
• 🔍 **Tra cứu vé:** Hướng dẫn tra cứu bằng mã đặt chỗ PNR

Quý khách cần em hỗ trợ giải đáp thông tin gì ạ?`,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  citations: []
};

const DEFAULT_SUGGESTIONS = [
  'Quy định hành lý xách tay và ký gửi?',
  'Chính sách giữ chỗ 15 phút là gì?',
  'Chính sách hủy vé và hoàn tiền như thế nào?',
  'Thời gian check-in online và tại sân bay?',
  'Làm sao để tra cứu vé bằng mã PNR?'
];

/**
 * Phân tích và định dạng nội dung Markdown (Bold, Italic, Bullets)
 */
function renderMessageContent(rawText) {
  if (!rawText) return null;
  const lines = rawText.split('\n');

  return lines.map((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={lineIndex} style={{ height: '0.45rem' }} />;
    }

    const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');
    const lineContent = isBullet ? trimmed.replace(/^[•\-]\s*/, '') : line;

    // Phân tích **in đậm** và *in nghiêng*
    const segments = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(lineContent)) !== null) {
      if (match.index > lastIndex) {
        segments.push(lineContent.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        segments.push(
          <strong key={`${lineIndex}-${match.index}`}>{token.slice(2, -2)}</strong>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        segments.push(
          <em key={`${lineIndex}-${match.index}`}>{token.slice(1, -1)}</em>
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < lineContent.length) {
      segments.push(lineContent.substring(lastIndex));
    }

    if (isBullet) {
      return (
        <div key={lineIndex} className="serene-chat-bullet-line">
          <span style={{ color: '#075b49', fontWeight: 'bold' }}>•</span>
          <span>{segments}</span>
        </div>
      );
    }

    return (
      <div key={lineIndex} className="serene-chat-text-line">
        {segments}
      </div>
    );
  });
}

export function SereneChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('serene_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [INITIAL_GREETING];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('serene_chat_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, loading]);

  // Tải suggestions từ backend nếu có
  useEffect(() => {
    let isMounted = true;
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      try {
        const promise = window.fetch('/api/v1/chat/suggestions');
        if (promise && typeof promise.then === 'function') {
          promise
            .then((res) => (res && res.ok ? res.json() : null))
            .then((data) => {
              if (isMounted && data?.data?.suggestions?.length) {
                setSuggestions(data.data.suggestions);
              }
            })
            .catch(() => {});
        }
      } catch {}
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSendMessage = async (userText) => {
    const textToSend = typeof userText === 'string' ? userText : input;
    if (!textToSend || !textToSend.trim() || loading) return;

    const trimmed = textToSend.trim();
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const botResponse = json.data || {};

      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: botResponse.message || 'Dạ, em đã tiếp nhận câu hỏi của Quý khách.',
        citations: botResponse.citations || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (_err) {
      const fallbackMsg = {
        id: `bot-err-${Date.now()}`,
        sender: 'bot',
        text: 'Dạ, hệ thống đang bận cập nhật dữ liệu sổ tay. Quý khách vui lòng thử lại sau giây lát hoặc liên hệ hotline **1900 8888** để được giải đáp trực tiếp ạ!',
        citations: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([INITIAL_GREETING]);
    try {
      sessionStorage.removeItem('serene_chat_history');
    } catch {}
  };

  return (
    <div className="serene-chatbot-container" aria-label="Khung hỗ trợ trợ lý AI">
      {isOpen ? (
        <section className="serene-chatbot-dialog" role="dialog" aria-modal="true" aria-labelledby="chatbot-heading">
          {/* Header với Brand Mark Logo Serene Flightways */}
          <header className="serene-chatbot-header">
            <div className="serene-chatbot-header-info">
              <span className="serene-chatbot-avatar-mark" aria-hidden="true">✈</span>
              <div className="serene-chatbot-title-box">
                <span id="chatbot-heading" className="serene-chatbot-title">Serene AI Assistant</span>
                <span className="serene-chatbot-status">
                  <span className="serene-chatbot-status-dot" />
                  Trực tuyến • Sổ tay Quy định 2026
                </span>
              </div>
            </div>
            <div className="serene-chatbot-header-actions">
              <button
                type="button"
                className="serene-chatbot-btn-icon"
                title="Xóa đoạn hội thoại"
                aria-label="Xóa hội thoại"
                onClick={handleClearChat}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <button
                type="button"
                className="serene-chatbot-btn-icon"
                title="Đóng cửa sổ chat"
                aria-label="Đóng"
                onClick={() => setIsOpen(false)}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </header>

          {/* Quick Suggestions Chips */}
          <nav className="serene-chatbot-quick-prompts" aria-label="Gợi ý câu hỏi nhanh">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="serene-chatbot-chip"
                onClick={() => handleSendMessage(prompt)}
                disabled={loading}
              >
                💬 {prompt}
              </button>
            ))}
          </nav>

          {/* Messages list with formatted Markdown & Slim Scrollbar */}
          <div className="serene-chatbot-messages" role="log" aria-live="polite">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`serene-chat-row ${msg.sender === 'user' ? 'serene-chat-row-user' : 'serene-chat-row-bot'}`}
              >
                <div className="serene-chat-bubble">
                  {renderMessageContent(msg.text)}

                  {/* Document Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="serene-chat-citations">
                      <div className="serene-chat-citation-title">
                        <span>📄</span>
                        <span>Trích dẫn từ Sổ tay Hành khách:</span>
                      </div>
                      {msg.citations.map((c) => (
                        <div key={c.id || c.section} className="serene-chat-citation-item">
                          • <strong>{c.section}</strong> (Trang {c.page}) — <em>{c.source}</em>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className="serene-chat-time">{msg.timestamp}</span>
              </div>
            ))}

            {loading && (
              <div className="serene-chat-row serene-chat-row-bot">
                <div className="serene-chat-typing">
                  <span className="serene-typing-dot" />
                  <span className="serene-typing-dot" />
                  <span className="serene-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input & Footer */}
          <footer className="serene-chatbot-footer">
            <div className="serene-chatbot-input-row">
              <input
                ref={inputRef}
                type="text"
                className="serene-chatbot-input"
                placeholder="Hỏi về hành lý, vé, hoàn hủy, check-in..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                aria-label="Nhập câu hỏi cho trợ lý AI"
              />
              <button
                type="button"
                className="serene-chatbot-send-btn"
                title="Gửi tin nhắn"
                aria-label="Gửi tin nhắn"
                disabled={!input.trim() || loading}
                onClick={() => handleSendMessage()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <div className="serene-chatbot-footer-caption">
              Serene RAG Engine • Sổ tay Quy chế Hàng không 2026
            </div>
          </footer>
        </section>
      ) : (
        /* Nút Floating Launcher - Dùng logo Brand Mark ✈ chuẩn trang chủ */
        <button
          type="button"
          className="serene-chatbot-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Mở Trợ lý Hàng không AI"
          title="Trợ lý Hàng không AI - Hỗ trợ 24/7"
        >
          <span className="serene-chatbot-online-pulse" />
          <span className="serene-chatbot-launcher-mark" aria-hidden="true">✈</span>
        </button>
      )}
    </div>
  );
}

export default SereneChatbot;
