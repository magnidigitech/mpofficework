"use client";

import { useEffect, useState, useTransition } from "react";
import { PageLayout } from "@/components/PageLayout";
import { db, type OfflineChecklistItem, type PendingChecklistMutation, type SyncMetadata } from "@/lib/db";
import { authClient } from "@/lib/auth-client";
import { 
  Calendar, MapPin, Clock, RefreshCw, AlertTriangle, Shield, CheckCircle2, 
  Circle, HelpCircle, UserCheck, MessageSquare, AlertCircle, Wifi, WifiOff, Check, Plus 
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface AssignedUser {
  id: string;
  name: string;
  email: string;
  mobileNumber?: string | null;
}

interface ChecklistItemWithDetails extends OfflineChecklistItem {
  assignedUser?: AssignedUser;
  completedBy?: { id: string; name: string; email: string };
  conflict?: {
    serverVersion: number;
    serverValue: {
      isCompleted: boolean;
      assignedUserId: string | null;
      remarks: string | null;
    };
    localValue: any;
  } | null;
}

interface ChecklistData {
  scheduleId: string;
  scheduleTitle: string;
  startAt: string;
  endAt: string;
  venue: string;
  scheduleStatus: string;
  checklistId: string;
  checklistStatus: string;
  progress: number;
  totalItems: number;
  completedItems: number;
  pendingItems: number;
  pendingMandatoryItems: number;
  groupedItems: {
    BEFORE_VISIT: ChecklistItemWithDetails[];
    DURING_VISIT: ChecklistItemWithDetails[];
    AFTER_VISIT: ChecklistItemWithDetails[];
  };
  updatedAt: string | Date;
}

export default function ScheduleChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.id as string;
  const { data: session } = authClient.useSession();
  
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [staffCoordinators, setStaffCoordinators] = useState<AssignedUser[]>([]);
  const [isPending, startTransition] = useTransition();

  // Active Collapsible Sections State
  const [collapsed, setCollapsed] = useState({
    BEFORE_VISIT: false,
    DURING_VISIT: false,
    AFTER_VISIT: false,
  });

  // Remarks edit target state
  const [editingRemarksId, setEditingRemarksId] = useState<string | null>(null);
  const [remarksInput, setRemarksInput] = useState("");

  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          setUserRoles(profile.roles || []);
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoadingRoles(false);
      }
    }
    fetchProfile();
  }, []);

  const isAdmin = session?.user?.email === "admin@mpoffice.com" || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin");
  const canManageAssignment = isAdmin || userRoles.includes("Schedule Coordinator");

  // Load Checklist & Offline sync state
  const loadChecklist = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceOnline = navigator.onLine;
      setIsOnline(deviceOnline);

      // Load staff list if online
      if (deviceOnline && staffCoordinators.length === 0) {
        const staffRes = await fetch("/api/users");
        if (staffRes.ok) {
          const staffData = await staffRes.json();
          setStaffCoordinators(staffData);
        }
      }

      if (deviceOnline) {
        const response = await fetch(`/api/schedules/${scheduleId}/checklist`);
        if (response.ok) {
          const serverData: ChecklistData = await response.json();
          setData(serverData);

          // Update Dexie cachedChecklists copy
          const flatItems: OfflineChecklistItem[] = [
            ...serverData.groupedItems.BEFORE_VISIT,
            ...serverData.groupedItems.DURING_VISIT,
            ...serverData.groupedItems.AFTER_VISIT,
          ].map(item => ({
            id: item.id,
            visitChecklistId: serverData.checklistId,
            templateItemId: item.templateItemId,
            title: item.title,
            description: item.description,
            section: item.section,
            displayOrder: item.displayOrder,
            isMandatory: item.isMandatory,
            isCompleted: item.isCompleted,
            assignedUserId: item.assignedUserId || undefined,
            completedById: item.completedById || undefined,
            completedAt: item.completedAt || undefined,
            remarks: item.remarks || undefined,
            version: item.version,
            assignedUser: item.assignedUser ? { id: item.assignedUser.id, name: item.assignedUser.name, email: item.assignedUser.email } : undefined,
            completedBy: item.completedBy ? { id: item.completedBy.id, name: item.completedBy.name, email: item.completedBy.email } : undefined,
          }));

          await db.cachedChecklists.put({
            scheduleId: serverData.scheduleId,
            visitChecklistId: serverData.checklistId,
            status: serverData.checklistStatus,
            totalItems: serverData.totalItems,
            completedItems: serverData.completedItems,
            items: flatItems,
            serverVersion: 1,
            lastServerUpdateTime: new Date().toISOString(),
            lastCachedTime: new Date().toISOString(),
          });
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to load checklist details.");
        }
      } else {
        // Load from Dexie Offline Cache
        const cached = await db.cachedChecklists.get(scheduleId);
        if (cached) {
          const grouped = {
            BEFORE_VISIT: cached.items.filter((i) => i.section === "BEFORE_VISIT") as ChecklistItemWithDetails[],
            DURING_VISIT: cached.items.filter((i) => i.section === "DURING_VISIT") as ChecklistItemWithDetails[],
            AFTER_VISIT: cached.items.filter((i) => i.section === "AFTER_VISIT") as ChecklistItemWithDetails[],
          };

          const totalItems = cached.items.length;
          const completedItems = cached.items.filter((i) => i.isCompleted).length;
          const pendingItems = totalItems - completedItems;
          const pendingMandatoryItems = cached.items.filter((i) => i.isMandatory && !i.isCompleted).length;
          const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

          setData({
            scheduleId: cached.scheduleId,
            scheduleTitle: "Offline Tour Visit",
            startAt: new Date().toISOString(),
            endAt: new Date().toISOString(),
            venue: "Cached Venue",
            scheduleStatus: "CONFIRMED",
            checklistId: cached.visitChecklistId,
            checklistStatus: cached.status,
            progress,
            totalItems,
            completedItems,
            pendingItems,
            pendingMandatoryItems,
            groupedItems: grouped,
            updatedAt: new Date(cached.lastServerUpdateTime),
          });
        } else {
          setError("No offline cached checklist details found for this visit.");
        }
      }

      // Check mutation count and metadata
      const mutationCount = await db.pendingChecklistMutations.where("scheduleId").equals(scheduleId).count();
      setPendingSyncCount(mutationCount);

      if (session?.user) {
        const metadata = await db.syncMetadata.get(session.user.id);
        if (metadata?.lastSuccessfulSyncAt) {
          setLastSyncTime(new Date(metadata.lastSuccessfulSyncAt).toLocaleTimeString("en-IN"));
        }
      }
    } catch (err: any) {
      console.error("Failed to load checklist details:", err);
      setError("An unexpected error occurred while loading checklist.");
    } finally {
      setLoading(false);
    }
  };

  // Synchronize offline mutations queue
  const triggerSync = async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);

    try {
      const mutations = await db.pendingChecklistMutations.where("scheduleId").equals(scheduleId).toArray();
      if (mutations.length === 0) {
        setSyncing(false);
        return;
      }

      // Payload structure matching POST /api/checklists/sync
      const response = await fetch("/api/checklists/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations }),
      });

      if (response.ok) {
        const results = await response.json();
        
        // 1. Delete successful and duplicate mutations from Dexie queue
        const successIds = [
          ...results.successful.map((m: any) => m.clientMutationId),
          ...results.duplicate.map((m: any) => m.clientMutationId),
        ];

        for (const id of successIds) {
          await db.pendingChecklistMutations.delete(id);
        }

        // Update local cached checklist item versions so subsequent mutations use correct expectedVersion
        const cached = await db.cachedChecklists.get(scheduleId);
        if (cached) {
          for (const s of results.successful) {
            const itemIdx = cached.items.findIndex(i => i.id === s.checklistItemId);
            if (itemIdx !== -1) {
              cached.items[itemIdx].version = s.version;
            }
          }
          await db.cachedChecklists.put(cached);
        }

        // Reload checklist to update react state with new versions
        await loadChecklist();

        // 2. Handle conflicts (flag local items)
        if (results.conflicts.length > 0) {
          alert(`Sync complete with ${results.conflicts.length} conflict(s) detected. Please resolve them below.`);
          
          const cached = await db.cachedChecklists.get(scheduleId);
          if (cached) {
            for (const conflict of results.conflicts) {
              const itemIdx = cached.items.findIndex(i => i.id === conflict.checklistItemId);
              if (itemIdx !== -1) {
                cached.items[itemIdx].version = conflict.serverVersion;
                // Add conflict marker
                (cached.items[itemIdx] as any).conflict = {
                  serverVersion: conflict.serverVersion,
                  serverValue: conflict.latestServerValue,
                  localValue: conflict.localSubmittedValue,
                };
              }
            }
            await db.cachedChecklists.put(cached);
          }
        }

        // Update last sync time metadata
        if (session?.user) {
          await db.syncMetadata.put({
            userId: session.user.id,
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastAttemptAt: new Date().toISOString(),
            currentSyncStatus: results.conflicts.length > 0 ? "ERROR" : "IDLE",
          });
        }
      }
    } catch (err) {
      console.error("Failed to execute checklist synchronization:", err);
    } finally {
      setSyncing(false);
      await loadChecklist();
    }
  };

  // Perform Local Mutation Helper (Supporting Optimistic UI)
  const applyLocalMutation = async (
    itemId: string,
    mutationType: "TOGGLE_COMPLETE" | "ASSIGN_STAFF" | "UPDATE_REMARKS",
    updatedFields: any
  ) => {
    if (!data) return;

    // A. Generate client mutation ID
    const clientMutationId = `mut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // B. Find expected version from current item in state
    let targetItem: ChecklistItemWithDetails | null = null;
    let sectionKey: keyof typeof data.groupedItems | null = null;

    for (const key of ["BEFORE_VISIT", "DURING_VISIT", "AFTER_VISIT"] as const) {
      const match = data.groupedItems[key].find((i) => i.id === itemId);
      if (match) {
        targetItem = match;
        sectionKey = key;
        break;
      }
    }

    if (!targetItem || !sectionKey) return;

    const expectedVersion = targetItem.version;

    // C. Save or merge in Dexie pendingChecklistMutations queue to prevent duplicate sequential version conflict errors
    const existing = await db.pendingChecklistMutations
      .where("checklistItemId")
      .equals(itemId)
      .first();

    if (existing) {
      existing.updatedFields = {
        ...existing.updatedFields,
        ...updatedFields,
      };
      existing.clientUpdatedAt = new Date().toISOString();
      if (mutationType === "TOGGLE_COMPLETE" || existing.mutationType === "TOGGLE_COMPLETE") {
        existing.mutationType = "TOGGLE_COMPLETE";
      } else {
        existing.mutationType = mutationType;
      }
      await db.pendingChecklistMutations.put(existing);
    } else {
      const mutation: PendingChecklistMutation = {
        clientMutationId,
        checklistItemId: itemId,
        visitChecklistId: data.checklistId,
        scheduleId,
        mutationType,
        updatedFields,
        expectedVersion,
        clientUpdatedAt: new Date().toISOString(),
        retryCount: 0,
        createdAt: new Date().toISOString(),
      };
      await db.pendingChecklistMutations.put(mutation);
    }

    // D. Apply Optimistic Updates in Local Cache & State
    const cached = await db.cachedChecklists.get(scheduleId);
    if (cached) {
      const itemIdx = cached.items.findIndex((i) => i.id === itemId);
      if (itemIdx !== -1) {
        const itemToUpdate = cached.items[itemIdx];
        
        // Optimistically apply fields
        if (updatedFields.isCompleted !== undefined) {
          itemToUpdate.isCompleted = updatedFields.isCompleted;
          itemToUpdate.completedById = updatedFields.isCompleted ? (session?.user?.id || undefined) : undefined;
          itemToUpdate.completedAt = updatedFields.isCompleted ? new Date().toISOString() : undefined;
        }
        if (updatedFields.assignedUserId !== undefined) {
          itemToUpdate.assignedUserId = updatedFields.assignedUserId || undefined;
          if (updatedFields.assignedUserId) {
            const staff = staffCoordinators.find(s => s.id === updatedFields.assignedUserId);
            itemToUpdate.assignedUser = staff ? { id: staff.id, name: staff.name, email: staff.email } : undefined;
          } else {
            itemToUpdate.assignedUser = undefined;
          }
        }
        if (updatedFields.remarks !== undefined) {
          itemToUpdate.remarks = updatedFields.remarks || undefined;
        }

        await db.cachedChecklists.put(cached);
      }
    }

    // Refresh UI
    await loadChecklist();

    // E. If online, trigger sync immediately
    if (navigator.onLine) {
      await triggerSync();
    }
  };

  // Toggle item completion
  const handleToggleItem = async (itemId: string, currentStatus: boolean) => {
    await applyLocalMutation(itemId, "TOGGLE_COMPLETE", { isCompleted: !currentStatus });
  };

  // Re-assign staff member
  const handleAssignStaff = async (itemId: string, assignedUserId: string | null) => {
    await applyLocalMutation(itemId, "ASSIGN_STAFF", { assignedUserId });
  };

  // Save remarks
  const handleSaveRemarks = async (itemId: string) => {
    await applyLocalMutation(itemId, "UPDATE_REMARKS", { remarks: remarksInput });
    setEditingRemarksId(null);
    setRemarksInput("");
  };

  // Resolve conflict: Keep Server Version
  const handleKeepServerVersion = async (itemId: string) => {
    try {
      // Find the pending mutation for this item and delete it
      const pending = await db.pendingChecklistMutations
        .where("checklistItemId")
        .equals(itemId)
        .toArray();
      
      for (const p of pending) {
        await db.pendingChecklistMutations.delete(p.clientMutationId);
      }

      // Re-trigger load to wipe conflict state and fetch server details
      await loadChecklist();
      alert("Local changes discarded. Server version applied.");
    } catch (err) {
      console.error(err);
    }
  };

  // Resolve conflict: Apply Local Version (force overwrite by matching current version)
  const handleApplyLocalVersion = async (itemId: string, serverVersion: number) => {
    try {
      // Find the pending mutation for this item
      const pending = await db.pendingChecklistMutations
        .where("checklistItemId")
        .equals(itemId)
        .toArray();

      if (pending.length > 0) {
        // Update its expectedVersion to match the latest server version
        for (const p of pending) {
          p.expectedVersion = serverVersion;
          await db.pendingChecklistMutations.put(p);
        }
      }

      // Re-trigger sync immediately
      if (navigator.onLine) {
        await triggerSync();
      } else {
        await loadChecklist();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Connectivity events
  useEffect(() => {
    loadChecklist();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
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
  }, []);

  if (loading && !data) {
    return (
      <PageLayout>
        <div className="text-center py-16 text-sm text-gray-500 font-sans">
          Loading checklist parameters...
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-start shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold">Checklist Fetch Error</h3>
            <p className="mt-1">{error}</p>
            <button
              onClick={() => loadChecklist()}
              className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-[10px] transition"
            >
              Retry Load
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!data) return null;

  return (
    <PageLayout>
      {/* Header Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 bg-amber-50 border border-amber-200 text-primary rounded">
              Visit Checklist
            </span>
            <h1 className="text-xl font-bold text-gray-950 mt-2 font-sans">{data.scheduleTitle}</h1>
            
            <div className="flex flex-col gap-1.5 mt-3 text-xs text-gray-600">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{data.venue}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <span>
                  {new Date(data.startAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  -{" "}
                  {new Date(data.endAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  ({new Date(data.startAt).toLocaleDateString("en-IN")})
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-xs px-2.5 py-1 font-bold rounded border border-gray-200 uppercase bg-gray-50 text-gray-700">
              Schedule: {data.scheduleStatus}
            </span>
            <span className={`text-xs px-2.5 py-1 font-extrabold rounded border uppercase ${
              data.checklistStatus === "COMPLETED" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : data.checklistStatus === "IN_PROGRESS"
                ? "bg-sky-50 text-sky-800 border-sky-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}>
              Checklist: {data.checklistStatus.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Progress Metrics */}
        <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Overall Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all" 
                  style={{ width: `${data.progress}%` }} 
                />
              </div>
              <span className="text-xs font-bold text-gray-800">{data.progress}%</span>
            </div>
          </div>

          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Checklist Items</p>
            <p className="text-sm font-bold text-gray-800 mt-1">
              {data.completedItems} / {data.totalItems} Completed
            </p>
          </div>

          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Pending Items</p>
            <p className="text-sm font-bold text-gray-800 mt-1">
              {data.pendingItems}
            </p>
          </div>

          <div className="text-center sm:text-right">
            <p className="text-[10px] font-bold text-red-400 uppercase">Pending Mandatory</p>
            <p className="text-sm font-black text-red-600 mt-1">
              {data.pendingMandatoryItems}
            </p>
          </div>
        </div>
      </div>

      {/* Sync state indicators banner */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${
            isOnline ? "text-emerald-700" : "text-red-600"
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>Connected Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Offline Cache Mode</span>
              </>
            )}
          </div>

          {pendingSyncCount > 0 && (
            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
              {pendingSyncCount} Change(s) Pending Sync
            </span>
          )}

          {lastSyncTime && (
            <p className="text-[10px] text-gray-400 font-medium">
              Last Sync: {lastSyncTime}
            </p>
          )}
        </div>

        {isOnline && pendingSyncCount > 0 && (
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-semibold rounded text-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>Sync Changes</span>
          </button>
        )}
      </div>

      {/* Collapsible Sections List */}
      <div className="space-y-4">
        {(["BEFORE_VISIT", "DURING_VISIT", "AFTER_VISIT"] as const).map((section) => {
          const sectionTitle = section.replace("_", " ");
          const sectionItems = data.groupedItems[section];
          const isCollapsed = collapsed[section];

          return (
            <div key={section} className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))}
                className="w-full flex justify-between items-center px-5 py-4 border-b border-gray-100 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">
                    {sectionTitle}
                  </span>
                  <span className="bg-gray-100 border border-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded">
                    {sectionItems.length} Items
                  </span>
                </div>
                <span className="text-xs text-primary font-bold hover:underline">
                  {isCollapsed ? "Expand" : "Collapse"}
                </span>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-gray-100 px-5">
                  {sectionItems.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-400 font-sans">
                      No checklist items defined in this section.
                    </p>
                  ) : (
                    sectionItems.map((item) => {
                      const hasConflict = !!(item as any).conflict;
                      const isPendingSync = pendingSyncCount > 0; // In reality we'd check if this item has an entry in pending mutations

                      return (
                        <div key={item.id} className="py-2.5 flex justify-between items-center gap-4 border-b border-gray-100 last:border-b-0">
                          {/* Left: Checkbox & Title */}
                          <div className="flex items-start gap-2.5 min-w-0">
                            <button
                              onClick={() => handleToggleItem(item.id, item.isCompleted)}
                              disabled={isPending}
                              className="mt-0.5 shrink-0 focus:outline-none"
                              aria-label={item.isCompleted ? "Mark incomplete" : "Mark completed"}
                            >
                              {item.isCompleted ? (
                                <CheckCircle2 className="w-4.5 h-4.5 text-primary shrink-0" />
                              ) : (
                                <Circle className="w-4.5 h-4.5 text-gray-300 shrink-0 hover:text-gray-400" />
                              )}
                            </button>
                            
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h4 className={`text-sm font-bold text-gray-950 whitespace-normal break-words ${
                                  item.isCompleted ? "line-through text-gray-400" : ""
                                }`}>
                                  {item.title}
                                  {item.isMandatory && (
                                    <span className="text-red-500 font-black text-sm ml-0.5 align-middle" title="Mandatory" aria-label="Mandatory">
                                      *
                                    </span>
                                  )}
                                </h4>
                                {hasConflict && (
                                  <span className="bg-red-100 text-red-800 border border-red-300 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Conflict
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Right: Completed details & Remarks */}
                          <div className="shrink-0 flex items-center gap-3">
                            {/* Completed Details */}
                            {item.isCompleted && item.completedBy && (
                              <div className="text-right hidden md:block">
                                <p className="text-[9px] font-bold text-gray-400">Completed By</p>
                                <p className="text-xs font-semibold text-gray-700 mt-0.5 leading-none">{item.completedBy.name}</p>
                              </div>
                            )}

                            {/* Remarks Block */}
                            {(item.remarks || editingRemarksId === item.id) ? (
                              <div className="text-[10px] text-gray-500">
                                {editingRemarksId === item.id ? (
                                  <div className="flex gap-1 items-center">
                                    <input
                                      type="text"
                                      value={remarksInput}
                                      onChange={(e) => setRemarksInput(e.target.value)}
                                      placeholder="Add remark..."
                                      className="text-[10px] h-6 px-2 py-0.5 border border-gray-250 rounded focus:outline-none focus:border-emerald-700 bg-white w-32 sm:w-48"
                                    />
                                    <button
                                      onClick={() => handleSaveRemarks(item.id)}
                                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[9px] cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingRemarksId(null)}
                                      className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded font-semibold text-[9px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 bg-gray-50 border border-gray-150 rounded-full px-2 py-0.5">
                                    <MessageSquare className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span className="font-bold text-gray-500 shrink-0 hidden sm:inline">Remarks:</span>
                                    <span className="text-gray-700 font-medium truncate max-w-[100px] sm:max-w-[180px]">{item.remarks}</span>
                                    <button
                                      onClick={() => {
                                        setEditingRemarksId(item.id);
                                        setRemarksInput(item.remarks || "");
                                      }}
                                      className="text-primary hover:underline font-extrabold ml-1 cursor-pointer text-[9px] uppercase tracking-wider"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              editingRemarksId !== item.id && (
                                <button
                                  onClick={() => {
                                    setEditingRemarksId(item.id);
                                    setRemarksInput("");
                                  }}
                                  className="text-gray-400 hover:text-primary flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>Add Remark</span>
                                </button>
                              )
                            )}
                          </div>
                          
                          {/* Version mismatch Conflict resolution Box */}
                          {hasConflict && (
                            <div className="mt-3 ml-8.5 p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                              <h5 className="font-extrabold flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                Sync Conflict Detected
                              </h5>
                              <p className="mt-1 text-red-700">
                                This checklist item was modified on the server by another request. Please choose which version to keep:
                              </p>

                              <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-white border border-red-100 rounded">
                                <div>
                                  <p className="font-bold text-[10px] text-gray-400 uppercase">Local Attempt</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">
                                    Status: {(item as any).conflict.localValue.isCompleted ? "Completed" : "Incomplete"}
                                  </p>
                                  <p className="text-gray-700 text-[10px] truncate mt-0.5">
                                    Remarks: {(item as any).conflict.localValue.remarks || "None"}
                                  </p>
                                </div>
                                <div className="border-l border-gray-100 pl-4">
                                  <p className="font-bold text-[10px] text-gray-400 uppercase">Server Latest</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">
                                    Status: {(item as any).conflict.serverValue.isCompleted ? "Completed" : "Incomplete"}
                                  </p>
                                  <p className="text-gray-700 text-[10px] truncate mt-0.5">
                                    Remarks: {(item as any).conflict.serverValue.remarks || "None"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end mt-4">
                                <button
                                  onClick={() => handleKeepServerVersion(item.id)}
                                  className="px-3 py-1.5 border border-red-200 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded text-[10px] transition"
                                >
                                  Keep Server Version
                                </button>
                                <button
                                  onClick={() => handleApplyLocalVersion(item.id, (item as any).conflict.serverVersion)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-[10px] transition"
                                >
                                  Apply Local Version
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageLayout>
  );
}
