"use client";

import { useState, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  Settings, Save, ShieldAlert, CheckCircle2, AlertCircle, Loader2,
  HelpCircle, Eye, EyeOff, LayoutGrid, Clock, Smartphone, Database
} from "lucide-react";

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  
  // Data loading state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Raw settings from DB
  const [settingsList, setSettingsList] = useState<any[]>([]);

  // Current working state (key-value mapped)
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettingsList(data.settings || []);
        
        // Populate formData based on key and type
        const initialForm: Record<string, any> = {};
        data.settings.forEach((s: any) => {
          if (s.valueType === "number") {
            initialForm[s.key] = Number(s.value);
          } else if (s.valueType === "boolean") {
            initialForm[s.key] = s.value === "true";
          } else {
            initialForm[s.key] = s.value;
          }
        });
        setFormData(initialForm);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load system settings.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to query system settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key: string, val: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSuccess("Portal configuration and system settings updated successfully.");
        fetchSettings();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to update configurations.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryFields = (categoryName: string) => {
    const fields = settingsList.filter((s) => s.category === categoryName);
    if (fields.length === 0) return null;

    return (
      <div className="space-y-4">
        {fields.map((f) => {
          const value = formData[f.key];
          return (
            <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-100 last:border-0 text-xs">
              <div className="md:col-span-1">
                <span className="font-bold text-gray-800">{f.key.replace(/_/g, " ").toUpperCase()}</span>
                <p className="text-[10px] text-gray-400 mt-1">{f.description || "System parameter control."}</p>
              </div>
              <div className="md:col-span-2">
                {f.valueType === "boolean" ? (
                  <label className="relative inline-flex items-center cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(e) => handleInputChange(f.key, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-700"></div>
                    <span className="ml-2 text-xs font-semibold text-gray-700">{value ? "Enabled" : "Disabled"}</span>
                  </label>
                ) : f.valueType === "number" ? (
                  <input
                    type="number"
                    value={value !== undefined ? value : ""}
                    onChange={(e) => handleInputChange(f.key, Number(e.target.value))}
                    className="w-full sm:w-64 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-700"
                  />
                ) : (
                  <input
                    type="text"
                    value={value !== undefined ? value : ""}
                    onChange={(e) => handleInputChange(f.key, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-700"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const isAuthorized = session?.user && (session.user.email === "admin@mpoffice.com" || (session.user as any).role === "Super Admin" || (session.user as any).role === "MP Office Admin");

  if (loading) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
          <p className="text-xs text-gray-500 mt-2">Loading system settings...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-700" />
            <span>System Settings</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">Configure tour reminders, checklist constraints, TTD thresholds, and audit parameters.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-8 max-w-4xl">
        {/* GENERAL SETTINGS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
            <LayoutGrid className="w-5 h-5 text-emerald-700" />
            <span>General Portal Configurations</span>
          </h3>
          {renderCategoryFields("GENERAL")}
        </div>

        {/* TOUR & CHECKLIST SETTINGS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-emerald-700" />
            <span>Schedules & Visit Checklists Controls</span>
          </h3>
          {renderCategoryFields("SCHEDULE")}
        </div>

        {/* SOCIAL MEDIA WORKFLOW */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-emerald-700" />
            <span>Social Media Workflow Controls</span>
          </h3>
          {renderCategoryFields("SOCIAL_MEDIA")}
        </div>

        {/* TTD DARSHAN LETTER SETTINGS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-emerald-700" />
            <span>TTD DARSHAN VIP Quotas</span>
          </h3>
          {renderCategoryFields("TTD")}
        </div>

        {/* DATA RETENTION CONTROLS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-emerald-700" />
            <span>Data Retention Limits</span>
          </h3>
          {renderCategoryFields("DATA_RETENTION")}
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-6 h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-sm active:scale-95 disabled:opacity-50 transition text-sm focus:outline-none"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Configurations</span>
          </button>
        </div>
      </form>
    </PageLayout>
  );
}
