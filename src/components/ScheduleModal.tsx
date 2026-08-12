"use client";

import { useEffect, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  X, Plus, Trash, Calendar, AlertCircle, CheckCircle2,
  Clock, Loader2, MapPin,
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
    "DRAFT", "CONFIRMED", "TRAVELLING", "ARRIVED",
    "IN_PROGRESS", "COMPLETED", "POSTPONED", "CANCELLED",
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

  const {
    register, control, handleSubmit, reset, setValue, watch,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      title: "", description: "", venue: "",
      startAt: "", endAt: "", status: "DRAFT",
      organizerName: "", organizerPhone: "",
      googleMapsLink: "", category: "Tour", priority: "MEDIUM",
      internalInstructions: "", requiredDocuments: "",
      assignedStaffIds: [],
      contacts: [{ name: "", phone: "", designation: "" }],
      checklistItems: [],
    },
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control, name: "contacts",
  });

  const startAtValue = watch("startAt");

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Load edit data / reset on open
  useEffect(() => {
    if (!isOpen) return;
    if (editId) {
      (async () => {
        try {
          const res = await fetch(`/api/schedules/${editId}`);
          if (!res.ok) return;
          const data = await res.json();
          const fmt = (ds: string) => {
            if (!ds) return "";
            const d = new Date(ds);
            return new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 16);
          };
          reset({
            title: data.title,
            description: data.description || "",
            venue: data.venue,
            startAt: fmt(data.startAt),
            endAt: fmt(data.endAt),
            status: data.status,
            organizerName: data.organizerName || "",
            organizerPhone: data.organizerPhone || "",
            googleMapsLink: data.googleMapsLink || "",
            category: data.category || "Tour",
            priority: data.priority || "MEDIUM",
            internalInstructions: data.internalInstructions || "",
            requiredDocuments: data.requiredDocuments || "",
            assignedStaffIds: data.assignments?.map((a: any) => a.user.id) ?? [],
            contacts: data.contacts?.length > 0
              ? data.contacts
              : [{ name: "", phone: "", designation: "" }],
            checklistItems: data.checklistItems?.map((c: any) => c.title) ?? [],
          });
        } catch (e) { console.error(e); }
      })();
    } else {
      reset({
        title: "", description: "", venue: "",
        startAt: "", endAt: "", status: "DRAFT",
        organizerName: "", organizerPhone: "",
        googleMapsLink: "", category: "Tour", priority: "MEDIUM",
        internalInstructions: "", requiredDocuments: "",
        assignedStaffIds: [],
        contacts: [{ name: "", phone: "", designation: "" }],
        checklistItems: [],
      });
    }
  }, [isOpen, editId, reset]);

  const quickEnd = (mins: number) => {
    const base = startAtValue ? new Date(startAtValue) : new Date();
    const d = new Date(base.getTime() + mins * 60000);
    setValue("endAt",
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
  };

  const onSubmit = (data: ScheduleFormValues) => {
    let finalEndAt = data.endAt;
    if (!finalEndAt && data.startAt) {
      const d = new Date(new Date(data.startAt).getTime() + 3600000);
      finalEndAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    const fmt = (dt: string) => (!dt || dt.includes("+") || dt.endsWith("Z")) ? dt : `${dt}:00+05:30`;

    startTransition(async () => {
      try {
        const res = await fetch(
          editId ? `/api/schedules/${editId}` : "/api/schedules/create",
          {
            method: editId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, startAt: fmt(data.startAt), endAt: fmt(finalEndAt || "") }),
          }
        );
        if (res.ok) {
          setTimeout(() => { onSave(); onClose(); }, 600);
        } else {
          const err = await res.json();
          alert(err.error || "Failed to save schedule.");
        }
      } catch (e: any) { alert(e.message); }
    });
  };

  if (!isOpen) return null;

  const inp = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 transition placeholder:text-gray-400";
  const sel = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 transition";
  const lbl = "block text-xs font-semibold text-gray-600 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="relative bg-white w-full max-h-[93vh] md:max-h-[87vh] md:max-w-xl rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col"
        style={{ animation: "slideUp 0.22s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Drag handle (mobile) */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm leading-tight">
                {editId ? "Edit Visit" : "New Visit"}
              </h3>
              <p className="text-[10px] text-gray-400 font-medium">
                {editId ? "Update the details below" : "Fill in the visit details"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <form id="smf" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            {/* Title */}
            <div>
              <label className={lbl}>Event Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Village Inspection Tour"
                {...register("title")}
                disabled={isPending}
                className={inp}
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            {/* Venue — full width */}
            <div>
              <label className={lbl}>
                <MapPin className="w-3 h-3 inline mr-1 text-gray-400" />
                Venue <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Town Hall, Guntur"
                {...register("venue")}
                disabled={isPending}
                className={inp}
              />
              {errors.venue && <p className="text-red-500 text-xs mt-1">{errors.venue.message}</p>}
            </div>

            {/* Google Maps URL — full width, optional */}
            <div>
              <label className={lbl}>
                <MapPin className="w-3 h-3 inline mr-1 text-gray-400" />
                Google Maps URL <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                placeholder="https://maps.google.com/..."
                {...register("googleMapsLink")}
                disabled={isPending}
                className={inp}
              />
            </div>


            {/* Starts At — full width */}
            <div>
              <label className={lbl}>
                <Clock className="w-3 h-3 inline mr-1 text-gray-400" />
                Starts At <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                {...register("startAt")}
                disabled={isPending}
                className={inp}
              />
              {errors.startAt && <p className="text-red-500 text-xs mt-1">{errors.startAt.message}</p>}
            </div>

            {/* Ends At — full width */}
            <div>
              <label className={lbl}>
                <Clock className="w-3 h-3 inline mr-1 text-gray-400" />
                Ends At
              </label>
              <input
                type="datetime-local"
                {...register("endAt")}
                disabled={!startAtValue || isPending}
                className={`${inp} disabled:bg-gray-50 disabled:text-gray-400`}
              />
            </div>

            {/* Quick duration chips */}
            <div className="flex gap-1.5 flex-wrap -mt-1">
              {[
                { m: 30, l: "+30m" }, { m: 45, l: "+45m" }, { m: 60, l: "+1h" },
                { m: 90, l: "+1.5h" }, { m: 120, l: "+2h" }, { m: 150, l: "+2.5h" },
              ].map(({ m, l }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => quickEnd(m)}
                  disabled={!startAtValue || isPending}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-40 rounded-full text-[10px] font-bold text-gray-600 transition"
                >
                  {l}
                </button>
              ))}
            </div>


            <div>
              <label className={lbl}>Visit Status <span className="text-red-500">*</span></label>
              <select {...register("status")} disabled={isPending} className={sel}>
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


            {/* Contacts */}
            <div className="pt-1">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</p>
                <button
                  type="button"
                  onClick={() => appendContact({ name: "", phone: "", designation: "" })}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:text-emerald-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              <div className="space-y-2.5">
                {contactFields.map((field, idx) => (
                  <div key={field.id} className="bg-gray-50/80 border border-gray-200 rounded-xl p-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Contact Name"
                      {...register(`contacts.${idx}.name` as const)}
                      disabled={isPending}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 bg-white focus:outline-none focus:border-emerald-500 transition placeholder:text-gray-400"
                    />
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        {...register(`contacts.${idx}.phone` as const)}
                        disabled={isPending}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 bg-white focus:outline-none focus:border-emerald-500 transition placeholder:text-gray-400"
                      />
                      {contactFields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContact(idx)}
                          disabled={isPending}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2.5 shrink-0 bg-gray-50/50 rounded-b-3xl md:rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2.5 border border-gray-200 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="smf"
            disabled={isPending}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold rounded-xl shadow-sm transition text-xs flex items-center gap-1.5"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{editId ? "Update Visit" : "Create Visit"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
