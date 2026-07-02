"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageLayout } from "@/components/PageLayout";
import { db, type OfflineSchedule, type OfflineContact } from "@/lib/db";
import { authClient } from "@/lib/auth-client";
import { 
  Calendar, MapPin, Phone, CheckCircle2, Circle, RefreshCw, 
  AlertTriangle, Navigation as MapIcon, Shield, Layers, BookOpen, AlertCircle, Trash, Edit3, Clock, Share2, X
} from "lucide-react";
import Link from "next/link";
import { ScheduleModal } from "@/components/ScheduleModal";

const WhatsAppIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.012 2c-5.506 0-9.988 4.482-9.988 9.988 0 1.761.459 3.477 1.332 5.006L2 22l5.161-1.353c1.472.802 3.129 1.229 4.845 1.229 5.506 0 9.994-4.482 9.994-9.988C22 6.482 17.518 2 12.012 2zm.006 17.884c-1.554 0-3.078-.418-4.414-1.209l-.317-.189-3.28.859.875-3.197-.207-.33c-.87-1.385-1.33-2.987-1.33-4.636 0-4.685 3.813-8.498 8.498-8.498 4.686 0 8.498 3.813 8.498 8.498 0 4.686-3.812 8.498-8.498 8.498zm4.673-6.39c-.256-.128-1.516-.748-1.75-.833-.234-.085-.404-.128-.574.128-.17.256-.659.833-.808 1.002-.149.17-.298.191-.554.063-.256-.128-1.077-.397-2.052-1.267-.759-.677-1.272-1.513-1.421-1.768-.149-.256-.016-.395.112-.522.115-.114.256-.298.383-.447.128-.149.17-.256.256-.426.085-.17.042-.319-.021-.447-.063-.128-.574-1.385-.788-1.897-.208-.501-.417-.433-.574-.441-.149-.007-.319-.007-.489-.007-.17 0-.447.063-.68.319-.234.256-.893.873-.893 2.129 0 1.256.915 2.47 1.042 2.64.128.17 1.8 2.75 4.36 3.854.61.263 1.085.42 1.457.538.613.195 1.171.168 1.611.102.49-.074 1.516-.619 1.729-1.217.213-.598.213-1.11.149-1.217-.064-.108-.234-.171-.49-.299z"/>
  </svg>
);

interface AssignedUser {
  id: string;
  name: string;
  email: string;
}

interface ScheduleWithRelations extends OfflineSchedule {
  organizerName?: string;
  organizerPhone?: string;
  googleMapsLink?: string;
  category?: string;
  priority?: string;
  internalInstructions?: string;
  requiredDocuments?: string;
  contacts: OfflineContact[];
  assignments: { user: AssignedUser }[];
  socialMediaUpdate?: { isRequired: boolean; status: string; posts?: any[] } | null;
}

export default function SchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const VALID_TABS = ["today", "tomorrow", "weekly", "all"] as const;
  type Tab = typeof VALID_TABS[number];

  const tabFromUrl = searchParams.get("tab")?.toLowerCase() as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "today"
  );

  // Sync activeTab when URL ?tab param changes (e.g. back/forward navigation)
  useEffect(() => {
    const t = searchParams.get("tab")?.toLowerCase() as Tab | null;
    if (t && VALID_TABS.includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/schedule?tab=${tab}`, { scroll: false });
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editScheduleId, setEditScheduleId] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // New features states
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Hi {contactName}, the status of the visit '{title}' scheduled at {venue} on {date} has been updated to {status}."
  );
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState<{ schedule: ScheduleWithRelations; newStatus: string } | null>(null);
  const [promptRecipientId, setPromptRecipientId] = useState("");
  const [promptMessage, setPromptMessage] = useState("");

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDate, setShareDate] = useState(() => {
    const now = new Date();
    const offsetMs = 5.5 * 60 * 60 * 1000;
    const localDate = new Date(now.getTime() + offsetMs);
    return localDate.toISOString().slice(0, 10);
  });
  const [shareMessage, setShareMessage] = useState("");

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load WhatsApp status update template from settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings/public");
        if (res.ok) {
          const data = await res.json();
          const tSetting = data.settings?.find((s: any) => s.key === "whatsapp_status_update_template");
          if (tSetting?.value) {
            setWhatsappTemplate(tSetting.value);
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    }
    loadSettings();
  }, []);

  // Sync recipient and message when WhatsApp prompt active state changes
  useEffect(() => {
    if (showWhatsAppPrompt) {
      const defaultContact = showWhatsAppPrompt.schedule.contacts[0];
      if (defaultContact) {
        setPromptRecipientId(defaultContact.id);
        const dateStr = new Date(showWhatsAppPrompt.schedule.startAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
        const timeStr = new Date(showWhatsAppPrompt.schedule.startAt).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
        setPromptMessage(
          whatsappTemplate
            .replace("{contactName}", defaultContact.name)
            .replace("{title}", showWhatsAppPrompt.schedule.title)
            .replace("{venue}", showWhatsAppPrompt.schedule.venue)
            .replace("{date}", dateStr)
            .replace("{time}", timeStr)
            .replace("{status}", showWhatsAppPrompt.newStatus)
        );
      }
    }
  }, [showWhatsAppPrompt, whatsappTemplate]);

  // Compile daily tour schedules
  const compileDailySchedule = (dateStr: string) => {
    const filtered = schedules.filter((s) => {
      const sDate = new Date(s.startAt);
      const localDateStr = sDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return localDateStr === dateStr;
    });

    if (filtered.length === 0) {
      return `No visits scheduled for ${dateStr}.`;
    }

    const displayDate = new Date(dateStr).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    let msg = `*MP TOUR SCHEDULE - ${displayDate}*\n`;
    msg += `--------------------------------\n\n`;

    filtered.forEach((s, idx) => {
      const startTime = new Date(s.startAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const endTime = new Date(s.endAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });

      msg += `${idx + 1}. *${s.title}*\n`;
      msg += `🕒 Time: ${startTime} - ${endTime}\n`;
      msg += `📍 Venue: ${s.venue}\n`;
      if (s.description) {
        msg += `📝 Description: ${s.description}\n`;
      }
      if (s.contacts && s.contacts.length > 0) {
        msg += `👥 Contacts: ${s.contacts.map((c) => `${c.name} (${c.phone})`).join(", ")}\n`;
      }
      if (s.assignments && s.assignments.length > 0) {
        msg += `👤 Assigned Staff: ${s.assignments.map((a) => a.user.name).join(", ")}\n`;
      }
      msg += `📋 Status: ${s.status}\n\n`;
    });

    msg += `Generated from MP Office Portal.`;
    return msg;
  };

  // User role details
  const isAdmin = session?.user?.email === "admin@mpoffice.com";

  // Load user roles
  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          setUserRoles(profile.roles || []);
        }
      } catch (err) {
        console.error("Failed to load user roles:", err);
      }
    }
    loadRoles();
  }, []);

  const canEdit = isAdmin || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin") || userRoles.includes("Schedule Coordinator");
  const canDelete = isAdmin || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin");
  const isReadOnlyViewer = !isAdmin && !userRoles.includes("Super Admin") && !userRoles.includes("MP Office Admin") && !userRoles.includes("Schedule Coordinator") && !userRoles.includes("Social Media Team");

  // Synchronize offline mutations queue from list view
  const triggerSync = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);

    try {
      const mutations = await db.pendingChecklistMutations.toArray();
      if (mutations.length === 0) {
        setSyncing(false);
        return;
      }

      const response = await fetch("/api/checklists/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations }),
      });

      if (response.ok) {
        const results = await response.json();
        
        // Delete successful and duplicate mutations from Dexie queue
        const successIds = [
          ...results.successful.map((m: any) => m.clientMutationId),
          ...results.duplicate.map((m: any) => m.clientMutationId),
        ];

        for (const id of successIds) {
          await db.pendingChecklistMutations.delete(id);
        }

        // Update local cached checklist item versions so subsequent mutations use correct expectedVersion
        for (const s of results.successful) {
          const mutObj = mutations.find((m: any) => m.clientMutationId === s.clientMutationId);
          const schedId = mutObj?.scheduleId || "";
          if (schedId) {
            const cached = await db.cachedChecklists.get(schedId);
            if (cached) {
              const itemIdx = cached.items.findIndex(i => i.id === s.checklistItemId);
              if (itemIdx !== -1) {
                cached.items[itemIdx].version = s.version;
              }
              await db.cachedChecklists.put(cached);
            }
          }
        }

        // Handle conflicts (flag local items in cached checklists)
        if (results.conflicts.length > 0) {
          for (const conflict of results.conflicts) {
            const cached = await db.cachedChecklists.get(conflict.scheduleId || "");
            if (cached) {
              const itemIdx = cached.items.findIndex(i => i.id === conflict.checklistItemId);
              if (itemIdx !== -1) {
                cached.items[itemIdx].version = conflict.serverVersion;
                (cached.items[itemIdx] as any).conflict = {
                  serverVersion: conflict.serverVersion,
                  serverValue: conflict.latestServerValue,
                  localValue: conflict.localSubmittedValue,
                };
              }
              await db.cachedChecklists.put(cached);
            }
          }
        }

        // Update pending count
        const count = await db.pendingChecklistMutations.count();
        setPendingCount(count);
      }
    } catch (err) {
      console.error("Failed to execute sync from schedule list:", err);
    } finally {
      setSyncing(false);
    }
  };

  // Load schedules & sync state
  const loadData = async (tab: typeof activeTab = activeTab) => {
    setLoading(true);
    try {
      const isDeviceOnline = navigator.onLine;
      setIsOnline(isDeviceOnline);

      if (isDeviceOnline) {
        // Fetch fresh schedules from DB for specified tab view
        const response = await fetch(`/api/schedules?view=${tab}`);
        if (response.ok) {
          const freshSchedules: ScheduleWithRelations[] = await response.json();
          setSchedules(freshSchedules);

          // Update Dexie cachedSchedules cache (Only for "all" or "today" cache to avoid cache pollution)
          if (tab === "today" || tab === "all") {
            await db.transaction("rw", [db.cachedSchedules, db.contacts], async () => {
              await db.cachedSchedules.clear();
              await db.contacts.clear();

              for (const sched of freshSchedules) {
                await db.cachedSchedules.put({
                  id: sched.id,
                  title: sched.title,
                  description: sched.description || undefined,
                  startAt: sched.startAt,
                  endAt: sched.endAt,
                  venue: sched.venue,
                  status: sched.status,
                  category: sched.category || undefined,
                  priority: sched.priority || undefined,
                  organizerName: sched.organizerName || undefined,
                  organizerPhone: sched.organizerPhone || undefined,
                  googleMapsLink: sched.googleMapsLink || undefined,
                  requiredDocuments: sched.requiredDocuments || undefined,
                  internalInstructions: sched.internalInstructions || undefined,
                });

                for (const contact of sched.contacts) {
                  await db.contacts.put({
                    id: contact.id,
                    scheduleId: sched.id,
                    name: contact.name,
                    phone: contact.phone,
                    designation: contact.designation || undefined,
                  });
                }
              }
            });
          }
        }
      } else {
        // Load from Dexie cache if offline
        const cachedSchedules = await db.cachedSchedules.toArray();
        const cachedContacts = await db.contacts.toArray();

        const combined: ScheduleWithRelations[] = cachedSchedules.map((sched) => ({
          ...sched,
          contacts: cachedContacts.filter((contact) => contact.scheduleId === sched.id),
          assignments: [],
        }));

        setSchedules(combined);
      }

      // Update pending queue count from mutations
      const count = await db.pendingChecklistMutations.count();
      setPendingCount(count);

      if (navigator.onLine && count > 0) {
        triggerSync();
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!deleteConfirmId) return;

    try {
      const response = await fetch(`/api/schedules/${deleteConfirmId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showToast("Schedule deleted successfully!");
        setDeleteConfirmId(null);
        loadData(activeTab);
      } else {
        const data = await response.json();
        showToast(data.error || "Failed to delete schedule", "error");
      }
    } catch (err: any) {
      console.error("Failed to delete schedule:", err);
      showToast(err.message || "Error deleting schedule", "error");
    }
  };

  // Sync listener and connectivity polling
  useEffect(() => {
    loadData(activeTab);

    const handleOnline = () => {
      setIsOnline(true);
      loadData(activeTab);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [activeTab]);

  const getSocialBadgeColor = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "PARTIALLY_PUBLISHED":
        return "bg-sky-50 text-sky-800 border-sky-200";
      case "APPROVED":
        return "bg-purple-50 text-purple-800 border-purple-200";
      case "WAITING_FOR_APPROVAL":
        return "bg-orange-50 text-orange-800 border-orange-200";
      case "DRAFTING":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "MEDIA_RECEIVED":
      case "MEDIA_PENDING":
        return "bg-amber-50 text-amber-800 border-amber-200";
      default:
        return "bg-gray-100 text-gray-500 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "CANCELLED":
        return "bg-red-50 text-red-800 border-red-200";
      case "IN_PROGRESS":
        return "bg-sky-50 text-sky-800 border-sky-200";
      case "TRAVELLING":
      case "ARRIVED":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "POSTPONED":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-amber-50 text-amber-800 border-amber-200";
    }
  };

  return (
    <PageLayout>
      {/* Inline Toast Notifications */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg border border-gray-800 animate-slide-in">
          <CheckCircle2 className={`w-4 h-4 ${toast.type === "success" ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-sans">MP Tour Schedule</h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time schedule check-offs and contacts</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          {/* Share Daily Compilation on WhatsApp (available for Admin/PA/Coordinators) */}
          {(isAdmin || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin") || userRoles.includes("Schedule Coordinator")) && (
            <button
              onClick={() => {
                setShareMessage(compileDailySchedule(shareDate));
                setShowShareModal(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold rounded-lg shadow-sm transition text-xs focus:outline-none"
              title="Share daily compiled schedules on WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span>Share Daily</span>
            </button>
          )}

          <button
            onClick={() => loadData(activeTab)}
            className="flex items-center justify-center p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-700 shadow-sm"
            aria-label="Refresh schedules"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => { setEditScheduleId(null); setShowAddModal(true); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-medium rounded-lg shadow-sm transition text-xs focus:outline-none"
          >
            + Add New
          </button>
        </div>
      </div>

      {/* Sync Queue Warning */}
      {pendingCount > 0 && (
        <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 text-xs">
                Offline Updates Pending Sync ({pendingCount})
              </h3>
              <p className="text-[10px] text-amber-700 mt-0.5">
                Checklist edits stored locally. Open a visit checklist to synchronize.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Filter Links */}
      <div className="flex border-b border-gray-200 mb-5 bg-white rounded-lg shadow-xs overflow-x-auto">
        {(["today", "tomorrow", "weekly", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`flex-1 min-w-[70px] py-2.5 text-xs font-bold border-b-2 uppercase tracking-wider transition ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Schedules Content */}
      {loading && schedules.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-xs font-sans">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400 text-xs bg-white font-sans font-semibold">
          No schedules found for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
              {/* Header: Title and Badges */}
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <h2 className="text-sm font-bold text-gray-900 leading-snug">{schedule.title}</h2>
                  {/* Minimal Sub-header: Date / Time / Venue */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-gray-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(schedule.startAt).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Kolkata",
                      })}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(schedule.startAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                      {" - "}
                      {new Date(schedule.endAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 max-w-[250px] truncate">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{schedule.venue}</span>
                      {schedule.googleMapsLink && (
                        <a
                          href={schedule.googleMapsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-amber-700 transition"
                          title="Navigate on Google Maps"
                        >
                          <MapIcon className="w-3 h-3 text-primary inline" />
                        </a>
                      )}
                    </span>
                  </div>
                </div>

                {/* Priority, Social, and Status Dropdown */}
                {!isReadOnlyViewer && (
                  <div className="flex gap-1.5 items-center shrink-0 flex-wrap justify-end">
                    {schedule.priority && (
                      <span className="bg-red-50 text-red-700 border border-red-100 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide">
                        {schedule.priority}
                      </span>
                    )}
                    {schedule.socialMediaUpdate && schedule.socialMediaUpdate.isRequired && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${getSocialBadgeColor(schedule.socialMediaUpdate.status)}`}>
                        SM: {schedule.socialMediaUpdate.status.replace("_", " ")}
                      </span>
                    )}
                    {canEdit ? (
                      <select
                        value={schedule.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          try {
                            const res = await fetch(`/api/schedules/${schedule.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: newStatus }),
                            });
                            if (res.ok) {
                              showToast("Status updated successfully!");
                              loadData(activeTab);
                              
                              // Trigger WhatsApp sharing dialog if contacts exist
                              if (schedule.contacts && schedule.contacts.length > 0) {
                                setShowWhatsAppPrompt({ schedule, newStatus });
                              }
                            } else {
                              const err = await res.json();
                              if (err.allowOverride) {
                                const reason = prompt(
                                  `${err.error}\n\nAs Super Admin, you can override this. Enter override reason to complete:`
                                );
                                if (reason) {
                                  const overrideRes = await fetch(`/api/schedules/${schedule.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      status: newStatus,
                                      override: { reason },
                                    }),
                                  });
                                  if (overrideRes.ok) {
                                    showToast("Status updated successfully via override!");
                                    loadData(activeTab);
                                    if (schedule.contacts && schedule.contacts.length > 0) {
                                      setShowWhatsAppPrompt({ schedule, newStatus });
                                    }
                                    return;
                                  } else {
                                    const overrideErr = await overrideRes.json();
                                    showToast(overrideErr.error || "Override update failed", "error");
                                  }
                                }
                              } else {
                                showToast(err.error || "Failed to update status", "error");
                              }
                              loadData(activeTab);
                            }
                          } catch (err: any) {
                            showToast(err.message || "Error updating status", "error");
                            loadData(activeTab);
                          }
                        }}
                        className={`status-select-badge text-[10px] h-6 py-0 ${getStatusColor(schedule.status)}`}
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="TRAVELLING">Travelling</option>
                        <option value="ARRIVED">Arrived</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="POSTPONED">Postponed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    ) : (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(schedule.status)}`}>
                        {schedule.status}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Visit Description */}
              {schedule.description && (
                <p className="text-[11px] text-gray-600 bg-gray-50/50 border-l-2 border-primary/30 pl-2 py-1 mt-2.5 rounded font-sans leading-relaxed">
                  {schedule.description}
                </p>
              )}

              {/* Linked Contacts & Staff details */}
              {!isReadOnlyViewer && (schedule.contacts.length > 0 || schedule.assignments.length > 0) && (
                <div className="mt-2.5 space-y-1.5 text-[11px] text-gray-600 font-sans border-t border-gray-100 pt-2.5">
                  {/* Contacts */}
                  {schedule.contacts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-gray-500">Contacts:</span>
                      {schedule.contacts.map((contact, cIdx) => (
                        <span key={contact.id} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] text-gray-700">
                          <span>{contact.name} ({contact.phone})</span>
                          <a
                            href={`https://api.whatsapp.com/send?phone=${contact.phone.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(
                              whatsappTemplate
                                .replace("{contactName}", contact.name)
                                .replace("{title}", schedule.title)
                                .replace("{venue}", schedule.venue)
                                .replace("{date}", new Date(schedule.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }))
                                .replace("{time}", new Date(schedule.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }))
                                .replace("{status}", schedule.status)
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 ml-0.5"
                            title="Message on WhatsApp"
                          >
                            <WhatsAppIcon className="w-3 h-3 text-emerald-600 inline" />
                          </a>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assignments */}
                  {schedule.assignments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-gray-500">Staff Assigned:</span>
                      <span className="text-gray-700 font-medium">{schedule.assignments.map((a) => a.user.name).join(", ")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex gap-2 justify-between items-center mt-3.5 pt-3 border-t border-gray-150 flex-wrap">
                {/* Left side actions (WhatsApp Quick Share if contacts exist) */}
                <div>
                  {!isReadOnlyViewer && schedule.contacts.length > 0 && (
                    <button
                      onClick={() => setShowWhatsAppPrompt({ schedule, newStatus: schedule.status })}
                      className="inline-flex items-center gap-1 px-2 h-7 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold rounded-lg text-[10px] transition focus:outline-none"
                      title="Share schedule status update via WhatsApp"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span>Share Status</span>
                    </button>
                  )}
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-1.5">
                  {isReadOnlyViewer ? (
                    (() => {
                      const publishedPostsCount = schedule.socialMediaUpdate?.posts?.filter((p: any) => p.postUrl)?.length || 0;
                      if (publishedPostsCount > 0) {
                        return (
                          <Link
                            href={`/schedule/${schedule.id}/social-media`}
                            className="flex items-center gap-1 px-2.5 h-7 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-bold rounded-lg text-[10px] transition"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Social ({publishedPostsCount})</span>
                          </Link>
                        );
                      }
                      return null;
                    })()
                  ) : (
                    <>
                      {schedule.status !== "DRAFT" && (
                        <>
                          <Link
                            href={`/schedule/${schedule.id}/checklist`}
                            className="flex items-center gap-1 px-2.5 h-7 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary font-bold rounded-lg text-[10px] transition"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Checklist</span>
                          </Link>
                          <Link
                            href={`/schedule/${schedule.id}/social-media`}
                            className="flex items-center gap-1 px-2.5 h-7 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-bold rounded-lg text-[10px] transition"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Social</span>
                          </Link>
                        </>
                      )}

                      {canEdit && (
                        <button
                          onClick={() => { setEditScheduleId(schedule.id); setShowAddModal(true); }}
                          className="flex items-center gap-1 px-2.5 h-7 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg text-[10px] transition cursor-pointer focus:outline-none"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => setDeleteConfirmId(schedule.id)}
                          className="flex items-center gap-1 px-2.5 h-7 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold rounded-lg text-[10px] transition cursor-pointer focus:outline-none"
                        >
                          <Trash className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp Status Update Confirmation Modal */}
      {showWhatsAppPrompt && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-lg border border-gray-150 animate-slide-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 mb-3.5">
              <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">WhatsApp Status Notification</h3>
              <button onClick={() => setShowWhatsAppPrompt(null)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Select Contact Recipient</label>
                <select
                  value={promptRecipientId}
                  onChange={(e) => {
                    setPromptRecipientId(e.target.value);
                    const contact = showWhatsAppPrompt.schedule.contacts.find(c => c.id === e.target.value);
                    if (contact) {
                      const dateStr = new Date(showWhatsAppPrompt.schedule.startAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
                      const timeStr = new Date(showWhatsAppPrompt.schedule.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
                      setPromptMessage(
                        whatsappTemplate
                          .replace("{contactName}", contact.name)
                          .replace("{title}", showWhatsAppPrompt.schedule.title)
                          .replace("{venue}", showWhatsAppPrompt.schedule.venue)
                          .replace("{date}", dateStr)
                          .replace("{time}", timeStr)
                          .replace("{status}", showWhatsAppPrompt.newStatus)
                      );
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-xs"
                >
                  {showWhatsAppPrompt.schedule.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Message Preview</label>
                <textarea
                  value={promptMessage}
                  onChange={(e) => setPromptMessage(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-xs leading-normal font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3.5 border-t border-gray-100">
              <button
                onClick={() => setShowWhatsAppPrompt(null)}
                className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                Cancel
              </button>
              <a
                href={`https://api.whatsapp.com/send?phone=${
                  (showWhatsAppPrompt.schedule.contacts.find(c => c.id === promptRecipientId)?.phone || "").replace(/[^0-9]/g, "")
                }&text=${encodeURIComponent(promptMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowWhatsAppPrompt(null)}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition focus:outline-none"
              >
                <WhatsAppIcon className="w-3 h-3" />
                <span>Send WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Daily Compilation WhatsApp Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full shadow-lg border border-gray-150 animate-slide-up">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 mb-3.5">
              <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">Share Daily Schedule</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Select Schedule Date</label>
                <input
                  type="date"
                  value={shareDate}
                  onChange={(e) => {
                    setShareDate(e.target.value);
                    setShareMessage(compileDailySchedule(e.target.value));
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Message Preview</label>
                <textarea
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-[11px] leading-normal font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3.5 border-t border-gray-100">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareMessage);
                  showToast("Copied to clipboard!");
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                Copy Message
              </button>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowShareModal(false)}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition focus:outline-none"
              >
                <WhatsAppIcon className="w-3 h-3" />
                <span>Send WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-xs w-full shadow-lg border border-gray-100">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Confirm Deletion</h3>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              Are you sure you want to delete this schedule? This action will also delete all linked contacts and staff assignments.
            </p>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSchedule}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ScheduleModal 
        isOpen={showAddModal} 
        onClose={() => { setShowAddModal(false); setEditScheduleId(null); }} 
        onSave={() => loadData(activeTab)} 
        editId={editScheduleId} 
      />
    </PageLayout>
  );
}
