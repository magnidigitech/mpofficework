"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  FileText, Calendar, CheckSquare, Share2, Award, Users, Search, 
  Download, Printer, ChevronLeft, ChevronRight, Loader2, AlertCircle, Sparkles, Filter, Shield
} from "lucide-react";

function ReportsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();

  const VALID_REPORT_TABS = ["schedules", "checklists", "social-media", "ttd/requests", "ttd/quotas", "staff-activity"];
  const tabFromUrl = searchParams.get("tab") ?? "schedules";
  const [activeTab, setActiveTab] = useState(
    VALID_REPORT_TABS.includes(tabFromUrl) ? tabFromUrl : "schedules"
  );

  // Sync tab when URL changes
  useEffect(() => {
    const t = searchParams.get("tab") ?? "schedules";
    if (VALID_REPORT_TABS.includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setReportData(null);
    setPage(1);
    router.replace(`/reports?tab=${tabId}`, { scroll: false });
  };

  // Filter states
  const [datePreset, setDatePreset] = useState("this_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);

  // Available staff list (for filters)
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => {
    fetchStaff();
    async function checkAdmin() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          const roles = profile.roles || [];
          const isAdm = roles.includes("Super Admin") || roles.includes("MP Office Admin");
          if (isAdm) {
            setIsAdmin(true);
          }
          const isScheduleViewerOnly = roles.includes("Schedule Viewer") &&
            !isAdm &&
            !roles.includes("Schedule Coordinator") &&
            !roles.includes("Social Media Team") &&
            !roles.includes("TTD Manager") &&
            !roles.includes("TTD Staff") &&
            !roles.includes("Field Staff") &&
            !roles.includes("Field Coordinator");
          if (isScheduleViewerOnly) {
            router.replace("/schedule");
          }
        }
      } catch (e) {}
    }
    checkAdmin();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchReport();
  }, [activeTab, datePreset, startDate, endDate, status, category, searchQuery]);

  useEffect(() => {
    fetchReport();
  }, [page]);

  const fetchStaff = async () => {
    try {
      const res = await fetch("/api/admin/users?limit=100");
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load staff list:", err);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = `/api/reports/${activeTab}`;
      if (activeTab === "ttd/requests") {
        endpoint = "/api/reports/ttd/requests";
      } else if (activeTab === "ttd/quotas") {
        endpoint = "/api/reports/ttd/quotas";
      }

      const params = new URLSearchParams({
        datePreset,
        startDate,
        endDate,
        status,
        category,
        query: searchQuery,
        page: String(page),
        limit: "10"
      });

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to retrieve report data.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    let endpoint = `/api/reports/${activeTab}/export.xlsx`;
    if (activeTab === "ttd/requests") {
      endpoint = "/api/reports/ttd/requests/export.xlsx";
    } else if (activeTab === "ttd/quotas") {
      endpoint = "/api/reports/ttd/quotas/export.xlsx";
    }

    const params = new URLSearchParams({
      datePreset,
      startDate,
      endDate,
      status,
      category,
      query: searchQuery,
    });

    window.open(`${endpoint}?${params.toString()}`, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResetFilters = () => {
    setDatePreset("this_month");
    setStartDate("");
    setEndDate("");
    setStatus("");
    setCategory("");
    setSearchQuery("");
  };

  // Render metrics summary cards
  const renderMetrics = () => {
    if (!reportData?.metrics && !reportData?.summaryTotals) return null;

    if (activeTab === "schedules") {
      const m = reportData.metrics;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Schedules</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{m.totalSchedules}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Completed Visits</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{m.completed}</p>
          </div>
          <div className="bg-blue-50 p-4 border border-blue-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Upcoming Tours</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{m.upcoming}</p>
          </div>
          <div className="bg-amber-50 p-4 border border-amber-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider font-semibold">Checklist Avg</p>
            <p className="text-xl font-bold text-amber-800 mt-1">{m.checklistCompletionRate}%</p>
          </div>
        </div>
      );
    }

    if (activeTab === "checklists") {
      const m = reportData.metrics;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Checklist Items</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{m.totalChecklistItems}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Completed Items</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{m.completed}</p>
          </div>
          <div className="bg-rose-50 p-4 border border-rose-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Mandatory Pending</p>
            <p className="text-xl font-bold text-rose-800 mt-1">{m.mandatoryPending}</p>
          </div>
          <div className="bg-amber-50 p-4 border border-amber-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Overall Pending</p>
            <p className="text-xl font-bold text-amber-800 mt-1">{m.pending}</p>
          </div>
        </div>
      );
    }

    if (activeTab === "social-media") {
      const m = reportData.metrics;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SM Required Visits</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{m.totalRequired}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Fully Published</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{m.fullyPublished}</p>
          </div>
          <div className="bg-blue-50 p-4 border border-blue-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Awaiting Approval</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{m.waitingApproval}</p>
          </div>
          <div className="bg-rose-50 p-4 border border-rose-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Media Pending</p>
            <p className="text-xl font-bold text-rose-800 mt-1">{m.mediaPending}</p>
          </div>
        </div>
      );
    }

    if (activeTab === "ttd/requests") {
      const m = reportData.metrics;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Letter Requests</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{m.totalLetters}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Distributed Letters</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{m.distributed}</p>
          </div>
          <div className="bg-blue-50 p-4 border border-blue-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Quota Reserved</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{m.approved}</p>
          </div>
          <div className="bg-amber-50 p-4 border border-amber-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Total Traveling Members</p>
            <p className="text-xl font-bold text-amber-800 mt-1">{m.totalTravellers}</p>
          </div>
        </div>
      );
    }

    if (activeTab === "ttd/quotas") {
      const m = reportData.metrics;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Allocated Slots</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{m.totalAllocated}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-semibold">Available Slots</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{m.totalAvailable}</p>
          </div>
          <div className="bg-blue-50 p-4 border border-blue-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Issued Letters</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{m.totalIssued}</p>
          </div>
          <div className="bg-rose-50 p-4 border border-rose-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Quota Anomalies</p>
            <p className="text-xl font-bold text-rose-800 mt-1">{m.inconsistentCount}</p>
          </div>
        </div>
      );
    }

    if (activeTab === "staff-activity") {
      const st = reportData.summaryTotals;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Schedules Added</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{st.schedulesCreated}</p>
          </div>
          <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Checklists Solved</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{st.checklistCompleted}</p>
          </div>
          <div className="bg-blue-50 p-4 border border-blue-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider font-semibold">TTD Requests Added</p>
            <p className="text-xl font-bold text-blue-800 mt-1">{st.ttdRequestsCreated}</p>
          </div>
          <div className="bg-amber-50 p-4 border border-amber-100 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Letters Distributed</p>
            <p className="text-xl font-bold text-amber-800 mt-1">{st.lettersDistributed}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <PageLayout>
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-700" />
            <span>Operational Reports</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">Review live metrics summaries, generate exports, and download printable logs.</p>
        </div>

        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/audit")}
              className="flex items-center gap-1.5 h-10 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg shadow-sm text-xs transition active:scale-95 focus:outline-none cursor-pointer"
            >
              <Shield className="w-4 h-4 text-amber-500" />
              <span>Security Audit Center</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 h-10 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm text-xs transition active:scale-95 focus:outline-none cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 h-10 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg text-xs transition active:scale-95 focus:outline-none cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto gap-2 mb-6 scrollbar-thin">
        {[
          { id: "schedules", label: "Tour Schedules", icon: Calendar },
          { id: "checklists", label: "Checklists", icon: CheckSquare },
          { id: "social-media", label: "Social Media", icon: Share2 },
          { id: "ttd/requests", label: "TTD Darshan", icon: Award },
          { id: "ttd/quotas", label: "TTD Quotas", icon: Award },
          { id: "staff-activity", label: "Staff Activity", icon: Users },
        ].map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 py-3 px-4 font-bold text-xs border-b-2 transition whitespace-nowrap focus:outline-none ${
                isActive 
                  ? "border-emerald-700 text-emerald-800" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <IconComp className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-emerald-700" />
          <span>Report Constraints Filters</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Date Interval</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="previous_month">Previous Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {datePreset === "custom" && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700"
            >
              <option value="">All Statuses</option>
              {activeTab === "schedules" && (
                <>
                  <option value="DRAFT">Draft</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </>
              )}
              {activeTab === "checklists" && (
                <>
                  <option value="completed">Completed Only</option>
                  <option value="pending">Pending Only</option>
                </>
              )}
              {activeTab === "social-media" && (
                <>
                  <option value="MEDIA_PENDING">Media Pending</option>
                  <option value="DRAFTING">Drafting</option>
                  <option value="WAITING_FOR_APPROVAL">Awaiting Approval</option>
                  <option value="PUBLISHED">Fully Published</option>
                </>
              )}
              {activeTab === "ttd/requests" && (
                <>
                  <option value="REQUESTED">Requested</option>
                  <option value="QUOTA_RESERVED">Quota Reserved</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DISTRIBUTED">Distributed</option>
                  <option value="REJECTED">Rejected</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Keywords</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search report items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-emerald-700 pl-8"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 text-xs">
          <button
            onClick={handleResetFilters}
            className="px-4 h-9 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Metrics overview */}
      {renderMetrics()}

      {/* Data display Area */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
          <p className="text-xs text-gray-500 mt-2 font-medium">Running query database filters...</p>
        </div>
      ) : !reportData || (activeTab === "schedules" && reportData.schedules?.length === 0) ||
          (activeTab === "checklists" && reportData.items?.length === 0) ||
          (activeTab === "social-media" && reportData.updates?.length === 0) ||
          (activeTab === "ttd/requests" && reportData.requests?.length === 0) ||
          (activeTab === "ttd/quotas" && reportData.quotaPeriods?.length === 0) ||
          (activeTab === "staff-activity" && reportData.report?.length === 0) ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-sm text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <h4 className="font-bold text-gray-900 text-sm">No report rows found</h4>
          <p className="text-xs text-gray-500 mt-0.5">Modify date filters or query constraints to load data.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" id="print-area">
          {/* Printable Header */}
          <div className="hidden print:block p-6 border-b border-gray-200 text-center">
            <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">MP Office Hyderabad Reports Portal</h2>
            <p className="text-xs text-gray-500 mt-1">Generated At: {new Date().toLocaleString("en-IN")} | Preset: {datePreset}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 font-bold text-gray-500 uppercase tracking-wider">
                  {activeTab === "schedules" && (
                    <>
                      <th className="p-4">Tour Date</th>
                      <th className="p-4">Title</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Location/Venue</th>
                      <th className="p-4">Organizer</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Assigned Staff</th>
                    </>
                  )}
                  {activeTab === "checklists" && (
                    <>
                      <th className="p-4">Schedule/Visit</th>
                      <th className="p-4">Checklist Item</th>
                      <th className="p-4">Section</th>
                      <th className="p-4">Mandatory</th>
                      <th className="p-4">Assigned</th>
                      <th className="p-4">State</th>
                      <th className="p-4">Remarks</th>
                    </>
                  )}
                  {activeTab === "social-media" && (
                    <>
                      <th className="p-4">Schedule</th>
                      <th className="p-4">Event Date</th>
                      <th className="p-4">Staff</th>
                      <th className="p-4">Workflow Status</th>
                      <th className="p-4">Platforms & Statuses</th>
                    </>
                  )}
                  {activeTab === "ttd/requests" && (
                    <>
                      <th className="p-4">Ref No.</th>
                      <th className="p-4">Applicant</th>
                      <th className="p-4">Mobile</th>
                      <th className="p-4">Members</th>
                      <th className="p-4">District/Constituency</th>
                      <th className="p-4">Darshan Date</th>
                      <th className="p-4">Status</th>
                    </>
                  )}
                  {activeTab === "ttd/quotas" && (
                    <>
                      <th className="p-4">Quota Period</th>
                      <th className="p-4">Date Range</th>
                      <th className="p-4">Allocated</th>
                      <th className="p-4">Reserved</th>
                      <th className="p-4">Issued</th>
                      <th className="p-4">Available</th>
                      <th className="p-4">State</th>
                    </>
                  )}
                  {activeTab === "staff-activity" && (
                    <>
                      <th className="p-4">Code</th>
                      <th className="p-4">Name</th>
                      <th className="p-4">Department</th>
                      <th className="p-4">Tours Created/Updated</th>
                      <th className="p-4">Checklists Completed</th>
                      <th className="p-4">TTD Requests Added</th>
                      <th className="p-4">Letters Prepared</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700">
                {activeTab === "schedules" && reportData.schedules.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-medium">{new Date(row.startAt).toLocaleDateString("en-IN")}</td>
                    <td className="p-4 font-bold text-gray-900">{row.title}</td>
                    <td className="p-4">{row.category}</td>
                    <td className="p-4">{row.venue}</td>
                    <td className="p-4">{row.organizerName}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        row.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        row.status === "CANCELLED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500">{row.assignedStaff}</td>
                  </tr>
                ))}
                {activeTab === "checklists" && reportData.items.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-gray-900">{row.scheduleTitle}</td>
                    <td className="p-4 font-semibold">{row.title}</td>
                    <td className="p-4 text-gray-500">{row.section}</td>
                    <td className="p-4">{row.isMandatory ? "YES" : "NO"}</td>
                    <td className="p-4 text-gray-500">{row.assignedStaffName}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        row.isCompleted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {row.isCompleted ? "COMPLETED" : "PENDING"}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 italic">{row.remarks}</td>
                  </tr>
                ))}
                {activeTab === "social-media" && reportData.updates.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-gray-900">{row.scheduleTitle}</td>
                    <td className="p-4">{new Date(row.eventDate).toLocaleDateString("en-IN")}</td>
                    <td className="p-4">{row.assignedStaffName}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="space-y-1">
                        {row.posts.map((p: any, idx: number) => (
                          <div key={idx} className="flex gap-2">
                            <span className="font-bold text-emerald-800">[{p.platform}]</span>
                            <span className="text-gray-400">({p.status})</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {activeTab === "ttd/requests" && reportData.requests.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-emerald-800">{row.requestNumber}</td>
                    <td className="p-4 font-bold text-gray-900">{row.applicantName}</td>
                    <td className="p-4 text-gray-500 font-mono">{row.applicantMobile}</td>
                    <td className="p-4 text-center font-semibold">{row.numberOfMembers}</td>
                    <td className="p-4">{`${row.district} / ${row.constituency}`}</td>
                    <td className="p-4">{new Date(row.preferredDarshanDate).toLocaleDateString("en-IN")}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        row.status === "DISTRIBUTED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        row.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {activeTab === "ttd/quotas" && reportData.quotaPeriods.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-gray-900">{row.name}</td>
                    <td className="p-4">
                      {`${new Date(row.startAt).toLocaleDateString("en-IN")} - ${new Date(row.endAt).toLocaleDateString("en-IN")}`}
                    </td>
                    <td className="p-4 text-center font-bold">{row.allocatedLetters}</td>
                    <td className="p-4 text-center text-blue-600 font-semibold">{row.reservedLetters}</td>
                    <td className="p-4 text-center text-emerald-600 font-semibold">{row.issuedLetters}</td>
                    <td className="p-4 text-center font-bold bg-gray-50">
                      {row.availableLetters}
                      {row.isInconsistent && (
                        <span className="ml-1 text-red-500" title="Counter discrepancy detected!">*</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {row.isActive ? "ACTIVE" : "EXPIRED"}
                      </span>
                    </td>
                  </tr>
                ))}
                {activeTab === "staff-activity" && reportData.report.map((row: any) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-mono font-bold text-gray-900">{row.employeeCode}</td>
                    <td className="p-4 font-bold text-emerald-800">{row.name}</td>
                    <td className="p-4">{row.department}</td>
                    <td className="p-4 text-center font-semibold">{row.metrics.schedulesCreated + row.metrics.schedulesUpdated}</td>
                    <td className="p-4 text-center font-semibold">{row.metrics.checklistCompleted}</td>
                    <td className="p-4 text-center font-semibold">{row.metrics.ttdRequestsCreated}</td>
                    <td className="p-4 text-center font-semibold">{row.metrics.lettersPrepared}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {reportData.pagination && reportData.pagination.totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">
                Showing Page {page} of {reportData.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-white active:scale-95 disabled:opacity-50 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  type="button"
                  disabled={page >= reportData.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-white active:scale-95 disabled:opacity-50 transition"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Embedded print overrides */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-area, #print-area * {
            visibility: visible !important;
          }
          #print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </PageLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-gray-500 font-medium font-sans">Loading reports...</p>
        </div>
      </div>
    }>
      <ReportsPageContent />
    </Suspense>
  );
}
