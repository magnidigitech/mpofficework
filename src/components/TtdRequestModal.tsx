"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { 
  X, Plus, Trash, FileText, AlertCircle, CheckCircle2, 
  HelpCircle, Eye, Loader2, ArrowLeft, ArrowRight, Upload
} from "lucide-react";
import Tesseract from "tesseract.js";

const ttdMemberSchema = zod.object({
  fullName: zod.string().min(2, "Member name must be at least 2 characters"),
  age: zod.number().min(1, "Age must be a positive number"),
  gender: zod.enum(["MALE", "FEMALE", "OTHER"]),
  mobile: zod.string().optional().nullable().or(zod.literal("")),
  relationshipToApplicant: zod.string().optional().nullable().or(zod.literal("")),
  identityType: zod.enum(["AADHAAR", "VOTER_ID", "PASSPORT"]),
  identityLastFourDigits: zod.string().min(4, "Identity reference must be at least 4 digits"),
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
  
  // OCR states
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrSuccess, setOcrSuccess] = useState<string | null>(null);
  const [scannedDetails, setScannedDetails] = useState<{ fullName: string, age: number, gender: "MALE" | "FEMALE" | "OTHER", identityLastFourDigits: string } | null>(null);

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

  const handleAadhaarScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrError(null);
    setOcrSuccess(null);
    setScannedDetails(null);

    try {
      const result = await Tesseract.recognize(
        file,
        "eng",
        { logger: (m) => console.log(m) }
      );
      
      const parsed = parseAadhaarText(result.data.text);
      if (parsed) {
        setScannedDetails(parsed);
        setOcrSuccess("Successfully scanned Aadhaar card! Review details below before adding.");
      } else {
        setOcrError("We couldn't extract all details from the card. Please fill them manually.");
      }
    } catch (err: any) {
      console.error("OCR scan failed:", err);
      setOcrError("Failed to scan card due to OCR error. Please enter manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  const confirmScannedPilgrim = () => {
    if (!scannedDetails) return;
    
    appendMember({
      fullName: scannedDetails.fullName,
      age: scannedDetails.age,
      gender: scannedDetails.gender,
      mobile: "",
      relationshipToApplicant: "",
      identityType: "AADHAAR",
      identityLastFourDigits: scannedDetails.identityLastFourDigits,
      isPrimaryApplicant: memberFields.length === 0,
    });
    
    setScannedDetails(null);
    setOcrSuccess(null);
  };

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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-0 md:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative bg-white w-full max-h-[88vh] md:max-h-[85vh] md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col animate-slide-up md:zoom-in-95 duration-200">
        {/* Mobile handle */}
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto my-3 md:hidden shrink-0" />
        
        {/* Header */}
        <div className="px-6 pb-4 pt-1 md:py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white md:bg-transparent rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100/50 shadow-xs">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-sm font-sans tracking-tight">
                New VIP Letter Request
              </h3>
            </div>
            <p className="text-[10px] text-gray-500 mt-1 font-sans">
              Submit recommendation and slot details for Tirumala Darshan letters
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Multi-step progress tracker */}
        <div className="px-6 py-2.5 bg-gray-50/50 border-b border-gray-150 shrink-0 flex justify-between items-center overflow-x-auto gap-2 text-[10px] font-bold">
          {["Applicant", "Source", "Dates", "Members", "Docs", "Review"].map((name, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-mono font-bold ${
                ttdStep === i + 1
                  ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
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
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 1: Applicant Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Applicant Name *</label>
                    <input
                      type="text"
                      placeholder="Applicant Name"
                      {...register("applicantName")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                    {errors.applicantName && (
                      <span className="text-red-500 text-[10px] mt-1 font-semibold">{errors.applicantName.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Mobile Number *</label>
                    <input
                      type="text"
                      placeholder="Mobile Number"
                      {...register("applicantMobile")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                    {errors.applicantMobile && (
                      <span className="text-red-500 text-[10px] mt-1 font-semibold">{errors.applicantMobile.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Alternate Mobile</label>
                    <input
                      type="text"
                      placeholder="Alternate Mobile"
                      {...register("alternateMobile")}
                      className="w-full border border-gray-255 border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Constituency</label>
                    <input
                      type="text"
                      placeholder="Constituency"
                      {...register("constituency")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">District</label>
                    <input
                      type="text"
                      placeholder="District"
                      {...register("district")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Address</label>
                    <textarea
                      placeholder="Address"
                      {...register("address")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl p-2.5 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Source */}
            {ttdStep === 2 && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 2: Referral Source Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Source Type *</label>
                    <select
                      {...register("sourceType")}
                      className="h-10 border border-gray-250 rounded-xl px-2.5 text-xs bg-white focus:outline-none focus:border-emerald-600 font-sans font-semibold cursor-pointer"
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
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Source Description *</label>
                      <input
                        type="text"
                        placeholder="Specify source..."
                        {...register("sourceDescription")}
                        className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                      />
                    </div>
                  )}

                  {watch("sourceType") === "SCHEDULE_VISIT" && (
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Linked Tour Visit *</label>
                      <select
                        {...register("relatedScheduleId")}
                        className="h-10 border border-gray-250 rounded-xl px-2.5 text-xs bg-white focus:outline-none focus:border-emerald-600 font-sans font-semibold cursor-pointer"
                      >
                        <option value="">Select Tour Schedule</option>
                        {schedulesList.map((s) => (
                          <option key={s.id} value={s.id}>{s.title} ({new Date(s.startAt).toLocaleDateString("en-IN")})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Reference Person Name</label>
                    <input
                      type="text"
                      placeholder="Name"
                      {...register("referencePersonName")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Reference Person Mobile</label>
                    <input
                      type="text"
                      placeholder="Mobile"
                      {...register("referencePersonMobile")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Dates */}
            {ttdStep === 3 && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 3: Preferred Travel Dates</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Preferred Date *</label>
                    <input 
                      type="date" 
                      {...register("preferredDarshanDate")} 
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                    {errors.preferredDarshanDate && (
                      <span className="text-red-500 text-[10px] mt-1 font-semibold">{errors.preferredDarshanDate.message}</span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Alternate Date</label>
                    <input 
                      type="date" 
                      {...register("alternateDarshanDate")} 
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-2 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
                    />
                  </div>

                  <div className="flex flex-col sm:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Applicant Notes</label>
                    <textarea
                      placeholder="e.g. Prefer morning slot..."
                      {...register("notes")}
                      className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl p-2.5 text-xs font-sans text-gray-900 focus:outline-none transition duration-150"
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
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Step 4: Pilgrim Details</h4>
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
                    className="flex items-center gap-1 text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> 
                    <span>Add Pilgrim</span>
                  </button>
                </div>

                {/* Aadhaar Card OCR Scanner Zone */}
                <div className="p-4 border border-dashed border-emerald-300 bg-emerald-50/20 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                      <Upload className="w-4 h-4 text-emerald-700" />
                      <span>Scan Aadhaar to Auto-Fill pilgrim details</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-semibold bg-white border border-gray-100 rounded px-1.5 py-0.5">Privacy Secure (Client-side)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      id="aadhaar-ocr-file"
                      onChange={handleAadhaarScan}
                      disabled={ocrLoading}
                      className="hidden"
                    />
                    <label
                      htmlFor="aadhaar-ocr-file"
                      className="cursor-pointer px-4 py-2 border border-emerald-250 bg-white hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                    >
                      {ocrLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                          <span>Scanning card...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Choose Aadhaar Card Image</span>
                        </>
                      )}
                    </label>
                    <span className="text-[10px] text-gray-500">Supports Aadhaar card photos (JPG/PNG)</span>
                  </div>

                  {ocrError && (
                    <p className="text-[11px] text-red-600 font-semibold">{ocrError}</p>
                  )}

                  {ocrSuccess && (
                    <p className="text-[11px] text-emerald-700 font-semibold">{ocrSuccess}</p>
                  )}

                  {scannedDetails && (
                    <div className="p-3 bg-white border border-emerald-100 rounded-lg space-y-2 text-xs text-gray-700">
                      <h5 className="font-bold text-emerald-900 border-b border-emerald-50 pb-1">Extracted Pilgrim Details:</h5>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <p><strong>Name:</strong> {scannedDetails.fullName}</p>
                        <p><strong>Age:</strong> {scannedDetails.age}</p>
                        <p><strong>Gender:</strong> <span className="uppercase">{scannedDetails.gender.toLowerCase()}</span></p>
                        <p><strong>Aadhaar number:</strong> {scannedDetails.identityLastFourDigits}</p>
                      </div>
                      <button
                        type="button"
                        onClick={confirmScannedPilgrim}
                        className="w-full mt-2 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1"
                      >
                        <span>Confirm & Add Pilgrim</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {memberFields.map((field, idx) => (
                    <div key={field.id} className="p-4 bg-gray-50/50 border border-gray-250 rounded-2xl space-y-3.5 relative">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-500">Pilgrim #{idx + 1}</span>
                        {memberFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMember(idx)}
                            className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center gap-0.5 cursor-pointer"
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
                            className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none transition duration-150"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="number"
                            placeholder="Age"
                            {...register(`members.${idx}.age` as const, { valueAsNumber: true })}
                            className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none transition duration-150"
                          />
                        </div>

                        <div className="flex flex-col">
                          <select
                            {...register(`members.${idx}.gender` as const)}
                            className="h-8 text-xs border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-2 bg-white focus:outline-none cursor-pointer font-sans font-semibold"
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
                            className="h-8 text-xs border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-2 bg-white focus:outline-none cursor-pointer font-sans font-semibold"
                          >
                            <option value="AADHAAR">Aadhaar Card</option>
                            <option value="VOTER_ID">Voter ID</option>
                            <option value="PASSPORT">Passport</option>
                          </select>
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="ID / Aadhaar Number"
                            maxLength={20}
                            {...register(`members.${idx}.identityLastFourDigits` as const)}
                            className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs text-gray-900 font-mono focus:outline-none transition duration-150"
                          />
                        </div>

                        <div className="flex flex-col">
                          <input
                            type="text"
                            placeholder="Mobile (Optional)"
                            {...register(`members.${idx}.mobile` as const)}
                            className="w-full border border-gray-250 hover:border-gray-300 focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none transition duration-150"
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 items-center pt-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 font-bold cursor-pointer font-sans">
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
                            className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700 cursor-pointer"
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
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 5: Document Checklists</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">Documents Upload Status</label>
                    <select
                      {...register("documentsStatus")}
                      className="h-10 border border-gray-250 rounded-xl px-2.5 text-xs bg-white focus:outline-none focus:border-emerald-600 font-sans font-semibold cursor-pointer"
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
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 6: Review details & Duplicate Checks</h4>
                
                {loadingWarnings ? (
                  <div className="p-4 bg-gray-50/50 border border-gray-250 rounded-2xl text-xs text-gray-500 font-bold animate-pulse flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                    <span>Running duplicates verification filters...</span>
                  </div>
                ) : reviewWarnings.length > 0 ? (
                  <div className="p-4 bg-amber-50/50 border border-amber-250 rounded-2xl text-xs text-amber-900 space-y-1.5 font-sans">
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
                  <div className="p-4 bg-emerald-50/50 border border-emerald-250 rounded-2xl text-emerald-800 text-xs font-bold font-sans">
                    No potential duplicates detected for these travel dates and details.
                  </div>
                )}

                <div className="p-4.5 bg-gray-50/50 border border-gray-250 rounded-2xl text-xs space-y-2.5 text-gray-700 font-sans font-semibold">
                  <p><strong>Applicant Name:</strong> <span className="text-gray-900">{watch("applicantName")}</span></p>
                  <p><strong>Mobile Number:</strong> <span className="text-gray-900 font-mono">{watch("applicantMobile")}</span></p>
                  <p><strong>Preferred Date:</strong> <span className="text-gray-900">
                    {watch("preferredDarshanDate") ? new Date(watch("preferredDarshanDate")).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    }) : ""}
                  </span></p>
                  <p><strong>Pilgrims count:</strong> <span className="text-gray-950 font-extrabold">{memberFields.length}</span></p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-150 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTtdStep(Math.max(1, ttdStep - 1))}
            disabled={ttdStep === 1}
            className="px-4 py-2 border border-gray-250 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer focus:outline-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-250 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 transition cursor-pointer focus:outline-none"
            >
              Cancel
            </button>
            {ttdStep < 6 ? (
              <button
                type="button"
                onClick={() => setTtdStep(ttdStep + 1)}
                className="px-4.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer focus:outline-none shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={isPending}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer focus:outline-none shadow-xs"
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

function parseAadhaarText(text: string) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  
  // 1. Aadhaar Card number: usually matching a 12 digit number format, e.g. "1234 5678 9012"
  const aadhaarRegex = /(\d{4}\s\d{4}\s\d{4})|(\d{12})/;
  let numberMatch = null;
  for (const line of lines) {
    const match = line.match(aadhaarRegex);
    if (match) {
      numberMatch = match[0].replace(/\s/g, "");
      break;
    }
  }
  
  let fullAadhaar = "";
  if (numberMatch && numberMatch.length === 12) {
    fullAadhaar = numberMatch;
  } else {
    const digitBlocks = text.replace(/[^0-9]/g, "");
    const matches = digitBlocks.match(/\d{12}/);
    if (matches) {
      fullAadhaar = matches[0];
    } else {
      const fourDigitRegex = /\b\d{4}\b/g;
      const matchesList = text.match(fourDigitRegex);
      if (matchesList && matchesList.length > 0) {
        fullAadhaar = matchesList.join("");
      }
    }
  }

  // 2. Gender: MALE or FEMALE
  let gender: "MALE" | "FEMALE" | "OTHER" = "MALE";
  const genderText = text.toUpperCase();
  if (genderText.includes("FEMALE") || genderText.includes("FEM A")) {
    gender = "FEMALE";
  } else if (genderText.includes("MALE")) {
    gender = "MALE";
  }

  // 3. Year of birth or DOB
  let age = 30;
  const currentYear = new Date().getFullYear();
  const dobRegex = /(?:DOB|Birth|YOB|Year of Birth)[:\s-]*(\d{2}\/\d{2}\/\d{4}|\d{4})/i;
  const dobMatch = text.match(dobRegex);
  
  if (dobMatch) {
    const dateOrYear = dobMatch[1];
    if (dateOrYear.includes("/")) {
      const parts = dateOrYear.split("/");
      const year = parseInt(parts[2], 10);
      if (!isNaN(year)) {
        age = currentYear - year;
      }
    } else {
      const year = parseInt(dateOrYear, 10);
      if (!isNaN(year)) {
        age = currentYear - year;
      }
    }
  } else {
    const yearRegex = /\b(19\d{2}|20[0-2]\d)\b/g;
    const years = text.match(yearRegex);
    if (years && years.length > 0) {
      const year = parseInt(years[0], 10);
      age = currentYear - year;
    }
  }

  // 4. Name extraction: excluding common government header keywords
  const excludeKeywords = [
    "GOVERNMENT", "INDIA", "UNIQUE", "IDENTIFICATION", "AUTHORITY", "AADHAAR", 
    "STATE", "DISTRICT", "PIN", "FATHER", "HUSBAND", "WIFE", "MOTHER", "MALE", "FEMALE"
  ];
  
  let name = "";
  for (const line of lines) {
    const cleanLine = line.replace(/[^A-Za-z\s]/g, "").trim();
    if (cleanLine.split(/\s+/).length >= 2) {
      const words = cleanLine.toUpperCase().split(/\s+/);
      const isHeader = words.some(w => excludeKeywords.some(kw => w.includes(kw)));
      if (!isHeader) {
        name = cleanLine;
        break;
      }
    }
  }
  
  if (name) {
    name = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase()).join(" ");
  }

  return {
    fullName: name || "Scanned Name",
    age: age,
    gender: gender,
    identityLastFourDigits: fullAadhaar || ""
  };
}
