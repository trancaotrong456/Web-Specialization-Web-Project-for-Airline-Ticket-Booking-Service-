import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { getSocket, setSocketAccessToken } from '../../lib/socket';
import './notifications.css';

const notificationLink = (notification) => {
  if (notification.related_type === 'booking' && notification.related_id) return `/bookings/${notification.related_id}`;
  if (notification.related_type === 'flight' && notification.related_id) return `/flights/search?flight_id=${notification.related_id}`;
  return null;
};

export function NotificationBell() {
  const { request, accessToken, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, unread] = await Promise.all([
        request('/notifications?page=1&limit=10'),
        request('/notifications/unread-count'),
      ]);
      setItems(Array.isArray(list?.data) ? list.data : []);
      setPage(Number(list?.pagination?.page || 1));
      setHasMore(Boolean(list?.pagination?.hasNextPage));
      setUnreadCount(Number(unread?.count || 0));
    } catch (fetchError) {
      setError(fetchError.message || 'Không thể tải thông báo.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError('');
    try {
      const nextPage = page + 1;
      const result = await request(`/notifications?page=${nextPage}&limit=10`);
      setItems((current) => [...current, ...(Array.isArray(result?.data) ? result.data : [])]);
      setPage(Number(result?.pagination?.page || nextPage));
      setHasMore(Boolean(result?.pagination?.hasNextPage));
    } catch (fetchError) {
      setError(fetchError.message || 'Không thể tải thêm thông báo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') {
      setSocketAccessToken(null);
      setItems([]);
      setUnreadCount(0);
      return undefined;
    }
    setSocketAccessToken(accessToken);
    const socket = getSocket();
    const handleNewNotification = () => { void refresh(); };
    socket.on('notification:new', handleNewNotification);
    if (!socket.connected) socket.connect();
    void refresh();
    return () => socket.off('notification:new', handleNewNotification);
  }, [accessToken, refresh, status]);

  const markRead = async (notification) => {
    if (notification.read_at) return;
    try {
      await request(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (markError) {
      setError(markError.message || 'Không thể đánh dấu đã đọc.');
    }
  };

  if (status !== 'authenticated') return null;

  return <div className="notification-bell">
    <button className="notification-bell-trigger" type="button" aria-label={`Thông báo, ${unreadCount} chưa đọc`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
      {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </button>
    {open ? <section className="notification-popover" aria-label="Thông báo">
      <header><strong>Thông báo</strong><button type="button" className="notification-refresh" onClick={() => void refresh()} disabled={loading}>Làm mới</button></header>
      {loading && items.length === 0 ? <p role="status">Đang tải thông báo…</p> : null}
      {error ? <p className="notification-error" role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p className="notification-empty">Bạn chưa có thông báo nào.</p> : null}
      <ul>
        {items.map((notification) => {
          const href = notificationLink(notification);
          return <li key={notification.id} className={notification.read_at ? '' : 'is-unread'}>
            {href ? <Link to={href} onClick={() => { void markRead(notification); setOpen(false); }}>
              <strong>{notification.title}</strong><span>{notification.message}</span><time>{new Date(notification.created_at).toLocaleString('vi-VN')}</time>
            </Link> : <button type="button" className="notification-item" onClick={() => void markRead(notification)}>
              <strong>{notification.title}</strong><span>{notification.message}</span><time>{new Date(notification.created_at).toLocaleString('vi-VN')}</time>
            </button>}
          </li>;
        })}
      </ul>
      {hasMore ? <button type="button" className="notification-load-more" onClick={() => void loadMore()} disabled={loading}>{loading ? 'Đang tải…' : 'Xem thêm'}</button> : null}
      <div className="notification-popover-footer">
        <Link to="/notifications" className="notification-view-all" onClick={() => setOpen(false)}>
          Xem tất cả thông báo →
        </Link>
      </div>
    </section> : null}
  </div>;
}
