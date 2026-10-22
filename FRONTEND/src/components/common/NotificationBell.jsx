import React, { useState, useEffect, useCallback, useRef } from "react";
import { Badge, Popover, Button, Empty, Spin, Alert, message } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import notificationService from "../../services/notificationService";
import { timeAgo } from "../../utils/formatters";
import "./NotificationBell.css";

export default function NotificationBell() {
  const { user } = useAuth();
  const account = `${user?.role}:${user?._id || user?.id}`;
  const owner = useRef(account);
  owner.current = account;
  const requestNumber = useRef(0);
  const opening = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [marking, setMarking] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const refresh = useCallback(async (nextPage = 1) => {
    const request = ++requestNumber.current;
    setLoading(true);
    setError(false);
    try {
      const data = await notificationService.list(nextPage);
      if (!Array.isArray(data?.items) || !Number.isFinite(data.unreadCount)) throw new Error("Invalid notification response");
      if (owner.current !== account || request !== requestNumber.current) return;
      setItems((previous) => nextPage === 1 ? data.items : [...previous, ...data.items.filter((item) => !previous.some((old) => old.eventId === item.eventId))]);
      setUnreadCount(data.unreadCount);
      setTotal(data.total);
      setPage(nextPage);
    } catch {
      if (owner.current === account && request === requestNumber.current) setError(true);
    } finally {
      if (owner.current === account && request === requestNumber.current) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    owner.current = account;
    setItems([]); setUnreadCount(0); setTotal(0); setOpen(false);
    refresh();
    const poll = () => { if (!document.hidden && !openRef.current) refresh(); };
    const timer = setInterval(poll, 30000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      owner.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [account, refresh]);
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  const handleReadAll = async () => {
    setMarking(true);
    try {
      await notificationService.markAllRead();
      if (owner.current !== account) return;
      setItems((previous) => previous.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      await refresh();
    } catch { message.error("Chưa đánh dấu được thông báo. Vui lòng thử lại."); }
    finally { setMarking(false); }
  };
  const handleOpenItem = async (item) => {
    if (opening.current) return;
    opening.current = true;
    try {
      if (!item.isRead) await notificationService.markRead(item.eventId);
      if (owner.current !== account) return;
      setItems((previous) => previous.map((old) => old.eventId === item.eventId ? { ...old, isRead: true } : old));
      if (!item.isRead) setUnreadCount((count) => Math.max(0, count - 1));
      setOpen(false);
      if (item.path.startsWith("/jobs/") || item.path.startsWith("/employer/dashboard?")) navigate(item.path);
    } catch { message.error("Không mở được thông báo. Vui lòng thử lại."); }
    finally { opening.current = false; }
  };

  return (
    <Popover rootClassName="notification-popover" open={open} onOpenChange={(value) => { setOpen(value); if (value) refresh(); }} trigger="click" placement="bottomRight" content={
      <section className="notification-panel" aria-label="Danh sách thông báo">
        <div className="notification-panel__header">
          <strong>Thông báo {unreadCount > 0 && `(${unreadCount} chưa đọc)`}</strong>
          <Button type="text" size="small" icon={<CheckOutlined />} disabled={!unreadCount || loading} loading={marking} onClick={handleReadAll}>Đọc tất cả</Button>
        </div>
        {error && <Alert type="warning" showIcon message="Chưa tải được thông báo" action={<Button size="small" onClick={() => refresh()}>Thử lại</Button>} />}
        <div className="notification-panel__list" aria-busy={loading}>
          {!error && !loading && !items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa có thông báo" />}
          {items.map((item) => (
            <button key={item.eventId} type="button" className={`notification-item ${item.isRead ? "" : "notification-item--unread"}`} onClick={() => handleOpenItem(item)}>
              <span className="notification-item__title">{item.title}{!item.isRead && <span className="notification-item__dot" aria-label="Chưa đọc" />}</span>
              <span className="notification-item__message">{item.message}</span>
              <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString("vi-VN")}>{timeAgo(item.createdAt)}</time>
            </button>
          ))}
          {loading && <div className="notification-panel__loading"><Spin size="small" /></div>}
        </div>
        {items.length < total && <Button type="link" block disabled={loading} onClick={() => refresh(page + 1)}>Xem thêm</Button>}
      </section>
    }>
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <button type="button" className="notification-bell" aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"} aria-expanded={open}><BellOutlined /></button>
      </Badge>
    </Popover>
  );
}
