import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { formatVnDateTime } from '../../lib/dateUtils';
import { Bell, CheckCheck, Plane, Ticket, ArrowRight, ExternalLink } from 'lucide-react';
import './notifications.css';

const notificationLink = (notification) => {
  if (notification.related_type === 'booking' && notification.related_id) return `/bookings/${notification.related_id}`;
  if (notification.related_type === 'flight' && notification.related_id) return `/flights/search?flight_id=${notification.related_id}`;
  return null;
};

export function NotificationsPage() {
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filter = params.get('filter') || 'all'; // 'all', 'unread', 'read'

  const [state, setState] = useState({
    loading: true,
    items: [],
    pagination: null,
    error: '',
    markingId: null,
    markingAll: false,
  });

  const loadNotifications = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await request(`/notifications?page=${page}&limit=10`);
      const rawList = Array.isArray(response?.data) ? response.data : [];
      setState((current) => ({
        ...current,
        loading: false,
        items: rawList,
        pagination: response?.pagination || { page, totalPages: 1, total: rawList.length },
        error: '',
      }));
    } catch (err) {
      setState((current) => ({
        ...current,
        loading: false,
        error: err.message || 'Không thể tải danh sách thông báo.',
      }));
    }
  }, [request, page]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const updateParam = (key, value) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, String(value));
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  };

  const markAsRead = async (notification) => {
    if (notification.read_at) return;
    setState((current) => ({ ...current, markingId: notification.id }));
    try {
      await request(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      setState((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        ),
        markingId: null,
      }));
    } catch (err) {
      setState((current) => ({
        ...current,
        markingId: null,
        error: err.message || 'Không thể đánh dấu đã đọc.',
      }));
    }
  };

  const markAllOnPageAsRead = async () => {
    const unreadItems = state.items.filter((item) => !item.read_at);
    if (!unreadItems.length) return;
    setState((current) => ({ ...current, markingAll: true }));
    try {
      await Promise.allSettled(
        unreadItems.map((item) => request(`/notifications/${item.id}/read`, { method: 'PATCH' }))
      );
      setState((current) => ({
        ...current,
        items: current.items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })),
        markingAll: false,
      }));
    } catch {
      setState((current) => ({ ...current, markingAll: false }));
    }
  };

  const filteredItems = useMemo(() => {
    if (filter === 'unread') return state.items.filter((i) => !i.read_at);
    if (filter === 'read') return state.items.filter((i) => Boolean(i.read_at));
    return state.items;
  }, [state.items, filter]);

  const unreadCountOnPage = state.items.filter((i) => !i.read_at).length;

  return (
    <div className="public-page booking-page notifications-page-layout">
      <AppHeader />
      <main className="booking-main">
        <header className="booking-heading">
          <div>
            <span className="eyebrow">HỘP THƯ HỆ THỐNG</span>
            <h1>Thông báo của bạn</h1>
            <p>Theo dõi các cập nhật về trạng thái đặt chỗ, chuyến bay và thông tin vận hành từ Serene Flightways.</p>
          </div>
          {unreadCountOnPage > 0 ? (
            <div className="booking-heading-actions">
              <button
                type="button"
                className="button button-outline button-small"
                disabled={state.markingAll}
                onClick={() => void markAllOnPageAsRead()}
              >
                <CheckCheck size={16} />
                <span>{state.markingAll ? 'Đang cập nhật…' : 'Đánh dấu đã đọc trên trang'}</span>
              </button>
            </div>
          ) : null}
        </header>

        {/* Tab lọc: Tất cả / Chưa đọc / Đã đọc */}
        <div className="booking-status-chips booking-tabs" role="tablist" aria-label="Phân loại thông báo">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`booking-status-chip ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => updateParam('filter', 'all')}
          >
            Tất cả
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`booking-status-chip ${filter === 'unread' ? 'is-active' : ''}`}
            onClick={() => updateParam('filter', 'unread')}
          >
            Chưa đọc {unreadCountOnPage > 0 ? `(${unreadCountOnPage})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'read'}
            className={`booking-status-chip ${filter === 'read' ? 'is-active' : ''}`}
            onClick={() => updateParam('filter', 'read')}
          >
            Đã đọc
          </button>
        </div>

        <section className="surface-card booking-panel">
          {/* Chú thích giới hạn phân trang máy chủ */}
          <div style={{ marginBottom: '14px' }}>
            <small className="booking-pagination-note" style={{ color: 'var(--color-muted, #64748b)', fontSize: '0.85rem' }}>
              Hiển thị theo phân trang máy chủ: tối đa 10 thông báo/trang · Tổng cộng {state.pagination?.total ?? state.items.length} thông báo
            </small>
          </div>

          {state.error ? <Notice type="error">{state.error}</Notice> : null}

          {state.loading ? (
            <LoadingView label="Đang tải danh sách thông báo…" />
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <h2>{filter === 'unread' ? 'Không có thông báo chưa đọc' : filter === 'read' ? 'Không có thông báo đã đọc' : 'Chưa có thông báo nào'}</h2>
              <p>Mọi thông báo cập nhật về vé và chuyến bay sẽ được hiển thị tại đây.</p>
            </div>
          ) : (
            <div className="notifications-list" role="feed" aria-label="Danh sách thông báo">
              {filteredItems.map((notification) => {
                const isUnread = !notification.read_at;
                const link = notificationLink(notification);
                const IconComponent = notification.related_type === 'booking' ? Ticket : notification.related_type === 'flight' ? Plane : Bell;

                return (
                  <article
                    key={notification.id}
                    className={`notification-page-item ${isUnread ? 'is-unread' : 'is-read'}`}
                    aria-label={notification.title}
                  >
                    <div className="notification-page-icon" aria-hidden="true">
                      <IconComponent size={20} />
                    </div>

                    <div className="notification-page-content">
                      <div className="notification-page-header">
                        <h2 className="notification-page-title">{notification.title}</h2>
                        {isUnread ? (
                          <span className="notification-unread-dot" title="Chưa đọc">
                            Mới
                          </span>
                        ) : null}
                      </div>

                      <p className="notification-page-message">{notification.message}</p>

                      <div className="notification-page-meta">
                        <time className="table-mono-cell tabular-nums font-mono" dateTime={notification.created_at}>
                          {formatVnDateTime(notification.created_at)}
                        </time>
                      </div>
                    </div>

                    <div className="notification-page-actions">
                      {link ? (
                        <Link
                          to={link}
                          className="button button-outline button-small"
                          onClick={() => void markAsRead(notification)}
                        >
                          <span>Xem chi tiết</span>
                          <ArrowRight size={14} />
                        </Link>
                      ) : null}

                      {isUnread ? (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={state.markingId === notification.id}
                          onClick={() => void markAsRead(notification)}
                          aria-label={`Đánh dấu thông báo "${notification.title}" là đã đọc`}
                        >
                          {state.markingId === notification.id ? 'Đang lưu…' : 'Đánh dấu đã đọc'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <Pagination
            page={Number(state.pagination?.page || page)}
            totalPages={Math.max(1, Number(state.pagination?.totalPages || 1))}
            onPageChange={(next) => updateParam('page', next)}
          />
        </section>
      </main>

      <footer className="site-footer">
        <span>Serene Flightways</span>
        <span>Hộp thư hệ thống thông báo cập nhật chuyến bay và đặt chỗ.</span>
      </footer>
    </div>
  );
}
