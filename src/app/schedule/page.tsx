"use client";

import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { db, type OfflineSchedule, type OfflineContact } from "@/lib/db";
import { authClient } from "@/lib/auth-client";
import { 
  Calendar, MapPin, Phone, CheckCircle2, Circle, RefreshCw, 
  AlertTriangle, Navigation as MapIcon, Shield, Layers, BookOpen, AlertCircle, Trash, Edit3, Clock, Share2
} from "lucide-react";
import Link from "next/link";

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
  socialMediaUpdate?: { isRequired: boolean; status: string } | null;
}

export default function SchedulePage() {
  const { data: session } = authClient.useSession();
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "weekly" | "all">("today");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // User role details
  const isAdmin = session?.user?.email === "admin@mpoffice.com";

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
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handle schedule deletion
  const handleDeleteSchedule = async () => {
    if (!deleteConfirmId) return;

    try {
      const response = await fetch(`/api/schedules/${deleteConfirmId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Schedule deleted successfully!");
        setDeleteConfirmId(null);
        loadData(activeTab);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete schedule");
      }
    } catch (err) {
      console.error("Failed to delete schedule:", err);
      alert("Error deleting schedule");
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans">MP Tour Schedule</h1>
          <p className="text-xs text-gray-500 mt-1">Real-time schedule check-offs and contacts</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => loadData(activeTab)}
            className="flex items-center justify-center p-2.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition text-gray-700 shadow-sm"
            aria-label="Refresh schedules"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/add?tab=schedule"
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-amber-700 text-white font-medium rounded-md shadow-sm transition text-xs"
          >
            Add Visit
          </Link>
        </div>
      </div>

      {/* Sync Queue Warning */}
      {pendingCount > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 text-sm">
                Offline Updates Pending Sync
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                {pendingCount} checklist change(s) stored locally. Open any visit checklist to synchronize.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Filter Links */}
      <div className="flex border-b border-gray-200 mb-6 bg-white rounded-lg shadow-sm overflow-x-auto">
        {(["today", "tomorrow", "weekly", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-[80px] py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition ${
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
        <div className="text-center py-12 text-gray-500 text-sm font-sans">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-lg text-gray-500 text-sm bg-white font-sans">
          No schedules found for this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              {/* Heading */}
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-950 leading-snug">{schedule.title}</h2>
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {new Date(schedule.startAt).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </div>
                
                {/* Status & Priority Badge */}
                <div className="flex gap-1.5 items-center shrink-0 flex-wrap justify-end">
                  {schedule.priority && (
                    <span className="bg-red-50 text-red-700 border border-red-100 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wide">
                      {schedule.priority}
                    </span>
                  )}
                  {schedule.socialMediaUpdate && schedule.socialMediaUpdate.isRequired && (
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wide ${getSocialBadgeColor(schedule.socialMediaUpdate.status)}`}>
                      Social: {schedule.socialMediaUpdate.status.replace("_", " ")}
                    </span>
                  )}
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getStatusColor(schedule.status)}`}>
                    {schedule.status}
                  </span>
                </div>
              </div>

              {/* Time & Venue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs text-gray-600 border-t border-b border-gray-50 py-3.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span>
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
                </div>
                
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="truncate">{schedule.venue}</span>
                </div>
              </div>

              {/* Organizer / Contact Info */}
              {(schedule.organizerName || schedule.organizerPhone || schedule.googleMapsLink) && (
                <div className="mt-4 bg-gray-50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Organizer Details</p>
                      <p className="font-bold text-gray-800 mt-0.5">
                        {schedule.organizerName || "Not specified"}
                      </p>
                      {schedule.organizerPhone && (
                        <p className="text-gray-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{schedule.organizerPhone}</span>
                        </p>
                      )}
                    </div>

                    {schedule.googleMapsLink && (
                      <a
                        href={schedule.googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded text-[10px] shadow-xs"
                      >
                        <MapIcon className="w-3 h-3 text-primary" />
                        <span>Navigate</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Linked Contacts */}
              {schedule.contacts.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Contacts</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {schedule.contacts.map((contact) => (
                      <div key={contact.id} className="p-2.5 bg-gray-50 border border-gray-100 rounded-md text-xs">
                        <p className="font-bold text-gray-800">{contact.name}</p>
                        <p className="text-gray-500 mt-0.5">{contact.phone}</p>
                        {contact.designation && (
                          <p className="text-[10px] text-primary font-bold mt-1 uppercase tracking-wide">
                            {contact.designation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff Assignments */}
              {schedule.assignments.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Assigned Staff</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {schedule.assignments.map((assignment, index) => (
                      <span
                        key={index}
                        className="bg-amber-50 text-primary border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                      >
                        {assignment.user.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-gray-100 flex-wrap">
                {schedule.status !== "DRAFT" && (
                  <>
                    <Link
                      href={`/schedule/${schedule.id}/checklist`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary font-bold rounded text-xs transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Checklist</span>
                    </Link>
                    <Link
                      href={`/schedule/${schedule.id}/social-media`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-bold rounded text-xs transition"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Social Media</span>
                    </Link>
                  </>
                )}

                {isAdmin && (
                  <>
                    <Link
                      href={`/add?tab=schedule&id=${schedule.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded text-xs transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Link>
                    <button
                      onClick={() => setDeleteConfirmId(schedule.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold rounded text-xs transition"
                    >
                      <Trash className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100">
            <h3 className="text-base font-bold text-gray-900">Confirm Deletion</h3>
            <p className="text-xs text-gray-600 mt-2">
              Are you sure you want to delete this schedule? This action will also delete all linked contacts and staff assignments.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSchedule}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                Delete Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
