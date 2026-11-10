"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/app/_trpc/client";
import { format } from "date-fns";
import {
  Users,
  Search,
  UserPlus,
  ShieldCheck,
  Shield,
  Gem,
  CreditCard,
  Edit3,
  Trash2,
  Ban,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Calendar,
  FileText,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import Skeleton from "react-loading-skeleton";

export default function UsersManagement() {
  const { toast } = useToast();
  const utils = trpc.useContext();

  const {
    data: users,
    isLoading,
    isFetching,
  } = trpc.adminGetUsers.useQuery(undefined, {
    refetchOnMount: "always",
  });

  const { data: plans } = trpc.adminGetPlans.useQuery();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "USER">("ALL");
  const [planFilter, setPlanFilter] = useState<"ALL" | "SUBSCRIBED" | "FREE">(
    "ALL"
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "SUSPENDED"
  >("ALL");

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"USER" | "ADMIN">("USER");
  const [newStatus, setNewStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [newPlanSlug, setNewPlanSlug] = useState("free");
  const [newDurationDays, setNewDurationDays] = useState(30);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"USER" | "ADMIN">("USER");
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "SUSPENDED">(
    "ACTIVE"
  );

  // Manage Subscription Modal State
  const [subModalUser, setSubModalUser] = useState<any | null>(null);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState("pro");
  const [subDurationDays, setSubDurationDays] = useState(30);

  // Delete User Confirmation State
  const [deletingUser, setDeletingUser] = useState<any | null>(null);

  const invalidateAll = () => {
    utils.adminGetUsers.invalidate();
    utils.adminGetOverview.invalidate();
    utils.adminGetPlans.invalidate();
  };

  // Mutations
  const createUserMutation = trpc.adminCreateUser.useMutation({
    onSuccess: (created) => {
      toast({
        title: "User created",
        description: `${created.email} has been added with role ${created.role}.`,
      });
      setIsCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("USER");
      setNewStatus("ACTIVE");
      setNewPlanSlug("free");
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Could not create user",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = trpc.adminUpdateUser.useMutation({
    onSuccess: (updated) => {
      toast({
        title: "User updated",
        description: `Account settings saved for ${updated.email}.`,
      });
      setEditingUser(null);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const manageSubMutation = trpc.adminManageSubscription.useMutation({
    onSuccess: () => {
      toast({
        title: "Subscription updated",
        description: `Subscription changes applied for ${subModalUser?.email}.`,
      });
      setSubModalUser(null);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Subscription update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = trpc.adminDeleteUser.useMutation({
    onSuccess: () => {
      toast({
        title: "User deleted",
        description:
          "User account, files, messages, and vector embeddings were removed.",
      });
      setDeletingUser(null);
      invalidateAll();
    },
    onError: (err) => {
      toast({
        title: "Could not delete user",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((u: any) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.email?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.id?.toLowerCase().includes(q);

      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchesPlan =
        planFilter === "ALL" ||
        (planFilter === "SUBSCRIBED" && u.isSubscribed) ||
        (planFilter === "FREE" && !u.isSubscribed);
      const matchesStatus = statusFilter === "ALL" || u.status === statusFilter;

      return matchesSearch && matchesRole && matchesPlan && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, planFilter, statusFilter]);

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditRole(u.role || "USER");
    setEditStatus(u.status || "ACTIVE");
  };

  const openSubModal = (u: any) => {
    setSubModalUser(u);
    const defaultPaidPlan =
      plans?.find((p) => p.slug !== "free")?.slug || "pro";
    setSelectedPlanSlug(
      u.planSlug && u.planSlug !== "free" ? u.planSlug : defaultPaidPlan
    );
    setSubDurationDays(30);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Users & Subscriptions
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage user accounts, Kinde RBAC roles (Admin / User), and subscription billing states.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={invalidateAll}
            disabled={isFetching}
            className="h-9 gap-1.5 bg-white border-zinc-200 text-zinc-700"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search by email, name, or Kinde ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
              {(["ALL", "ADMIN", "USER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    roleFilter === r
                      ? "bg-white text-blue-600 shadow-sm font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  {r === "ALL" ? "All Roles" : r}
                </button>
              ))}
            </div>

            {/* Plan Filter */}
            <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
              {(["ALL", "SUBSCRIBED", "FREE"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlanFilter(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    planFilter === p
                      ? "bg-white text-blue-600 shadow-sm font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  {p === "ALL"
                    ? "All Plans"
                    : p === "SUBSCRIBED"
                    ? "Paid / Pro"
                    : "Free"}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
              {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    statusFilter === s
                      ? "bg-white text-blue-600 shadow-sm font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  {s === "ALL" ? "All Status" : s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      {isLoading ? (
        <Skeleton height={360} className="rounded-xl" />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3.5 px-5">User / Kinde ID</th>
                  <th className="py-3.5 px-4">RBAC Role</th>
                  <th className="py-3.5 px-4">Subscription Plan</th>
                  <th className="py-3.5 px-4">Usage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-sm">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-zinc-500"
                    >
                      No users match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u: any) => (
                    <tr
                      key={u.id}
                      className="hover:bg-zinc-50/70 transition-colors"
                    >
                      {/* User Details */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-xs border",
                              u.role === "ADMIN"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-zinc-100 text-zinc-700 border-zinc-200"
                            )}
                          >
                            {(u.name || u.email || "U")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {u.email}
                            </p>
                            <code className="text-[10px] font-mono text-zinc-400">
                              {u.id}
                            </code>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            u.role === "ADMIN"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                          )}
                        >
                          {u.role === "ADMIN" ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-zinc-500" />
                          )}
                          {u.role}
                        </span>
                      </td>

                      {/* Subscription Plan */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              u.isSubscribed
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-zinc-100 text-zinc-700"
                            )}
                          >
                            {u.isSubscribed && (
                              <Gem className="h-3 w-3 text-emerald-600" />
                            )}
                            {u.planName} (${u.planPrice}/mo)
                          </span>
                          {u.isSubscribed && u.stripeCurrentPeriodEnd && (
                            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-zinc-400" />
                              Renews{" "}
                              {format(
                                new Date(u.stripeCurrentPeriodEnd),
                                "MMM d, yyyy"
                              )}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Usage */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 text-xs text-zinc-600">
                          <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
                            <FileText className="h-3.5 w-3.5 text-blue-600" />
                            {u.filesCount} / {u.planQuota} files
                          </span>
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <MessageSquare className="h-3 w-3 text-zinc-400" />
                            {u.messagesCount} messages
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            u.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          )}
                        >
                          {u.status === "ACTIVE" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Ban className="h-3 w-3" />
                          )}
                          {u.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSubModal(u)}
                            className="h-8 px-2.5 text-xs gap-1 border-zinc-200 text-zinc-700 hover:text-blue-600 hover:border-blue-200"
                            title="Manage Subscription & Plan"
                          >
                            <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                            Plan
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(u)}
                            className="h-8 px-2.5 text-xs gap-1 border-zinc-200 text-zinc-700"
                            title="Edit User & Role"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeletingUser(u)}
                            className="h-8 px-2 text-xs border-zinc-200 text-red-600 hover:bg-red-50 hover:border-red-200"
                            title="Delete User"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREATE NEW USER
         ===================================================================== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Create User Account
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUserMutation.mutate({
                name: newName,
                email: newEmail,
                role: newRole,
                status: newStatus,
                planSlug: newPlanSlug,
                durationDays: newDurationDays,
              });
            }}
            className="space-y-4 mt-2"
          >
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Full Name
              </label>
              <Input
                required
                placeholder="e.g. Jane Doe"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Email Address (synced with Kinde on login)
              </label>
              <Input
                required
                type="email"
                placeholder="jane@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  RBAC Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as "USER" | "ADMIN")
                  }
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="USER">USER (Standard)</option>
                  <option value="ADMIN">ADMIN (Full Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Initial Plan
                </label>
                <select
                  value={newPlanSlug}
                  onChange={(e) => setNewPlanSlug(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {(plans || []).map((p: any) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} (${p.price.amount}/mo)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {newPlanSlug !== "free" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Subscription Duration (Days)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={newDurationDays}
                  onChange={(e) =>
                    setNewDurationDays(Number(e.target.value) || 30)
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createUserMutation.isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL 2: EDIT USER & KINDE RBAC ROLE
         ===================================================================== */}
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <Edit3 className="h-5 w-5 text-blue-600" />
              Edit User & Role
            </DialogTitle>
          </DialogHeader>

          {editingUser && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateUserMutation.mutate({
                  id: editingUser.id,
                  name: editName,
                  email: editEmail,
                  role: editRole,
                  status: editStatus,
                });
              }}
              className="space-y-4 mt-2"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Display Name
                </label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address
                </label>
                <Input
                  required
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Role (RBAC)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) =>
                      setEditRole(e.target.value as "USER" | "ADMIN")
                    }
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as "ACTIVE" | "SUSPENDED")
                    }
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateUserMutation.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL 3: MANAGE SUBSCRIPTION & BILLING
         ===================================================================== */}
      <Dialog
        open={Boolean(subModalUser)}
        onOpenChange={(open) => !open && setSubModalUser(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Manage User Subscription
            </DialogTitle>
          </DialogHeader>

          {subModalUser && (
            <div className="space-y-5 mt-2">
              {/* Current Summary */}
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Account:</span>
                  <span className="font-semibold text-zinc-900">
                    {subModalUser.email}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Current Plan:</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full text-xs border border-blue-200">
                    {subModalUser.isSubscribed && <Gem className="h-3 w-3" />}
                    {subModalUser.planName} ({subModalUser.planQuota} files max)
                  </span>
                </div>
                {subModalUser.stripeCurrentPeriodEnd && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Current Period Ends:</span>
                    <span className="font-medium text-zinc-800">
                      {format(
                        new Date(subModalUser.stripeCurrentPeriodEnd),
                        "PPP"
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Grant / Upgrade Form */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Assign or Upgrade Subscription Tier
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Target Plan
                    </label>
                    <select
                      value={selectedPlanSlug}
                      onChange={(e) => setSelectedPlanSlug(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {(plans || [])
                        .filter((p: any) => p.slug !== "free")
                        .map((p: any) => (
                          <option key={p.slug} value={p.slug}>
                            {p.name} (${p.price.amount}/mo - {p.quota} files)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Billing Period (Days)
                    </label>
                    <select
                      value={subDurationDays}
                      onChange={(e) =>
                        setSubDurationDays(Number(e.target.value))
                      }
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value={30}>30 Days (1 Month)</option>
                      <option value={90}>90 Days (Quarter)</option>
                      <option value={180}>180 Days (6 Months)</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={manageSubMutation.isLoading}
                    onClick={() =>
                      manageSubMutation.mutate({
                        userId: subModalUser.id,
                        action: "GRANT_PLAN",
                        planSlug: selectedPlanSlug,
                        durationDays: subDurationDays,
                      })
                    }
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  >
                    {manageSubMutation.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Activate Plan ({subDurationDays}d)
                  </Button>

                  {subModalUser.isSubscribed && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={manageSubMutation.isLoading}
                      onClick={() =>
                        manageSubMutation.mutate({
                          userId: subModalUser.id,
                          action: "EXTEND",
                          planSlug: selectedPlanSlug,
                          durationDays: subDurationDays,
                        })
                      }
                      className="border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      +{subDurationDays}d Extension
                    </Button>
                  )}

                  {subModalUser.isSubscribed && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={manageSubMutation.isLoading}
                      onClick={() =>
                        manageSubMutation.mutate({
                          userId: subModalUser.id,
                          action: "REVOKE_TO_FREE",
                        })
                      }
                      className="border-red-200 text-red-600 hover:bg-red-50 ml-auto"
                    >
                      Downgrade to Free
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL 4: DELETE USER CONFIRMATION
         ===================================================================== */}
      <Dialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete User Account
            </DialogTitle>
          </DialogHeader>

          {deletingUser && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-zinc-600">
                Are you sure you want to permanently delete{" "}
                <strong className="text-zinc-900">{deletingUser.email}</strong>?
              </p>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-1">
                <p className="font-semibold">This action will also remove:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>{deletingUser.filesCount} uploaded document(s)</li>
                  <li>{deletingUser.messagesCount} AI chat message(s)</li>
                  <li>Associated Pinecone vector namespaces</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletingUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteUserMutation.isLoading}
                  onClick={() =>
                    deleteUserMutation.mutate({ id: deletingUser.id })
                  }
                >
                  {deleteUserMutation.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete Permanently
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

