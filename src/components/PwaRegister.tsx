"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    // Prevent service worker from caching dynamic Turbopack development chunks
    if (process.env.NODE_ENV === "development") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
            console.log("Service Worker unregistered automatically in development mode.");
          }
        });
      }
      return;
    }

    if ("serviceWorker" in navigator && (window as any).workbox === undefined) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Service Worker registered successfully with scope:", reg.scope);
        })
        .catch((err) => {
          console.error("Service Worker registration failed:", err);
        });
    }
  }, []);

  return null;
}
