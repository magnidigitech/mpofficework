"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { subscribeToPushNotification } from "@/lib/push-helper";
import { 
  Bell, Calendar, FileText, CheckSquare, BellRing, Wifi, WifiOff, 
  MapPin, Clock, Navigation as MapIcon, Shield, Layers, Award, FileCode, Share2 
} from "lucide-react";
import { db } from "@/lib/db";
import Link from "next/link";

interface AssignedUser {
  id: string;
  name: string;
  email: string;
}

interface ScheduleWithAssignments {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  venue: string;
  status: string;
  organizerName?: string;
  organizerPhone?: string;
  googleMapsLink?: string;
  category?: string;
  priority?: string;
  internalInstructions?: string;
  requiredDocuments?: string;
  assignments?: { user: AssignedUser }[];
}

export default function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [pushSupported, setPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Redirect Schedule Viewers to /schedule
  useEffect(() => {
    async function checkUserRoles() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          const roles = profile.roles || [];
          const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
          const isScheduleViewerOnly = roles.includes("Schedule Viewer") &&
            !isAdmin &&
            !roles.includes("Schedule Coordinator") &&
            !roles.includes("Social Media Team") &&
            !roles.includes("TTD Manager") &&
            !roles.includes("TTD Staff") &&
            !roles.includes("Field Staff") &&
            !roles.includes("Field Coordinator");
          if (isScheduleViewerOnly) {
            router.replace("/schedule");
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    checkUserRoles();
  }, [router]);

  const [dashboardData, setDashboardData] = useState<{
    metrics: {
      todayTotal: number;
      todayCompleted: number;
      todayUpcoming: number;
      todayCancelled: number;
      pendingChecklists: number;
      pendingSocialMedia: number;
      smCompletedEventsPending?: number;
      smWaitingApprovalCount?: number;
      smPartiallyPublishedCount?: number;
      smFullyPublishedCount?: number;
      ttdQuotaUsed: number;
      ttdQuotaAvailable: number;
    };
    nextVisit: ScheduleWithAssignments | null;
    tomorrowSchedules: ScheduleWithAssignments[];
    urgentSocialItems?: any[];
  } | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Check online status, push subscription status, and load dashboard data
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }

    async function fetchDashboard() {
      setLoadingData(true);
      try {
        if (navigator.onLine) {
          const res = await fetch(`/api/dashboard?t=${Date.now()}`, {
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            setDashboardData(data);
          }
        } else {
          // Offline fallback: load counts from Dexie
          const totalSchedules = await db.schedules.count();
          const pendingChecklists = await db.checklistItems.where("isCompleted").equals(0).count();
          
          setDashboardData({
            metrics: {
              todayTotal: totalSchedules,
              todayCompleted: 0,
              todayUpcoming: totalSchedules,
              todayCancelled: 0,
              pendingChecklists,
              pendingSocialMedia: 0,
              smCompletedEventsPending: 0,
              smWaitingApprovalCount: 0,
              smPartiallyPublishedCount: 0,
              smFullyPublishedCount: 0,
              ttdQuotaUsed: 0,
              ttdQuotaAvailable: 0,
            },
            nextVisit: null,
            tomorrowSchedules: [],
            urgentSocialItems: [],
          });
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoadingData(false);
      }
    }

    fetchDashboard();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isOnline]);

  const subscribeToPush = async () => {
    if (!pushSupported) return;

    try {
      await subscribeToPushNotification();
      setIsSubscribed(true);
      alert("Push notifications enabled successfully!");
    } catch (error: any) {
      console.error("Failed to subscribe to push notifications:", error);
      alert(error.message || "Error enabling notifications.");
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm font-sans">Loading session...</div>
      </div>
    );
  }

  const user = session?.user;
  const metrics = dashboardData?.metrics;
  const nextVisit = dashboardData?.nextVisit;
  const tomorrowSchedules = dashboardData?.tomorrowSchedules || [];

  return (
    <PageLayout>
      {/* Top Welcome / Status Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans">Welcome, {user?.name || "Staff Member"}</h1>
          <p className="text-xs text-gray-500 mt-1">
            Role: <strong>{user?.email === "admin@mpoffice.com" ? "Super Admin" : "Staff"}</strong>
          </p>
        </div>
        
        {/* Network Status Badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${
          isOnline ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span>Online Mode</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode (Cached)</span>
            </>
          )}
        </div>
      </div>

      {/* Grid of Key Actions */}
      {loadingData ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading metrics...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Today Total */}
            <Link 
              href="/schedule?tab=today" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm hover:shadow-md hover:border-amber-200 transition cursor-pointer"
            >
              <span className="text-2xl font-black text-gray-900">{metrics?.todayTotal || 0}</span>
              <h3 className="font-semibold text-gray-700 text-xs mt-1">Today's Visits</h3>
            </Link>

            {/* Today Completed */}
            <Link 
              href="/schedule?tab=all" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm hover:shadow-md hover:border-emerald-200 transition cursor-pointer"
            >
              <span className="text-2xl font-black text-emerald-700">{metrics?.todayCompleted || 0}</span>
              <h3 className="font-semibold text-gray-700 text-xs mt-1">Completed Visits</h3>
            </Link>

            {/* Today Upcoming */}
            <Link 
              href="/schedule?tab=weekly" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm hover:shadow-md hover:border-amber-200 transition cursor-pointer"
            >
              <span className="text-2xl font-black text-amber-600">{metrics?.todayUpcoming || 0}</span>
              <h3 className="font-semibold text-gray-700 text-xs mt-1">Upcoming Visits</h3>
            </Link>

            {/* Today Cancelled */}
            <Link 
              href="/schedule?tab=all" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm hover:shadow-md hover:border-red-200 transition cursor-pointer"
            >
              <span className="text-2xl font-black text-red-600">{metrics?.todayCancelled || 0}</span>
              <h3 className="font-semibold text-gray-700 text-xs mt-1">Cancelled Visits</h3>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {/* Checklist items remaining */}
            <Link 
              href="/schedule?tab=all" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm flex items-center justify-between hover:shadow-md hover:border-amber-200 transition cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-700 text-xs">Pending Checklists</h3>
                <span className="text-xl font-black text-gray-900 mt-1 block">{metrics?.pendingChecklists || 0}</span>
              </div>
              <CheckSquare className="w-8 h-8 text-primary/30" />
            </Link>

            {/* Social media links pending */}
            <Link 
              href="/schedule?tab=all" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-amber-200 transition cursor-pointer"
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <h3 className="font-semibold text-gray-700 text-xs">Pending Social Tracks</h3>
                  <span className="text-xl font-black text-gray-900 mt-1 block">{metrics?.pendingSocialMedia || 0}</span>
                </div>
                <Layers className="w-6 h-6 text-primary/30" />
              </div>
              
              <div className="mt-3 pt-2.5 border-t border-gray-100 grid grid-cols-2 gap-1 text-[9px] font-bold text-gray-400">
                <div>
                  PENDING APPR: <span className="text-gray-700">{(metrics as any)?.smWaitingApprovalCount || 0}</span>
                </div>
                <div>
                  PARTIAL POSTS: <span className="text-gray-700">{(metrics as any)?.smPartiallyPublishedCount || 0}</span>
                </div>
              </div>
            </Link>

            {/* TTD Quota Used */}
            <Link 
              href="/ttd-letters" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm flex items-center justify-between hover:shadow-md hover:border-amber-200 transition cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-700 text-xs">TTD Quota Used</h3>
                <span className="text-xl font-black text-gray-900 mt-1 block">{metrics?.ttdQuotaUsed || 0}</span>
              </div>
              <Award className="w-8 h-8 text-primary/30" />
            </Link>

            {/* TTD Quota Available */}
            <Link 
              href="/ttd-letters" 
              className="bg-white border border-gray-200 rounded-lg p-4.5 shadow-sm flex items-center justify-between hover:shadow-md hover:border-emerald-250 transition cursor-pointer"
            >
              <div>
                <h3 className="font-semibold text-gray-700 text-xs">TTD Quota Available</h3>
                <span className="text-xl font-black text-emerald-700 mt-1 block">{metrics?.ttdQuotaAvailable || 0}</span>
              </div>
              <FileText className="w-8 h-8 text-emerald-600/20" />
            </Link>
          </div>

          {/* Analytics Summary and pure SVG Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Chart Card 1: TTD Letters Quota Utilization */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-primary" />
                  <span>TTD Quota Utilization</span>
                </h3>
                
                {(() => {
                  const used = metrics?.ttdQuotaUsed || 0;
                  const available = metrics?.ttdQuotaAvailable || 0;
                  const total = used + available;
                  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
                  const radius = 38;
                  const circumference = 2 * Math.PI * radius;
                  const strokeOffset = circumference - (percent / 100) * circumference;

                  return (
                    <div className="flex items-center gap-6">
                      <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          {/* Background circle track */}
                          <circle
                            cx="56"
                            cy="56"
                            r={radius}
                            className="stroke-gray-100 fill-transparent"
                            strokeWidth="8"
                          />
                          {/* Foreground progress indicator */}
                          <circle
                            cx="56"
                            cy="56"
                            r={radius}
                            className="stroke-primary fill-transparent transition-all duration-500 ease-out"
                            strokeWidth="8"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeOffset}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center text-center">
                          <span className="text-sm font-black text-gray-900">{percent}%</span>
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Used</span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="text-xs font-semibold text-gray-700">
                          Quota Period Status:
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wide">
                          <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2 text-center">
                            <span className="text-gray-400 block text-[8px] mb-0.5">Used Letters</span>
                            <span className="text-primary text-sm font-black">{used}</span>
                          </div>
                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-2 text-center">
                            <span className="text-gray-400 block text-[8px] mb-0.5">Available Slots</span>
                            <span className="text-emerald-700 text-sm font-black">{available}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 leading-normal font-sans">
                          {total > 0 
                            ? `${used} out of total ${total} official recommendation letters issued or reserved for this quota season.`
                            : "No active quota periods allocated at the moment."
                          }
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Chart Card 2: Today's Schedule status coverage */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>Today's Visit Status</span>
                </h3>

                {(() => {
                  const total = metrics?.todayTotal || 0;
                  const completed = metrics?.todayCompleted || 0;
                  const upcoming = metrics?.todayUpcoming || 0;
                  const cancelled = metrics?.todayCancelled || 0;

                  const compPercent = total > 0 ? (completed / total) * 100 : 0;
                  const upPercent = total > 0 ? (upcoming / total) * 100 : 0;
                  const cancPercent = total > 0 ? (cancelled / total) * 100 : 0;

                  return (
                    <div className="space-y-4">
                      {/* Horizontal Stacked Bar */}
                      <div className="h-6 w-full rounded-xl bg-gray-100 overflow-hidden flex shadow-inner">
                        {total > 0 ? (
                          <>
                            {completed > 0 && (
                              <div 
                                style={{ width: `${compPercent}%` }} 
                                className="bg-emerald-600 h-full transition-all duration-300 relative group flex items-center justify-center"
                                title={`Completed: ${completed}`}
                              >
                                <span className="text-[9px] font-black text-white">{completed}</span>
                              </div>
                            )}
                            {upcoming > 0 && (
                              <div 
                                style={{ width: `${upPercent}%` }} 
                                className="bg-amber-500 h-full transition-all duration-300 relative group flex items-center justify-center"
                                title={`Upcoming: ${upcoming}`}
                              >
                                <span className="text-[9px] font-black text-white">{upcoming}</span>
                              </div>
                            )}
                            {cancelled > 0 && (
                              <div 
                                style={{ width: `${cancPercent}%` }} 
                                className="bg-red-500 h-full transition-all duration-300 relative group flex items-center justify-center"
                                title={`Cancelled: ${cancelled}`}
                              >
                                <span className="text-[9px] font-black text-white">{cancelled}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">
                            No visits scheduled for today.
                          </div>
                        )}
                      </div>

                      {/* Status Legends */}
                      <div className="grid grid-cols-3 gap-2.5 pt-1 text-[10px] font-bold font-sans">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shrink-0"></span>
                          <span className="truncate">COMPLETED ({completed})</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
                          <span className="truncate">UPCOMING ({upcoming})</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shrink-0"></span>
                          <span className="truncate">CANCELLED ({cancelled})</span>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-gray-500 leading-normal font-sans pt-1 border-t border-gray-100">
                        Total visits on today's agenda: <span className="font-bold text-gray-900">{total}</span>. 
                        {completed === total && total > 0 && " 🎉 All scheduled tours completed successfully!"}
                        {completed < total && total > 0 && ` ${upcoming} tours are remaining.`}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Push Notifications Opt-In Card */}
      {pushSupported && !isSubscribed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-amber-100 rounded-full shrink-0">
              <BellRing className="w-5.5 h-5.5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Enable Real-Time Alerts</h3>
              <p className="text-xs text-gray-700 mt-0.5 max-w-lg">
                Receive important schedule updates, contact changes, checklist reminders, and TTD quota alerts directly on your device.
              </p>
            </div>
          </div>
          <button
            onClick={subscribeToPush}
            className="w-full md:w-auto px-4 py-2.5 bg-primary hover:bg-amber-700 text-white font-medium rounded-md shadow-sm transition text-xs whitespace-nowrap"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {/* Grid: Next Visit & Tomorrow Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Next Upcoming Visit */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
            <Clock className="w-4 h-4 text-primary" />
            Next Upcoming Visit
          </h2>
          
          {loadingData ? (
            <div className="text-center py-12 text-xs text-gray-500">Loading next schedule...</div>
          ) : !nextVisit ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-xs text-gray-400">
              <Calendar className="w-8 h-8 text-gray-300 mb-2" />
              <span>No upcoming visits scheduled.</span>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-bold text-gray-950 text-base leading-snug">{nextVisit.title}</h3>
                  {nextVisit.priority && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0 ${
                      nextVisit.priority === "HIGH" 
                        ? "bg-red-50 text-red-700 border border-red-100" 
                        : nextVisit.priority === "LOW"
                        ? "bg-gray-50 text-gray-700 border border-gray-100"
                        : "bg-amber-50 text-primary border border-amber-100"
                    }`}>
                      {nextVisit.priority}
                    </span>
                  )}
                </div>
                
                {nextVisit.category && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">{nextVisit.category}</p>
                )}

                {nextVisit.description && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-3">{nextVisit.description}</p>
                )}

                <div className="mt-4 space-y-2 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{nextVisit.venue}</span>
                    {nextVisit.googleMapsLink && (
                      <a
                        href={nextVisit.googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5 ml-1 font-semibold"
                      >
                        <MapIcon className="w-3 h-3" />
                        <span>Maps</span>
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>
                      {new Date(nextVisit.startAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      -{" "}
                      {new Date(nextVisit.endAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      ({new Date(nextVisit.startAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})
                    </span>
                  </div>
                </div>

                {/* Assigned Staff */}
                {nextVisit.assignments && nextVisit.assignments.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-gray-400" />
                      Assigned Staff
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {nextVisit.assignments.map((a, idx) => (
                        <span key={idx} className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded font-medium">
                          {a.user.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tomorrow's Schedule Preview */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
            <Calendar className="w-4 h-4 text-primary" />
            Tomorrow's Schedule
          </h2>

          {loadingData ? (
            <div className="text-center py-12 text-xs text-gray-500">Loading schedules...</div>
          ) : tomorrowSchedules.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-xs text-gray-400">
              <Calendar className="w-8 h-8 text-gray-300 mb-2" />
              <span>No visits scheduled for tomorrow.</span>
            </div>
          ) : (
            <div className="flex-1 divide-y divide-gray-100 max-h-[300px] overflow-y-auto pr-1">
              {tomorrowSchedules.map((schedule) => (
                <div key={schedule.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-semibold text-gray-950 text-sm leading-tight">{schedule.title}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-amber-50 text-amber-800 uppercase">
                      {new Date(schedule.startAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <span>{schedule.venue}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Urgent Social Media Actions Panel */}
      {dashboardData?.urgentSocialItems && dashboardData.urgentSocialItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-8">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
            <Share2 className="w-4 h-4 text-primary" />
            Urgent Social Media Actions
          </h2>
          <div className="divide-y divide-gray-100">
            {dashboardData.urgentSocialItems.map((item: any) => {
              // Calculate elapsed time since event completion
              const endAt = item.schedule.endAt;
              const endTime = endAt ? new Date(endAt).getTime() : 0;
              const nowTime = new Date().getTime();
              const diffMs = nowTime - endTime;
              const isCompleted = item.schedule.status === "COMPLETED";
              const showCountdown = isCompleted && diffMs > 0;
              
              let elapsedStr = "";
              let urgencyBadgeStyle = "bg-blue-50 text-blue-800 border-blue-200";
              
              if (showCountdown) {
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const remainingMins = diffMins % 60;
                elapsedStr = diffHours === 0 ? `${diffMins}m elapsed` : `${diffHours}h ${remainingMins}m elapsed`;
                
                if (diffHours < 3) {
                  urgencyBadgeStyle = "bg-blue-50 text-blue-800 border-blue-200";
                } else if (diffHours < 6) {
                  urgencyBadgeStyle = "bg-amber-50 text-amber-800 border border-amber-200 animate-pulse";
                } else {
                  urgencyBadgeStyle = "bg-red-50 text-red-800 border border-red-200 font-extrabold animate-bounce";
                }
              }

              return (
                <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h4 className="font-bold text-gray-950 text-sm">{item.schedule.title}</h4>
                    <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                      <span className="text-[9px] text-gray-400 font-semibold uppercase">
                        Event: {item.schedule.status}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 border rounded uppercase font-black ${
                        item.approvalStatus === "PENDING"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : item.status === "APPROVED"
                          ? "bg-purple-50 text-purple-800 border-purple-200"
                          : "bg-red-50 text-red-800 border-red-200"
                      }`}>
                        {item.approvalStatus === "PENDING" ? "Approval Pending" : item.status.replace("_", " ")}
                      </span>
                      {showCountdown && (
                        <span className={`text-[9px] px-2 py-0.5 border rounded-full font-bold flex items-center gap-1 ${urgencyBadgeStyle}`}>
                          <Clock className="w-2.5 h-2.5" />
                          <span>{elapsedStr}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/schedule/${item.schedule.id}/social-media`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-primary font-bold rounded text-xs transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Manage Coverage</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
