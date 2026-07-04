"use client";

import { useEffect, useState, useTransition } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { 
  Plus, Trash, ArrowUp, ArrowDown, Settings, FileText, CheckCircle2, 
  AlertCircle, Save, Edit3, X, Eye, ShieldAlert, GripVertical
} from "lucide-react";
import { useRouter } from "next/navigation";

interface TemplateItem {
  id?: string;
  title: string;
  description?: string | null;
  section: "BEFORE_VISIT" | "DURING_VISIT" | "AFTER_VISIT";
  displayOrder: number;
  isMandatory: boolean;
  defaultAssignedRole?: string | null;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string | null;
  eventCategory?: string | null;
  isDefault: boolean;
  isActive: boolean;
  items: TemplateItem[];
}

export default function ChecklistTemplateManagement() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [isPending, startTransition] = useTransition();

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for selected template
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [templateIsActive, setTemplateIsActive] = useState(true);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);

  // Item form input states
  const [itemTitle, setItemTitle] = useState("");
  const [itemSection, setItemSection] = useState<"BEFORE_VISIT" | "DURING_VISIT" | "AFTER_VISIT">("BEFORE_VISIT");
  const [itemIsMandatory, setItemIsMandatory] = useState(false);

  // Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Swap items in state array
    const updatedItems = [...templateItems];
    const draggedItem = updatedItems[draggedIndex];
    updatedItems.splice(draggedIndex, 1);
    updatedItems.splice(index, 0, draggedItem);

    // Update displayOrder
    const reordered = updatedItems.map((item, i) => ({
      ...item,
      displayOrder: i + 1,
    }));

    setDraggedIndex(index);
    setTemplateItems(reordered);
  };

  // Fetch templates list
  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        const errData = await response.json();
        setError(errData.error || "Failed to load checklist templates.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      loadTemplates();
    }
  }, [session]);

  const selectTemplate = (tpl: ChecklistTemplate) => {
    setSelectedTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description || "");
    setTemplateCategory(tpl.eventCategory || "");
    setTemplateIsDefault(tpl.isDefault);
    setTemplateIsActive(tpl.isActive);
    setTemplateItems([...tpl.items].sort((a, b) => a.displayOrder - b.displayOrder));
    setError(null);
    setSuccess(null);
  };

  const initNewTemplate = () => {
    setSelectedTemplate({
      id: "NEW",
      name: "New Custom Template",
      isDefault: false,
      isActive: true,
      items: [],
    });
    setTemplateName("");
    setTemplateDesc("");
    setTemplateCategory("");
    setTemplateIsDefault(false);
    setTemplateIsActive(true);
    setTemplateItems([]);
    setError(null);
    setSuccess(null);
  };

  // Add Item to Template Form
  const handleAddItem = () => {
    if (!itemTitle.trim()) return;

    const newItem: TemplateItem = {
      title: itemTitle.trim(),
      section: itemSection,
      displayOrder: templateItems.length + 1,
      isMandatory: itemIsMandatory,
    };

    setTemplateItems(prev => [...prev, newItem].map((item, idx) => ({ ...item, displayOrder: idx + 1 })));
    setItemTitle("");
    setItemIsMandatory(false);
  };

  // Remove Item from Template
  const handleRemoveItem = (idx: number) => {
    setTemplateItems(prev => prev.filter((_, i) => i !== idx).map((item, idx) => ({ ...item, displayOrder: idx + 1 })));
  };

  // Shift item up (Reorder)
  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const nextItems = [...templateItems];
    const target = nextItems[idx];
    nextItems[idx] = nextItems[idx - 1];
    nextItems[idx - 1] = target;

    // Recalculate display order
    setTemplateItems(nextItems.map((item, index) => ({ ...item, displayOrder: index + 1 })));
  };

  // Shift item down (Reorder)
  const handleMoveDown = (idx: number) => {
    if (idx === templateItems.length - 1) return;
    const nextItems = [...templateItems];
    const target = nextItems[idx];
    nextItems[idx] = nextItems[idx + 1];
    nextItems[idx + 1] = target;

    // Recalculate display order
    setTemplateItems(nextItems.map((item, index) => ({ ...item, displayOrder: index + 1 })));
  };

  // Save Template details to backend
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      setError("Template Name is required.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const url = selectedTemplate?.id === "NEW" 
          ? "/api/admin/templates" 
          : `/api/admin/templates/${selectedTemplate?.id}`;
        
        const method = selectedTemplate?.id === "NEW" ? "POST" : "PATCH";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName,
            description: templateDesc || null,
            eventCategory: templateCategory || null,
            isDefault: templateIsDefault,
            isActive: templateIsActive,
            items: templateItems,
          }),
        });

        if (response.ok) {
          setSuccess("Checklist template saved successfully!");
          setSelectedTemplate(null);
          await loadTemplates();
        } else {
          const errData = await response.json();
          setError(errData.error || "Failed to save template.");
        }
      } catch (err) {
        console.error(err);
        setError("Error saving template.");
      }
    });
  };

  // Delete Template from database
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template? This cannot be undone.")) return;

    try {
      const response = await fetch(`/api/admin/templates/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Template deleted successfully!");
        setSelectedTemplate(null);
        await loadTemplates();
      } else {
        const errData = await response.json();
        alert(errData.error || "Failed to delete template");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting template");
    }
  };

  if (sessionPending) {
    return (
      <PageLayout>
        <div className="text-center py-16 text-sm text-gray-500 font-sans">Loading session details...</div>
      </PageLayout>
    );
  }

  // Permission boundary check
  const isSuperAdmin = session?.user?.email === "admin@mpoffice.com";
  if (!isSuperAdmin) {
    return (
      <PageLayout>
        <div className="p-5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div>
            <h3 className="font-bold text-sm">Access Denied</h3>
            <p className="mt-1">Only administrators have access to template administration views.</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans">Checklist Templates</h1>
          <p className="text-xs text-gray-500 mt-1">Manage boilerplate tour verification tasks</p>
        </div>
        {!selectedTemplate && (
          <button
            onClick={initNewTemplate}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-amber-700 text-white font-medium rounded-md shadow-sm transition text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Template</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex gap-2 items-start shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex gap-2 items-start shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {selectedTemplate ? (
        /* TEMPLATE EDITOR VIEW */
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
              <Settings className="w-4.5 h-4.5 text-primary" />
              {selectedTemplate.id === "NEW" ? "Create New Checklist Template" : "Edit Template details"}
            </h2>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-gray-500 hover:text-gray-900 text-xs flex items-center gap-1 font-semibold"
            >
              <X className="w-4 h-4" /> Close Editor
            </button>
          </div>

          {/* Template basic details form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Template Name *</label>
              <input
                type="text"
                placeholder="e.g. Protocol Visit Template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-gray-700 mb-1">Target Category (Optional)</label>
              <input
                type="text"
                placeholder="e.g. VIP Visit (matches schedule category)"
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="flex flex-row items-end gap-6 pt-5">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateIsDefault}
                  onChange={(e) => setTemplateIsDefault(e.target.checked)}
                  disabled={isPending}
                  className="w-4 h-4 rounded border-gray-300 text-primary accent-primary"
                />
                <span>Set as Default Template</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateIsActive}
                  onChange={(e) => setTemplateIsActive(e.target.checked)}
                  disabled={isPending}
                  className="w-4 h-4 rounded border-gray-300 text-primary accent-primary"
                />
                <span>Active</span>
              </label>
            </div>

            <div className="flex flex-col sm:col-span-3">
              <label className="text-xs font-bold text-gray-700 mb-1">Description</label>
              <input
                type="text"
                placeholder="Boilerplate summary..."
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Template Items management */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Tasks List</h3>

            {/* Quick Add Task Form */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4.5 mb-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col w-full">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Task Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Verify catering details"
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    className="text-xs h-9.5 px-3 w-full border border-gray-200 rounded-lg focus:outline-none focus:border-primary font-sans font-medium text-gray-900"
                  />
                </div>

                <div className="flex flex-col w-full">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Section</label>
                  <select
                    value={itemSection}
                    onChange={(e) => setItemSection(e.target.value as any)}
                    className="text-xs h-9.5 border border-gray-200 rounded-lg px-2.5 bg-white focus:outline-none focus:border-primary font-sans font-medium text-gray-900 cursor-pointer"
                  >
                    <option value="BEFORE_VISIT">Before Visit</option>
                    <option value="DURING_VISIT">During Visit</option>
                    <option value="AFTER_VISIT">After Visit</option>
                  </select>
                </div>
              </div>

              {/* Mandatory checkbox and Add button grouped together */}
              <div className="flex items-center justify-between border-t border-gray-200/60 pt-3 flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={itemIsMandatory}
                    onChange={(e) => setItemIsMandatory(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-primary"
                  />
                  <span>Mark as Mandatory Task</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="h-9 px-5 bg-primary hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer focus:outline-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>

            {/* List of items */}
            {templateItems.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400 font-sans border border-dashed border-gray-200 rounded-lg">
                No tasks added to this template yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {templateItems.map((item, idx) => (
                  <div 
                    key={idx}
                    draggable
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={() => setDraggedIndex(null)}
                    className={`bg-white border rounded-xl p-3 shadow-xs hover:shadow-sm transition flex items-start gap-3 select-none relative ${
                      draggedIndex === idx ? "opacity-30 border-dashed border-primary bg-amber-50/20" : "border-gray-200"
                    }`}
                  >
                    {/* Left: Drag Handle Icon */}
                    <div className="text-gray-400 mt-0.5 shrink-0 cursor-grab active:cursor-grabbing hover:text-gray-600 p-1">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Right: 2-Section Details */}
                    <div className="flex-1 min-w-0">
                      {/* Top Row: Checklist point Title */}
                      <p className="text-xs font-bold text-gray-900 break-words whitespace-normal leading-normal">{item.title}</p>
                      
                      {/* Bottom Row: Metadata tags & actions */}
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide border-t border-gray-100/70 pt-2 mt-2 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md text-[9px]">
                            {item.section.replace("_", " ")}
                          </span>
                          {item.isMandatory && (
                            <span className="bg-red-50 text-red-700 border border-red-100 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                              Mandatory
                            </span>
                          )}
                        </div>

                        {/* Delete action button */}
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmIdx(idx)}
                          className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 rounded-lg transition focus:outline-none cursor-pointer shrink-0"
                          title="Delete Task"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submission button */}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              onClick={() => setSelectedTemplate(null)}
              className="px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTemplate}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-amber-700 text-white font-semibold rounded text-xs transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{selectedTemplate.id === "NEW" ? "Create Template" : "Save Template"}</span>
            </button>
          </div>
        </div>
      ) : (
        /* TEMPLATES LIST VIEW */
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          {loading ? (
            <div className="text-center py-8 text-xs text-gray-500 font-sans">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-400 font-sans border border-dashed border-gray-200 rounded-lg">
              No checklist templates created yet. Click "Create Template" to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {templates.map((tpl) => (
                <div key={tpl.id} className="py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-bold text-gray-900 text-sm">{tpl.name}</h3>
                      {tpl.isDefault && (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                          Default fallback
                        </span>
                      )}
                      {!tpl.isActive && (
                        <span className="bg-gray-100 text-gray-500 border border-gray-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                          Inactive
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 mt-1">{tpl.description}</p>
                    )}
                    {tpl.eventCategory && (
                      <p className="text-[10px] text-primary font-bold mt-1.5 uppercase tracking-wide">
                        Category: {tpl.eventCategory}
                      </p>
                    )}
                    <p className="text-[9px] text-gray-400 font-medium mt-1">
                      {tpl.items.length} tasks registered in template
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => selectTemplate(tpl)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded text-xs transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      disabled={tpl.isDefault}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold rounded text-xs transition disabled:opacity-30 disabled:hover:bg-red-50"
                    >
                      <Trash className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteConfirmIdx !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setDeleteConfirmIdx(null)} />
          <div className="relative bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-gray-100 z-50 space-y-4 animate-slide-up">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5 text-red-700">
              <Trash className="w-4 h-4" />
              <span>Delete Checklist Item</span>
            </h4>
            <p className="text-xs text-gray-600 leading-normal">
              Are you sure you want to remove the task <strong className="text-gray-900">"{templateItems[deleteConfirmIdx]?.title}"</strong>? This deletion won't be final until you click <strong>Save Template</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmIdx(null)}
                className="px-3.5 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRemoveItem(deleteConfirmIdx);
                  setDeleteConfirmIdx(null);
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs focus:outline-none cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
