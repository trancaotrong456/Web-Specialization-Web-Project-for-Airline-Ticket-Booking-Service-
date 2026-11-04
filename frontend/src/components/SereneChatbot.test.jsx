import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SereneChatbot } from './SereneChatbot';

describe('SereneChatbot Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/chat/suggestions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { suggestions: ['Hành lý xách tay?'] } })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            message: 'Hành khách được mang tối đa 7kg hành lý xách tay.',
            citations: [
              {
                id: 'baggage-carry-on',
                title: 'Quy định Hành lý Xách tay',
                section: 'Điều 1.1 - Hành lý xách tay tiêu chuẩn',
                page: 4,
                source: 'Sổ tay Hành khách 2026'
              }
            ]
          }
        })
      });
    }));
  });

  it('renders launcher button by default', () => {
    render(<SereneChatbot />);
    const launcher = screen.getByRole('button', { name: /Mở Trợ lý Hàng không AI/i });
    expect(launcher).toBeDefined();
  });

  it('opens chat dialog when clicking launcher button', async () => {
    render(<SereneChatbot />);
    const launcher = screen.getByRole('button', { name: /Mở Trợ lý Hàng không AI/i });
    fireEvent.click(launcher);

    expect(screen.getByText('Serene AI Assistant')).toBeDefined();
    expect(screen.getByPlaceholderText(/Hỏi về hành lý, vé, hoàn hủy, check-in.../i)).toBeDefined();
  });

  it('sends message and renders bot response with citations', async () => {
    render(<SereneChatbot />);
    fireEvent.click(screen.getByRole('button', { name: /Mở Trợ lý Hàng không AI/i }));

    const input = screen.getByPlaceholderText(/Hỏi về hành lý, vé, hoàn hủy, check-in.../i);
    fireEvent.change(input, { target: { value: 'Hành lý xách tay bao nhiêu kg?' } });

    const sendBtn = screen.getByRole('button', { name: /Gửi tin nhắn/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hành khách được mang tối đa 7kg hành lý xách tay./i)).toBeDefined();
      expect(screen.getByText(/Điều 1.1 - Hành lý xách tay tiêu chuẩn/i)).toBeDefined();
    });
  });

  it('can reset chat history', async () => {
    render(<SereneChatbot />);
    fireEvent.click(screen.getByRole('button', { name: /Mở Trợ lý Hàng không AI/i }));

    const clearBtn = screen.getByRole('button', { name: /Xóa hội thoại/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText(/Xin chào Quý khách!/i)).toBeDefined();
  });
});
