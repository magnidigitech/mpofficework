"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { 
  X, Plus, Trash, FileText, AlertCircle, CheckCircle2, 
  HelpCircle, Eye, Loader2, ArrowLeft, ArrowRight
} from "lucide-react";

const ttdMemberSchema = zod.object({
  fullName: zod.string().min(2, "Member name must be at least 2 characters"),
  age: zod.number().min(1, "Age must be a positive number"),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: zod.string().optional().nullable().or(zod.literal("")),
  relationshipToApplicant: zod.string().optional().nullable().or(zod.literal("")),
  identityType: zod.enum(["AADHAAR", "VOTER_ID", "PASSPORT"]),
  identityLastFourDigits: zod.string().length(4, "Identity reference must be last 4 digits only"),
  isPrimaryApplicant: zod.boolean(),
});

const ttdRequestSchema = zod.object({
  applicantName: zod.string().min(2, "Applicant name is required"),
  applicantMobile: zod.string().min(10, "Valid mobile number is required"),
  alternateMobile: zod.string().optional().nullable().or(zod.literal("")),
  address: zod.string().optional().nullable().or(zod.literal("")),
  district: zod.string().optional().nullable().or(zod.literal("")),
  constituency: zod.string().optional().nullable().or(zod.literal("")),
  sourceType: zod.enum([
    "OFFICE_WALK_IN",
    "PHONE_CALL",
    "STAFF_REFERENCE",
    "PUBLIC_MEETING",
    "PERSONAL_REFERENCE",
    "SCHEDULE_VISIT",
    "OTHER",
  ]),
  sourceDescription: zod.string().optional().nullable().or(zod.literal("")),
  relatedScheduleId: zod.string().optional().nullable().or(zod.literal("")),
  referencePersonName: zod.string().optional().nullable().or(zod.literal("")),
  referencePersonMobile: zod.string().optional().nullable().or(zod.literal("")),
  preferredDarshanDate: zod.string().min(1, "Preferred Darshan date is required"),
  alternateDarshanDate: zod.string().optional().nullable().or(zod.literal("")),
  notes: zod.string().optional().nullable().or(zod.literal("")),
  documentsStatus: zod.enum(["NOT_SUBMITTED", "PARTIAL", "COMPLETE", "VERIFIED", "REJECTED"]),
  members: zod.array(ttdMemberSchema).min(1, "At least one travelling member is required"),
});

type TtdFormValues = zod.infer<typeof ttdRequestSchema>;

interface TtdRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function TtdRequestModal({ isOpen, onClose, onSave }: TtdRequestModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ttdStep, setTtdStep] = useState(1);
  const [schedulesList, setSchedulesList] = useState<{ id: string; title: string; startAt: string }[]>([]);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TtdFormValues>({
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

  const { fields: memberFields, append: appendMember, remove: removeMember } = useFieldArray({
    control,
    name: "members",
  });

  // Load schedules directory
  useEffect(() => {
    if (isOpen) {
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
    }
  }, [isOpen]);

  // Run duplicate check on step 6
  useEffect(() => {
    if (isOpen && ttdStep === 6) {
      async function runDuplicateCheck() {
        setLoadingWarnings(true);
        try {
          const res = await fetch("/api/ttd/requests/check-duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(watch()),
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
  }, [ttdStep, isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
      setTtdStep(1);
      reset({
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
      });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: TtdFormValues) => {
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
          setTimeout(() => {
            onSave();
            onClose();
          }, 800);
        } else {
          const errData = await res.json();
          setError(errData.error || "Failed to submit letter application.");
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
              <FileText className="w-5 h-5 text-emerald-700" />
              <span>New TTD VIP Letter Request</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Submit recommendation and slot details for Tirumala Darshan letters
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-step progress tracker */}
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-150 shrink-0 flex justify-between items-center overflow-x-auto gap-2 text-[10px] font-bold">
          {["Applicant", "Source", "Dates", "Members", "Docs", "Review"].map((name, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-mono ${
                ttdStep === i + 1
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : ttdStep > i + 1
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white text-gray-400 border-gray-200"
              }`}>
                {i + 1}
              </span>
              <span className={ttdStep === i + 1 ? "text-emerald-800" : "text-gray-400"}>{name}</span>
            </div>
          ))}
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

          {/* Form fields */}
          <div className="space-y-4">
            {/* Step 1: Applicant */}
            {ttdStep === 1 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 1: Applicant Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Applicant Name *</label>
                    <input
                      type="text"
                      placeholder="Applicant Name"
                      {...register("applicantName")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                    {errors.applicantName && (
                      <span className="text-red-500 text-xs mt-1 font-semibold">{errors.applicantName.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Mobile Number *</label>
                    <input
                      type="text"
                      placeholder="Mobile Number"
                      {...register("applicantMobile")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                    {errors.applicantMobile && (
                      <span className="text-red-500 text-xs mt-1 font-semibold">{errors.applicantMobile.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Alternate Mobile</label>
                    <input
                      type="text"
                      placeholder="Alternate Mobile"
                      {...register("alternateMobile")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Constituency</label>
                    <input
                      type="text"
                      placeholder="Constituency"
                      {...register("constituency")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">District</label>
                    <input
                      type="text"
                      placeholder="District"
                      {...register("district")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1">Address</label>
                    <textarea
                      placeholder="Address"
                      {...register("address")}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Source */}
            {ttdStep === 2 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 2: Referral Source Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Source Type *</label>
                    <select
                      {...register("sourceType")}
                      className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:border-emerald-700"
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

                  {watch("sourceType") === "OTHER" && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1">Source Description *</label>
                      <input
                        type="text"
                        placeholder="Specify source..."
                        {...register("sourceDescription")}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                  )}

                  {watch("sourceType") === "SCHEDULE_VISIT" && (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1">Linked Tour Visit *</label>
                      <select
                        {...register("relatedScheduleId")}
                        className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:border-emerald-700"
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
                      placeholder="Name"
                      {...register("referencePersonName")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Reference Person Mobile</label>
                    <input
                      type="text"
                      placeholder="Mobile"
                      {...register("referencePersonMobile")}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Dates */}
            {ttdStep === 3 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 3: Preferred Travel Dates</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Preferred Date *</label>
                    <input 
                      type="date" 
                      {...register("preferredDarshanDate")} 
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                    {errors.preferredDarshanDate && (
                      <span className="text-red-500 text-xs mt-1 font-semibold">{errors.preferredDarshanDate.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Alternate Date</label>
                    <input 
                      type="date" 
                      {...register("alternateDarshanDate")} 
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1">Applicant Notes</label>
                    <textarea
                      placeholder="e.g. Prefer morning slot..."
                      {...register("notes")}
                      className="w-full border border-gray-200 rounded-lg p-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Pilgrims */}
            {ttdStep === 4 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-sans">Step 4: Pilgrim Details</h4>
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
                    className="flex items-center gap-1 text-xs text-emerald-700 font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> 
                    <span>Add Pilgrim</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {memberFields.map((field, idx) => (
                    <div key={field.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3 relative">
                      <div className="flex justify-between items-center pb-1.5 border-b border-gray-200">
                        <span className="text-xs font-bold text-gray-500">Pilgrim #{idx + 1}</span>
                        {memberFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMember(idx)}
                            className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-0.5"
                          >
                            <Trash className="w-3.5 h-3.5" /> 
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Full Name"
                            {...register(`members.${idx}.fullName` as const)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-emerald-700"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="number"
                            placeholder="Age"
                            {...register(`members.${idx}.age` as const, { valueAsNumber: true })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-emerald-700"
                          />
                        </div>

                        <div className="flex flex-col">
                          <select
                            {...register(`members.${idx}.gender` as const)}
                            className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:border-emerald-700"
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
                            {...register(`members.${idx}.identityType` as const)}
                            className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:border-emerald-700"
                          >
                            <option value="AADHAAR">Aadhaar Card</option>
                            <option value="VOTER_ID">Voter ID</option>
                            <option value="PASSPORT">Passport</option>
                          </select>
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Last 4 Digits"
                            maxLength={4}
                            {...register(`members.${idx}.identityLastFourDigits` as const)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 font-mono focus:outline-none focus:border-emerald-700"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Mobile (Optional)"
                            {...register(`members.${idx}.mobile` as const)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-emerald-700"
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 items-center pt-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={watch(`members.${idx}.isPrimaryApplicant`)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                memberFields.forEach((_, fidx) => {
                                  setValue(`members.${fidx}.isPrimaryApplicant`, fidx === idx);
                                });
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700"
                          />
                          <span>Primary Applicant</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Docs status */}
            {ttdStep === 5 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 5: Document Checklists</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-700 mb-1">Documents Upload Status</label>
                    <select
                      {...register("documentsStatus")}
                      className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:border-emerald-700"
                    >
                      <option value="NOT_SUBMITTED">Not Submitted</option>
                      <option value="PARTIAL">Partial Copies Attached</option>
                      <option value="COMPLETE">All Identity Verification Attached</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review & warnings */}
            {ttdStep === 6 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step 6: Review details & Duplicate Checks</h4>
                
                {loadingWarnings ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 font-bold animate-pulse flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                    <span>Running duplicates verification filters...</span>
                  </div>
                ) : reviewWarnings.length > 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <h5 className="font-extrabold text-amber-800 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-700" />
                      <span>Duplicate Check Warnings:</span>
                    </h5>
                    <ul className="list-disc pl-5 font-semibold space-y-0.5">
                      {reviewWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                    No potential duplicates detected for these travel dates and details.
                  </div>
                )}

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-2 text-gray-700">
                  <p><strong>Applicant Name:</strong> {watch("applicantName")}</p>
                  <p><strong>Mobile Number:</strong> {watch("applicantMobile")}</p>
                  <p><strong>Preferred Date:</strong> {watch("preferredDarshanDate")}</p>
                  <p><strong>Pilgrims count:</strong> {memberFields.length}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-150 flex items-center justify-between bg-gray-50/50 md:bg-transparent shrink-0">
          <button
            type="button"
            onClick={() => setTtdStep(Math.max(1, ttdStep - 1))}
            disabled={ttdStep === 1}
            className="px-4 py-2 border border-gray-250 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-40 transition flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-250 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-600 transition"
            >
              Cancel
            </button>
            {ttdStep < 6 ? (
              <button
                type="button"
                onClick={() => setTtdStep(ttdStep + 1)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={isPending}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Submit Request</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
