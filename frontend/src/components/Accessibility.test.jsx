import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { Field } from './Field';
import { Pagination } from './Pagination';
import { StatusBadge } from './StatusBadge';

describe('shared component accessibility', () => {
  it('moves focus into a dialog, closes on Escape, and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(<><button type="button">Mở hộp thoại</button><ConfirmDialog open={false} /></>);
    const opener = screen.getByRole('button', { name: 'Mở hộp thoại' });
    opener.focus();
    rerender(<><button type="button">Mở hộp thoại</button><ConfirmDialog open title="Xác nhận" description="Bạn chắc chắn?" confirmLabel="Đồng ý" onCancel={onCancel} onConfirm={vi.fn()} /></>);
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(<><button type="button">Mở hộp thoại</button><ConfirmDialog open={false} /></>);
    expect(screen.getByRole('button', { name: 'Mở hộp thoại' })).toHaveFocus();
  });

  it('associates field errors, exposes text status, and labels pagination controls', () => {
    render(<><Field id="email" label="Email" error="Email không hợp lệ." /><StatusBadge status="locked" /><Pagination page={2} totalPages={3} onPageChange={vi.fn()} /></>);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Phân trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đi tới trang 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đi tới trang 3' })).toBeInTheDocument();
  });

  it('contains Tab and Shift+Tab while pending and cannot be cancelled', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(<><button>Outside before</button><ConfirmDialog open={false} /><button>Outside after</button></>);
    const opener = screen.getByRole('button', { name: 'Outside before' });
    opener.focus();
    const content = (pending) => <><button>Outside before</button><ConfirmDialog open title="Xóa tài khoản" description="Xác nhận xóa" confirmLabel="Xóa" pending={pending} onCancel={onCancel} onConfirm={onConfirm} /><button>Outside after</button></>;
    rerender(content(false));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Xóa' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Xóa' })).toHaveFocus();
    rerender(content(true));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.click(dialog.parentElement);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<><button>Outside before</button><ConfirmDialog open={false} /><button>Outside after</button></>);
    expect(opener).toHaveFocus();
  });
});
