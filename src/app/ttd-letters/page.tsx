"use client";

import { useEffect, useState, useTransition } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  FileText, Calendar, Users, AlertCircle, Plus, CheckCircle2, Clock, 
  XCircle, Filter, Search, Shield, ChevronLeft, ChevronRight, BarChart2, 
  Layers, MapPin, Phone, HelpCircle, RefreshCw, Eye, MessageSquare, Trash, 
  AlertTriangle, Check, X 
} from "lucide-react";
import Link from "next/link";
import { TtdRequestModal } from "@/components/TtdRequestModal";

interface QuotaPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  allocatedLetters: number;
  reservedLetters: number;
  issuedLetters: number;
  isActive: boolean;
  notes?: string | null;
}

interface TTDRequestListEntry {
  id: string;
  requestNumber: string;
  applicantName: string;
  applicantMobile: string;
  preferredDarshanDate: string;
  numberOfMembers: number;
  sourceType: string;
  status: string;
  verificationStatus: string;
  documentsStatus: string;
  createdAt: string;
  letterNumber?: string | null;
  quotaPeriod?: { name: string } | null;
}

export default function TTDLettersDashboard() {
  const { data: session } = authClient.useSession();
  const [activeTab, setActiveTab] = useState<"dashboard" | "requests" | "quotas">("dashboard");
  const [isPending, startTransition] = useTransition();
  const [showAddModal, setShowAddModal] = useState(false);

  // Metrics states
  const [metrics, setMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Requests States
  const [requests, setRequests] = useState<TTDRequestListEntry[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [reqPage, setReqPage] = useState(1);
  const [reqPages, setReqPages] = useState(1);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [verFilter, setVerFilter] = useState("");
  const [docFilter, setDocFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [quotaFilter, setQuotaFilter] = useState("");

  // Quotas States
  const [quotas, setQuotas] = useState<QuotaPeriod[]>([]);
  const [loadingQuotas, setLoadingQuotas] = useState(true);

  // Create Quota Modal State
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaName, setQuotaName] = useState("");
  const [quotaStart, setQuotaStart] = useState("");
  const [quotaEnd, setQuotaEnd] = useState("");
  const [quotaAllocated, setQuotaAllocated] = useState(10);
  const [quotaNotes, setQuotaNotes] = useState("");
  const [quotaIsActive, setQuotaIsActive] = useState(true);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // Adjust Quota State
  const [adjustingQuotaId, setAdjustingQuotaId] = useState<string | null>(null);
  const [adjustAllocated, setAdjustAllocated] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const isAdmin = session?.user?.email === "admin@mpoffice.com";

  const fetchMetrics = async () => {
    try {
      setLoadingMetrics(true);
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setMetrics(body.metrics || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const params = new URLSearchParams({
        page: reqPage.toString(),
        limit: "10",
      });
      if (statusFilter) params.append("status", statusFilter);
      if (verFilter) params.append("verificationStatus", verFilter);
      if (docFilter) params.append("documentsStatus", docFilter);
      if (searchQuery) params.append("query", searchQuery);
      if (quotaFilter) params.append("quotaPeriodId", quotaFilter);

      const res = await fetch(`/api/ttd/requests?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setRequests(body.requests || []);
        setTotalRequests(body.pagination?.total || 0);
        setReqPages(body.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchQuotas = async () => {
    try {
      setLoadingQuotas(true);
      const res = await fetch("/api/ttd/quotas", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setQuotas(body);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuotas(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchMetrics();
      fetchQuotas();
    }
  }, [session]);

  useEffect(() => {
    if (session?.user) {
      fetchRequests();
    }
  }, [session, reqPage, statusFilter, verFilter, docFilter, quotaFilter]);

  // Handle create quota period
  const handleCreateQuota = (e: React.FormEvent) => {
    e.preventDefault();
    setOverlapError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/ttd/quotas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: quotaName,
            startDate: quotaStart,
            endDate: quotaEnd,
            allocatedLetters: quotaAllocated,
            isActive: quotaIsActive,
            notes: quotaNotes,
          }),
        });

        if (res.ok) {
          setShowQuotaModal(false);
          setQuotaName("");
          setQuotaStart("");
          setQuotaEnd("");
          setQuotaNotes("");
          await fetchQuotas();
          await fetchMetrics();
        } else {
          const errData = await res.json();
          setOverlapError(errData.error || "Failed to create quota period");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Adjust existing quota period
  const handleAdjustQuota = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);

    if (!adjustingQuotaId) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/ttd/quotas/${adjustingQuotaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allocatedLetters: adjustAllocated,
            adjustmentReason: adjustReason,
          }),
        });

        if (res.ok) {
          setAdjustingQuotaId(null);
          setAdjustReason("");
          await fetchQuotas();
          await fetchMetrics();
        } else {
          const errData = await res.json();
          setAdjustError(errData.error || "Failed to adjust quota allocation.");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DISTRIBUTED":
      case "USED":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "QUOTA_RESERVED":
      case "LETTER_PREPARED":
        return "bg-sky-50 text-sky-800 border-sky-200";
      case "VERIFIED":
        return "bg-purple-50 text-purple-800 border-purple-200";
      case "REJECTED":
      case "CANCELLED":
      case "EXPIRED":
        return "bg-red-50 text-red-800 border-red-200";
      default:
        return "bg-amber-50 text-amber-800 border-amber-200";
    }
  };

  return (
    <PageLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans">TTD VIP Recommendation Letters</h1>
          <p className="text-xs text-gray-500 mt-1">Manage ticket allocations, verification reviews, and letter distributions</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
          <button
            onClick={async () => {
              await Promise.all([fetchMetrics(), fetchRequests(), fetchQuotas()]);
            }}
            className="flex items-center justify-center gap-2 px-4.5 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-md shadow-sm transition text-sm w-full md:w-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync / Refresh</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4.5 py-2.5 bg-primary hover:bg-amber-700 text-white font-medium rounded-md shadow-sm transition text-sm w-full md:w-auto cursor-pointer focus:outline-none"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 bg-white p-1 rounded-lg shadow-sm">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${
            activeTab === "dashboard" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          TTD Dashboard
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${
            activeTab === "requests" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Requests Catalog ({totalRequests})
        </button>
        <button
          onClick={() => setActiveTab("quotas")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md transition ${
            activeTab === "quotas" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Quotas Period ({quotas.length})
        </button>
      </div>

      {/* 1. TTD DASHBOARD TAB */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {loadingMetrics ? (
            <div className="text-center py-12 text-sm text-gray-500 font-sans">Loading dashboard metrics...</div>
          ) : (
            <>
              {/* Metrics cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Available Letters</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{metrics?.ttdQuotaAvailable || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase">Distributed Slots</p>
                  <p className="text-2xl font-black text-emerald-700 mt-1">{metrics?.ttdQuotaUsed || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-amber-500 uppercase">New Requests</p>
                  <p className="text-2xl font-black text-amber-700 mt-1">{metrics?.ttdNewRequests || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-purple-500 uppercase">Verified Awaiting approval</p>
                  <p className="text-2xl font-black text-purple-700 mt-1">{metrics?.ttdAwaitingApproval || 0}</p>
                </div>
              </div>

              {/* Warning notifications banner */}
              {metrics?.ttdLowQuotaWarning && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-center">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span><strong>Low Ticket Quota Alert:</strong> The total available ticket letters count has dropped below 5. Register additional quota periods or request reallocation adjustments!</span>
                </div>
              )}

              {/* Urgent checklists list */}
              <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-primary" /> Urgent Recommendation Actions
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-bold text-gray-700 mb-2.5">Requests Awaiting Verification ({metrics?.ttdNewRequests || 0})</h3>
                    <p className="text-xs text-gray-400">Review new walk-ins, phone calls, or referrals to verify identity documents and check duplicate warning logs.</p>
                    <button
                      onClick={() => { setActiveTab("requests"); setStatusFilter("REQUESTED"); }}
                      className="mt-3.5 inline-block text-xs font-bold text-primary hover:underline"
                    >
                      Process Pending Verification &rarr;
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-gray-700 mb-2.5">Awaiting Quota Approval ({metrics?.ttdAwaitingApproval || 0})</h3>
                    <p className="text-xs text-gray-400">Verified recommendations requiring quotaPeriod lock-in by Supervisors or Office Admins to reserve tickets.</p>
                    <button
                      onClick={() => { setActiveTab("requests"); setStatusFilter("VERIFIED"); }}
                      className="mt-3.5 inline-block text-xs font-bold text-primary hover:underline"
                    >
                      Approve Tickets &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. REQUESTS CATALOG TAB */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search applicant name, mobile number, or request ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-10 w-full"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>
              <button
                onClick={fetchRequests}
                className="px-4 bg-primary hover:bg-amber-700 text-white rounded text-xs font-bold transition h-10"
              >
                Search
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setReqPage(1); }}
                className="text-xs border border-gray-200 rounded px-2 h-9 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="REQUESTED">Requested</option>
                <option value="UNDER_VERIFICATION">Under Verification</option>
                <option value="DOCUMENTS_PENDING">Documents Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="QUOTA_RESERVED">Quota Reserved</option>
                <option value="LETTER_PREPARED">Letter Prepared</option>
                <option value="DISTRIBUTED">Distributed</option>
                <option value="USED">Used</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </select>

              <select
                value={verFilter}
                onChange={(e) => { setVerFilter(e.target.value); setReqPage(1); }}
                className="text-xs border border-gray-200 rounded px-2 h-9 bg-white"
              >
                <option value="">Verification Status</option>
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="VERIFIED">Verified</option>
                <option value="FAILED">Failed</option>
              </select>

              <select
                value={docFilter}
                onChange={(e) => { setDocFilter(e.target.value); setReqPage(1); }}
                className="text-xs border border-gray-200 rounded px-2 h-9 bg-white"
              >
                <option value="">Documents Status</option>
                <option value="NOT_SUBMITTED">Not Submitted</option>
                <option value="PARTIAL">Partial</option>
                <option value="COMPLETE">Complete</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={quotaFilter}
                onChange={(e) => { setQuotaFilter(e.target.value); setReqPage(1); }}
                className="text-xs border border-gray-200 rounded px-2 h-9 bg-white"
              >
                <option value="">Quota Period</option>
                {quotas.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* List catalog entries */}
          {loadingRequests ? (
            <div className="text-center py-12 text-sm text-gray-500 font-sans">Loading request lists...</div>
          ) : requests.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg p-12 text-center text-xs text-gray-400">
              No matching TTD letter request records found.
            </div>
          ) : (
            <div className="space-y-3.5">
              {requests.map((req) => (
                <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-4 flex-wrap pb-3.5 border-b border-gray-50">
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400">ID: {req.requestNumber}</span>
                      <h3 className="font-bold text-gray-950 text-sm mt-1">{req.applicantName}</h3>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{req.applicantMobile}</p>
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      <span className={`text-[10px] px-2 py-0.5 border rounded uppercase font-black ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                      {req.letterNumber && (
                        <span className="text-[9px] font-semibold text-gray-500">Letter: {req.letterNumber}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-3.5 flex-wrap gap-2 text-xs">
                    <div className="flex gap-4 text-gray-600">
                      <div>
                        <span className="font-semibold">Darshan:</span> {new Date(req.preferredDarshanDate).toLocaleDateString("en-IN")}
                      </div>
                      <div>
                        <span className="font-semibold">Pilgrims:</span> {req.numberOfMembers}
                      </div>
                    </div>

                    <Link
                      href={`/ttd-letters/${req.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded text-xs font-bold transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Review Details</span>
                    </Link>
                  </div>
                </div>
              ))}

              {/* Pagination controls */}
              {reqPages > 1 && (
                <div className="flex justify-between items-center pt-4">
                  <button
                    onClick={() => setReqPage(Math.max(1, reqPage - 1))}
                    disabled={reqPage === 1}
                    className="p-2 border border-gray-200 bg-white rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-500">Page {reqPage} of {reqPages}</span>
                  <button
                    onClick={() => setReqPage(Math.min(reqPages, reqPage + 1))}
                    disabled={reqPage === reqPages}
                    className="p-2 border border-gray-200 bg-white rounded disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. QUOTAS PERIOD TAB */}
      {activeTab === "quotas" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-900 uppercase">Quota Allocation Master</h2>
            {isAdmin && (
              <button
                onClick={() => setShowQuotaModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-amber-700 text-white rounded text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Allocate Period
              </button>
            )}
          </div>

          {loadingQuotas ? (
            <div className="text-center py-12 text-sm text-gray-500 font-sans">Loading quotas periods...</div>
          ) : quotas.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg p-12 text-center text-xs text-gray-400">
              No quota periods allocated. Click Allocate Period to add.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quotas.map((q) => {
                const av = q.allocatedLetters - q.reservedLetters - q.issuedLetters;
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-bold text-gray-950 text-sm">{q.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 border rounded uppercase font-black ${
                          q.isActive ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {q.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Start: {new Date(q.startDate).toLocaleDateString("en-IN")}</p>
                        <p>End: {new Date(q.endDate).toLocaleDateString("en-IN")}</p>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Allocated</p>
                          <p className="text-sm font-black text-gray-800 mt-0.5">{q.allocatedLetters}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Reserved</p>
                          <p className="text-sm font-black text-sky-700 mt-0.5">{q.reservedLetters}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase">Available</p>
                          <p className="text-sm font-black text-emerald-700 mt-0.5">{av}</p>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="mt-5 pt-3.5 border-t border-gray-50 flex justify-end">
                        <button
                          onClick={() => { setAdjustingQuotaId(q.id); setAdjustAllocated(q.allocatedLetters); }}
                          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          Manual Adjustment
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Quota Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateQuota} className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg border border-gray-100 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Allocate TTD Quota Period</h3>

            {overlapError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex gap-1 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{overlapError}</span>
              </div>
            )}

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Period Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. July First Half 2026"
                value={quotaName}
                onChange={(e) => setQuotaName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={quotaStart}
                  onChange={(e) => setQuotaStart(e.target.value)}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={quotaEnd}
                  onChange={(e) => setQuotaEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Allocated Letters *</label>
              <input
                type="number"
                required
                min={1}
                value={quotaAllocated}
                onChange={(e) => setQuotaAllocated(parseInt(e.target.value))}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Internal Notes</label>
              <textarea
                placeholder="Add allotment directives or guidelines..."
                value={quotaNotes}
                onChange={(e) => setQuotaNotes(e.target.value)}
                className="text-xs border border-gray-200 rounded p-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-primary hover:bg-amber-700 text-white rounded text-xs font-semibold"
              >
                Submit Period
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual adjustments popup */}
      {adjustingQuotaId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdjustQuota} className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Manual Quota Adjustment</h3>

            {adjustError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex gap-1 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">New Allocation Capacity *</label>
              <input
                type="number"
                required
                min={0}
                value={adjustAllocated}
                onChange={(e) => setAdjustAllocated(parseInt(e.target.value))}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Mandatory Correction Reason *</label>
              <textarea
                required
                placeholder="e.g. Corrected quota mistake after office reallocation."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="text-xs border border-gray-200 rounded p-2 min-h-[70px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingQuotaId(null)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !adjustReason.trim()}
                className="px-4 py-2 bg-primary hover:bg-amber-700 text-white rounded text-xs font-semibold disabled:opacity-40"
              >
                Save Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      <TtdRequestModal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        onSave={() => fetchRequests()} 
      />
    </PageLayout>
  );
}
