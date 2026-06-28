"use client";

import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { 
  Users, Search, Plus, Edit, ShieldAlert, Key, Ban, CheckCircle, 
  X, AlertCircle, Copy, Check, Info, ShieldCheck, RefreshCw, Loader2
} from "lucide-react";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  mobileNumber: string;
  designation: string | null;
  department: string | null;
  employeeCode: string;
  profileImage: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: string;
  pushDeviceCount: number;
}

export default function StaffManagement() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  
  // States
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  // Add Form
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addMobile, setAddMobile] = useState("");
  const [addDesignation, setAddDesignation] = useState("");
  const [addDept, setAddDept] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addRole, setAddRole] = useState("Viewer");
  const [addPassword, setAddPassword] = useState("");

  // Edit Form
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editRole, setEditRole] = useState("");

  // Reset Form
  const [tempPassword, setTempPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const rolesList = [
    "Super Admin",
    "MP Office Admin",
    "Schedule Coordinator",
    "Field Staff",
    "Social Media Team",
    "TTD Manager",
    "TTD Staff",
    "Viewer"
  ];

  // Fetch Users
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        query: search,
        role: roleFilter,
        active: activeFilter,
        page: String(page),
        limit: "10",
      });

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotalPages(data.pagination.totalPages);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load staff list.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch portal users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchUsers();
    }
  }, [session, search, roleFilter, activeFilter, page]);

  // Auth Guard
  useEffect(() => {
    if (!sessionPending && !session) {
      router.push("/login");
    }
  }, [session, sessionPending]);

  // Actions
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          email: addEmail,
          mobileNumber: addMobile,
          designation: addDesignation || null,
          department: addDept || null,
          employeeCode: addCode,
          role: addRole,
          password: addPassword,
        }),
      });

      if (res.ok) {
        setSuccess("Staff account created successfully.");
        setIsAddModalOpen(false);
        // Clear
        setAddName("");
        setAddEmail("");
        setAddMobile("");
        setAddDesignation("");
        setAddDept("");
        setAddCode("");
        setAddPassword("");
        fetchUsers();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to create user.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    }
  };

  const handleEditOpen = (user: UserRecord) => {
    setSelectedUser(user);
    setEditName(user.name);
    setEditMobile(user.mobileNumber);
    setEditDesignation(user.designation || "");
    setEditDept(user.department || "");
    setEditCode(user.employeeCode);
    setEditRole(user.role);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedUser) return;

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          mobileNumber: editMobile,
          designation: editDesignation || null,
          department: editDept || null,
          employeeCode: editCode,
          role: editRole,
        }),
      });

      if (res.ok) {
        setSuccess(`Successfully updated details for ${editName}.`);
        setIsEditModalOpen(false);
        fetchUsers();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to update staff.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to apply updates.");
    }
  };

  const toggleUserActiveState = async (user: UserRecord) => {
    setError(null);
    setSuccess(null);
    const action = user.isActive ? "deactivate" : "activate";

    try {
      const res = await fetch(`/api/admin/users/${user.id}/${action}`, {
        method: "POST",
      });

      if (res.ok) {
        setSuccess(`User ${user.name} has been successfully ${action}d.`);
        fetchUsers();
      } else {
        const errData = await res.json();
        setError(errData.error || `Failed to ${action} user.`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to update status.`);
    }
  };

  const handleResetOpen = (user: UserRecord) => {
    setSelectedUser(user);
    setTempPassword("");
    setCopied(false);
    setIsResetModalOpen(true);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedUser || !tempPassword) return;

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword: tempPassword }),
      });

      if (res.ok) {
        setSuccess(`Password for ${selectedUser.name} has been reset. Share the temporary password.`);
        setIsResetModalOpen(false);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to reset password.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(pass);
  };

  return (
    <PageLayout>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header Section */}
        <div className="p-6 md:p-8 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-7 h-7" />
              <span>Staff Administration</span>
            </h1>
            <p className="text-emerald-100 text-sm mt-1">
              Create portal accounts, administer roles, reset passwords, and manage activation status.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold rounded-lg shadow transition focus:outline-none"
          >
            <Plus className="w-5 h-5" />
            <span>Add Staff Account</span>
          </button>
        </div>

        {/* Filters Section */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, employee code, mobile..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
            />
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-3">
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-emerald-700 font-medium"
            >
              <option value="">All Roles</option>
              {rolesList.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
              className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-emerald-700 font-medium"
            >
              <option value="">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Deactivated Only</option>
            </select>
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="font-medium">{error}</div>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="font-medium">{success}</div>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-700" />
              <span className="text-sm mt-3 font-semibold">Fetching staff accounts...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <h3 className="font-medium text-gray-900 text-base">No staff accounts found</h3>
              <p className="text-xs text-gray-500 mt-1">Try resetting your search query or filters.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-200">
                  <th className="px-6 py-3.5">Code / Name</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Department / Desig</th>
                  <th className="px-6 py-3.5">Contact Details</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 text-sm transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{user.employeeCode}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{user.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {user.role === "Super Admin" ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Users className="w-3.5 h-3.5" />
                        )}
                        <span>{user.role}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{user.designation || "N/A"}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{user.department || "N/A"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 text-xs font-semibold">{user.email}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{user.mobileNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        user.isActive 
                          ? "bg-emerald-100 text-emerald-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {user.isActive ? "Active" : "Deactivated"}
                      </span>
                      {user.mustChangePassword && (
                        <div className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-0.5">
                          <Key className="w-3 h-3" />
                          <span>Reset Required</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditOpen(user)}
                          title="Edit Details"
                          className="p-2 text-gray-500 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 active:scale-95 transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetOpen(user)}
                          title="Reset Password"
                          className="p-2 text-gray-500 hover:text-amber-700 rounded-lg hover:bg-amber-50 active:scale-95 transition"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleUserActiveState(user)}
                          title={user.isActive ? "Deactivate" : "Activate"}
                          className={`p-2 rounded-lg active:scale-95 transition ${
                            user.isActive 
                              ? "text-red-500 hover:text-red-700 hover:bg-red-50" 
                              : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Section */}
        {totalPages > 1 && (
          <div className="p-6 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <span className="text-xs font-semibold text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Users className="w-5.5 h-5.5" />
                <span>Create Staff Account</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-emerald-100 hover:text-white transition">
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee Name</label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={addCode}
                    onChange={(e) => setAddCode(e.target.value)}
                    placeholder="e.g. MPO-2026-08"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Office Email</label>
                  <input
                    type="email"
                    required
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="rajesh@mpoffice.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={addMobile}
                    onChange={(e) => setAddMobile(e.target.value)}
                    placeholder="e.g. 9000123456"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Designation</label>
                  <input
                    type="text"
                    value={addDesignation}
                    onChange={(e) => setAddDesignation(e.target.value)}
                    placeholder="e.g. Senior Secretary"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    value={addDept}
                    onChange={(e) => setAddDept(e.target.value)}
                    placeholder="e.g. Public Relations"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Portal Role</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-emerald-700 bg-white"
                  >
                    {rolesList.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Temporary Password</label>
                  <input
                    type="password"
                    required
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="At least 6 chars"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed flex gap-2">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Adding a user automatically forces the <strong>Change Password on login</strong> policy.
                  They will be prompted to update this password upon their first sign-in.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-semibold rounded-lg shadow-sm focus:outline-none transition"
                >
                  Register Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Edit className="w-5.5 h-5.5" />
                <span>Modify Staff Profile</span>
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-emerald-100 hover:text-white transition">
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email (ReadOnly)</label>
                  <input
                    type="email"
                    disabled
                    value={selectedUser.email}
                    className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Designation</label>
                  <input
                    type="text"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Portal Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-emerald-700 bg-white"
                >
                  {rolesList.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-semibold rounded-lg shadow-sm focus:outline-none transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-gradient-to-r from-amber-600 to-amber-500 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Key className="w-5.5 h-5.5" />
                <span>Reset Staff Password</span>
              </h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-amber-100 hover:text-white transition">
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Generate or define a new temporary password for <strong>{selectedUser.name}</strong>.
                This forces session revocation and password change policy on login.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Temporary Password</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="Enter or generate password"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-xs text-gray-700 rounded-lg border border-gray-200 font-bold transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              {tempPassword && (
                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <code className="text-xs font-mono text-gray-800 select-all font-bold">{tempPassword}</code>
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-100 active:scale-95 text-[10px] text-primary border border-gray-200 rounded-md font-bold transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-gray-500" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tempPassword}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold rounded-lg shadow-sm focus:outline-none transition disabled:opacity-50"
                >
                  Apply Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
