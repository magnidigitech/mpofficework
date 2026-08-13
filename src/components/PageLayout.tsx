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
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50/70 antialiased">
      {/* Sidebar & Bottom Nav */}
      {isLoggedIn && <Navigation />}
      
      {/* Main content wrapper offsets for fixed nav bars */}
      <div className={`flex-1 ${isLoggedIn ? "md:pl-64" : ""} min-w-0 flex flex-col`}>
        {/* Sticky Top Header Bar */}
        <header className="h-20 bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-4 sm:px-6 md:px-8 flex items-center justify-between shadow-2xs transition-all">
          <div className="flex items-center gap-3.5">
            <div className="p-1 bg-amber-500/10 rounded-xl border border-amber-500/20 shrink-0">
              <img 
                src="/telugudesamlogo.png" 
                alt="TDP Logo" 
                className="h-11 w-auto object-contain flex-shrink-0"
              />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm md:text-base font-extrabold text-slate-900 leading-tight tracking-tight uppercase">
                  Bhashyam Rama Krishna
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/80 rounded-full border border-amber-300/60">
                  MP Office
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold text-amber-600 tracking-wider uppercase mt-0.5">
                Member of Parliament · Rajya Sabha
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {isLoggedIn ? (
              <NotificationInbox />
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 rounded-xl shadow-xs hover:shadow-md transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-8">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 border-t border-slate-200/60 bg-white text-center shrink-0">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-sans tracking-wide">
            <span>Powered by</span>
            <a 
              href="https://www.magnidigitech.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center bg-slate-950 px-2.5 py-1 rounded-lg hover:opacity-90 transition shadow-xs"
            >
              <img 
                src="/magnilogo.webp" 
                alt="Magni Digitech" 
                className="h-4 w-auto object-contain"
              />
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
