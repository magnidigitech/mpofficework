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
      {isLoggedIn && <Navigation />}
      
      {/* Main content wrapper offsets for fixed nav bars */}
      <div className={`flex-1 ${isLoggedIn ? "md:pl-64" : ""} min-w-0 flex flex-col`}>
        {/* Sticky Top Header Bar */}
        <header className="h-20 bg-white border-b-4 border-yellow-400 px-4 sm:px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <img 
              src="/telugudesamlogo.png" 
              alt="TDP Logo" 
              className="h-12 w-auto object-contain flex-shrink-0"
            />
            <div className="flex flex-col justify-center">
              <h1 className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-[rgb(10,28,48)] leading-tight tracking-tight uppercase">
                Bhashyam Rama Krishna
              </h1>
              <p className="text-[8px] sm:text-[9px] md:text-[10px] font-semibold text-amber-500 tracking-wider uppercase mt-0.5">
                Member of Parliament, Rajya Sabha
              </p>
            </div>
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

        {/* Footer */}
        <footer className="py-4 border-t border-gray-200 bg-white text-center shrink-0">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 font-sans tracking-wide">
            <span>Powered by</span>
            <a 
              href="https://www.magnidigitech.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:opacity-85 transition"
            >
              <img 
                src="/magnilogo.webp" 
                alt="Magni Digitech Logo" 
                className="h-4 w-auto object-contain"
              />
              <span className="font-semibold text-gray-500 hover:text-emerald-700 transition">Magni Digitech</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
