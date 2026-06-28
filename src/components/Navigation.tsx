"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, PlusCircle, FileText, User, LogOut, Users, Shield, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const baseNavItems = [
  { name: "Home", href: "/", icon: Home },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "Add New", href: "/add", icon: PlusCircle },
  { name: "TTD Letters", href: "/ttd-letters", icon: FileText },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Profile", href: "/profile", icon: User },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const profile = await res.json();
          const roles = profile.roles || [];
          if (roles.includes("Super Admin") || roles.includes("MP Office Admin")) {
            setIsAdmin(true);
          }
        }
      } catch (e) {}
    }
    checkAdmin();
  }, []);

  const navItems = [...baseNavItems];
  if (isAdmin) {
    navItems.push({ name: "Staff Management", href: "/admin/staff", icon: Users });
    navItems.push({ name: "Audit Center", href: "/admin/audit", icon: Shield });
    navItems.push({ name: "Settings", href: "/admin/settings", icon: Settings });
  }

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      {/* Mobile Bottom Navigation (Visible only on mobile/tablet) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden pb-safe">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
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
        </div>
      </nav>

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

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3.5 w-full px-4 py-3 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 hover:text-red-700 transition"
          >
            <LogOut className="w-5 h-5 text-red-500" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
