"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, CheckCheck, Inbox, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationInbox() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load notifications and count
  const fetchInbox = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
      }
      
      const countRes = await fetch("/api/notifications/unread-count");
      if (countRes.ok) {
        const countData = await countRes.json();
        setUnreadCount(countData.unreadCount);
      }
    } catch (err) {
      console.error("Failed to load notifications inbox:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
    // Poll unread count every 30 seconds for real-time updates
    const interval = setInterval(async () => {
      try {
        const countRes = await fetch("/api/notifications/unread-count");
        if (countRes.ok) {
          const countData = await countRes.json();
          setUnreadCount(countData.unreadCount);
        }
      } catch (e) {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchInbox();
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    setIsOpen(false);
    // Mark as read
    if (!notif.readAt) {
      try {
        await fetch(`/api/notifications/${notif.id}/read`, { method: "POST" });
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
      } catch (err) {
        console.error(err);
      }
    }

    if (notif.targetUrl) {
      router.push(notif.targetUrl);
    }
  };

  const getRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getNotificationStyles = (type: string) => {
    switch (type) {
      case "schedule":
        return "border-emerald-500 bg-emerald-50 text-emerald-800";
      case "checklist":
        return "border-blue-500 bg-blue-50 text-blue-800";
      case "social_media":
        return "border-amber-500 bg-amber-50 text-amber-800";
      case "ttd":
        return "border-indigo-500 bg-indigo-50 text-indigo-800";
      default:
        return "border-gray-500 bg-gray-50 text-gray-800";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative p-2 text-gray-500 hover:text-primary transition rounded-full hover:bg-gray-100 focus:outline-none"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden transform origin-top-right transition-all">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <span>Notifications Inbox</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full font-medium">
                  {unreadCount} unread
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-primary hover:text-green-700 font-medium transition focus:outline-none"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-xs mt-2 font-medium">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Inbox className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-gray-900 font-medium text-sm">Your inbox is clear</p>
                <p className="text-gray-400 text-xs mt-1">We'll notify you here when you receive new task updates or Darshan letters</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex gap-3 p-3.5 hover:bg-gray-50 cursor-pointer transition relative ${
                    !n.readAt ? "bg-amber-50/40" : ""
                  }`}
                >
                  {/* Left status dot or type indicator */}
                  <div className="flex-shrink-0 mt-1">
                    {!n.readAt ? (
                      <Circle className="w-2.5 h-2.5 text-red-600 fill-red-600" />
                    ) : (
                      <Circle className="w-2.5 h-2.5 text-gray-300" />
                    )}
                  </div>

                  {/* Body details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-semibold text-gray-900 truncate">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {getRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    
                    {/* Badge type label */}
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold border ${getNotificationStyles(n.type)}`}>
                        {n.type}
                      </span>
                      {n.targetUrl && (
                        <span className="text-[10px] text-primary hover:underline font-semibold">
                          View details &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default NotificationInbox;
