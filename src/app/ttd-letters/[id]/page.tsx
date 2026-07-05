"use client";

import { useEffect, useState, useTransition } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  FileText, Calendar, Users, AlertCircle, Clock, CheckCircle2, 
  XCircle, ArrowLeft, Shield, Paperclip, MessageSquare, Edit3, 
  Trash2, Phone, Share2, HelpCircle, User, Info, FileSpreadsheet, Lock 
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface QuotaPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Member {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  mobile?: string | null;
  relationshipToApplicant?: string | null;
  identityType: string;
  identityLastFourDigits: string;
  isPrimaryApplicant: boolean;
}

interface Transaction {
  id: string;
  transactionType: string;
  quantity: number;
  reason?: string | null;
  createdAt: string;
  performedBy: { name: string; email: string };
}

interface Attachment {
  id: string;
  filename: string;
  path: string;
}

interface ActivityLog {
  id: string;
  action: string;
  details?: string | null;
  createdAt: string;
  user: { name: string };
}

interface TTDRequestDetail {
  id: string;
  requestNumber: string;
  applicantName: string;
  applicantMobile: string;
  alternateMobile?: string | null;
  address?: string | null;
  district?: string | null;
  constituency?: string | null;
  sourceType: string;
  sourceDescription?: string | null;
  relatedScheduleId?: string | null;
  referencePersonName?: string | null;
  referencePersonMobile?: string | null;
  preferredDarshanDate: string;
  alternateDarshanDate?: string | null;
  numberOfMembers: number;
  status: string;
  verificationStatus: string;
  documentsStatus: string;
  quotaPeriodId?: string | null;
  quotaPeriod?: QuotaPeriod | null;
  quotaReservedAt?: string | null;
  quotaReservedBy?: { name: string } | null;
  approvedAt?: string | null;
  approvedBy?: { name: string } | null;
  rejectedAt?: string | null;
  rejectedBy?: { name: string } | null;
  rejectionReason?: string | null;
  letterNumber?: string | null;
  letterDate?: string | null;
  letterPreparedAt?: string | null;
  letterPreparedBy?: { name: string } | null;
  distributedAt?: string | null;
  distributedBy?: { name: string } | null;
  usedAt?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: { name: string } | null;
  cancellationReason?: string | null;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  members: Member[];
  quotaTransactions: Transaction[];
  attachments: Attachment[];
  duplicateWarnings: string[];
  activityLogs: ActivityLog[];
  relatedSchedule?: { id: string; title: string } | null;
}

export default function TTDRequestDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;
  const { data: session } = authClient.useSession();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<TTDRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Quotas for approvals
  const [quotas, setQuotas] = useState<QuotaPeriod[]>([]);
  const [selectedQuotaPeriod, setSelectedQuotaPeriod] = useState("");

  // Action states popup modals
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState<"REJECT" | "DOCS_PENDING" | "FAIL_VERIFY" | "CANCEL" | "USE" | null>(null);
  const [reasonInput, setReasonInput] = useState("");

  // Prepare Letter Modal State
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [letterNumber, setLetterNumber] = useState("");
  const [letterDate, setLetterDate] = useState("");

  const isAdmin = session?.user?.email === "admin@mpoffice.com";
  const isStaff = session?.user?.email === "admin@mpoffice.com" || data?.createdById === session?.user?.id;

  const loadData = async () => {
    try {
      const res = await fetch(`/api/ttd/requests/${requestId}`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setData(body);
        setLetterNumber(body.letterNumber || "");
        setLetterDate(body.letterDate ? body.letterDate.split("T")[0] : "");
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load request details");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading request details.");
    } finally {
      setLoading(false);
    }
  };

  const loadQuotas = async () => {
    try {
      const res = await fetch("/api/ttd/quotas?active=true", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setQuotas(body);
        if (body.length > 0) setSelectedQuotaPeriod(body[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (session?.user) {
      loadData();
      loadQuotas();
    }
  }, [session]);

  const handleAction = (endpoint: string, payload: any = {}) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/ttd/requests/${requestId}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setSuccess(`Action completed successfully!`);
          setShowApproveModal(false);
          setShowPrepareModal(false);
          setShowReasonModal(null);
          setReasonInput("");
          router.refresh();
          await loadData();
        } else {
          const errData = await res.json();
          setError(errData.error || "Failed to complete workflow step.");
        }
      } catch (err) {
        console.error(err);
        setError("Error processing request action.");
      }
    });
  };

  const getStatusBadge = (status: string) => {
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

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center py-16 text-sm text-gray-500 font-sans">Loading TTD Request details...</div>
      </PageLayout>
    );
  }

  if (error && !data) {
    return (
      <PageLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-red-700 text-xs flex gap-2 items-start">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      </PageLayout>
    );
  }

  if (!data) return null;

  return (
    <PageLayout>
      <div className="print:hidden">
        {/* Header section with back btn */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { window.location.href = "/ttd-letters"; }}
          className="p-2 border border-gray-200 rounded hover:bg-gray-50 transition"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <span className="text-[10px] font-black uppercase text-gray-400">Request Details</span>
          <h1 className="text-lg font-bold text-gray-900 font-sans mt-0.5">ID: {data.requestNumber}</h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-start shadow-sm">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex gap-2 items-start shadow-sm">
          <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Duplicate warning flags */}
      {data.duplicateWarnings && data.duplicateWarnings.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900 text-xs space-y-2">
          <h4 className="font-extrabold flex items-center gap-1.5 uppercase tracking-wide text-amber-800">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" /> Potential Duplicate Warning
          </h4>
          <ul className="list-disc pl-5 space-y-1">
            {data.duplicateWarnings.map((warn, idx) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
          <p className="text-[10px] text-amber-700 font-semibold italic mt-2">These warnings are flags for staff review and do not block processing automatically.</p>
        </div>
      )}

      {/* Main split grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Main Application Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: Applicant & Dates */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-start flex-wrap gap-2 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900">Applicant Details</h2>
                <h3 className="font-bold text-base mt-1.5">{data.applicantName}</h3>
              </div>

              <div className="flex flex-col gap-1 items-end">
                <span className={`text-[10px] px-2.5 py-1.5 border rounded uppercase font-black ${getStatusBadge(data.status)}`}>
                  {data.status.replace("_", " ")}
                </span>
                <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">
                  Docs: {data.documentsStatus}
                </span>
              </div>
            </div>

            {/* Applicant Contacts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-700">
              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-gray-500 uppercase text-[9px]">Mobile Numbers</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold">{data.applicantMobile}</span>
                  {/* Action links */}
                  <a href={`tel:${data.applicantMobile}`} className="p-1 border border-gray-200 rounded hover:bg-gray-50 transition" title="Call">
                    <Phone className="w-3.5 h-3.5 text-gray-600" />
                  </a>
                  <a href={`https://wa.me/91${data.applicantMobile.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="p-1 border border-gray-200 rounded hover:bg-gray-50 transition text-emerald-600" title="WhatsApp">
                    <Share2 className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {data.alternateMobile && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-bold text-gray-500 uppercase text-[9px]">Alternate Mobile</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{data.alternateMobile}</span>
                  </div>
                </div>
              )}

              {data.address && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="font-bold text-gray-500 uppercase text-[9px]">Address</span>
                  <p>{data.address}</p>
                </div>
              )}

              {data.district && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-bold text-gray-500 uppercase text-[9px]">District / Constituency</span>
                  <p>{data.district} {data.constituency ? ` / ${data.constituency}` : ""}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-gray-500 uppercase text-[9px]">Request Source</span>
                <p>{data.sourceType.replace("_", " ")} {data.sourceDescription ? `(${data.sourceDescription})` : ""}</p>
                {data.relatedSchedule && (
                  <Link href={`/schedule`} className="text-[10px] text-primary font-bold hover:underline">
                    Linked schedule: {data.relatedSchedule.title}
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Section: Travelling Members */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-1.5">
              <Users className="w-4.5 h-4.5 text-gray-400" />
              Travelling Members ({data.members.length})
            </h2>

            <div className="divide-y divide-gray-100">
              {data.members.map((member, idx) => (
                <div key={member.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-gray-950">
                      {idx + 1}. {member.fullName} ({member.age}y, {member.gender})
                      {member.isPrimaryApplicant && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-primary rounded ml-2 font-extrabold uppercase">
                          Primary
                        </span>
                      )}
                    </h4>
                    {member.mobile && (
                      <p className="text-gray-500 mt-1">Mobile: {member.mobile}</p>
                    )}
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <span className="font-mono text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded text-[10px]">
                      {member.identityType}: {member.identityLastFourDigits}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Darshan dates */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900 border-b border-gray-100 pb-3 mb-4">
              Dates Preference
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Preferred Darshan Date</p>
                <p className="text-sm font-bold text-gray-800 mt-1">
                  {new Date(data.preferredDarshanDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              {data.alternateDarshanDate && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Alternate Darshan Date</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">
                    {new Date(data.alternateDarshanDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}
            </div>

            {data.notes && (
              <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-lg text-xs text-gray-700">
                <h4 className="font-bold text-primary mb-1">Remarks & Correction Logs</h4>
                <p className="whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
          </div>

          {/* Section: Quota transactions */}
          {data.quotaTransactions && data.quotaTransactions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900 border-b border-gray-100 pb-3 mb-4">
                Quota Transactions History
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase">
                      <th className="py-2">Type</th>
                      <th className="py-2">Quantity</th>
                      <th className="py-2">Reason</th>
                      <th className="py-2 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {data.quotaTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 font-bold uppercase text-gray-800">{tx.transactionType}</td>
                        <td className="py-2.5">{tx.quantity}</td>
                        <td className="py-2.5 text-gray-500">{tx.reason || "None"}</td>
                        <td className="py-2.5 text-right font-mono text-[10px]">
                          {new Date(tx.createdAt).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Activity log */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-900 border-b border-gray-100 pb-3 mb-4">
              Audit Logs History
            </h2>

            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {data.activityLogs.map((log) => (
                <div key={log.id} className="text-xs pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <p className="font-bold text-gray-800">{log.action.replace(/_/g, " ")}</p>
                  <p className="text-gray-500 mt-1">{log.details}</p>
                  <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                    <span>By: {log.user.name}</span>
                    <span>{new Date(log.createdAt).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Status Summary & Workflow Actions */}
        <div className="space-y-6">
          {/* Verification / Documents Status Widget */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Status Summary</h3>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Verification Status:</span>
                <span className="font-bold uppercase">{data.verificationStatus.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Documents Status:</span>
                <span className="font-bold uppercase">{data.documentsStatus}</span>
              </div>
              {data.quotaPeriod && (
                <div className="flex justify-between border-t border-gray-50 pt-2">
                  <span className="text-gray-500">Quota Period:</span>
                  <span className="font-bold text-gray-800">{data.quotaPeriod.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Workflow actions panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Workflow Administrative Panel
            </h3>

            <div className="flex flex-col gap-2.5">
              {/* Verification workflow step */}
              {data.status === "REQUESTED" && (
                <button
                  onClick={() => handleAction("start-verification")}
                  disabled={isPending}
                  className="w-full py-2.5 bg-primary hover:bg-amber-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                >
                  Start Verification
                </button>
              )}

              {data.status === "UNDER_VERIFICATION" && (
                <>
                  <button
                    onClick={() => handleAction("verify")}
                    disabled={isPending}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Verify Request
                  </button>
                  <button
                    onClick={() => setShowReasonModal("DOCS_PENDING")}
                    disabled={isPending}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Mark Docs Pending
                  </button>
                  <button
                    onClick={() => setShowReasonModal("FAIL_VERIFY")}
                    disabled={isPending}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Fail Verification
                  </button>
                </>
              )}

              {/* Approvals/Quota period lock */}
              {data.status === "VERIFIED" && isAdmin && (
                <>
                  <button
                    onClick={() => setShowApproveModal(true)}
                    disabled={isPending}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Approve & Reserve Quota
                  </button>
                  <button
                    onClick={() => setShowReasonModal("REJECT")}
                    disabled={isPending}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Reject Application
                  </button>
                </>
              )}

              {/* Preparation */}
              {data.status === "QUOTA_RESERVED" && (
                <>
                  <button
                    onClick={() => setShowPrepareModal(true)}
                    disabled={isPending}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                  >
                    Prepare Official Letter
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setShowReasonModal("REJECT")}
                      disabled={isPending}
                      className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                    >
                      Reject Request (Release Quota)
                    </button>
                  )}
                </>
              )}

              {/* Distribution */}
              {data.status === "LETTER_PREPARED" && (
                <button
                  onClick={() => handleAction("distribute", { confirmDistribution: true })}
                  disabled={isPending}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                >
                  Distribute Letter
                </button>
              )}

              {/* Usage */}
              {data.status === "DISTRIBUTED" && (
                <button
                  onClick={() => setShowReasonModal("USE")}
                  disabled={isPending}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded transition uppercase tracking-wider"
                >
                  Mark as USED
                </button>
              )}

              {/* Print Letter Button */}
              {["QUOTA_RESERVED", "LETTER_PREPARED", "DISTRIBUTED", "USED"].includes(data.status) && (
                <button
                  onClick={() => window.print()}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded transition uppercase tracking-wider mt-2.5 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>Print Official Letter</span>
                </button>
              )}

              {/* Cancellation */}
              {!["CANCELLED", "REJECTED", "USED"].includes(data.status) && (
                <button
                  onClick={() => setShowReasonModal("CANCEL")}
                  disabled={isPending}
                  className="w-full py-2.5 border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs rounded transition uppercase tracking-wider mt-3"
                >
                  Cancel Request
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1. APPROVAL MODAL */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Approve TTD Request</h3>
            <p className="text-xs text-gray-600">Choose which active quota period to lock and reserve one slot from.</p>

            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Quota Period *</label>
              <select
                value={selectedQuotaPeriod}
                onChange={(e) => setSelectedQuotaPeriod(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 bg-white h-9"
              >
                {quotas.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction("approve", { quotaPeriodId: selectedQuotaPeriod })}
                disabled={isPending || !selectedQuotaPeriod}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
              >
                Approve Tickets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. REASON MODALS (REJECT, DOCUMENTS_PENDING, FAIL_VERIFY, CANCEL, USED REMARKS) */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100 space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              {showReasonModal === "REJECT" && "Reject Request"}
              {showReasonModal === "DOCS_PENDING" && "Mark Documents Pending"}
              {showReasonModal === "FAIL_VERIFY" && "Fail Verification"}
              {showReasonModal === "CANCEL" && "Cancel Letter Request"}
              {showReasonModal === "USE" && "Used Remarks"}
            </h3>

            <p className="text-xs text-gray-600">
              {showReasonModal === "REJECT" && "Enter the rejection reason. This will release any reserved quota slots."}
              {showReasonModal === "DOCS_PENDING" && "Specify which documents/assets are missing."}
              {showReasonModal === "FAIL_VERIFY" && "State why verification failed."}
              {showReasonModal === "CANCEL" && "Enter the cancellation reason."}
              {showReasonModal === "USE" && "State any usage notes or remarks."}
            </p>

            <textarea
              required
              placeholder="Enter remarks..."
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              className="text-xs border border-gray-200 rounded p-2 w-full min-h-[80px]"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowReasonModal(null); setReasonInput(""); }}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showReasonModal === "REJECT") handleAction("reject", { reason: reasonInput });
                  if (showReasonModal === "DOCS_PENDING") handleAction("mark-documents-pending", { reason: reasonInput });
                  if (showReasonModal === "FAIL_VERIFY") handleAction("fail-verification", { reason: reasonInput });
                  if (showReasonModal === "CANCEL") handleAction("cancel", { reason: reasonInput });
                  if (showReasonModal === "USE") handleAction("mark-used", { remarks: reasonInput });
                }}
                disabled={isPending || (showReasonModal !== "USE" && !reasonInput.trim())}
                className={`px-4 py-2 text-white rounded text-xs font-semibold disabled:opacity-40 ${
                  showReasonModal === "USE" ? "bg-purple-600 hover:bg-purple-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PREPARE LETTER MODAL */}
      {showPrepareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Prepare Official Recommendation Letter</h3>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Letter Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. MP/TTD/2026/045"
                value={letterNumber}
                onChange={(e) => setLetterNumber(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Letter Date *</label>
              <input
                type="date"
                required
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPrepareModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction("prepare-letter", { letterNumber, letterDate })}
                disabled={isPending || !letterNumber || !letterDate}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-semibold"
              >
                Submit Letter
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Print-only template */}
      <div className="hidden print:block font-serif text-black leading-relaxed p-10 max-w-2xl mx-auto bg-white min-h-[1050px] flex flex-col justify-between">
        <div>
          {/* Letterhead */}
          <div className="flex justify-between items-start border-b border-gray-300 pb-3 mb-6 font-sans">
            {/* Left: Name and Title */}
            <div className="w-1/3 text-left space-y-1">
              <h1 className="text-sm font-black tracking-tight text-[#9C2A2A] uppercase leading-none">
                Bhashyam Ramakrishna
              </h1>
              <p className="text-[9px] font-bold text-gray-800 leading-tight">
                Member of Parliament (Rajya Sabha)
              </p>
            </div>

            {/* Center: Emblem Logo */}
            <div className="w-1/3 flex justify-center shrink-0">
              <svg className="w-9 h-11 text-amber-600" viewBox="0 0 100 120" fill="currentColor">
                {/* Pedestal */}
                <path d="M 20,95 L 80,95 L 75,102 L 25,102 Z" />
                <rect x="35" y="102" width="30" height="5" rx="1.5" />
                {/* Ashoka Chakra */}
                <circle cx="50" cy="85" r="7" fill="none" stroke="currentColor" strokeWidth="1" />
                <circle cx="50" cy="85" r="1" />
                {/* Lion head outline silhouette */}
                <path d="M 40,40 C 40,28 60,28 60,40 C 60,45 65,45 68,52 C 72,58 65,72 58,75 L 61,88 L 39,88 L 42,75 C 35,72 28,58 32,52 C 35,45 40,45 40,40 Z" />
                <path d="M 47,40 Q 50,42 53,40 Q 50,30 47,40 Z" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>

            {/* Right: Office info */}
            <div className="w-1/3 text-right text-[8px] font-semibold text-gray-600 leading-tight space-y-0.5">
              <p>Office : 4/3, Navabharat Nagar,</p>
              <p>Guntur - 522 006.</p>
              <p>ramakrishna.bhashyammp@gmail.com</p>
              <p>Cell : 99081 22239</p>
            </div>
          </div>

          {/* Date */}
          <div className="text-right text-xs font-bold text-gray-900 mb-6 font-sans">
            Date: {data.letterDate ? new Date(data.letterDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}
          </div>

          {/* Recipient */}
          <div className="text-xs space-y-0.5 mb-6 text-gray-950 font-sans">
            <p className="font-semibold">To</p>
            <p className="pl-4">The Joint Executive Officer,</p>
            <p className="pl-4">Tirumala Tirupati Devasthanam's,</p>
            <p className="pl-4">Tirumala.</p>
          </div>

          {/* Subject */}
          <div className="text-xs font-black text-gray-900 mb-6 uppercase tracking-wide border-y border-gray-200 py-2 font-sans">
            Subject: Request for VIP Break Darshan Tickets and Accommodation
          </div>

          {/* Salutation */}
          <p className="text-xs font-bold text-gray-900 mb-4 font-sans">Dear Sir,</p>

          {/* Body content */}
          <div className="text-xs text-gray-800 leading-relaxed space-y-4 text-justify font-sans">
            <p>
              I wish to recommend the following devotee {data.members.length > 1 ? `along with ${data.members.length - 1} family members,` : ""} will be visiting Tirumala to offer prayers to Lord Sri Venkateswara Swamy. The devotee's details are as follows:
            </p>

            {/* Main Devotee Profile Details Box */}
            {(() => {
              const primaryMember = data.members.find(m => m.isPrimaryApplicant) || data.members[0];
              return (
                <div className="pl-6 space-y-1 font-bold text-gray-950">
                  <p>Name: <span className="font-medium text-gray-800">{primaryMember?.fullName}</span></p>
                  <p>Age: <span className="font-medium text-gray-800">{primaryMember?.age} Years</span></p>
                  <p>Aadhaar No: <span className="font-medium text-gray-800">{primaryMember?.identityType === "AADHAAR" || primaryMember?.identityType === "Aadhaar" ? "" : `${primaryMember?.identityType}: `}{primaryMember?.identityLastFourDigits}</span></p>
                  <p>Mobile No: <span className="font-medium text-gray-800">{primaryMember?.mobile || data.applicantMobile}</span></p>
                </div>
              );
            })()}

            <p>
              I kindly request you to arrange <strong className="text-gray-950">{data.members.length} VIP Break Darshan tickets</strong> for <strong className="text-gray-950">{new Date(data.preferredDarshanDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}</strong> and provide accommodation from <strong className="text-gray-950">{(() => {
                const d = new Date(data.preferredDarshanDate);
                d.setDate(d.getDate() - 1);
                return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
              })()}</strong> for the family.
            </p>

            {/* Table of pilgrims (Only if accompanying members exist) */}
            {(() => {
              const primaryMember = data.members.find(m => m.isPrimaryApplicant) || data.members[0];
              const familyMembers = data.members.filter(m => m.id !== primaryMember?.id);
              if (familyMembers.length === 0) return null;
              return (
                <div className="mt-4 space-y-1.5">
                  <p className="font-bold text-gray-900">Accompanying Family Members:</p>
                  <table className="w-full text-left text-[10px] border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700 font-bold uppercase">
                        <th className="border border-gray-300 p-1.5 text-center w-8">S.No</th>
                        <th className="border border-gray-300 p-1.5">Full Name</th>
                        <th className="border border-gray-300 p-1.5 text-center w-12">Age</th>
                        <th className="border border-gray-300 p-1.5 text-center w-12">Gender</th>
                        <th className="border border-gray-300 p-1.5">ID Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {familyMembers.map((member, idx) => (
                        <tr key={member.id}>
                          <td className="border border-gray-300 p-1.5 text-center">{idx + 1}</td>
                          <td className="border border-gray-300 p-1.5 font-semibold text-gray-800">{member.fullName}</td>
                          <td className="border border-gray-300 p-1.5 text-center">{member.age}</td>
                          <td className="border border-gray-300 p-1.5 text-center uppercase">{member.gender.toLowerCase()}</td>
                          <td className="border border-gray-300 p-1.5 font-mono text-gray-600">{member.identityType}: {member.identityLastFourDigits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <p>
              Your kind consideration and favourable action in this regard will be highly appreciated.
            </p>
            
            <p>Thanking You.</p>
          </div>
        </div>

        {/* Sign-off & Footer */}
        <div>
          <div className="flex justify-between items-end text-xs mt-12 font-sans">
            <div className="text-left text-[10px] text-gray-500">
              <p>Lr. No. {data.letterNumber || `1/${new Date().getFullYear()}/MP/Rajya Sabha`}</p>
            </div>
            <div className="text-right space-y-1 font-bold">
              <p>Yours sincerely,</p>
              <div className="h-14"></div>
              <p className="text-gray-900">(Bhashyam Rama Krishna)</p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Member of Parliament</p>
            </div>
          </div>

          {/* Bottom letter footer line */}
          <div className="border-t border-gray-200 mt-10 pt-2 flex justify-between text-[8px] font-semibold text-gray-400 font-sans tracking-wide">
            <p>Resi : #4-4-26/1, Navabharat Nagar, Guntur - 522 006.</p>
            <p>Web : bhashyamramakrishna.in</p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
