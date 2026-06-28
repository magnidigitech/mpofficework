"use client";

import { useEffect, useState } from "react";
import { db, type OfflineSchedule, type OfflineContact } from "@/lib/db";
import { CloudOff, Phone, Calendar, MapPin, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const [schedules, setSchedules] = useState<OfflineSchedule[]>([]);
  const [contacts, setContacts] = useState<OfflineContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOfflineData() {
      try {
        const cachedSchedules = await db.schedules.toArray();
        const cachedContacts = await db.contacts.toArray();
        setSchedules(cachedSchedules);
        setContacts(cachedContacts);
      } catch (err) {
        console.error("Failed to load offline IndexedDB data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadOfflineData();
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col flex-1 p-4 max-w-lg mx-auto w-full pb-24">
      {/* Offline Status Header */}
      <div className="flex flex-col items-center text-center my-8 bg-amber-50 border border-amber-200 rounded-lg p-6 shadow-sm">
        <CloudOff className="w-12 h-12 text-amber-600 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">You are Offline</h1>
        <p className="text-sm text-gray-600 mt-2 max-w-xs">
          Some features are unavailable. Showing schedules and contacts cached on your device.
        </p>
        <button
          onClick={handleRetry}
          className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-amber-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>

      {/* Today / Tomorrow Schedule */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Cached Schedule
        </h2>
        
        {loading ? (
          <div className="text-center py-4 text-gray-500 text-sm">Loading local database...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg text-gray-500 text-sm bg-white">
            No offline schedule available.
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-gray-900 text-base">{schedule.title}</h3>
                  <span className="text-xs px-2 py-1 font-semibold rounded bg-amber-100 text-amber-800 uppercase">
                    {schedule.status}
                  </span>
                </div>
                {schedule.description && (
                  <p className="text-sm text-gray-600 mt-1">{schedule.description}</p>
                )}
                <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>{schedule.venue}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>
                      {new Date(schedule.startAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata"
                      })} - {new Date(schedule.endAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata"
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Contacts */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          Emergency Contacts
        </h2>

        {loading ? (
          <div className="text-center py-4 text-gray-500 text-sm">Loading contacts...</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg text-gray-500 text-sm bg-white">
            No offline contacts available.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 shadow-sm">
            {contacts.map((contact) => (
              <div key={contact.id} className="p-3.5 flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-gray-950 text-sm">{contact.name}</h3>
                  {contact.designation && (
                    <p className="text-xs text-gray-500">{contact.designation}</p>
                  )}
                </div>
                <a
                  href={`tel:${contact.phone}`}
                  className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-full border border-gray-200 text-primary transition"
                  aria-label={`Call ${contact.name}`}
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
