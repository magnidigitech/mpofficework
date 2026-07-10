"use client";

import { useEffect, useState, useTransition, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  FileText, Calendar, Users, AlertCircle, Plus, CheckCircle2, Clock, 
  XCircle, Filter, Search, Shield, ChevronLeft, ChevronRight, BarChart2, 
  Layers, MapPin, Phone, HelpCircle, RefreshCw, Eye, MessageSquare, Trash, 
  AlertTriangle, Check, X, Award, SlidersHorizontal 
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

function TTDLettersDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();

  const VALID_TTD_TABS = ["dashboard", "requests", "quotas"] as const;
  type TTDTab = typeof VALID_TTD_TABS[number];
  const tabFromUrl = searchParams.get("tab") as TTDTab | null;
  const [activeTab, setActiveTab] = useState<TTDTab>(
    tabFromUrl && VALID_TTD_TABS.includes(tabFromUrl) ? tabFromUrl : "dashboard"
  );

  useEffect(() => {
    const t = searchParams.get("tab") as TTDTab | null;
    if (t && VALID_TTD_TABS.includes(t) && t !== activeTab) setActiveTab(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (tab: TTDTab) => {
    setActiveTab(tab);
    router.replace(`/ttd-letters?tab=${tab}`, { scroll: false });
  };

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
  const [sortBy, setSortBy] = useState("darshanDate");

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

  // Filter Modal state
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Temporary modal filter fields (applied when clicking "Apply Filters")
  const [tempSearchQuery, setTempSearchQuery] = useState("");
  const [tempStatusFilter, setTempStatusFilter] = useState("");
  const [tempVerFilter, setTempVerFilter] = useState("");
  const [tempDocFilter, setTempDocFilter] = useState("");
  const [tempQuotaFilter, setTempQuotaFilter] = useState("");
  const [tempSortBy, setTempSortBy] = useState("darshanDate");

  const hasActiveFilters = !!(searchQuery || statusFilter || verFilter || docFilter || quotaFilter);

  const openFilterModal = () => {
    setTempSearchQuery(searchQuery);
    setTempStatusFilter(statusFilter);
    setTempVerFilter(verFilter);
    setTempDocFilter(docFilter);
    setTempQuotaFilter(quotaFilter);
    setTempSortBy(sortBy);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setSearchQuery(tempSearchQuery);
    setStatusFilter(tempStatusFilter);
    setVerFilter(tempVerFilter);
    setDocFilter(tempDocFilter);
    setQuotaFilter(tempQuotaFilter);
    setSortBy(tempSortBy);
    setReqPage(1);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setVerFilter("");
    setDocFilter("");
    setQuotaFilter("");
    setSortBy("darshanDate");
    setReqPage(1);

    // Sync temp states
    setTempSearchQuery("");
    setTempStatusFilter("");
    setTempVerFilter("");
    setTempDocFilter("");
    setTempQuotaFilter("");
    setTempSortBy("darshanDate");

    setShowFilterModal(false);
    setTimeout(() => {
      fetchRequests();
    }, 50);
  };

  // Swipe to Refresh touch gesture states
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    
    if (diff > 0) {
      const dist = Math.min(diff * 0.4, 75);
      setPullDistance(dist);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    setIsPulling(false);
    
    if (pullDistance > 55) {
      setRefreshing(true);
      setPullDistance(30);
      try {
        await Promise.all([fetchMetrics(), fetchRequests(), fetchQuotas()]);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Load user roles
  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          const roles = profile.roles || [];
          setUserRoles(roles);
          const isOnlyScheduleViewer = roles.includes("Schedule Viewer") &&
            !roles.includes("Super Admin") &&
            !roles.includes("MP Office Admin") &&
            !roles.includes("Schedule Coordinator") &&
            !roles.includes("Social Media Team") &&
            !roles.includes("TTD Manager") &&
            !roles.includes("TTD Staff") &&
            !roles.includes("Field Staff") &&
            !roles.includes("Field Coordinator");
          if (isOnlyScheduleViewer) {
            router.replace("/schedule");
          }
        }
      } catch (err) {
        console.error("Failed to load user roles:", err);
      }
    }
    loadRoles();
  }, [router]);

  const isAdmin = 
    session?.user?.email === "admin@mpoffice.com" || 
    session?.user?.email === "admin@bhashyamramakrishna.in" || 
    userRoles.includes("Super Admin") || 
    userRoles.includes("MP Office Admin") || 
    userRoles.includes("TTD Manager");

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
        sortBy,
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
  }, [session, reqPage, statusFilter, verFilter, docFilter, quotaFilter, sortBy, searchQuery]);

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
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="min-h-screen relative"
      >
        {/* Pull to Refresh Indicator */}
        {(pullDistance > 0 || refreshing) && (
          <div 
            className="flex justify-center items-center transition-all duration-75 overflow-hidden w-full bg-transparent mb-4"
            style={{ height: `${pullDistance}px`, opacity: Math.min(pullDistance / 55, 1) }}
          >
            <div className="bg-white border border-gray-200 rounded-full py-1.5 px-3 shadow-md flex items-center gap-1.5 animate-bounce">
              <RefreshCw className={`w-3.5 h-3.5 text-primary ${refreshing || pullDistance > 55 ? "animate-spin" : ""}`} />
              <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-wide">
                {refreshing ? "Refreshing..." : pullDistance > 55 ? "Release to refresh" : "Pull down to refresh"}
              </span>
            </div>
          </div>
        )}

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/50 shadow-xs">
              <Award className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight font-sans">
              TTD VIP Letters
            </h1>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-sans">Manage VIP ticket allocations, verification reviews, and distributions</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-primary hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition text-xs focus:outline-none cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Request</span>
          </button>
          {activeTab === "requests" && (
            <div className="flex items-center gap-2">
              <button
                onClick={openFilterModal}
                className={`flex items-center justify-center p-2.5 border rounded-xl shadow-xs transition cursor-pointer focus:outline-none relative ${
                  hasActiveFilters
                    ? "bg-amber-50 border-amber-300 text-primary"
                    : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                }`}
                title="Filter Requests"
              >
                <Filter className="w-3.5 h-3.5" />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full border border-white"></span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center justify-center p-2.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition shadow-xs cursor-pointer focus:outline-none animate-fade-in"
                  title="Clear all filters"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="flex bg-gray-100/80 p-0.5 rounded-xl border border-gray-200/50 mb-6 max-w-lg shadow-xs">
        {[
          { id: "dashboard", label: "Dashboard" },
          { id: "requests", label: `Requests (${totalRequests})` },
          { id: "quotas", label: `Quotas (${quotas.length})` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg uppercase tracking-wider transition-all duration-150 cursor-pointer text-center ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-xs border border-gray-205 border-gray-200/25"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. TTD DASHBOARD TAB */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {loadingMetrics ? (
            <div className="text-center py-12 text-xs text-gray-500 font-sans">Loading dashboard metrics...</div>
          ) : (
            <>
              {/* Metrics cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Card 1: Available Letters */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-sm hover:-translate-y-0.5 transition duration-200">
                  <div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Available Letters</span>
                    <p className="text-xl font-black text-gray-900 mt-1">{metrics?.ttdQuotaAvailable || 0}</p>
                  </div>
                  <div className="p-2 bg-indigo-50/70 text-indigo-600 rounded-xl border border-indigo-100/50 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                </div>

                {/* Card 2: Distributed Slots */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-sm hover:-translate-y-0.5 transition duration-200">
                  <div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Distributed Slots</span>
                    <p className="text-xl font-black text-gray-900 mt-1">{metrics?.ttdQuotaUsed || 0}</p>
                  </div>
                  <div className="p-2 bg-emerald-50/70 text-emerald-600 rounded-xl border border-emerald-100/50 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                {/* Card 3: New Requests */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-sm hover:-translate-y-0.5 transition duration-200">
                  <div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">New Requests</span>
                    <p className="text-xl font-black text-gray-900 mt-1">{metrics?.ttdNewRequests || 0}</p>
                  </div>
                  <div className="p-2 bg-amber-50/70 text-amber-600 rounded-xl border border-amber-100/50 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>

                {/* Card 4: Verified Awaiting approval */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] hover:shadow-sm hover:-translate-y-0.5 transition duration-200">
                  <div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Awaiting Approval</span>
                    <p className="text-xl font-black text-gray-900 mt-1">{metrics?.ttdAwaitingApproval || 0}</p>
                  </div>
                  <div className="p-2 bg-purple-50/70 text-purple-600 rounded-xl border border-purple-100/50 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Warning notifications banner */}
              {metrics?.ttdLowQuotaWarning && (
                <div className="p-3.5 bg-red-50/50 border border-red-200/60 rounded-xl text-red-800 text-[11px] font-medium flex gap-3 items-center shadow-xs">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 animate-pulse" />
                  <span>
                    <strong className="font-bold">Low Ticket Quota Alert:</strong> The total available ticket letters count has dropped below 5. Register additional quota periods or request reallocation adjustments!
                  </span>
                </div>
              )}

              {/* Action Panels */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                <h2 className="text-xs font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-primary" /> Urgent Recommendation Actions
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="group bg-gray-50/40 hover:bg-gray-50 border border-gray-150 hover:border-gray-300 p-4.5 rounded-xl transition duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block border border-white shadow-xs shrink-0"></span>
                        <span>Requests Awaiting Verification ({metrics?.ttdNewRequests || 0})</span>
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-1 font-sans leading-relaxed">Review new walk-ins, phone calls, or referrals to verify identity documents and check duplicate warning logs.</p>
                    </div>
                    <button
                      onClick={() => { setStatusFilter("REQUESTED"); setActiveTab("requests"); }}
                      className="mt-4 inline-flex items-center gap-1 text-[11px] font-extrabold text-primary hover:text-amber-700 transition cursor-pointer"
                    >
                      <span>Process Pending Verification</span>
                      <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                    </button>
                  </div>

                  <div className="group bg-gray-50/40 hover:bg-gray-50 border border-gray-150 hover:border-gray-300 p-4.5 rounded-xl transition duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block border border-white shadow-xs shrink-0"></span>
                        <span>Awaiting Quota Approval ({metrics?.ttdAwaitingApproval || 0})</span>
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-1 font-sans leading-relaxed">Verified recommendations requiring quotaPeriod lock-in by Supervisors or Office Admins to reserve tickets.</p>
                    </div>
                    <button
                      onClick={() => { setStatusFilter("VERIFIED"); setActiveTab("requests"); }}
                      className="mt-4 inline-flex items-center gap-1 text-[11px] font-extrabold text-primary hover:text-amber-700 transition cursor-pointer"
                    >
                      <span>Approve Tickets</span>
                      <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
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
          {/* Filter options are now managed via the Filter Modal popup */}

          {/* List catalog entries */}
          {loadingRequests ? (
            <div className="text-center py-12 text-xs text-gray-500 font-sans">Loading request lists...</div>
          ) : requests.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-xs text-gray-400 font-bold font-sans">
              No matching TTD letter request records found.
            </div>
          ) : (
            <div className="space-y-3.5">
              {requests.map((req) => (
                <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-4.5 shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition duration-200 flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-4 flex-wrap pb-3.5 border-b border-gray-100/60">
                    <div>
                      <span className="text-[9px] font-bold uppercase text-gray-500 bg-gray-100 px-2 py-0.5 rounded">ID: {req.requestNumber}</span>
                      <h3 className="font-extrabold text-gray-900 text-sm mt-2">{req.applicantName}</h3>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{req.applicantMobile}</p>
                    </div>

                    <div className="flex flex-col gap-1.5 items-end">
                      <span className={`text-[9px] px-2 py-0.5 border rounded-full uppercase font-extrabold tracking-wide ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                      {req.letterNumber && (
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-150 px-1.5 py-0.5 rounded">Letter: {req.letterNumber}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-3.5 flex-wrap gap-2 text-xs text-gray-600">
                    <div className="flex gap-4 text-gray-500 font-sans font-medium text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>Darshan:</span> 
                        <span className="text-gray-800 font-bold">
                          {new Date(req.preferredDarshanDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "Asia/Kolkata",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                         <span>Pilgrims:</span> 
                        <span className="text-gray-800 font-bold">{req.numberOfMembers}</span>
                      </div>
                    </div>

                    <Link
                      href={`/ttd-letters/${req.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
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
                    className="p-2 border border-gray-200 bg-white rounded-lg disabled:opacity-40 hover:bg-gray-50 transition shadow-xs cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-700" />
                  </button>
                  <span className="text-xs font-bold text-gray-500">Page {reqPage} of {reqPages}</span>
                  <button
                    onClick={() => setReqPage(Math.min(reqPages, reqPage + 1))}
                    disabled={reqPage === reqPages}
                    className="p-2 border border-gray-200 bg-white rounded-lg disabled:opacity-40 hover:bg-gray-50 transition shadow-xs cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-700" />
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
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider font-sans">Quota Allocation Master</h2>
            {isAdmin && (
              <button
                onClick={() => setShowQuotaModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition focus:outline-none cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Allocate Period
              </button>
            )}
          </div>

          {loadingQuotas ? (
            <div className="text-center py-12 text-xs text-gray-500 font-sans">Loading quotas periods...</div>
          ) : quotas.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-xs text-gray-400 font-bold font-sans">
              No quota periods allocated. Click Allocate Period to add.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quotas.map((q) => {
                const av = q.allocatedLetters - q.reservedLetters - q.issuedLetters;
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition duration-200">
                    <div>
                      <div className="flex justify-between items-start mb-3.5">
                        <h3 className="font-extrabold text-gray-900 text-sm leading-tight">{q.name}</h3>
                        <span className={`text-[9px] px-2 py-0.5 border rounded-full uppercase font-extrabold tracking-wide ${
                          q.isActive ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {q.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="text-[11px] text-gray-500 space-y-1 font-sans font-semibold">
                        <p>
                          <span className="text-gray-400">Start:</span>{" "}
                          <span className="text-gray-700 font-bold">
                            {new Date(q.startDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "Asia/Kolkata",
                            })}
                          </span>
                        </p>
                        <p>
                          <span className="text-gray-400">End:</span>{" "}
                          <span className="text-gray-700 font-bold">
                            {new Date(q.endDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "Asia/Kolkata",
                            })}
                          </span>
                        </p>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Allocated</p>
                          <p className="text-sm font-black text-gray-800 mt-0.5">{q.allocatedLetters}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Reserved</p>
                          <p className="text-sm font-black text-sky-700 mt-0.5">{q.reservedLetters}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Available</p>
                          <p className="text-sm font-black text-emerald-700 mt-0.5">{av}</p>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                        <button
                          onClick={() => { setAdjustingQuotaId(q.id); setAdjustAllocated(q.allocatedLetters); }}
                          className="text-[10px] font-extrabold text-primary hover:underline flex items-center gap-1 cursor-pointer"
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
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateQuota} className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-gray-150 space-y-4 animate-slide-up">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Allocate TTD Quota Period</h3>

            {overlapError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-1.5 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{overlapError}</span>
              </div>
            )}

            <div className="flex flex-col text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Period Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. July First Half 2026"
                value={quotaName}
                onChange={(e) => setQuotaName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={quotaStart}
                  onChange={(e) => setQuotaStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={quotaEnd}
                  onChange={(e) => setQuotaEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold"
                />
              </div>
            </div>

            <div className="flex flex-col text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Allocated Letters *</label>
              <input
                type="number"
                required
                min={1}
                value={quotaAllocated}
                onChange={(e) => setQuotaAllocated(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold"
              />
            </div>

            <div className="flex flex-col text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Internal Notes</label>
              <textarea
                placeholder="Add allotment directives or guidelines..."
                value={quotaNotes}
                onChange={(e) => setQuotaNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold min-h-[60px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-1.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 bg-primary hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs focus:outline-none cursor-pointer"
              >
                Submit Period
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual adjustments popup */}
      {adjustingQuotaId && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAdjustQuota} className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-gray-150 space-y-4 animate-slide-up">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Manual Quota Adjustment</h3>

            {adjustError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-1.5 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="flex flex-col text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">New Allocation Capacity *</label>
              <input
                type="number"
                required
                min={0}
                value={adjustAllocated}
                onChange={(e) => setAdjustAllocated(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs font-sans font-semibold"
              />
            </div>

            <div className="flex flex-col text-xs">
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Mandatory Correction Reason *</label>
              <textarea
                required
                placeholder="e.g. Corrected quota mistake after office reallocation."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs min-h-[70px] font-sans font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAdjustingQuotaId(null)}
                className="px-4 py-1.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !adjustReason.trim()}
                className="px-4 py-1.5 bg-primary hover:bg-amber-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 shadow-xs focus:outline-none cursor-pointer"
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

      {/* Filter Modal Popup */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setShowFilterModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100 animate-slide-up space-y-4 z-50">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-primary" />
                <span>Filter TTD Requests</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Search Keywords</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search applicant name, mobile, or request ID..."
                    value={tempSearchQuery}
                    onChange={(e) => setTempSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-9 w-full rounded-xl border border-gray-200 focus:outline-none focus:border-primary font-sans font-medium text-gray-900"
                  />
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Overall Status</label>
                  <select
                    value={tempStatusFilter}
                    onChange={(e) => setTempStatusFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2.5 h-9 bg-white focus:outline-none focus:border-primary font-sans font-medium cursor-pointer text-gray-900"
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
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Verification Status</label>
                  <select
                    value={tempVerFilter}
                    onChange={(e) => setTempVerFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2.5 h-9 bg-white focus:outline-none focus:border-primary font-sans font-medium cursor-pointer text-gray-900"
                  >
                    <option value="">All Verification</option>
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Documents Status</label>
                  <select
                    value={tempDocFilter}
                    onChange={(e) => setTempDocFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2.5 h-9 bg-white focus:outline-none focus:border-primary font-sans font-medium cursor-pointer text-gray-900"
                  >
                    <option value="">All Documents</option>
                    <option value="NOT_SUBMITTED">Not Submitted</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="COMPLETE">Complete</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Quota Period</label>
                  <select
                    value={tempQuotaFilter}
                    onChange={(e) => setTempQuotaFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2.5 h-9 bg-white focus:outline-none focus:border-primary font-sans font-medium cursor-pointer text-gray-900"
                  >
                    <option value="">All Quotas</option>
                    {quotas.map((q) => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Sorting Order</label>
                <select
                  value={tempSortBy}
                  onChange={(e) => setTempSortBy(e.target.value)}
                  className="text-xs border border-gray-200 rounded-xl px-2.5 h-9 bg-white focus:outline-none focus:border-primary font-sans font-medium cursor-pointer text-gray-900"
                >
                  <option value="darshanDate">Sort by Date</option>
                  <option value="idNewest">Sort by ID (New first)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100 flex-wrap gap-2">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="px-4 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition focus:outline-none cursor-pointer disabled:opacity-40"
              >
                Clear All
              </button>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="px-5 py-2 bg-primary hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs focus:outline-none cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageLayout>
  );
}

export default function TTDLettersDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-gray-500 font-medium font-sans">Loading TTD dashboard...</p>
        </div>
      </div>
    }>
      <TTDLettersDashboardContent />
    </Suspense>
  );
}
