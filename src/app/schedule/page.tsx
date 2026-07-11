"use client";

import { useEffect, useState, Suspense, useRef } from "react";
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
  visitChecklist?: any;
  socialMediaUpdate?: { isRequired: boolean; status: string; posts?: any[] } | null;
}

function SchedulePageContent() {
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

  interface ShareOptions {
    includeDescription: boolean;
    includeGoogleMaps: boolean;
    includeContacts: boolean;
    includeAssignments: boolean;
    includeStatus: boolean;
    noEmojis: boolean;
    onlyConfirmed: boolean;
  }

  // Calendar states
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day">("month");
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const [shareOptions, setShareOptions] = useState<ShareOptions>({
    includeDescription: true,
    includeGoogleMaps: true,
    includeContacts: true,
    includeAssignments: true,
    includeStatus: true,
    noEmojis: true,
    onlyConfirmed: true,
  });

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("schedule_share_options");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setShareOptions({
          includeDescription: parsed.includeDescription ?? true,
          includeGoogleMaps: parsed.includeGoogleMaps ?? true,
          includeContacts: parsed.includeContacts ?? true,
          includeAssignments: parsed.includeAssignments ?? true,
          includeStatus: parsed.includeStatus ?? true,
          noEmojis: parsed.noEmojis ?? true,
          onlyConfirmed: parsed.onlyConfirmed ?? true,
        });
      } catch (e) {
        console.error("Failed to parse schedule share options", e);
      }
    }
  }, []);

  // Handler to update share preferences and save to localStorage
  const updateShareOption = (key: keyof ShareOptions, val: boolean) => {
    const updated = { ...shareOptions, [key]: val };
    if (key === "onlyConfirmed" && val === true) {
      updated.includeStatus = false;
    }
    setShareOptions(updated);
    localStorage.setItem("schedule_share_options", JSON.stringify(updated));
  };

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
  const compileDailySchedule = (dateStr: string, opts: ShareOptions = shareOptions) => {
    let filtered = schedules.filter((s) => {
      const sDate = new Date(s.startAt);
      const localDateStr = sDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return localDateStr === dateStr;
    });

    if (opts.onlyConfirmed) {
      filtered = filtered.filter((s) => s.status !== "DRAFT");
    }

    if (filtered.length === 0) {
      return `No visits scheduled for ${dateStr}.`;
    }

    const formatDisplayDate = (dStr: string) => {
      try {
        const parts = dStr.split("-");
        const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
      } catch (e) {
        return dStr;
      }
    };

    const formatTime = (dateString: string) => {
      try {
        const d = new Date(dateString);
        return d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        }).toLowerCase();
      } catch (e) {
        return "";
      }
    };

    const displayDate = formatDisplayDate(dateStr);

    let msg = `*HONOURABLE MP SHRI BHASHYAM RAMA KRISHNA TOUR SCHEDULE - ${displayDate}*\n`;
    msg += `---------------------------------------------\n\n`;

    filtered.forEach((s, idx) => {
      const startTime = formatTime(s.startAt);
      const endTime = formatTime(s.endAt);

      const prefix = `${idx + 1}. `;
      const indent = " ".repeat(prefix.length);

      msg += `${prefix}*${s.title}*\n`;
      msg += indent + (opts.noEmojis ? `Time: ${startTime} - ${endTime}\n` : `🕒 Time: ${startTime} - ${endTime}\n`);
      msg += indent + (opts.noEmojis ? `Venue: ${s.venue}\n` : `📍 Venue: ${s.venue}\n`);
      
      if (opts.includeGoogleMaps && s.googleMapsLink) {
        msg += indent + (opts.noEmojis ? `Maps Link: ${s.googleMapsLink}\n` : `🗺️ Maps Link: ${s.googleMapsLink}\n`);
      }
      if (opts.includeDescription && s.description) {
        msg += indent + (opts.noEmojis ? `Description: ${s.description}\n` : `📝 Description: ${s.description}\n`);
      }
      if (opts.includeContacts && s.contacts && s.contacts.length > 0) {
        const contactList = s.contacts.map((c) => `${c.name} (${c.phone})`).join(", ");
        msg += indent + (opts.noEmojis ? `Contacts: ${contactList}\n` : `👥 Contacts: ${contactList}\n`);
      }
      if (opts.includeAssignments && s.assignments && s.assignments.length > 0) {
        const staffList = s.assignments.map((a) => a.user.name).join(", ");
        msg += indent + (opts.noEmojis ? `Assigned Staff: ${staffList}\n` : `👤 Assigned Staff: ${staffList}\n`);
      }
      if (opts.includeStatus && !opts.onlyConfirmed) {
        msg += indent + (opts.noEmojis ? `Status: ${s.status}\n` : `📋 Status: ${s.status}\n`);
      }
      msg += `\n`;
    });

    return msg.trim();
  };

  // Re-compile share preview dynamically when settings or date change
  useEffect(() => {
    if (showShareModal) {
      setShareMessage(compileDailySchedule(shareDate, shareOptions));
    }
  }, [shareDate, shareOptions, showShareModal, schedules]);

  // Listen to Escape key to close Share Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowShareModal(false);
      }
    };
    if (showShareModal) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showShareModal]);

  // User role details
  const isAdmin = session?.user?.email === "admin@mpoffice.com";

  // Load user roles
  useEffect(() => {
    async function loadRoles() {
      if (!session) return;
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
  }, [session]);

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
        const response = await fetch(`/api/schedules?view=${tab}&t=${Date.now()}`, {
          cache: "no-store",
        });
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
    const fetchTab = viewMode === "calendar" ? "all" : activeTab;
    loadData(fetchTab);

    const handleOnline = () => {
      setIsOnline(true);
      loadData(fetchTab);
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
  }, [activeTab, viewMode]);

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
    }
  };

  const renderCalendarView = () => {
    // Filter schedules for Month Grid, Week Grid, and Day Grid
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // Week View Days
    const currentDay = calendarDate.getDay();
    const startOfWeek = new Date(calendarDate);
    startOfWeek.setDate(calendarDate.getDate() - currentDay);
    
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDays.push(d);
    }
    
    // Month View Grid Days
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    const monthGrid: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      monthGrid.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }
    for (let i = 1; i <= totalDays; i++) {
      monthGrid.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    const totalCells = (startDayOfWeek + totalDays) <= 35 ? 35 : 42;
    const remaining = totalCells - monthGrid.length;
    for (let i = 1; i <= remaining; i++) {
      monthGrid.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    // Helper to format date string to match DB local timezone (en-CA: YYYY-MM-DD)
    const getLocalDateStr = (d: Date) => {
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    };

    // Helper to get schedules for a specific date
    const getSchedulesForDate = (date: Date) => {
      const targetStr = getLocalDateStr(date);
      return schedules.filter(s => {
        const sDate = new Date(s.startAt);
        return getLocalDateStr(sDate) === targetStr;
      });
    };

    const handlePrev = () => {
      const newDate = new Date(calendarDate);
      if (calendarView === "month") {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (calendarView === "week") {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
      setCalendarDate(newDate);
    };

    const handleNext = () => {
      const newDate = new Date(calendarDate);
      if (calendarView === "month") {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (calendarView === "week") {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      setCalendarDate(newDate);
    };

    const handleToday = () => {
      const now = new Date();
      setCalendarDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    };

    const getCalendarHeaderTitle = () => {
      if (calendarView === "month") {
        return calendarDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      } else if (calendarView === "week") {
        const first = weekDays[0];
        const last = weekDays[6];
        if (first.getMonth() === last.getMonth()) {
          return `${first.toLocaleDateString("en-IN", { month: "short" })} ${first.getFullYear()}`;
        }
        return `${first.toLocaleDateString("en-IN", { month: "short" })} - ${last.toLocaleDateString("en-IN", { month: "short" })} ${last.getFullYear()}`;
      } else {
        return calendarDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      }
    };

    const getGoogleMapsRouteUrl = (schedulesForDay: ScheduleWithRelations[]) => {
      if (schedulesForDay.length === 0) return "";
      const venues = schedulesForDay.map(s => s.venue.trim()).filter(Boolean);
      if (venues.length === 0) return "";
      
      const origin = encodeURIComponent(venues[0]);
      const destination = encodeURIComponent(venues[venues.length - 1]);
      if (venues.length === 1) {
        return `https://www.google.com/maps/search/?api=1&query=${origin}`;
      }
      const waypoints = venues.slice(1, -1).map(v => encodeURIComponent(v)).join("|");
      return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}`;
    };

    const currentDaySchedules = getSchedulesForDate(calendarDate);

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-5 font-sans">
        {/* Calendar Nav & Sub-view buttons */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center w-full md:w-auto gap-3">
            <div className="flex items-center justify-between w-full md:w-auto gap-2">
              <button onClick={handlePrev} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-700 font-bold text-xs cursor-pointer shrink-0">
                &larr; Prev
              </button>
              <h2 className="text-sm font-extrabold text-gray-900 font-sans text-center flex-1 md:flex-none md:min-w-[120px] px-2 truncate">
                {getCalendarHeaderTitle()}
              </h2>
              <button onClick={handleNext} className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-700 font-bold text-xs cursor-pointer shrink-0">
                Next &rarr;
              </button>
            </div>
          </div>

          <div className="bg-gray-100 p-0.5 rounded-lg border border-gray-200 flex items-center justify-between md:justify-start shadow-xs">
            {(["month", "week", "day"] as const).map((view) => (
              <button
                key={view}
                onClick={() => setCalendarView(view)}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-md text-xs font-bold transition uppercase tracking-wider cursor-pointer text-center ${
                  calendarView === view ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        {/* Month View Layout */}
        {calendarView === "month" && (
          <div className="grid grid-cols-7 gap-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center font-bold text-gray-400 text-[10px] uppercase py-1">
                {day}
              </div>
            ))}
            {monthGrid.map(({ date, isCurrentMonth }, idx) => {
              const daySchedules = getSchedulesForDate(date);
              const isToday = getLocalDateStr(date) === getLocalDateStr(new Date());
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCalendarDate(date);
                    setCalendarView("day");
                  }}
                  className={`min-h-[60px] md:min-h-[85px] p-1.5 md:p-2 border border-gray-100 rounded-xl flex flex-col justify-between hover:bg-amber-50/20 transition cursor-pointer ${
                    isCurrentMonth ? "bg-white" : "bg-gray-50/40 text-gray-300"
                  } ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                >
                  <span className={`text-[10px] font-bold self-end ${isToday ? "text-primary font-black" : "text-gray-600"}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-y-auto max-h-[55px] pr-0.5">
                    {/* Desktop: Show full text labels */}
                    <div className="hidden md:flex flex-col gap-0.5">
                      {daySchedules.map((s) => (
                        <span
                          key={s.id}
                          className={`text-[8px] px-1 py-0.5 rounded truncate font-bold block leading-tight border ${
                            s.priority === "HIGH" 
                              ? "bg-red-50 text-red-700 border-red-100" 
                              : s.priority === "LOW"
                              ? "bg-gray-50 text-gray-500 border-gray-100"
                              : "bg-amber-50 text-amber-800 border-amber-100"
                          }`}
                          title={s.title}
                        >
                          {new Date(s.startAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} {s.title}
                        </span>
                      ))}
                    </div>
                    {/* Mobile: Show dots */}
                    <div className="flex md:hidden justify-center items-center gap-0.5 flex-wrap mt-0.5">
                      {daySchedules.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className={`w-1.5 h-1.5 rounded-full ${
                            s.priority === "HIGH" 
                              ? "bg-red-500" 
                              : s.priority === "LOW"
                              ? "bg-gray-400"
                              : "bg-amber-500"
                          }`}
                        />
                      ))}
                      {daySchedules.length > 3 && (
                        <span className="text-[8px] text-gray-400 font-extrabold leading-none">+</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Week View Layout */}
        {calendarView === "week" && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
            {weekDays.map((day, idx) => {
              const daySchedules = getSchedulesForDate(day);
              const isToday = getLocalDateStr(day) === getLocalDateStr(new Date());
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCalendarDate(day);
                    setCalendarView("day");
                  }}
                  className={`border border-gray-100 rounded-xl p-3 flex flex-row md:flex-col gap-3 md:gap-2 min-h-0 md:min-h-[320px] hover:bg-amber-50/20 transition cursor-pointer ${
                    isToday ? "bg-amber-50/10 ring-2 ring-primary ring-inset" : "bg-white"
                  }`}
                >
                  <div className="border-r md:border-r-0 md:border-b border-gray-100 pr-3 md:pr-0 md:pb-1.5 flex flex-col items-center justify-center shrink-0 min-w-[45px]">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {day.toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    <span className={`text-sm md:text-base font-black mt-0.5 ${isToday ? "text-primary" : "text-gray-900"}`}>
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-[260px] pr-0.5">
                    {daySchedules.length === 0 ? (
                      <span className="text-[10px] text-gray-300 italic self-start md:self-auto md:text-center md:mt-4 font-semibold">Free</span>
                    ) : (
                      daySchedules.map((s) => (
                        <div
                          key={s.id}
                          className={`p-2 border rounded-lg text-[10px] font-bold text-gray-700 leading-snug space-y-1 ${
                            s.priority === "HIGH" 
                              ? "bg-red-50 border-red-150" 
                              : s.priority === "LOW"
                              ? "bg-gray-50 border-gray-150 text-gray-500"
                              : "bg-amber-50 border-amber-150"
                          }`}
                        >
                          <p className="line-clamp-2">{s.title}</p>
                          <span className="text-[8px] text-gray-400 font-mono block">
                            {new Date(s.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Day Timeline View Layout */}
        {calendarView === "day" && (
          <div className="space-y-4">
            {/* Google Maps Route optimization banner */}
            {currentDaySchedules.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3.5 bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-100 p-4 rounded-2xl shadow-xs">
                <div className="flex items-start gap-2.5">
                  <MapIcon className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950">Geographic Convoy Route Planning</h4>
                    <p className="text-xs text-emerald-700 mt-1 font-medium">Optimize driver navigation for today's {currentDaySchedules.length} scheduled visits.</p>
                  </div>
                </div>
                <a
                  href={getGoogleMapsRouteUrl(currentDaySchedules)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 whitespace-nowrap px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs hover:shadow-sm focus:outline-none"
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>Open Route Maps</span>
                </a>
              </div>
            )}

            {currentDaySchedules.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic">
                No schedules mapped for this date.
              </div>
            ) : (
              <div className="relative border-l-2 border-gray-150 pl-6 ml-3 space-y-6">
                {currentDaySchedules.map((s, idx) => {
                  const sStart = new Date(s.startAt);
                  const sEnd = new Date(s.endAt);
                  const nextS = currentDaySchedules[idx + 1];
                  
                  let gapAlert = null;
                  if (nextS) {
                    const nextStart = new Date(nextS.startAt).getTime();
                    const currEnd = sEnd.getTime();
                    const diffMins = Math.floor((nextStart - currEnd) / 60000);
                    
                    if (diffMins < 0) {
                      gapAlert = (
                        <div className="my-2 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] font-bold text-red-700 flex items-center gap-1.5 max-w-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>Timeline Conflict: Overlap of {Math.abs(diffMins)} minutes!</span>
                        </div>
                      );
                    } else if (diffMins > 0) {
                      gapAlert = (
                        <div className="my-2 p-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 flex items-center gap-1.5 max-w-sm">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>Convoy Travel Gap: {diffMins} minutes</span>
                        </div>
                      );
                    }
                  }

                  return (
                    <div key={s.id} className="relative">
                      {/* Bullet point node */}
                      <span className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                        s.status === "COMPLETED"
                          ? "border-emerald-600 bg-emerald-50"
                          : s.status === "CANCELLED"
                          ? "border-red-600 bg-red-50"
                          : "border-primary bg-amber-50"
                      }`} />
                      
                      <div className="bg-gray-50/50 hover:bg-gray-50 border border-gray-150 rounded-xl p-4.5 max-w-2xl transition">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">
                              {sStart.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} - {sEnd.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                            </span>
                            <h3 className="text-sm font-bold text-gray-900 mt-1">{s.title}</h3>
                            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                              <span>{s.venue}</span>
                            </p>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 border rounded-full uppercase font-bold shrink-0 ${getStatusColor(s.status)}`}>
                            {s.status.replace("_", " ")}
                          </span>
                        </div>

                        {s.description && (
                          <p className="text-xs text-gray-600 mt-2.5 leading-relaxed">{s.description}</p>
                        )}

                        <div className="mt-3.5 pt-3 border-t border-gray-200 flex justify-between items-center text-[10px] text-gray-500 font-medium">
                          {/* Assigned Staff commented out for future use
                          <span>Assigned Staff: {s.assignments && s.assignments.length > 0 ? s.assignments.map(a => a.user.name).join(", ") : "None"}</span>
                          */}
                          <span />
                          {canEdit && (
                            <button
                              onClick={() => { setEditScheduleId(s.id); setShowAddModal(true); }}
                              className="text-primary font-bold hover:underline focus:outline-none cursor-pointer text-[10px]"
                            >
                              Manage Visit
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {gapAlert}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
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
        const fetchTab = viewMode === "calendar" ? "all" : activeTab;
        await loadData(fetchTab);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  // Bottom sheet swipe down to close gesture states
  const [sheetOffset, setSheetOffset] = useState(0);
  const sheetStartY = useRef(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetStartY.current = e.touches[0].clientY;
    setIsDraggingSheet(true);
  };

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingSheet) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - sheetStartY.current;
    if (diff > 0) {
      setSheetOffset(diff);
    }
  };

  const handleSheetTouchEnd = () => {
    setIsDraggingSheet(false);
    if (sheetOffset > 100) {
      setShowShareModal(false);
    }
    setSheetOffset(0);
  };

  return (
    <PageLayout>
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="min-h-screen relative print:hidden"
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
      {/* Toast Notifications (Bottom Center) */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-gray-950 text-white px-4.5 py-3 rounded-xl shadow-2xl border border-gray-800 animate-bounce">
          <CheckCircle2 className={`w-4.5 h-4.5 ${toast.type === "success" ? "text-emerald-400" : "text-red-400"}`} />
          <span className="text-xs font-bold font-sans tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col gap-4 mb-5 font-sans">
        {/* Title & Primary Add Button */}
        <div className="flex justify-between items-center gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
              HONOURABLE MP SHRI BHASHYAM RAMA KRISHNA TOUR SCHEDULE
            </h1>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditScheduleId(null); setShowAddModal(true); }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm transition text-xs cursor-pointer focus:outline-none shrink-0"
            >
              <span>+ Add New</span>
            </button>
          )}
        </div>

        {/* View Selection & Compilation Tools */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Calendar vs List Toggle */}
          <div className="flex-1 min-w-[150px] bg-gray-150 p-0.5 rounded-xl border border-gray-200 flex items-center shadow-xs">
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                viewMode === "calendar" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                viewMode === "list" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              List
            </button>
          </div>

          {/* Share Daily Compilation */}
          {(isAdmin || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin") || userRoles.includes("Schedule Coordinator")) && (
            <button
              onClick={() => {
                setShareMessage(compileDailySchedule(shareDate));
                setShowShareModal(true);
              }}
              className="flex items-center justify-center gap-1.5 px-4.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold rounded-xl shadow-sm transition text-xs cursor-pointer focus:outline-none"
              title="Share daily compiled schedules on WhatsApp"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share Daily</span>
              <span className="sm:hidden">Share</span>
            </button>
          )}
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
      {viewMode === "list" && (
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
      )}

      {/* Schedules Content */}
      {viewMode === "calendar" ? (
        renderCalendarView()
      ) : loading && schedules.length === 0 ? (
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
                <div className="flex items-center gap-1.5 flex-wrap font-sans">
                  {schedule.priority && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                      schedule.priority === "HIGH"
                        ? "bg-red-50 text-red-700 border-red-150"
                        : schedule.priority === "LOW"
                        ? "bg-gray-50 text-gray-500 border-gray-150"
                        : "bg-amber-50 text-amber-800 border-amber-150"
                    }`}>
                      {schedule.priority}
                    </span>
                  )}
                  {schedule.category && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-150 uppercase">
                      {schedule.category}
                    </span>
                  )}
                  {!isReadOnlyViewer ? (
                    canEdit ? (
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
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase font-extrabold ${getStatusColor(schedule.status)}`}>
                        {schedule.status.replace("_", " ")}
                      </span>
                    )
                  ) : (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase font-extrabold ${getStatusColor(schedule.status)}`}>
                      {schedule.status.replace("_", " ")}
                    </span>
                  )}
                </div>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-500">Contacts:</span>
                      {schedule.contacts.map((contact) => (
                        <div key={contact.id} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg text-[11px] text-gray-800">
                          <span className="font-bold">{contact.name} ({contact.phone})</span>
                          <span className="text-gray-300">|</span>
                          <a
                            href={`tel:${contact.phone}`}
                            className="p-1 text-sky-600 hover:text-sky-800 hover:bg-sky-100 rounded transition flex items-center justify-center"
                            title={`Call ${contact.name}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
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
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded transition flex items-center justify-center"
                            title={`WhatsApp ${contact.name}`}
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assignments commented out for future use
                  {schedule.assignments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-gray-500">Staff Assigned:</span>
                      <span className="text-gray-700 font-medium">{schedule.assignments.map((a) => a.user.name).join(", ")}</span>
                    </div>
                  )}
                  */}
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
                    <>
                      {/* Checklist commented out for future use
                      {schedule.visitChecklist && (
                        <Link
                          href={`/schedule/${schedule.id}/checklist`}
                          className="flex items-center gap-1 px-2.5 h-7 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary font-bold rounded-lg text-[10px] transition"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Checklist</span>
                        </Link>
                      )}
                      */}
                      {schedule.socialMediaUpdate && (
                        <Link
                          href={`/schedule/${schedule.id}/social-media`}
                          className="flex items-center gap-1 px-2.5 h-7 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-bold rounded-lg text-[10px] transition"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>Social</span>
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      {schedule.status !== "DRAFT" && (
                        <>
                          {/* Checklist commented out for future use
                          <Link
                            href={`/schedule/${schedule.id}/checklist`}
                            className="flex items-center gap-1 px-2.5 h-7 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary font-bold rounded-lg text-[10px] transition"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Checklist</span>
                          </Link>
                          */}
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
        <div 
          onClick={() => setShowShareModal(false)}
          className="fixed inset-0 bg-black/55 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              transform: sheetOffset > 0 ? `translateY(${sheetOffset}px)` : undefined,
              transition: isDraggingSheet ? "none" : "transform 0.2s ease-out"
            }}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-150 max-h-[88vh] flex flex-col focus:outline-none"
          >
            {/* Mobile Drag Indicator / Pull handle */}
            <div 
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              className="w-full flex justify-center py-3 cursor-row-resize sm:hidden shrink-0 select-none active:bg-gray-50"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
            </div>

            <div className="flex justify-between items-center border-b border-gray-100 px-5 py-3 shrink-0">
              <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">Share Daily Schedule</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600 focus:outline-none p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4 text-xs flex-1">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Select Schedule Date</label>
                <input
                  type="date"
                  value={shareDate}
                  onChange={(e) => setShareDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Message Preview</label>
                <textarea
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-700 text-[11px] leading-normal font-sans"
                />
              </div>

              {/* Share Options Filters Checklist (Controls) */}
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50 space-y-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Include in message:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-gray-700 font-sans">
                  <label className="flex items-center gap-2 cursor-pointer col-span-2 pb-1.5 mb-1.5 border-b border-gray-200">
                    <input
                      type="checkbox"
                      checked={shareOptions.onlyConfirmed}
                      onChange={(e) => updateShareOption("onlyConfirmed", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-emerald-800 font-bold">Only Confirmed (Exclude Drafts)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareOptions.includeDescription}
                      onChange={(e) => updateShareOption("includeDescription", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Description</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareOptions.includeGoogleMaps}
                      onChange={(e) => updateShareOption("includeGoogleMaps", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Maps Link</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareOptions.includeContacts}
                      onChange={(e) => updateShareOption("includeContacts", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Contacts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareOptions.includeAssignments}
                      onChange={(e) => updateShareOption("includeAssignments", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Assigned Staff</span>
                  </label>
                  {!shareOptions.onlyConfirmed && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shareOptions.includeStatus}
                        onChange={(e) => updateShareOption("includeStatus", e.target.checked)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Status</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer col-span-2 mt-1 pt-1 border-t border-gray-200">
                    <input
                      type="checkbox"
                      checked={shareOptions.noEmojis}
                      onChange={(e) => updateShareOption("noEmojis", e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>No Emojis (Clean formatting)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center px-5 py-4 border-t border-gray-100 shrink-0 flex-wrap gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer focus:outline-none"
                title="Print Daily Schedule to PDF"
              >
                <span>Print PDF</span>
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareMessage);
                    showToast("Copied to clipboard!");
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none cursor-pointer"
                >
                  Copy
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowShareModal(false)}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition focus:outline-none cursor-pointer"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  <span>Send</span>
                </a>
              </div>
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
      </div>

      {/* Printable Tabular Daily Schedule PDF Layout */}
      <div className="hidden print:block font-sans bg-white relative" style={{ width: "210mm", height: "297mm", backgroundImage: "url('/letterhead_bg.png')", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
        
        {/* Print styling overrides */}
        <style dangerouslySetInnerHTML={{ __html: `
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&display=swap');
          @media print {
            @page {
              size: A4 portrait !important;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}} />

        {/* Date inside the top-right white strip bubble */}
        <div style={{ position: "absolute", top: "9mm", right: "2mm", width: "65mm", height: "11mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: "18px", fontFamily: "'Poppins', sans-serif", fontWeight: 800, color: "#0F172A", letterSpacing: "0.5px", margin: 0, textAlign: "center" }}>
            {new Date(shareDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}
          </p>
        </div>

        {/* Schedule Table Container */}
        <div style={{ paddingTop: "52mm", paddingLeft: "15mm", paddingRight: "15mm" }}>
          <table className="w-full border-collapse border border-gray-300 text-[11px] bg-white/95">
            <thead>
              <tr className="bg-gray-100 text-gray-800 font-bold uppercase tracking-wider">
                <th className="border border-gray-300 p-2 text-center w-12">S.No</th>
                <th className="border border-gray-300 p-2 text-left">Visit Details / Venue</th>
                <th className="border border-gray-300 p-2 text-left w-32">Time</th>
                {shareOptions.includeStatus && !shareOptions.onlyConfirmed && <th className="border border-gray-300 p-2 text-left w-24">Status</th>}
              </tr>
            </thead>
            <tbody>
              {schedules
                .filter((s) => {
                  const sDate = new Date(s.startAt);
                  const localDateStr = sDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                  return localDateStr === shareDate;
                })
                .filter((s) => !shareOptions.onlyConfirmed || s.status !== "DRAFT")
                .map((s, idx) => {
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

                  return (
                    <tr key={s.id} className="align-top border border-gray-300">
                      <td className="border border-gray-300 p-2 text-center text-gray-700">{idx + 1}</td>
                      <td className="border border-gray-300 p-2 space-y-1">
                        <div className="font-bold text-gray-900 text-xs">{s.title}</div>
                        <div className="text-[10px] text-gray-600 font-semibold">📍 Venue: {s.venue}</div>
                        {shareOptions.includeGoogleMaps && s.googleMapsLink && (
                          <div className="text-[9px] text-blue-600 underline">Maps Link: {s.googleMapsLink}</div>
                        )}
                        {shareOptions.includeDescription && s.description && (
                          <p className="text-[10px] text-gray-500 leading-normal italic">{s.description}</p>
                        )}
                        {shareOptions.includeContacts && s.contacts && s.contacts.length > 0 && (
                          <div className="text-[9px] text-gray-500">
                            Contacts: {s.contacts.map((c) => `${c.name} (${c.phone})`).join(", ")}
                          </div>
                        )}
                        {shareOptions.includeAssignments && s.assignments && s.assignments.length > 0 && (
                          <div className="text-[9px] text-gray-400">Assigned Staff: {s.assignments.map(a => a.user.name).join(", ")}</div>
                        )}
                      </td>
                      <td className="border border-gray-300 p-2 font-mono font-semibold text-gray-700">
                        {startTime} - {endTime}
                      </td>
                      {shareOptions.includeStatus && !shareOptions.onlyConfirmed && (
                        <td className="border border-gray-300 p-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800">{s.status.replace("_", " ")}</td>
                      )}
                    </tr>
                  );
                })}
              {schedules.filter((s) => {
                const sDate = new Date(s.startAt);
                const localDateStr = sDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                return localDateStr === shareDate;
              }).filter((s) => !shareOptions.onlyConfirmed || s.status !== "DRAFT").length === 0 && (
                <tr>
                  <td colSpan={shareOptions.includeStatus && !shareOptions.onlyConfirmed ? 4 : 3} className="border border-gray-300 p-8 text-center text-gray-400 italic">
                    No visits scheduled for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-gray-500 font-medium font-sans">Loading schedules...</p>
        </div>
      </div>
    }>
      <SchedulePageContent />
    </Suspense>
  );
}
