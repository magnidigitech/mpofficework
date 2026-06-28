"use client";

import { useState, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  FileCode, Shield, RefreshCw, AlertTriangle, CheckCircle2, 
  Smartphone, Search, ChevronDown, ChevronUp, Loader2, Play
} from "lucide-react";

export default function AuditPage() {
  const { data: session } = authClient.useSession();
  const [activeTab, setActiveTab] = useState("activity-logs");

  // Filters
  const [datePreset, setDatePreset] = useState("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Data lists
  const [logs, setLogs] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    fetchData();
  }, [activeTab, datePreset, searchQuery, actionFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [page]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = activeTab === "activity-logs" 
        ? "/api/admin/activity-logs" 
        : "/api/admin/notification-deliveries";

      const params = new URLSearchParams({
        datePreset,
        query: searchQuery,
        page: String(page),
        limit: "15",
      });

      if (activeTab === "activity-logs" && actionFilter) {
        params.append("action", actionFilter);
      }
      if (activeTab === "notification-deliveries" && statusFilter) {
        params.append("status", statusFilter);
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (activeTab === "activity-logs") {
          setLogs(data.logs || []);
        } else {
          setDeliveries(data.deliveries || []);
        }
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load log entries.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to query audit data.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryNotification = async (id: string) => {
    setError(null);
    setSuccess(null);
    setRetryingId(id);
    try {
      const res = await fetch(`/api/admin/notification-deliveries/${id}/retry`, {
        method: "POST",
      });

      if (res.ok) {
        setSuccess("Notification delivery retry task successfully dispatched to background BullMQ queue.");
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to dispatch retry task.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to retry delivery.");
    } finally {
      setRetryingId(null);
    }
  };

  // Safe JSON formatting check
  const renderLogDetails = (details: string | null) => {
    if (!details) return <span className="text-gray-400 italic">No structured change parameters.</span>;

    try {
      const parsed = JSON.parse(details);
      return (
        <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-[11px] font-mono overflow-auto max-h-60 shadow-inner">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch (e) {
      return <div className="text-gray-700 text-xs font-semibold bg-gray-50 border border-gray-100 p-3 rounded-lg">{details}</div>;
    }
  };

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 font-sans flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-700" />
          <span>Admin Audit Center</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Audit security activity logs and monitor real-time Web Push notification deliveries.</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-2 mb-6">
        <button
          onClick={() => {
            setActiveTab("activity-logs");
            setError(null);
            setSuccess(null);
          }}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition whitespace-nowrap focus:outline-none ${
            activeTab === "activity-logs"
              ? "border-emerald-700 text-emerald-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Activity Logs
        </button>
        <button
          onClick={() => {
            setActiveTab("notification-deliveries");
            setError(null);
            setSuccess(null);
          }}
          className={`py-3 px-4 font-bold text-xs border-b-2 transition whitespace-nowrap focus:outline-none ${
            activeTab === "notification-deliveries"
              ? "border-emerald-700 text-emerald-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Notification Deliveries
        </button>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6 flex flex-col sm:flex-row gap-3 text-xs items-center">
        <div className="w-full sm:w-48">
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="custom">All Time</option>
          </select>
        </div>

        {activeTab === "activity-logs" ? (
          <div className="w-full sm:w-48">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
            >
              <option value="">All Actions</option>
              <option value="CREATE_SCHEDULE">Create Schedule</option>
              <option value="UPDATE_SCHEDULE">Update Schedule</option>
              <option value="COMPLETE_CHECKLIST_ITEM">Complete Checklist</option>
              <option value="TTD_REQUEST_CREATED">TTD Request Added</option>
              <option value="UPDATE_SETTING">Settings Changes</option>
              <option value="RETRY_NOTIFICATION">Manual Retry Push</option>
            </select>
          </div>
        ) : (
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
            >
              <option value="">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        )}

        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search audit parameters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700 pl-8"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
          <p className="text-xs text-gray-500 mt-2">Loading audit entries...</p>
        </div>
      ) : activeTab === "activity-logs" ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Action</th>
                  <th className="p-4 w-12">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <>
                      <tr key={log.id} className="hover:bg-gray-50/50">
                        <td className="p-4 font-medium text-gray-500">
                          {new Date(log.timestamp).toLocaleString("en-IN")}
                        </td>
                        <td className="p-4 font-bold text-gray-900">{log.userName}</td>
                        <td className="p-4">{log.userRole}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 font-semibold text-[10px] text-gray-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="p-1 border border-gray-200 hover:bg-gray-50 rounded transition focus:outline-none"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="p-4 bg-gray-50/60 border-t border-b border-gray-200">
                            <div className="space-y-2">
                              <p className="font-bold text-[10px] uppercase text-gray-400">Activity JSON details</p>
                              {renderLogDetails(log.details)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <th className="p-4">Notification Details</th>
                  <th className="p-4">Recipient</th>
                  <th className="p-4">Device summary</th>
                  <th className="p-4">Attempts</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700">
                {deliveries.map((del) => (
                  <tr key={del.id} className="hover:bg-gray-50/50">
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{del.title}</div>
                      <div className="text-gray-500 text-[10px] mt-0.5">{del.message}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-gray-800">{del.recipientName}</div>
                      <div className="text-gray-400 text-[10px]">{del.recipientEmail}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Smartphone className="w-4 h-4 text-gray-400" />
                        <span>{del.deviceName}</span>
                      </div>
                      <div className="text-gray-400 text-[10px] mt-0.5">
                        {del.deviceBrowser} | {del.deviceOS}
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-center">{del.attemptCount}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        del.status === "SENT" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        del.status === "FAILED" ? "bg-red-50 text-red-700 border border-red-200" :
                        del.status === "PENDING" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {del.status}
                      </span>
                      {del.errorCode && (
                        <div className="text-red-500 font-mono text-[9px] mt-0.5" title={del.errorMessage}>
                          Error: {del.errorCode}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {del.status === "FAILED" && del.deviceIsSubscribed && (
                        <button
                          type="button"
                          disabled={retryingId === del.id}
                          onClick={() => handleRetryNotification(del.id)}
                          className="inline-flex items-center gap-1 px-2.5 h-8 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-sm active:scale-95 disabled:opacity-50 transition focus:outline-none"
                        >
                          {retryingId === del.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination controls */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex justify-between items-center text-xs text-gray-500 font-medium">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 h-8 border border-gray-200 hover:bg-white rounded-lg active:scale-95 disabled:opacity-50 transition"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 h-8 border border-gray-200 hover:bg-white rounded-lg active:scale-95 disabled:opacity-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
