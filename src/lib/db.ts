import Dexie, { type Table } from "dexie";

export interface OfflineSchedule {
  id: string;
  title: string;
  description?: string;
  startAt: string; // ISO string
  endAt: string;
  venue: string;
  status: string;
  category?: string;
  priority?: string;
  organizerName?: string;
  organizerPhone?: string;
  googleMapsLink?: string;
  requiredDocuments?: string;
  internalInstructions?: string;
}

export interface OfflineChecklistItem {
  id: string;
  visitChecklistId: string;
  templateItemId?: string;
  title: string;
  description?: string;
  section: string; // BEFORE_VISIT, DURING_VISIT, AFTER_VISIT
  displayOrder: number;
  isMandatory: boolean;
  isCompleted: boolean;
  assignedUserId?: string;
  completedById?: string;
  completedAt?: string;
  remarks?: string;
  version: number;
  assignedUser?: { id: string; name: string; email: string };
  completedBy?: { id: string; name: string; email: string };
}

export interface CachedChecklist {
  scheduleId: string;
  visitChecklistId: string;
  status: string;
  totalItems: number;
  completedItems: number;
  items: OfflineChecklistItem[];
  serverVersion: number;
  lastServerUpdateTime: string;
  lastCachedTime: string;
}

export interface PendingChecklistMutation {
  clientMutationId: string;
  checklistItemId: string;
  visitChecklistId: string;
  scheduleId: string;
  mutationType: "TOGGLE_COMPLETE" | "ASSIGN_STAFF" | "UPDATE_REMARKS" | "UPDATE";
  updatedFields: {
    isCompleted?: boolean;
    assignedUserId?: string | null;
    remarks?: string | null;
  };
  expectedVersion: number;
  clientUpdatedAt: string;
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

export interface SyncMetadata {
  userId: string;
  lastSuccessfulSyncAt?: string;
  lastAttemptAt?: string;
  currentSyncStatus: "IDLE" | "SYNCING" | "ERROR";
  latestSyncError?: string;
}

export interface OfflineContact {
  id: string;
  scheduleId: string;
  name: string;
  phone: string;
  designation?: string;
}

class MpOfficeDexie extends Dexie {
  schedules!: Table<OfflineSchedule, string>;
  checklistItems!: Table<OfflineChecklistItem, string>;
  pendingUpdates!: Table<any, number>;
  contacts!: Table<OfflineContact, string>;

  // Version 2 tables
  cachedSchedules!: Table<OfflineSchedule, string>;
  cachedChecklists!: Table<CachedChecklist, string>; // Primary key: scheduleId
  pendingChecklistMutations!: Table<PendingChecklistMutation, string>; // Primary key: clientMutationId
  syncMetadata!: Table<SyncMetadata, string>; // Primary key: userId

  constructor() {
    super("MpOfficeOfflineDB");
    // Keep version 1 for backward compatibility
    this.version(1).stores({
      schedules: "id, startAt, endAt, venue, status",
      checklistItems: "id, scheduleId, isCompleted",
      pendingUpdates: "++id, itemId, status",
      contacts: "id, scheduleId, name",
    });
    // Add version 2 stores
    this.version(2).stores({
      cachedSchedules: "id, startAt, endAt, venue, status",
      cachedChecklists: "scheduleId, visitChecklistId",
      pendingChecklistMutations: "clientMutationId, checklistItemId, visitChecklistId, scheduleId",
      syncMetadata: "userId",
    });
  }
}

export const db = new MpOfficeDexie();
