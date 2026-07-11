"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, Calendar, FileText, User, LogOut, Users, Shield, Settings, Menu, X 
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const baseNavItems = [
  { name: "Home", href: "/", icon: Home },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "TTD Letters", href: "/ttd-letters", icon: FileText },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Profile", href: "/profile", icon: User },
];

const mobileMainLinks = [
  { name: "Home", href: "/", icon: Home },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "TTD Letters", href: "/ttd-letters", icon: FileText },
  { name: "Reports", href: "/reports", icon: FileText },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session;
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    async function checkRoles() {
      if (!isLoggedIn) {
        setIsAdmin(false);
        setUserRoles([]);
        return;
      }
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          const roles = profile.roles || [];
          setUserRoles(roles);
          if (roles.includes("Super Admin") || roles.includes("MP Office Admin")) {
            setIsAdmin(true);
          }
        }
      } catch (e) {}
    }
    checkRoles();
  }, [isLoggedIn]);

  const isScheduleViewerOnly = userRoles.includes("Schedule Viewer") &&
    !isAdmin &&
    !userRoles.includes("Schedule Coordinator") &&
    !userRoles.includes("Social Media Team") &&
    !userRoles.includes("TTD Manager") &&
    !userRoles.includes("TTD Staff") &&
    !userRoles.includes("Field Staff") &&
    !userRoles.includes("Field Coordinator");

  let navItems = [...baseNavItems];
  if (isAdmin) {
    navItems.push({ name: "Staff Management", href: "/admin/staff", icon: Users });
    navItems.push({ name: "Checklist Templates", href: "/admin/templates", icon: FileText });
    navItems.push({ name: "Audit Center", href: "/admin/audit", icon: Shield });
    navItems.push({ name: "Settings", href: "/admin/settings", icon: Settings });
  }

  if (!isLoggedIn) {
    navItems = baseNavItems.filter((item) => item.name === "Schedule");
  } else if (isScheduleViewerOnly) {
    navItems = navItems.filter((item) => item.name === "Schedule");
  }

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isMenuLinkActive = ["/profile", "/admin/staff", "/admin/templates", "/admin/audit", "/admin/settings"].includes(pathname);

  return (
    <>
      {/* Mobile Bottom Navigation (Visible only on mobile/tablet) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden pb-safe">
        <div className="flex justify-around items-center h-16">
          {mobileMainLinks
            .filter((item) => {
              if (!isLoggedIn) {
                return item.name === "Schedule";
              }
              if (isScheduleViewerOnly) {
                return item.name === "Schedule";
              }
              return true;
            })
            .map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center flex-1 h-full text-xs transition ${
                    isActive ? "text-primary font-semibold" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-0.5 ${isActive ? "text-primary" : "text-gray-400"}`} />
                  <span className="truncate max-w-[70px] text-[10px]">{item.name}</span>
                </Link>
              );
            })}
          
          {/* Mobile Menu Button / Login Button */}
          {!isLoggedIn ? (
            <Link
              href="/login"
              className="flex flex-col items-center justify-center flex-1 h-full text-xs text-gray-500 hover:text-gray-900 transition"
            >
              <User className="w-5 h-5 mb-0.5 text-gray-400" />
              <span className="text-[10px]">Login</span>
            </Link>
          ) : (
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={`flex flex-col items-center justify-center flex-1 h-full text-xs transition focus:outline-none cursor-pointer ${
                isMenuLinkActive ? "text-primary font-semibold" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Menu className={`w-5 h-5 mb-0.5 ${isMenuLinkActive ? "text-primary" : "text-gray-400"}`} />
              <span className="text-[10px]">Menu</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Menu Slide-up Bottom Sheet */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsMobileMenuOpen(false)} />
          
          <div className="relative bg-white w-full max-h-[80vh] rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250 z-10">
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 shrink-0" />
            
            {/* Header */}
            <div className="px-6 pb-3 pt-1 border-b border-gray-100 flex items-center justify-between shrink-0">
              <span className="font-bold text-gray-900 text-sm">Quick Menu</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)} 
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
              {/* Sign Out (At the top to prevent accidental clicks near swipe areas) */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="flex items-center gap-3.5 w-full px-4 py-3 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 transition focus:outline-none cursor-pointer text-left"
              >
                <LogOut className="w-5 h-5 text-red-500" />
                <span>Sign Out Account</span>
              </button>

              <div className="border-b border-gray-100 my-1" />

              <Link
                href="/profile"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-lg transition ${
                  pathname === "/profile" ? "bg-amber-50 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <User className="w-5 h-5 text-gray-400" />
                <span>Profile</span>
              </Link>
              
              {isAdmin && (
                <>
                  <Link
                    href="/admin/staff"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-lg transition ${
                      pathname === "/admin/staff" ? "bg-amber-50 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Users className="w-5 h-5 text-gray-400" />
                    <span>Staff Management</span>
                  </Link>
                  <Link
                    href="/admin/templates"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-lg transition ${
                      pathname === "/admin/templates" ? "bg-amber-50 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span>Checklist Templates</span>
                  </Link>
                  <Link
                    href="/admin/audit"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-lg transition ${
                      pathname === "/admin/audit" ? "bg-amber-50 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Shield className="w-5 h-5 text-gray-400" />
                    <span>Audit Center</span>
                  </Link>
                  <Link
                    href="/admin/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-lg transition ${
                      pathname === "/admin/settings" ? "bg-amber-50 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Settings className="w-5 h-5 text-gray-400" />
                    <span>Settings</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowLogoutConfirm(false)} />
          
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150 z-50">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-500" />
              <span>Confirm Sign Out</span>
            </h3>
            <p className="text-xs text-gray-500 mt-2.5 leading-relaxed font-medium">
              Are you sure you want to sign out of your account? You will need to enter your credentials to log back in.
            </p>
            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-semibold text-gray-600 transition focus:outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition focus:outline-none cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation (Visible only on desktop md+) */}
      <aside className="fixed top-0 bottom-0 left-0 z-40 hidden w-64 bg-white border-r border-gray-200 md:flex md:flex-col">
        {/* Header Logo Area */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-gray-200 bg-gray-50">
          <svg className="w-8 h-8 text-primary" viewBox="0 0 512 512" fill="currentColor">
            <path d="M256 130 L150 195 L362 195 Z" />
            <rect x="165" y="195" width="182" height="15" />
            <rect x="177" y="218" width="18" height="110" />
            <rect x="247" y="218" width="18" height="110" />
            <rect x="317" y="218" width="18" height="110" />
            <rect x="165" y="328" width="182" height="15" />
          </svg>
          <span className="font-bold text-gray-900 tracking-tight">MP Office Portal</span>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-3 text-sm font-medium rounded-lg transition ${
                  isActive
                    ? "bg-amber-50 text-primary"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-gray-400"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout/Login Button */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          {isLoggedIn ? (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-3.5 w-full px-4 py-3 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-red-500" />
              <span>Sign Out</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-3.5 w-full px-4 py-3 text-sm font-medium text-primary rounded-lg hover:bg-amber-50 hover:text-primary-dark transition cursor-pointer"
            >
              <User className="w-5 h-5 text-primary" />
              <span>Login</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
