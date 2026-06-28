"use client";

import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { subscribeToPushNotification } from "@/lib/push-helper";
import { useRouter } from "next/navigation";
import { 
  User, Mail, LogOut, Shield, Phone, Sparkles, Key, Lock, Eye, 
  EyeOff, CheckCircle2, AlertCircle, Bell, RefreshCw, Trash2, Smartphone, Loader2
} from "lucide-react";

interface DeviceSubscription {
  id: string;
  deviceName: string | null;
  browser: string | null;
  operatingSystem: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  
  // States
  const [profileData, setProfileData] = useState<any>(null);
  const [devices, setDevices] = useState<DeviceSubscription[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Push registration state
  const [registeringPush, setRegisteringPush] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Fetch full profile and devices list
  const fetchProfileAndDevices = async () => {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      }

      setLoadingDevices(true);
      const devRes = await fetch("/api/push/subscriptions");
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(devData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchProfileAndDevices();
    }
  }, [session]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending]);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmittingPassword(true);
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setSuccess("Password updated successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        fetchProfileAndDevices();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to update password.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleRegisterCurrentDevice = async () => {
    setError(null);
    setSuccess(null);
    setRegisteringPush(true);
    try {
      await subscribeToPushNotification();
      setSuccess("This device has been successfully registered for push notifications.");
      fetchProfileAndDevices();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to enable notifications. Ensure you allow permissions.");
    } finally {
      setRegisteringPush(false);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/push/subscriptions/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSuccess("Device subscription removed.");
        fetchProfileAndDevices();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to remove device.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to remove device.");
    }
  };

  const handleSendTestPush = async () => {
    setError(null);
    setSuccess(null);
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Portal Verification Alert",
          message: "Web push delivery verified successfully! This is a test notification.",
        }),
      });

      if (res.ok) {
        setSuccess("Test push notification dispatched successfully.");
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to send test push (ensure you are Super Admin).");
      }
    } catch (err: any) {
      setError(err.message || "Failed to dispatch test notification.");
    } finally {
      setSendingTest(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
      </div>
    );
  }

  const user = session?.user;
  const role = profileData?.roles?.[0] || "Staff";

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 font-sans">User Settings</h1>
        <p className="text-xs text-gray-500 mt-1">Manage portal profile details, password updates, and push notification devices.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Hand Card: Profile details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Overview Card */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="h-32 bg-gradient-to-r from-emerald-800 to-emerald-700 flex items-center justify-between px-8 text-white relative">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-white/10 rounded-full border border-white/20">
                  <User className="w-7 h-7 text-emerald-200" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">{user?.name}</h2>
                  <p className="text-xs text-emerald-100 mt-1 font-semibold flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>{role}</span>
                  </p>
                </div>
              </div>
              <Sparkles className="w-5 h-5 text-emerald-200/50" />
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-gray-700 bg-white">
              <div className="flex items-center gap-3.5 pb-3 border-b border-gray-100">
                <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Email Address</p>
                  <p className="text-gray-900 font-semibold mt-0.5">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 pb-3 border-b border-gray-100">
                <Phone className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Mobile Number</p>
                  <p className="text-gray-900 font-semibold mt-0.5">{(user as any)?.mobileNumber || "Not Provided"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 pb-3 border-b border-gray-100 sm:border-0">
                <Shield className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Employee Code</p>
                  <p className="text-gray-900 font-semibold mt-0.5">{(user as any)?.employeeCode || "N/A"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 pb-3 border-b border-gray-100 sm:border-0">
                <User className="w-5 h-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Designation / Dept</p>
                  <p className="text-gray-900 font-semibold mt-0.5">
                    {`${(user as any)?.designation || "Staff"} - ${(user as any)?.department || "MP Office"}`}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 h-11 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg font-semibold transition text-sm focus:outline-none"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out Account</span>
              </button>
            </div>
          </div>

          {/* Devices and Notifications Center */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 mb-2">
              <Bell className="w-5.5 h-5.5 text-emerald-700" />
              <span>Registered Devices</span>
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Subscribe devices to receive push alerts when checklists, visit schedules, or letters are assigned to you.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={registeringPush}
                  onClick={handleRegisterCurrentDevice}
                  className="flex items-center justify-center gap-2 px-4 h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm active:scale-95 disabled:opacity-50 transition text-sm focus:outline-none"
                >
                  {registeringPush ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  <span>Subscribe Current Device</span>
                </button>

                {role === "Super Admin" && (
                  <button
                    type="button"
                    disabled={sendingTest}
                    onClick={handleSendTestPush}
                    className="flex items-center justify-center gap-2 px-4 h-11 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-lg active:scale-95 disabled:opacity-50 transition text-sm focus:outline-none"
                  >
                    {sendingTest ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>Send Test Push Notification</span>
                  </button>
                )}
              </div>

              {/* Devices list */}
              <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 font-bold text-xs text-gray-500">
                  Subscribed Devices List
                </div>
                {loadingDevices ? (
                  <div className="p-8 text-center text-gray-400 text-xs">Loading subscriptions...</div>
                ) : devices.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs font-semibold">No registered devices. Subscribe this browser above.</div>
                ) : (
                  <div className="divide-y divide-gray-150">
                    {devices.map((dev) => (
                      <div key={dev.id} className="flex justify-between items-center p-4">
                        <div className="flex items-start gap-3">
                          <Smartphone className="w-5 h-5 text-gray-400 mt-0.5" />
                          <div>
                            <div className="font-bold text-sm text-gray-900">{dev.deviceName || "Unknown Device"}</div>
                            <div className="text-gray-500 text-[10px] mt-0.5">
                              Browser: {dev.browser || "N/A"} | OS: {dev.operatingSystem || "N/A"}
                            </div>
                            <div className="text-gray-400 text-[9px] mt-0.5">
                              Registered: {new Date(dev.createdAt).toLocaleDateString()} 
                              {dev.lastUsedAt && ` | Active: ${new Date(dev.lastUsedAt).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteDevice(dev.id)}
                          title="Revoke subscription"
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg active:scale-95 transition focus:outline-none"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand Card: Update password */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm h-fit">
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 mb-2">
            <Lock className="w-5.5 h-5.5 text-emerald-700" />
            <span>Change Password</span>
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            Ensure your account is secure. Avoid repeating passwords.
          </p>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingPassword}
              className="w-full h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm active:scale-95 disabled:opacity-50 transition text-sm flex items-center justify-center gap-2 focus:outline-none"
            >
              {submittingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save New Password</span>
            </button>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
