import { Navigation } from "./Navigation";
import { NotificationInbox } from "./NotificationInbox";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar & Bottom Nav */}
      <Navigation />
      
      {/* Main content wrapper offsets for fixed nav bars */}
      <div className="flex-1 md:pl-64 min-w-0 flex flex-col">
        {/* Sticky Top Header Bar */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 md:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="text-sm font-bold text-emerald-800 tracking-tight md:hidden">
            MP Office Portal
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {isLoggedIn ? (
              <NotificationInbox />
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition"
              >
                Login
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-8">
          <div className="max-w-5xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
