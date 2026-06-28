"use client";

import { useEffect, useState, useTransition, Suspense } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, FileText, Plus, Trash, AlertCircle, CheckCircle2, Shield, Users } from "lucide-react";

// 1. Zod Schemas
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
  endAt: zod.string().min(1, "End date and time is required"),
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
  checklistItems: zod.array(zod.string().min(2, "Checklist item cannot be empty")),
});

const ttdMemberSchema = zod.object({
  fullName: zod.string().min(2, "Member name must be at least 2 characters"),
  age: zod.number().min(1, "Age must be a positive number"),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: zod.string().optional().nullable(),
  relationshipToApplicant: zod.string().optional().nullable(),
  identityType: zod.enum(["AADHAAR", "VOTER_ID", "PASSPORT"]),
  identityLastFourDigits: zod.string().length(4, "Identity reference must be last 4 digits only"),
  isPrimaryApplicant: zod.boolean(),
});

const ttdRequestSchema = zod.object({
  applicantName: zod.string().min(2, "Applicant name is required"),
  applicantMobile: zod.string().min(10, "Valid mobile number is required"),
  alternateMobile: zod.string().optional().nullable(),
  address: zod.string().optional().nullable(),
  district: zod.string().optional().nullable(),
  constituency: zod.string().optional().nullable(),
  sourceType: zod.enum([
    "OFFICE_WALK_IN",
    "PHONE_CALL",
    "STAFF_REFERENCE",
    "PUBLIC_MEETING",
    "PERSONAL_REFERENCE",
    "SCHEDULE_VISIT",
    "OTHER",
  ]),
  sourceDescription: zod.string().optional().nullable(),
  relatedScheduleId: zod.string().optional().nullable(),
  referencePersonName: zod.string().optional().nullable(),
  referencePersonMobile: zod.string().optional().nullable(),
  preferredDarshanDate: zod.string().min(1, "Preferred Darshan date is required"),
  alternateDarshanDate: zod.string().optional().nullable(),
  notes: zod.string().optional().nullable(),
  documentsStatus: zod.enum(["NOT_SUBMITTED", "PARTIAL", "COMPLETE", "VERIFIED", "REJECTED"]),
  members: zod.array(ttdMemberSchema).min(1, "At least one travelling member is required"),
});

type ScheduleFormValues = zod.infer<typeof scheduleSchema>;
type TtdFormValues = zod.infer<typeof ttdRequestSchema>;

function AddNewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"schedule" | "ttd">("schedule");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Custom states for editing & staff listing
  const [editId, setEditId] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string; email: string }[]>([]);

  // Fetch staff members directory
  useEffect(() => {
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
  }, []);

  // Form Hooks
  const scheduleForm = useForm<ScheduleFormValues>({
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
      checklistItems: ["Verify venue arrangements", "Brief local coordinators"],
    },
  });

  const ttdForm = useForm<TtdFormValues>({
    resolver: zodResolver(ttdRequestSchema),
    defaultValues: {
      applicantName: "",
      applicantMobile: "",
      alternateMobile: "",
      address: "",
      district: "",
      constituency: "",
      sourceType: "OFFICE_WALK_IN",
      sourceDescription: "",
      relatedScheduleId: "",
      referencePersonName: "",
      referencePersonMobile: "",
      preferredDarshanDate: "",
      alternateDarshanDate: "",
      notes: "",
      documentsStatus: "NOT_SUBMITTED",
      members: [{ fullName: "", age: 30, gender: "MALE", mobile: "", relationshipToApplicant: "", identityType: "AADHAAR", identityLastFourDigits: "", isPrimaryApplicant: true }],
    },
  });

  const [ttdStep, setTtdStep] = useState(1);
  const [schedulesList, setSchedulesList] = useState<{ id: string; title: string; startAt: string }[]>([]);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);

  useEffect(() => {
    async function loadSchedules() {
      try {
        const res = await fetch("/api/schedules");
        if (res.ok) {
          const body = await res.json();
          setSchedulesList(body.schedules || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadSchedules();
  }, []);

  useEffect(() => {
    if (activeTab === "ttd" && ttdStep === 6) {
      async function runDuplicateCheck() {
        setLoadingWarnings(true);
        try {
          const res = await fetch("/api/ttd/requests/check-duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ttdForm.getValues()),
          });
          if (res.ok) {
            const body = await res.json();
            setReviewWarnings(body.warnings || []);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingWarnings(false);
        }
      }
      runDuplicateCheck();
    }
  }, [ttdStep, activeTab]);

  // Read query parameters to activate tab and load edit state
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "ttd") {
      setActiveTab("ttd");
    }

    const id = searchParams.get("id");
    if (id && activeTab === "schedule") {
      setEditId(id);
      
      async function loadEditData() {
        try {
          const res = await fetch(`/api/schedules/${id}`);
          if (res.ok) {
            const data = await res.json();
            
            // Format timestamps correctly to local datetime string: YYYY-MM-DDThh:mm
            const formatDatetime = (dateString: string) => {
              if (!dateString) return "";
              const date = new Date(dateString);
              // Shift by Kolkata offset for input prefill matching
              const offsetMs = 5.5 * 60 * 60 * 1000;
              const localDate = new Date(date.getTime() + offsetMs);
              return localDate.toISOString().slice(0, 16);
            };

            scheduleForm.reset({
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
          } else {
            console.error("Failed to fetch schedule detail for edit");
          }
        } catch (err) {
          console.error("Failed to load edit data:", err);
        }
      }

      loadEditData();
    }
  }, [searchParams, activeTab]);

  // Dynamic Array for Contacts (Schedule)
  const {
    fields: contactFields,
    append: appendContact,
    remove: removeContact,
  } = useFieldArray({
    control: scheduleForm.control,
    name: "contacts",
  });

  // Dynamic Array for Members (TTD)
  const {
    fields: memberFields,
    append: appendMember,
    remove: removeMember,
  } = useFieldArray({
    control: ttdForm.control,
    name: "members",
  });

  // Dynamic List for Checklist Items (Schedule)
  const [checklistInput, setChecklistInput] = useState("");
  const currentChecklist = scheduleForm.watch("checklistItems") || [];

  const handleAddChecklistItem = () => {
    if (checklistInput.trim()) {
      scheduleForm.setValue("checklistItems", [...currentChecklist, checklistInput.trim()]);
      setChecklistInput("");
    }
  };

  const handleRemoveChecklistItem = (idx: number) => {
    const nextChecklist = currentChecklist.filter((_, i) => i !== idx);
    scheduleForm.setValue("checklistItems", nextChecklist);
  };

  // Submit Handlers
  const onScheduleSubmit = async (data: ScheduleFormValues) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const url = editId ? `/api/schedules/${editId}` : "/api/schedules/create";
        const method = editId ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          setSuccess(editId ? "Schedule updated successfully!" : "Schedule created successfully!");
          scheduleForm.reset();
          setTimeout(() => router.push("/schedule"), 1000);
        } else {
          const errData = await res.json();
          setError(errData.error || "Failed to save schedule.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      }
    });
  };

  const onTtdSubmit = async (data: TtdFormValues) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ttd/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          setSuccess("TTD Letter application created successfully!");
          ttdForm.reset();
          setTimeout(() => router.push("/ttd-letters"), 1000);
        } else {
          const errData = await res.json();
          setError(errData.error || "Failed to submit letter application.");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 font-sans">
          {editId ? "Edit Tour Schedule" : "Add Record"}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          {editId ? "Update tour parameters and staff assignments" : "Create new schedules or request recommendation letters"}
        </p>
      </div>

      {/* Tabs Selector (Hidden when editing) */}
      {!editId && (
        <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-lg shadow-sm">
          <button
            onClick={() => {
              setActiveTab("schedule");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-4 text-sm font-semibold border-b-2 flex items-center justify-center gap-2 transition ${
              activeTab === "schedule"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Schedule Event
          </button>
          <button
            onClick={() => {
              setActiveTab("ttd");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-4 text-sm font-semibold border-b-2 flex items-center justify-center gap-2 transition ${
              activeTab === "ttd"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            TTD Letter
          </button>
        </div>
      )}

      {/* Action Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-start shadow-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex gap-2 items-start shadow-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Content Form Blocks */}
      <div className="bg-white border border-gray-200 rounded-b-lg p-6 shadow-sm">
        {activeTab === "schedule" ? (
          /* SCHEDULE TOUR FORM */
          <form onSubmit={scheduleForm.handleSubmit(onScheduleSubmit)} className="space-y-6" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Event Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Village Inspection Tour"
                  {...scheduleForm.register("title")}
                  disabled={isPending}
                />
                {scheduleForm.formState.errors.title && (
                  <span className="text-red-500 text-xs mt-1">{scheduleForm.formState.errors.title.message}</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Venue Location *</label>
                <input
                  type="text"
                  placeholder="e.g. Town Hall, Guntur"
                  {...scheduleForm.register("venue")}
                  disabled={isPending}
                />
                {scheduleForm.formState.errors.venue && (
                  <span className="text-red-500 text-xs mt-1">{scheduleForm.formState.errors.venue.message}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Starts At (Kolkata Time) *</label>
                <input type="datetime-local" {...scheduleForm.register("startAt")} disabled={isPending} />
                {scheduleForm.formState.errors.startAt && (
                  <span className="text-red-500 text-xs mt-1">{scheduleForm.formState.errors.startAt.message}</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Ends At (Kolkata Time) *</label>
                <input type="datetime-local" {...scheduleForm.register("endAt")} disabled={isPending} />
                {scheduleForm.formState.errors.endAt && (
                  <span className="text-red-500 text-xs mt-1">{scheduleForm.formState.errors.endAt.message}</span>
                )}
              </div>
            </div>

            {/* Visit Status, Priority, Category Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Visit Status *</label>
                <select
                  {...scheduleForm.register("status")}
                  disabled={isPending}
                  className="h-[48px] border border-gray-200 rounded px-2.5 text-sm"
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
                  {...scheduleForm.register("priority")}
                  disabled={isPending}
                  className="h-[48px] border border-gray-200 rounded px-2.5 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Category *</label>
                <input
                  type="text"
                  placeholder="e.g. Tour, Public Meet, Party"
                  {...scheduleForm.register("category")}
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Organizer details & Maps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Organizer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  {...scheduleForm.register("organizerName")}
                  disabled={isPending}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Organizer Mobile</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  {...scheduleForm.register("organizerPhone")}
                  disabled={isPending}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Google Maps URL</label>
                <input
                  type="url"
                  placeholder="e.g. https://maps.google.com/..."
                  {...scheduleForm.register("googleMapsLink")}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                placeholder="Details about meeting purpose, public issues..."
                rows={2}
                {...scheduleForm.register("description")}
                disabled={isPending}
                className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Required Documents</label>
                <textarea
                  placeholder="e.g. Welfare reports, budget proposals..."
                  rows={2}
                  {...scheduleForm.register("requiredDocuments")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 mb-1">Internal Instructions</label>
                <textarea
                  placeholder="Confidential notes for staff coordinators..."
                  rows={2}
                  {...scheduleForm.register("internalInstructions")}
                  disabled={isPending}
                  className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Staff Assignments checklist */}
            {staffMembers.length > 0 && (
              <div className="flex flex-col pt-2">
                <label className="text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                  <Users className="w-4 h-4 text-gray-400" /> Assign Staff Coordinators
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded p-3.5 max-h-40 overflow-y-auto bg-gray-50/50">
                  {staffMembers.map((staff) => (
                    <label key={staff.id} className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer p-1 hover:bg-white rounded">
                      <input
                        type="checkbox"
                        value={staff.id}
                        checked={(scheduleForm.watch("assignedStaffIds") || []).includes(staff.id)}
                        onChange={(e) => {
                          const currentIds = scheduleForm.getValues("assignedStaffIds") || [];
                          if (e.target.checked) {
                            scheduleForm.setValue("assignedStaffIds", [...currentIds, staff.id]);
                          } else {
                            scheduleForm.setValue("assignedStaffIds", currentIds.filter(id => id !== staff.id));
                          }
                        }}
                        disabled={isPending}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                      />
                      <span>{staff.name} ({staff.email})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts Array */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gray-800">Local Visit Contacts</h3>
                <button
                  type="button"
                  onClick={() => appendContact({ name: "", phone: "", designation: "" })}
                  className="flex items-center gap-1 text-xs text-primary font-bold hover:underline"
                  disabled={isPending}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Contact
                </button>
              </div>

              <div className="space-y-3">
                {contactFields.map((field, idx) => (
                  <div key={field.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row gap-3 relative">
                    <div className="flex-1 flex flex-col">
                      <input
                        type="text"
                        placeholder="Contact Name"
                        {...scheduleForm.register(`contacts.${idx}.name` as const)}
                        disabled={isPending}
                        className="w-full h-11 text-xs"
                      />
                      {scheduleForm.formState.errors.contacts?.[idx]?.name && (
                        <span className="text-red-500 text-[10px] mt-1">
                          {scheduleForm.formState.errors.contacts[idx]?.name?.message}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <input
                        type="text"
                        placeholder="Mobile Number"
                        {...scheduleForm.register(`contacts.${idx}.phone` as const)}
                        disabled={isPending}
                        className="w-full h-11 text-xs"
                      />
                      {scheduleForm.formState.errors.contacts?.[idx]?.phone && (
                        <span className="text-red-500 text-[10px] mt-1">
                          {scheduleForm.formState.errors.contacts[idx]?.phone?.message}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <input
                        type="text"
                        placeholder="Designation (e.g. Protocol)"
                        {...scheduleForm.register(`contacts.${idx}.designation` as const)}
                        disabled={isPending}
                        className="w-full h-11 text-xs"
                      />
                    </div>
                    {contactFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(idx)}
                        className="p-2 border border-red-200 text-red-500 rounded hover:bg-red-50 transition shrink-0"
                        disabled={isPending}
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Checklist Items */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Boilerplate Checklist Items</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="e.g. Arrange security clearance"
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  className="flex-1"
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-xs font-semibold text-gray-800"
                  disabled={isPending}
                >
                  Add Item
                </button>
              </div>

              <ul className="space-y-1.5">
                {currentChecklist.map((item, idx) => (
                  <li key={idx} className="flex justify-between items-center p-2.5 bg-gray-50 border border-gray-100 rounded text-xs">
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      className="text-red-500 hover:text-red-700"
                      disabled={isPending}
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 bg-primary hover:bg-amber-700 text-white font-medium rounded-md transition text-sm flex items-center justify-center disabled:opacity-50"
            >
              {isPending 
                ? (editId ? "Updating Visit..." : "Creating Visit...") 
                : (editId ? "Update Tour Visit" : "Create Tour Visit")}
            </button>
          </form>
        ) : (
          /* TTD RECOMMENDATION LETTER APPLICATION FORM */
          <div className="space-y-6">
            {/* Step Indicators */}
            <div className="flex justify-between items-center bg-gray-50 border border-gray-100 p-3 rounded-lg overflow-x-auto gap-2">
              {[
                "Applicant",
                "Source",
                "Dates",
                "Members",
                "Docs",
                "Review"
              ].map((name, i) => (
                <div key={i} className="flex items-center gap-1 shrink-0 text-[10px] font-bold">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center border font-mono ${
                    ttdStep === i + 1
                      ? "bg-primary text-white border-primary"
                      : ttdStep > i + 1
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-white text-gray-400 border-gray-200"
                  }`}>
                    {i + 1}
                  </span>
                  <span className={ttdStep === i + 1 ? "text-primary" : "text-gray-400"}>{name}</span>
                </div>
              ))}
            </div>

            {/* Step 1: Applicant Details */}
            {ttdStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 1: Primary Applicant details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Applicant Name *</label>
                    <input
                      type="text"
                      placeholder="Applicant Name"
                      {...ttdForm.register("applicantName")}
                    />
                    {ttdForm.formState.errors.applicantName && (
                      <span className="text-red-500 text-xs mt-1">{ttdForm.formState.errors.applicantName.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Mobile Number *</label>
                    <input
                      type="text"
                      placeholder="Mobile Number"
                      {...ttdForm.register("applicantMobile")}
                    />
                    {ttdForm.formState.errors.applicantMobile && (
                      <span className="text-red-500 text-xs mt-1">{ttdForm.formState.errors.applicantMobile.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Alternate Mobile</label>
                    <input
                      type="text"
                      placeholder="Alternate Mobile"
                      {...ttdForm.register("alternateMobile")}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Constituency</label>
                    <input
                      type="text"
                      placeholder="Constituency"
                      {...ttdForm.register("constituency")}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">District</label>
                    <input
                      type="text"
                      placeholder="District"
                      {...ttdForm.register("district")}
                    />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1">Address</label>
                    <textarea
                      placeholder="Address"
                      {...ttdForm.register("address")}
                      className="text-xs border border-gray-200 rounded p-2"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Source Details */}
            {ttdStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 2: Referral Source Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Source Type *</label>
                    <select
                      {...ttdForm.register("sourceType")}
                      className="text-xs border border-gray-200 rounded px-2 h-10 bg-white"
                    >
                      <option value="OFFICE_WALK_IN">Walk-in Request</option>
                      <option value="PHONE_CALL">Phone Call</option>
                      <option value="STAFF_REFERENCE">Staff Reference</option>
                      <option value="PUBLIC_MEETING">Public Meeting</option>
                      <option value="PERSONAL_REFERENCE">Personal Reference</option>
                      <option value="SCHEDULE_VISIT">Tour Visit</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  {ttdForm.watch("sourceType") === "OTHER" && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1">Source Description *</label>
                      <input
                        type="text"
                        placeholder="Specify source..."
                        {...ttdForm.register("sourceDescription")}
                      />
                    </div>
                  )}

                  {ttdForm.watch("sourceType") === "SCHEDULE_VISIT" && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1">Linked Tour Visit *</label>
                      <select
                        {...ttdForm.register("relatedScheduleId")}
                        className="text-xs border border-gray-200 rounded px-2 h-10 bg-white"
                      >
                        <option value="">Select Tour Schedule</option>
                        {schedulesList.map((s) => (
                          <option key={s.id} value={s.id}>{s.title} ({new Date(s.startAt).toLocaleDateString("en-IN")})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Reference Person Name</label>
                    <input
                      type="text"
                      placeholder="Reference Person Name"
                      {...ttdForm.register("referencePersonName")}
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Reference Person Mobile</label>
                    <input
                      type="text"
                      placeholder="Reference Person Mobile"
                      {...ttdForm.register("referencePersonMobile")}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Dates Preferences */}
            {ttdStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 3: Darshan Dates Preference</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Preferred Date *</label>
                    <input type="date" {...ttdForm.register("preferredDarshanDate")} />
                    {ttdForm.formState.errors.preferredDarshanDate && (
                      <span className="text-red-500 text-xs mt-1">{ttdForm.formState.errors.preferredDarshanDate.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Alternate Date</label>
                    <input type="date" {...ttdForm.register("alternateDarshanDate")} />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1">Applicant Notes</label>
                    <textarea
                      placeholder="e.g. VIP darshan letter requested, prefer morning slot..."
                      {...ttdForm.register("notes")}
                      className="text-xs border border-gray-200 rounded p-2"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Travelling Members */}
            {ttdStep === 4 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 4: Pilgrim Details</h3>
                  <button
                    type="button"
                    onClick={() =>
                      appendMember({
                        fullName: "",
                        age: 30,
                        gender: "MALE",
                        mobile: "",
                        relationshipToApplicant: "",
                        identityType: "AADHAAR",
                        identityLastFourDigits: "",
                        isPrimaryApplicant: memberFields.length === 0,
                      })
                    }
                    className="flex items-center gap-1 text-xs text-primary font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Member
                  </button>
                </div>

                <div className="space-y-4">
                  {memberFields.map((field, idx) => (
                    <div key={field.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3 relative">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                        <span className="text-xs font-bold text-gray-600">Pilgrim Member #{idx + 1}</span>
                        {memberFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMember(idx)}
                            className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1"
                          >
                            <Trash className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Pilgrim Full Name"
                            {...ttdForm.register(`members.${idx}.fullName` as const)}
                            className="h-10 text-xs"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="number"
                            placeholder="Age"
                            {...ttdForm.register(`members.${idx}.age` as const, { valueAsNumber: true })}
                            className="h-10 text-xs"
                          />
                        </div>

                        <div className="flex flex-col">
                          <select
                            {...ttdForm.register(`members.${idx}.gender` as const)}
                            className="h-10 text-xs border border-gray-200 rounded px-2 bg-white"
                          >
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col">
                          <select
                            {...ttdForm.register(`members.${idx}.identityType` as const)}
                            className="h-10 text-xs border border-gray-200 rounded px-2 bg-white"
                          >
                            <option value="AADHAAR">Aadhaar Card</option>
                            <option value="VOTER_ID">Voter ID</option>
                            <option value="PASSPORT">Passport</option>
                          </select>
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Last 4 Digits only *"
                            maxLength={4}
                            {...ttdForm.register(`members.${idx}.identityLastFourDigits` as const)}
                            className="h-10 text-xs font-mono"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Mobile (Optional)"
                            {...ttdForm.register(`members.${idx}.mobile` as const)}
                            className="h-10 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 items-center pt-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 font-semibold">
                          <input
                            type="checkbox"
                            checked={ttdForm.watch(`members.${idx}.isPrimaryApplicant`)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Uncheck all other primary indicators
                                memberFields.forEach((_, fidx) => {
                                  ttdForm.setValue(`members.${fidx}.isPrimaryApplicant`, fidx === idx);
                                });
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                          />
                          <span>Primary Applicant</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Document Checklist */}
            {ttdStep === 5 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 5: Document upload Checklist</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Documents Upload Status</label>
                    <select
                      {...ttdForm.register("documentsStatus")}
                      className="text-xs border border-gray-200 rounded px-2 h-10 bg-white"
                    >
                      <option value="NOT_SUBMITTED">Not Submitted</option>
                      <option value="PARTIAL">Partial Copies Attached</option>
                      <option value="COMPLETE">All Identity Verification Attached</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review Application & Warnings */}
            {ttdStep === 6 && (
              <div className="space-y-5 bg-gray-50 border border-gray-200 rounded-lg p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Step 6: Review details & Warnings</h3>

                {loadingWarnings ? (
                  <div className="text-xs text-gray-500 font-bold animate-pulse">Running duplicates verification filters...</div>
                ) : reviewWarnings.length > 0 ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5">
                    <h4 className="font-extrabold text-amber-800">Duplicate Check Warnings:</h4>
                    <ul className="list-disc pl-5">
                      {reviewWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
                    No potential duplicates detected for these travel dates and details.
                  </div>
                )}

                {/* Summary list */}
                <div className="text-xs space-y-2.5 text-gray-700">
                  <p><strong>Applicant Name:</strong> {ttdForm.watch("applicantName")}</p>
                  <p><strong>Mobile Number:</strong> {ttdForm.watch("applicantMobile")}</p>
                  <p><strong>Preferred Date:</strong> {ttdForm.watch("preferredDarshanDate")}</p>
                  <p><strong>Pilgrims:</strong> {memberFields.length}</p>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-2 justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setTtdStep(Math.max(1, ttdStep - 1))}
                disabled={ttdStep === 1}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded text-xs font-bold disabled:opacity-40"
              >
                Back
              </button>

              {ttdStep < 6 ? (
                <button
                  type="button"
                  onClick={() => setTtdStep(ttdStep + 1)}
                  className="px-4 py-2 bg-primary hover:bg-amber-700 text-white rounded text-xs font-bold transition"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={ttdForm.handleSubmit(onTtdSubmit)}
                  disabled={isPending}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition"
                >
                  Submit Recommendation
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function AddNewPage() {
  return (
    <Suspense fallback={
      <PageLayout>
        <div className="text-center py-12 text-gray-500 text-sm">Loading forms...</div>
      </PageLayout>
    }>
      <AddNewPageContent />
    </Suspense>
  );
}
