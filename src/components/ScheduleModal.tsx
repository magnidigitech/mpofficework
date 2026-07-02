"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { 
  X, Plus, Trash, Calendar, Users, AlertCircle, CheckCircle2, 
  MapPin, Phone, Clock, Loader2
} from "lucide-react";

const contactSchema = zod.object({
  name: zod.string().optional().or(zod.literal("")),
  phone: zod.string().optional().or(zod.literal("")),
  designation: zod.string().optional().or(zod.literal("")),
});

const scheduleSchema = zod.object({
  title: zod.string().min(3, "Title must be at least 3 characters"),
  description: zod.string().optional().nullable(),
  venue: zod.string().min(3, "Venue location is required"),
  startAt: zod.string().min(1, "Start date and time is required"),
  endAt: zod.string().optional().or(zod.literal("")),
  status: zod.enum([
    "DRAFT",
    "CONFIRMED",
    "TRAVELLING",
    "ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
    "POSTPONED",
    "CANCELLED"
  ]),
  organizerName: zod.string().optional().nullable(),
  organizerPhone: zod.string().optional().nullable(),
  googleMapsLink: zod.string().optional().nullable(),
  category: zod.string().optional().nullable(),
  priority: zod.string().optional().nullable(),
  internalInstructions: zod.string().optional().nullable(),
  requiredDocuments: zod.string().optional().nullable(),
  assignedStaffIds: zod.array(zod.string()),
  contacts: zod.array(contactSchema),
  checklistItems: zod.array(zod.string()).optional(),
});

type ScheduleFormValues = zod.infer<typeof scheduleSchema>;

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editId?: string | null;
}

export function ScheduleModal({ isOpen, onClose, onSave, editId }: ScheduleModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [checklistInput, setChecklistInput] = useState("");

  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      title: "",
      description: "",
      venue: "",
      startAt: "",
      endAt: "",
      status: "DRAFT",
      organizerName: "",
      organizerPhone: "",
      googleMapsLink: "",
      category: "Tour",
      priority: "MEDIUM",
      internalInstructions: "",
      requiredDocuments: "",
      assignedStaffIds: [],
      contacts: [{ name: "", phone: "", designation: "" }],
      checklistItems: [],
    },
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control,
    name: "contacts",
  });

  const currentChecklist = watch("checklistItems") || [];
  const startAtValue = watch("startAt");

  // Load staff list
  useEffect(() => {
    if (isOpen) {
      async function loadStaff() {
        try {
          const res = await fetch("/api/users");
          if (res.ok) {
            const data = await res.json();
            setStaffMembers(data);
          }
        } catch (err) {
          console.error("Failed to load staff list:", err);
        }
      }
      loadStaff();
    }
  }, [isOpen]);

  // Load edit data
  useEffect(() => {
    if (isOpen && editId) {
      async function loadEditData() {
        try {
          const res = await fetch(`/api/schedules/${editId}`);
          if (res.ok) {
            const data = await res.json();
            
            const formatDatetime = (dateString: string) => {
              if (!dateString) return "";
              const date = new Date(dateString);
              const offsetMs = 5.5 * 60 * 60 * 1000;
              const localDate = new Date(date.getTime() + offsetMs);
              return localDate.toISOString().slice(0, 16);
            };

            reset({
              title: data.title,
              description: data.description || "",
              venue: data.venue,
              startAt: formatDatetime(data.startAt),
              endAt: formatDatetime(data.endAt),
              status: data.status,
              organizerName: data.organizerName || "",
              organizerPhone: data.organizerPhone || "",
              googleMapsLink: data.googleMapsLink || "",
              category: data.category || "",
              priority: data.priority || "MEDIUM",
              internalInstructions: data.internalInstructions || "",
              requiredDocuments: data.requiredDocuments || "",
              assignedStaffIds: data.assignments ? data.assignments.map((a: any) => a.user.id) : [],
              contacts: data.contacts && data.contacts.length > 0 ? data.contacts : [{ name: "", phone: "", designation: "" }],
              checklistItems: data.checklistItems ? data.checklistItems.map((c: any) => c.title) : [],
            });
          }
        } catch (err) {
          console.error("Failed to load edit data:", err);
        }
      }
      loadEditData();
    } else if (isOpen) {
      setError(null);
      setSuccess(null);
      reset({
        title: "",
        description: "",
        venue: "",
        startAt: "",
        endAt: "",
        status: "DRAFT",
        organizerName: "",
        organizerPhone: "",
        googleMapsLink: "",
        category: "Tour",
        priority: "MEDIUM",
        internalInstructions: "",
        requiredDocuments: "",
        assignedStaffIds: [],
        contacts: [{ name: "", phone: "", designation: "" }],
        checklistItems: [],
      });
    }
  }, [isOpen, editId, reset]);

  const handleAddChecklistItem = () => {
    if (checklistInput.trim()) {
      setValue("checklistItems", [...currentChecklist, checklistInput.trim()]);
      setChecklistInput("");
    }
  };

  const handleRemoveChecklistItem = (idx: number) => {
    setValue("checklistItems", currentChecklist.filter((_, i) => i !== idx));
  };

  const handleQuickDuration = (minutes: number) => {
    const startVal = watch("startAt");
    const baseDate = startVal ? new Date(startVal) : new Date();
    
    const newDate = new Date(baseDate.getTime() + minutes * 60 * 1000);
    
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, "0");
    const day = String(newDate.getDate()).padStart(2, "0");
    const hours = String(newDate.getHours()).padStart(2, "0");
    const mins = String(newDate.getMinutes()).padStart(2, "0");
    
    const formatted = `${year}-${month}-${day}T${hours}:${mins}`;
    setValue("endAt", formatted);
  };

  const onSubmit = async (data: ScheduleFormValues) => {
    setError(null);
    setSuccess(null);
    
    // Default endAt to 1 hour after startAt if not specified
    let finalEndAt = data.endAt;
    if (!finalEndAt && data.startAt) {
      const startVal = new Date(data.startAt);
      const endVal = new Date(startVal.getTime() + 60 * 60 * 1000); // +1 hour
      const year = endVal.getFullYear();
      const month = String(endVal.getMonth() + 1).padStart(2, "0");
      const day = String(endVal.getDate()).padStart(2, "0");
      const hours = String(endVal.getHours()).padStart(2, "0");
      const mins = String(endVal.getMinutes()).padStart(2, "0");
      finalEndAt = `${year}-${month}-${day}T${hours}:${mins}`;
    }

    const formatPayloadDate = (dt: string) => {
      if (!dt) return dt;
      if (dt.includes("+") || dt.endsWith("Z")) return dt;
      return `${dt}:00+05:30`;
    };

    const payload = {
      ...data,
      startAt: formatPayloadDate(data.startAt),
      endAt: formatPayloadDate(finalEndAt || ""),
    };

    startTransition(async () => {
      try {
        const url = editId ? `/api/schedules/${editId}` : "/api/schedules/create";
        const method = editId ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setSuccess(editId ? "Schedule updated successfully!" : "Schedule created successfully!");
          setTimeout(() => {
            onSave();
            onClose();
          }, 800);
        } else {
          const errData = await res.json();
          setError(errData.error || "Failed to save schedule.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-0 md:p-4 bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative bg-white w-full max-h-[90vh] md:max-h-[85vh] md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        {/* Mobile handle */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 md:hidden shrink-0" />
        
        {/* Header */}
        <div className="px-6 pb-4 pt-1 md:py-5 border-b border-gray-150 flex items-center justify-between shrink-0 bg-gray-50/50 md:bg-transparent rounded-t-2xl">
          <div>
            <h3 className="font-bold text-gray-950 text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-700" />
              <span>{editId ? "Edit Tour Visit" : "Add New Tour Visit"}</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {editId ? "Modify specific visit details and staff allocations" : "Create a new schedule with tasks and coordinator mappings"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex gap-2 items-start shadow-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex gap-2 items-start shadow-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="font-semibold">{success}</span>
            </div>
          )}

          <form id="schedule-modal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Event Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Village Inspection Tour"
                  {...register("title")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                />
                {errors.title && (
                  <span className="text-red-500 text-xs mt-1 font-semibold">{errors.title.message}</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Venue Location *</label>
                <input
                  type="text"
                  placeholder="e.g. Town Hall, Guntur"
                  {...register("venue")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                />
                {errors.venue && (
                  <span className="text-red-500 text-xs mt-1 font-semibold">{errors.venue.message}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Starts At *</label>
                <input 
                  type="datetime-local" 
                  {...register("startAt")} 
                  disabled={isPending} 
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                />
                {errors.startAt && (
                  <span className="text-red-500 text-xs mt-1 font-semibold">{errors.startAt.message}</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Ends At</label>
                <input 
                  type="datetime-local" 
                  {...register("endAt")} 
                  disabled={!startAtValue || isPending} 
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {([15, 30, 45, 60] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleQuickDuration(mins)}
                      disabled={!startAtValue || isPending}
                      className="px-2.5 py-1 bg-gray-50 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-250 hover:text-emerald-700 disabled:opacity-50 disabled:hover:bg-gray-50 disabled:hover:border-gray-200 disabled:hover:text-gray-600 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
                {errors.endAt && (
                  <span className="text-red-500 text-xs mt-1 font-semibold">{errors.endAt.message}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Visit Status *</label>
                <select
                  {...register("status")}
                  disabled={isPending}
                  className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:border-emerald-700"
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
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Priority *</label>
                <select
                  {...register("priority")}
                  disabled={isPending}
                  className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:border-emerald-700"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Google Maps URL</label>
              <input
                type="url"
                placeholder="Maps Link"
                {...register("googleMapsLink")}
                disabled={isPending}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                placeholder="Details about meeting purpose..."
                rows={2}
                {...register("description")}
                disabled={isPending}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Required Documents</label>
                <textarea
                  placeholder="Required documents list..."
                  rows={2}
                  {...register("requiredDocuments")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Internal Instructions</label>
                <textarea
                  placeholder="Confidential notes for staff..."
                  rows={2}
                  {...register("internalInstructions")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>

            {/* Staff list */}
            {staffMembers.length > 0 && (
              <div className="flex flex-col pt-2">
                <label className="text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-gray-400" /> 
                  <span>Assign Staff Coordinators</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded-xl p-3 max-h-36 overflow-y-auto bg-gray-50/50">
                  {staffMembers.map((staff) => (
                    <label key={staff.id} className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer p-1 hover:bg-white rounded transition">
                      <input
                        type="checkbox"
                        value={staff.id}
                        checked={(watch("assignedStaffIds") || []).includes(staff.id)}
                        onChange={(e) => {
                          const currentIds = watch("assignedStaffIds") || [];
                          if (e.target.checked) {
                            setValue("assignedStaffIds", [...currentIds, staff.id]);
                          } else {
                            setValue("assignedStaffIds", currentIds.filter(id => id !== staff.id));
                          }
                        }}
                        disabled={isPending}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700"
                      />
                      <span className="truncate">{staff.name} ({staff.email})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts Array */}
            <div className="pt-4 border-t border-gray-150">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Contact Details</h3>
                <button
                  type="button"
                  onClick={() => appendContact({ name: "", phone: "", designation: "" })}
                  className="flex items-center gap-1 text-xs text-emerald-700 font-bold hover:underline"
                  disabled={isPending}
                >
                  <Plus className="w-3.5 h-3.5" /> 
                  <span>Add Contact</span>
                </button>
              </div>

              <div className="space-y-3">
                {contactFields.map((field, idx) => (
                  <div key={field.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row gap-3 relative items-start">
                    <div className="flex-1 w-full flex flex-col">
                      <input
                        type="text"
                        placeholder="Contact Name"
                        {...register(`contacts.${idx}.name` as const)}
                        disabled={isPending}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                    <div className="flex-1 w-full flex flex-col">
                      <input
                        type="text"
                        placeholder="Mobile Number"
                        {...register(`contacts.${idx}.phone` as const)}
                        disabled={isPending}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                    {contactFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(idx)}
                        className="p-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition shrink-0 self-center sm:self-auto"
                        disabled={isPending}
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>


          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-150 flex items-center justify-end gap-3 bg-gray-50/50 md:bg-transparent shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-250 hover:bg-gray-100 rounded-lg text-xs font-semibold text-gray-600 transition"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="schedule-modal-form"
            disabled={isPending}
            className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm transition text-xs flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{editId ? "Update Visit" : "Create Visit"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
