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
      const res = await fetch(`/api/ttd/requests/${requestId}`);
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
      const res = await fetch("/api/ttd/quotas?active=true");
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
      {/* Header section with back btn */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
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
                      {member.identityType}: ****{member.identityLastFourDigits}
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
    </PageLayout>
  );
}
