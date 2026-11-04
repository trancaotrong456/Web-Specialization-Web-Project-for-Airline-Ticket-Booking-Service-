'use strict';

const { KNOWLEDGE_DOCUMENTS, QUICK_PROMPTS } = require('./chat.knowledgeBase');

class ChatService {
  constructor({ documents = KNOWLEDGE_DOCUMENTS, quickPrompts = QUICK_PROMPTS } = {}) {
    this.documents = documents;
    this.quickPrompts = quickPrompts;
  }

  /**
   * Tokenize text into lowercase words for scoring
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  /**
   * RAG Retriever: Tìm kiếm các tài liệu / chunks liên quan nhất
   */
  retrieveRelevantChunks(query, topK = 2) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const scoredDocs = this.documents.map((doc) => {
      let score = 0;
      const lowerQuery = query.toLowerCase();
      const lowerTitle = doc.title.toLowerCase();
      const lowerContent = doc.content.toLowerCase();

      // Keyword boost
      if (Array.isArray(doc.keywords)) {
        for (const kw of doc.keywords) {
          if (lowerQuery.includes(kw.toLowerCase())) {
            score += 15;
          }
        }
      }

      // Title exact/partial match
      if (lowerQuery.includes(lowerTitle)) {
        score += 25;
      }

      // Token overlap scoring
      const contentTokens = this.tokenize(doc.content);
      for (const token of queryTokens) {
        if (lowerTitle.includes(token)) {
          score += 6;
        }
        const occurrences = contentTokens.filter((t) => t === token).length;
        score += Math.min(occurrences * 2, 10);
      }

      return { doc, score };
    });

    // Sắp xếp theo điểm số giảm dần
    scoredDocs.sort((a, b) => b.score - a.score);

    // Lấy topK tài liệu có điểm > 0
    const relevant = scoredDocs.filter((item) => item.score > 2).slice(0, topK);
    return relevant.map((item) => item.doc);
  }

  /**
   * Sinh câu trả lời tổng hợp dựa trên ngữ cảnh đã trích xuất từ tài liệu PDF
   */
  generateAnswer(query, relevantDocs) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        answer: 'Xin chào! Em là Trợ lý AI của Serene Flightways. Quý khách vui lòng đặt câu hỏi về quy định hành lý, đặt vé, chính sách hoàn hủy hoặc thủ tục bay ạ!',
        citations: []
      };
    }

    const lowerQuery = query.toLowerCase().trim();

    // Lời chào hỏi cơ bản
    if (['xin chào', 'chào bạn', 'hello', 'hi', 'alo', 'chào em', 'chào bot'].includes(lowerQuery)) {
      return {
        answer: `Xin chào Quý khách! Em là Trợ lý AI chuyên hỗ trợ thông tin hành khách của **Serene Flightways**.\n
Quý khách có thể hỏi em bất kỳ thông tin nào về:
- 🧳 **Quy định hành lý** (xách tay, ký gửi, chất lỏng, pin sạc)
- ⏱️ **Chính sách giữ chỗ 15 phút** & các phương thức thanh toán
- 💳 **Chính sách đổi vé, hủy vé & hoàn tiền**
- 🛫 **Thủ tục Check-in** trực tuyến và tại sân bay
- 🔍 **Cách tra cứu vé bằng mã PNR**
- 🍱 **Dịch vụ suất ăn nóng & phòng chờ Priority Pass**

Quý khách cần em hỗ trợ điều gì hôm nay ạ?`,
        citations: []
      };
    }

    if (relevantDocs.length === 0) {
      return {
        answer: `Cảm ơn Quý khách đã đặt câu hỏi. Theo thông tin tra cứu trong **Sổ tay Quy định Hành khách Serene Flightways**, em chưa tìm thấy điều khoản trực tiếp cho câu hỏi: *"${query}"*.

Quý khách vui lòng liên hệ trực tiếp Tổng đài Chăm sóc Khách hàng Serene Flightways qua hotline **1900 8888** hoặc xem thêm các mục hướng dẫn phổ biến bên dưới để được hỗ trợ nhanh nhất ạ!`,
        citations: []
      };
    }

    const citations = relevantDocs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      section: doc.section,
      page: doc.page,
      source: doc.source
    }));

    const primaryDoc = relevantDocs[0];
    const secondaryDoc = relevantDocs.length > 1 ? relevantDocs[1] : null;

    let responseText = `Dạ, dựa theo **${primaryDoc.section}** trong **${primaryDoc.source}** (Trang ${primaryDoc.page}), Serene Flightways xin thông tin đến Quý khách như sau:\n\n`;
    responseText += `${primaryDoc.content}\n\n`;

    if (secondaryDoc) {
      responseText += `*Thông tin bổ sung liên quan (${secondaryDoc.title} - ${secondaryDoc.section}):*\n${secondaryDoc.content}\n\n`;
    }

    responseText += `Nếu Quý khách cần hỗ trợ thêm thông tin chi tiết hoặc kiểm tra vé cụ thể, vui lòng gửi thêm câu hỏi hoặc sử dụng tính năng **Tra cứu mã đặt chỗ (PNR)** trên trang web ạ!`;

    return {
      answer: responseText,
      citations
    };
  }

  /**
   * Xử lý tin nhắn chat từ người dùng
   */
  async processMessage({ message, history = [] }) {
    const relevantDocs = this.retrieveRelevantChunks(message, 2);
    const { answer, citations } = this.generateAnswer(message, relevantDocs);

    return {
      success: true,
      message: answer,
      citations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Lấy danh sách câu hỏi gợi ý nhanh
   */
  getQuickPrompts() {
    return this.quickPrompts;
  }

  /**
   * Lấy toàn bộ tài liệu chính sách cho người dùng tra cứu
   */
  getPolicies() {
    return this.documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      section: doc.section,
      page: doc.page,
      source: doc.source,
      summary: doc.content.slice(0, 150) + '...'
    }));
  }
}

module.exports = ChatService;
