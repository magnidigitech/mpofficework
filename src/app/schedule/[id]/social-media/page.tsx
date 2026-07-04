"use client";

import { useEffect, useState, useTransition } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  Share2, Save, Clock, MapPin, Eye, CheckCircle2, AlertTriangle, 
  MessageSquare, Edit3, X, Copy, ExternalLink, Link2, Folder, 
  Check, PlayCircle, Star, ThumbsUp, AlertCircle, RefreshCw, Plus, Trash
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface SocialPost {
  id: string;
  platform: "FACEBOOK" | "INSTAGRAM" | "X" | "YOUTUBE" | "WEBSITE";
  postType: "POST" | "REEL" | "STORY" | "VIDEO" | "SHORT" | "PRESS_RELEASE" | "OTHER";
  status: "NOT_REQUIRED" | "PENDING" | "DRAFTING" | "APPROVED" | "PUBLISHED" | "FAILED";
  isRequired: boolean;
  postUrl?: string | null;
  captionText?: string | null;
  remarks?: string | null;
  publishedAt?: string | null;
  publishedBy?: UserInfo | null;
}

interface SocialMediaData {
  scheduleId: string;
  scheduleTitle: string;
  socialMediaUpdateId: string;
  startAt: string;
  endAt: string;
  venue: string;
  scheduleStatus: string;
  isRequired: boolean;
  workflowStatus: string;
  assignedUser?: UserInfo | null;
  mediaReceived: boolean;
  mediaReceivedAt?: string | null;
  captionPrepared: boolean;
  captionPreparedAt?: string | null;
  approvalStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  approvedBy?: UserInfo | null;
  approvedAt?: string | null;
  notes?: string | null;
  mediaFolderUrl?: string | null;
  photoFolderUrl?: string | null;
  videoFolderUrl?: string | null;
  posts: SocialPost[];
  pendingPlatformCount: number;
  publishedPlatformCount: number;
}

export default function SocialMediaTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.id as string;
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<SocialMediaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Users listing (for social media assignee)
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  // Editing basic tracking fields
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [mediaFolder, setMediaFolder] = useState<string>("");
  const [photoFolder, setPhotoFolder] = useState<string>("");
  const [videoFolder, setVideoFolder] = useState<string>("");

  // Correction requested modal state
  const [correctionReason, setCorrectionReason] = useState("");
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  // Platform edit popup states
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [postRemarks, setPostRemarks] = useState("");
  const [postStatus, setPostStatus] = useState<any>("PENDING");
  const [postIsRequired, setPostIsRequired] = useState(true);
  const [postType, setPostType] = useState<any>("POST");

  // Create platform post popup state
  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [addPlatform, setAddPlatform] = useState<any>("FACEBOOK");
  const [addPostType, setAddPostType] = useState<any>("POST");

  const isAdmin = session?.user?.email === "admin@mpoffice.com" || userRoles.includes("Super Admin") || userRoles.includes("MP Office Admin");
  const isSMTeam = isAdmin || userRoles.includes("Social Media Team") || data?.assignedUser?.id === session?.user?.id;
  const isReadOnlyViewer = !isSMTeam && !isAdmin;

  const loadData = async () => {
    try {
      const response = await fetch(`/api/schedules/${scheduleId}/social-media`);
      if (response.ok) {
        const body: SocialMediaData = await response.json();
        setData(body);
        setAssignedUserId(body.assignedUser?.id || "");
        setNotes(body.notes || "");
        setMediaFolder(body.mediaFolderUrl || "");
        setPhotoFolder(body.photoFolderUrl || "");
        setVideoFolder(body.videoFolderUrl || "");
        setError(null);
      } else {
        const errData = await response.json();
        if (response.status === 404) {
          // Social media not enabled yet
          setData(null);
        } else {
          setError(errData.error || "Failed to load social media details");
        }
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading social media status.");
    } finally {
      setLoading(false);
    }
  };

  // Load system users for assignments dropdown
  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const u = await res.json();
        setUsers(u);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (session?.user) {
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
      loadData();
      loadUsers();
    }
  }, [session]);

  // Manually enable social media tracking
  const handleEnableTracking = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createDefaultPlatforms: true }),
        });

        if (response.ok) {
          setSuccess("Social media tracking enabled successfully!");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to enable social media tracking");
        }
      } catch (err) {
        console.error(err);
        setError("Error enabling tracking");
      }
    });
  };

  // Save basic updates (Assigned staff, folders, notes)
  const handleSaveBasicUpdates = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedUserId: assignedUserId || null,
            notes,
            mediaFolderUrl: mediaFolder || null,
            photoFolderUrl: photoFolder || null,
            videoFolderUrl: videoFolder || null,
          }),
        });

        if (response.ok) {
          setSuccess("Basic social media details updated successfully!");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to update basic fields.");
        }
      } catch (err) {
        console.error(err);
        setError("Error saving updates.");
      }
    });
  };

  // Mark Media/Caption Prepared toggles
  const handleToggleState = (field: "mediaReceived" | "captionPrepared", current: boolean) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [field]: !current,
          }),
        });

        if (response.ok) {
          setSuccess(`Updated ${field === "mediaReceived" ? "Media status" : "Caption status"} successfully.`);
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to update state.");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Approval Submission
  const handleSubmitForApproval = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalStatus: "PENDING" }),
        });

        if (response.ok) {
          setSuccess("Content submitted for administrator approval successfully.");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to submit for approval");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Approve Content
  const handleApproveContent = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalStatus: "APPROVED" }),
        });

        if (response.ok) {
          setSuccess("Social media content approved successfully!");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to approve content");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Request corrections
  const handleRequestCorrections = () => {
    if (!correctionReason.trim()) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            approvalStatus: "CHANGES_REQUESTED", 
            changeReason: correctionReason.trim() 
          }),
        });

        if (response.ok) {
          setSuccess("Correction request sent to the social media team.");
          setShowCorrectionModal(false);
          setCorrectionReason("");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to submit corrections request");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Disable Social media coverage tracking
  const handleMarkNotRequired = () => {
    if (!confirm("Are you sure you want to mark social media as not required?")) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schedules/${scheduleId}/social-media`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRequired: false }),
        });

        if (response.ok) {
          setSuccess("Social media coverage marked as not required.");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to disable tracking");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Edit platform post values
  const initEditPost = (post: SocialPost) => {
    setEditingPostId(post.id);
    setPostUrl(post.postUrl || "");
    setPostCaption(post.captionText || "");
    setPostRemarks(post.remarks || "");
    setPostStatus(post.status);
    setPostIsRequired(post.isRequired);
    setPostType(post.postType);
    setError(null);
    setSuccess(null);
  };

  const handleSavePost = () => {
    if (!editingPostId) return;
    setError(null);
    setSuccess(null);

    // If status is PUBLISHED, require URL
    if (postStatus === "PUBLISHED" && (!postUrl || postUrl.trim() === "")) {
      setError("A valid URL is required to publish a platform post.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/social-media/posts/${editingPostId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: data?.posts.find(p => p.id === editingPostId)?.platform,
            postType,
            status: postStatus,
            postUrl: postUrl || null,
            captionText: postCaption || null,
            remarks: postRemarks || null,
            isRequired: postIsRequired,
          }),
        });

        if (response.ok) {
          setSuccess("Platform post updated successfully!");
          setEditingPostId(null);
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to update platform post link.");
        }
      } catch (err) {
        console.error(err);
        setError("Error saving platform post.");
      }
    });
  };

  // Delete Platform post
  const handleDeletePost = (postId: string) => {
    if (!confirm("Are you sure you want to delete this platform post?")) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/social-media/posts/${postId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setSuccess("Platform post link deleted successfully!");
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to delete post link");
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Add platform post
  const handleAddPost = () => {
    if (!data) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/social-media/${data.socialMediaUpdateId || scheduleId}/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: addPlatform,
            postType: addPostType,
            isRequired: true,
          }),
        });

        if (response.ok) {
          setSuccess("Platform post record registered successfully!");
          setShowAddPostModal(false);
          await loadData();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to create post record");
        }
      } catch (err) {
        console.error(err);
        setError("Error creating post.");
      }
    });
  };

  // Copy URL to Clipboard
  const handleCopyLink = (url?: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    alert("Post link copied to clipboard!");
  };

  if (sessionPending) {
    return (
      <PageLayout>
        <div className="text-center py-16 text-sm text-gray-500 font-sans">Loading session parameters...</div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center py-16 text-sm text-gray-500 font-sans">Loading social media tracker details...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Banner info */}
      {data ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-6">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 bg-amber-50 border border-amber-200 text-primary rounded">
                Social Media Coverage
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
                    {new Date(data.startAt).toLocaleDateString("en-IN")} (
                    {new Date(data.startAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}
                    )
                  </span>
                </p>
              </div>
            </div>

            {!isReadOnlyViewer && (
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-xs px-2.5 py-1 font-bold rounded border border-gray-200 uppercase bg-gray-50 text-gray-700">
                  Schedule: {data.scheduleStatus}
                </span>
                <span className={`text-xs px-2.5 py-1 font-extrabold rounded border uppercase ${
                  data.workflowStatus === "PUBLISHED" 
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                    : data.workflowStatus === "PARTIALLY_PUBLISHED"
                    ? "bg-sky-50 text-sky-800 border-sky-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}>
                  Workflow: {data.workflowStatus.replace("_", " ")}
                </span>
              </div>
            )}
          </div>

          {/* Progress Overview Panel */}
          {data.isRequired && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              {isReadOnlyViewer ? (
                <div>
                  <p className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wide">Total Published Posts</p>
                  <p className="text-2xl font-black text-emerald-700 mt-1">
                    {data.publishedPlatformCount}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Required Platforms</p>
                    <p className="text-sm font-bold text-gray-800 mt-1">
                      {data.posts.filter((p) => p.isRequired).length}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Published Posts</p>
                    <p className="text-sm font-black text-emerald-700 mt-1">
                      {data.publishedPlatformCount}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-amber-400 uppercase">Pending Posts</p>
                    <p className="text-sm font-bold text-amber-700 mt-1">
                      {data.pendingPlatformCount}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Approval State</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 border rounded font-bold uppercase ${
                      data.approvalStatus === "APPROVED" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : data.approvalStatus === "PENDING"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : data.approvalStatus === "CHANGES_REQUESTED"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}>
                      {data.approvalStatus.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ENABLE SOCIAL MEDIA PROMPT */
        <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm text-center">
          <Share2 className="w-12 h-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-bold text-gray-900 mt-4 font-sans">Social Media Tracking Disabled</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-2">
            Coverage is not currently required for this event. You can enable it below to track platforms, approvals, and post urls.
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go Back
            </button>
            <button
              onClick={handleEnableTracking}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-semibold rounded text-xs transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Enable Tracking</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-start shadow-sm">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex gap-2 items-start shadow-sm">
          <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {data && data.isRequired && (
        <div className="space-y-6">
          {/* Section 1: Workflow Controls */}
          {!isReadOnlyViewer && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">
                Workflow Steps & Assignee
              </h3>

              {/* Media Toggles & Approval Requests */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <button
                  type="button"
                  onClick={() => handleToggleState("mediaReceived", data.mediaReceived)}
                  className={`p-3 border rounded-lg text-left transition flex justify-between items-center ${
                    data.mediaReceived 
                      ? "bg-emerald-50/50 border-emerald-200 text-emerald-950" 
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Media Status</p>
                    <p className="text-xs font-bold mt-1">
                      {data.mediaReceived ? "Media Received" : "Media Pending"}
                    </p>
                  </div>
                  {data.mediaReceived ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleState("captionPrepared", data.captionPrepared)}
                  className={`p-3 border rounded-lg text-left transition flex justify-between items-center ${
                    data.captionPrepared 
                      ? "bg-emerald-50/50 border-emerald-200 text-emerald-950" 
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100/50"
                  }`}
                >
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Captions Status</p>
                    <p className="text-xs font-bold mt-1">
                      {data.captionPrepared ? "Captions Prepared" : "Drafting Caption"}
                    </p>
                  </div>
                  {data.captionPrepared ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Submissions & Corrections */}
                {isSMTeam && data.approvalStatus !== "APPROVED" && (
                  <button
                    type="button"
                    onClick={handleSubmitForApproval}
                    disabled={data.approvalStatus === "PENDING"}
                    className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-left hover:bg-amber-100/50 transition flex justify-between items-center text-amber-950"
                  >
                    <div>
                      <p className="text-[10px] font-bold text-amber-500 uppercase">Approval Request</p>
                      <p className="text-xs font-bold mt-1">
                        {data.approvalStatus === "PENDING" ? "Waiting for review" : "Submit for Approval"}
                      </p>
                    </div>
                    <MessageSquare className="w-5 h-5 text-amber-600 animate-pulse" />
                  </button>
                )}

                {isAdmin && data.approvalStatus === "PENDING" && (
                  <div className="col-span-1 sm:col-span-2 md:col-span-2 flex gap-2">
                    <button
                      onClick={handleApproveContent}
                      className="flex-1 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1 transition"
                    >
                      <Check className="w-4 h-4" /> Approve Content
                    </button>
                    <button
                      onClick={() => setShowCorrectionModal(true)}
                      className="flex-1 p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1 transition"
                    >
                      <X className="w-4 h-4" /> Request Changes
                    </button>
                  </div>
                )}
              </div>

              {/* Folder Links, Notes, and User Selector inputs */}
              {(() => {
                const socialMediaStaff = users.filter((u: any) => 
                  u.userRoles?.some((ur: any) => ur.role?.name === "Social Media Team") ||
                  u.id === data?.assignedUser?.id
                );
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1.5">Assigned Social Media Coordinator</label>
                      <select
                        value={assignedUserId}
                        onChange={(e) => setAssignedUserId(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 cursor-pointer text-gray-800"
                      >
                        <option value="">Unassigned</option>
                        {socialMediaStaff.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1.5">Google Drive Folder Link</label>
                      <input
                        type="text"
                        placeholder="https://drive.google.com/..."
                        value={mediaFolder}
                        onChange={(e) => setMediaFolder(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-700 mb-1.5">Photos Folder Link</label>
                      <input
                        type="text"
                        placeholder="https://photos.google.com/..."
                        value={photoFolder}
                        onChange={(e) => setPhotoFolder(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400"
                      />
                    </div>

                    <div className="flex flex-col sm:col-span-3">
                      <label className="text-xs font-bold text-gray-700 mb-1.5">Internal Checklist Notes</label>
                      <textarea
                        placeholder="Add workflow notes, approvals guidelines, etc."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg p-3 min-h-[80px] w-full bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400"
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-between items-center mt-5 pt-4 border-t border-gray-100 flex-wrap gap-2">
                <button
                  onClick={handleMarkNotRequired}
                  className="text-xs text-red-600 hover:underline font-bold"
                >
                  Mark Social Media Not Required
                </button>

                <button
                  onClick={handleSaveBasicUpdates}
                  disabled={isPending}
                  className="flex items-center gap-1 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-semibold rounded text-xs transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Basic Parameters</span>
                </button>
              </div>
            </div>
          )}

          {/* Section 2: Platform Links Cards */}
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide">
                Publishing Platforms & Links
              </h2>
              {!isReadOnlyViewer && (
                <button
                  onClick={() => setShowAddPostModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded text-xs font-bold transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Platform Post
                </button>
              )}
            </div>

            {isReadOnlyViewer ? (
              /* Simple clean list of published links */
              <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                {data.posts.filter((post) => post.postUrl).length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">No published links available yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {data.posts.filter((post) => post.postUrl).map((post) => (
                      <div key={post.id} className="py-3 first:pt-0 last:pb-0 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold tracking-wide uppercase px-2.5 py-0.5 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded">
                            {post.platform}
                          </span>
                          <span className="text-xs text-gray-500 font-bold uppercase">{post.postType}</span>
                        </div>
                        <a 
                          href={post.postUrl!} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 max-w-[200px] sm:max-w-md truncate"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{post.postUrl}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.posts.map((post) => {
                  const isEditing = editingPostId === post.id;

                  return (
                    <div key={post.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col justify-between">
                      <div>
                        {/* Platform header */}
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-[10px] font-extrabold tracking-wide uppercase px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 rounded mr-2">
                              {post.platform}
                            </span>
                            <span className="text-xs text-gray-500 font-bold uppercase">{post.postType}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 border rounded uppercase font-black ${
                            post.status === "PUBLISHED" 
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                              : post.status === "PENDING"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-gray-50 text-gray-500 border-gray-200"
                          }`}>
                            {post.status}
                          </span>
                        </div>

                        {isEditing ? (
                          /* PLATFORM EDIT FORM */
                          <div className="space-y-3 mb-4 text-left">
                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Post URL *</label>
                              <input
                                type="text"
                                value={postUrl}
                                onChange={(e) => setPostUrl(e.target.value)}
                                placeholder={`URL for ${post.platform}...`}
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400 w-full mt-1"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Post Caption Text</label>
                              <textarea
                                value={postCaption}
                                onChange={(e) => setPostCaption(e.target.value)}
                                placeholder="Insert Telugu or English caption draft..."
                                className="text-xs border border-gray-200 rounded-lg p-3 min-h-[70px] bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400 w-full mt-1"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Post Status</label>
                                <select
                                  value={postStatus}
                                  onChange={(e) => setPostStatus(e.target.value as any)}
                                  className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 cursor-pointer w-full mt-1"
                                >
                                  <option value="PENDING">Pending</option>
                                  <option value="DRAFTING">Drafting</option>
                                  <option value="APPROVED">Approved</option>
                                  <option value="PUBLISHED">Published</option>
                                  <option value="FAILED">Failed</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Coverage requirement</label>
                                <select
                                  value={postIsRequired ? "YES" : "NO"}
                                  onChange={(e) => setPostIsRequired(e.target.value === "YES")}
                                  className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 cursor-pointer w-full mt-1"
                                >
                                  <option value="YES">Required</option>
                                  <option value="NO">Optional</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Remarks / Internal Notes</label>
                              <input
                                type="text"
                                value={postRemarks}
                                onChange={(e) => setPostRemarks(e.target.value)}
                                placeholder="Remarks..."
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition duration-150 text-gray-800 placeholder-gray-400 w-full mt-1"
                              />
                            </div>
                          </div>
                        ) : (
                          /* PLATFORM DISPLAY DETAIL */
                          <div className="space-y-2 mb-4">
                            {post.postUrl ? (
                              <div className="flex items-center gap-1 text-xs text-primary font-semibold truncate hover:underline">
                                <Link2 className="w-3.5 h-3.5 shrink-0" />
                                <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="truncate">
                                  {post.postUrl}
                                </a>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No published link added yet</p>
                            )}

                            {post.captionText && (
                              <div className="bg-gray-50 border border-gray-100 rounded p-2 mt-2">
                                <p className="text-[9px] font-bold text-gray-400 uppercase">Caption Draft</p>
                                <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap line-clamp-3">
                                  {post.captionText}
                                </p>
                              </div>
                            )}

                            {post.remarks && (
                              <p className="text-xs text-gray-500">
                                <span className="font-semibold text-gray-600">Remarks:</span> {post.remarks}
                              </p>
                            )}

                            {post.publishedAt && (
                              <div className="text-[10px] text-gray-400 mt-2 flex flex-wrap gap-2 justify-between">
                                <span>Published on: {new Date(post.publishedAt).toLocaleDateString("en-IN")}</span>
                                {post.publishedBy && <span>By: {post.publishedBy.name}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Platform Actions */}
                      <div className="flex gap-2 justify-end border-t border-gray-100 pt-3 flex-wrap">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => setEditingPostId(null)}
                              className="px-3 py-1.5 border border-gray-200 rounded text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSavePost}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition"
                            >
                              Save Post
                            </button>
                          </>
                        ) : (
                          <>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeletePost(post.id)}
                                className="text-red-500 hover:text-red-700 p-1 mr-auto"
                                aria-label="Delete platform post"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            )}

                            {post.postUrl && (
                              <>
                                <button
                                  onClick={() => handleCopyLink(post.postUrl)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded text-[10px] font-bold transition"
                                >
                                  <Copy className="w-3 h-3" /> Copy Link
                                </button>
                                <a
                                  href={post.postUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary rounded text-[10px] font-bold transition"
                                >
                                  <ExternalLink className="w-3 h-3" /> View Post
                                </a>
                              </>
                            )}

                            <button
                              onClick={() => initEditPost(post)}
                              className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded text-[10px] font-bold transition"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Corrections request reason popup */}
      {showCorrectionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Correction Guidelines
            </h3>
            <p className="text-xs text-gray-600 mt-2">
              Explain which platforms, captions, or media assets require changes before approval.
            </p>
            <textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Correct name spelling in Facebook caption..."
              className="text-xs border border-gray-200 rounded p-2 w-full mt-3 min-h-[80px]"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestCorrections}
                disabled={!correctionReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-30"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Platform modal */}
      {showAddPostModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg border border-gray-100">
            <h3 className="text-base font-bold text-gray-900">Add Platform Post Link</h3>
            <p className="text-xs text-gray-600 mt-2">
              Select which platform and type of post you would like to track.
            </p>

            <div className="grid grid-cols-1 gap-3 mt-4">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Platform</label>
                <select
                  value={addPlatform}
                  onChange={(e) => setAddPlatform(e.target.value as any)}
                  className="text-xs border border-gray-200 rounded px-2 bg-white h-9"
                >
                  <option value="FACEBOOK">Facebook</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="X">X (Twitter)</option>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="WEBSITE">Website press note</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Post Type</label>
                <select
                  value={addPostType}
                  onChange={(e) => setAddPostType(e.target.value as any)}
                  className="text-xs border border-gray-200 rounded px-2 bg-white h-9"
                >
                  <option value="POST">Post</option>
                  <option value="REEL">Reel</option>
                  <option value="STORY">Story</option>
                  <option value="VIDEO">Video</option>
                  <option value="SHORT">Short</option>
                  <option value="PRESS_RELEASE">Press Release</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowAddPostModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPost}
                className="px-4 py-2 bg-primary hover:bg-amber-700 text-white rounded text-xs font-semibold"
              >
                Register Post
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
