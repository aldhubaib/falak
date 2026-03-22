import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Shield, Mail, Search, Pencil, Trash2, ChevronDown, ChevronUp, Key, Eye,
  AlertTriangle, Loader2, Plus, X, Check, UserPlus,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type Role = "admin" | "editor" | "viewer";

interface PageDef {
  slug: string;
  label: string;
}

interface ProfileDef {
  id: string;
  nameAr: string;
  nameEn: string | null;
  handle: string;
  avatarUrl: string | null;
  color: string | null;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  note: string | null;
  isActive: boolean;
  canCreateProfile: boolean;
  pageAccess: string[] | null;
  channelAccess: string[] | null;
  createdAt: string;
}

const roleColors: Record<Role, string> = {
  admin: "text-destructive border-destructive/30 bg-destructive/10",
  editor: "text-primary border-primary/30 bg-primary/10",
  viewer: "text-muted-foreground border-border bg-card",
};

const roleIcons: Record<Role, typeof Key> = {
  admin: Key,
  editor: Pencil,
  viewer: Eye,
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const avatarColors = [
  "bg-primary", "bg-emerald-600", "bg-purple-600", "bg-amber-600",
  "bg-rose-600", "bg-sky-600", "bg-teal-600", "bg-indigo-600",
];
function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function Admin() {
  const currentUser = useCurrentUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pages, setPages] = useState<PageDef[]>([]);
  const [profiles, setProfiles] = useState<ProfileDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role>("viewer");
  const [editNote, setEditNote] = useState("");
  const [editCanCreate, setEditCanCreate] = useState(false);
  const [editPages, setEditPages] = useState<string[]>([]);
  const [editChannels, setEditChannels] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [usersRes, pagesRes, profilesRes] = await Promise.all([
        fetch("/api/admin/users", { credentials: "include" }),
        fetch("/api/admin/pages", { credentials: "include" }),
        fetch("/api/admin/profiles", { credentials: "include" }),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (pagesRes.ok) setPages(await pagesRes.json());
      if (profilesRes.ok) setProfiles(await profilesRes.json());
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !searchQuery ||
          (u.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [users, searchQuery]
  );

  const handleAdd = async () => {
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, role: "viewer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsers((prev) => [...prev, data]);
      setAddEmail("");
      toast.success(`Added ${email}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (user: AdminUser) => {
    setEditUser(user);
    setEditRole((user.role === "owner" ? "admin" : user.role) as Role);
    setEditNote(user.note ?? "");
    setEditCanCreate(user.canCreateProfile);
    setEditPages(user.pageAccess ?? pages.map((p) => p.slug));
    setEditChannels(user.channelAccess ?? profiles.map((p) => p.id));
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const allPageSlugs = pages.map((p) => p.slug);
      const allProfileIds = profiles.map((p) => p.id);
      const isAllPages = editPages.length === allPageSlugs.length && allPageSlugs.every((s) => editPages.includes(s));
      const isAllProfiles = editChannels.length === allProfileIds.length && allProfileIds.every((id) => editChannels.includes(id));

      const body: Record<string, unknown> = {
        role: editRole,
        note: editNote || null,
        canCreateProfile: editCanCreate,
        isActive: editUser.isActive,
        pageAccess: isAllPages ? null : editPages,
        channelAccess: isAllProfiles ? null : editChannels,
      };
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
      setEditOpen(false);
      toast.success("User updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      setDeleteUser(null);
      toast.success("User removed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const togglePage = (slug: string) => {
    setEditPages((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const toggleChannel = (id: string) => {
    setEditChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const isOwner = (u: AdminUser) => u.role === "owner";

  const resolvedPages = (u: AdminUser): string[] => {
    if (u.role === "owner" || u.role === "admin") return pages.map((p) => p.slug);
    return u.pageAccess ?? pages.map((p) => p.slug);
  };

  const resolvedChannels = (u: AdminUser): string[] => {
    if (u.role === "owner" || u.role === "admin") return profiles.map((p) => p.id);
    return u.channelAccess ?? profiles.map((p) => p.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Access Control</h1>
          <span className="text-[11px] text-muted-foreground font-mono">
            Manage which users can log in and what they can do inside Falak.
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5">
          {/* Owner notice */}
          <div className="rounded-lg bg-primary/5 border border-primary/15 px-5 py-4 flex items-start gap-3.5">
            <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              The <strong className="text-foreground">channel owner</strong> always has full access and cannot be removed.
              Users not on this list will see an{" "}
              <strong className="text-foreground">"Access Denied"</strong> page after login.
              You can control which pages, profiles, and permissions each user has.
            </p>
          </div>

          {/* Add Allowed User */}
          <div className="rounded-lg bg-card p-5">
            <div className="mb-1">
              <span className="text-[14px] font-semibold">Add Allowed User</span>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              Enter an email address. The user will be able to log in via Google with this email.
            </p>
            <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
              <div className="relative flex-1 max-sm:w-full">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addEmail.trim()}
                className="px-5 py-2.5 text-[13px] font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>

          {/* Allowed Users */}
          <div className="rounded-lg bg-card p-5">
            <div className="flex items-center justify-between mb-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold">Allowed Users</span>
                <span className="text-[11px] text-muted-foreground font-mono bg-card px-2 py-0.5 rounded-full">
                  {users.length}
                </span>
              </div>
              <div className="relative max-sm:w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-border/50 rounded-full text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border w-[180px] max-sm:w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const userPages = resolvedPages(user);
                const userChannels = resolvedChannels(user);
                const expanded = expandedUser === user.id;

                return (
                  <div
                    key={user.id}
                    className={`rounded-lg border border-border p-4 transition-colors ${!user.isActive ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3.5 max-sm:flex-col max-sm:gap-3">
                      {/* Avatar */}
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name ?? user.email} className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full ${pickColor(user.id)} flex items-center justify-center text-[13px] font-semibold text-white shrink-0`}>
                          {getInitials(user.name, user.email)}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold">
                            {user.name || user.email}
                          </span>
                          {isOwner(user) && (
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-orange/10 text-orange">
                              owner
                            </span>
                          )}
                          {!user.isActive && (
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                              disabled
                            </span>
                          )}
                          {user.canCreateProfile && !isOwner(user) && user.role !== "admin" && (
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                              can create profiles
                            </span>
                          )}
                          {currentUser?.id === user.id && (
                            <span className="text-[11px] text-muted-foreground font-mono">(you)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground font-mono">{user.email}</span>
                          {user.note && (
                            <>
                              <span className="text-[11px] text-muted-foreground">·</span>
                              <span className="text-[11px] text-muted-foreground font-mono">{user.note}</span>
                            </>
                          )}
                        </div>

                        {/* Page access pills */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          {pages.map((page) => (
                            <span
                              key={page.slug}
                              className={`text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors ${
                                userPages.includes(page.slug)
                                  ? "text-foreground border border-border"
                                  : "text-muted-foreground/30 border border-transparent"
                              }`}
                            >
                              {page.label}
                            </span>
                          ))}
                        </div>

                        {/* Profile access — expand/collapse */}
                        {profiles.length > 0 && (
                          <button
                            onClick={() => setExpandedUser(expanded ? null : user.id)}
                            className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {userChannels.length === profiles.length
                              ? "All profiles"
                              : `${userChannels.length}/${profiles.length} profiles`}
                          </button>
                        )}
                        {expanded && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {profiles.map((p) => {
                              const hasAccess = userChannels.includes(p.id);
                              return (
                                <div
                                  key={p.id}
                                  className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full transition-colors ${
                                    hasAccess
                                      ? "text-foreground border border-border"
                                      : "text-muted-foreground/30 border border-transparent"
                                  }`}
                                >
                                  {p.avatarUrl ? (
                                    <img src={p.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                                  ) : (
                                    <div
                                      className="w-3.5 h-3.5 rounded-full shrink-0"
                                      style={{ backgroundColor: p.color || "#3b82f6" }}
                                    />
                                  )}
                                  {p.nameAr || p.nameEn || p.handle}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 max-sm:w-full max-sm:justify-end">
                        <span
                          className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${
                            isOwner(user)
                              ? "text-orange border-orange/30 bg-orange/10"
                              : roleColors[(user.role as Role) || "viewer"]
                          }`}
                        >
                          {user.role}
                        </span>
                        {!isOwner(user) && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => openEdit(user)}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-card/60 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit user</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setDeleteUser(user)}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Remove user</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-[13px] text-muted-foreground">
                  {searchQuery ? "No users match your search." : "No users yet. Add one above."}
                </div>
              )}
            </div>
          </div>

          {/* Role Permissions */}
          <div className="rounded-lg bg-card p-5">
            <span className="text-[14px] font-semibold mb-4 block">Role Permissions</span>
            <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3">
              {[
                {
                  role: "Admin" as const,
                  icon: "🔑",
                  color: "border-destructive/20 bg-destructive/5",
                  textColor: "text-destructive",
                  desc: "Full access to all pages and profiles · Can manage users · Can create profiles · Can modify settings",
                },
                {
                  role: "Editor" as const,
                  icon: "✏️",
                  color: "border-primary/20 bg-primary/5",
                  textColor: "text-primary",
                  desc: "Access assigned pages and profiles · Can view & interact with data · Cannot manage users or settings",
                },
                {
                  role: "Viewer" as const,
                  icon: "👁",
                  color: "border-border bg-card/30",
                  textColor: "text-muted-foreground",
                  desc: "Read-only access to assigned pages and profiles · Cannot make changes · Perfect for stakeholders",
                },
              ].map((r) => (
                <div key={r.role} className={`rounded-lg border p-4 ${r.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>{r.icon}</span>
                    <span className={`text-[13px] font-semibold ${r.textColor}`}>{r.role}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone */}
          <DangerZone />
        </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px] bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Edit User</DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground">
              {editUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            {/* Role */}
            <div>
              <label className="text-[12px] font-semibold text-foreground block mb-2">Role</label>
              <div className="flex gap-2">
                {(["admin", "editor", "viewer"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setEditRole(r)}
                    className={`flex-1 px-3 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
                      editRole === r
                        ? roleColors[r] + " font-semibold"
                        : "border-border text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[12px] font-semibold text-foreground block mb-2">Note</label>
              <input
                type="text"
                placeholder="e.g. Content team, Client, etc."
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
            </div>

            {/* Can Create Profile */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[12px] font-semibold text-foreground block">Can Create Profiles</label>
                <span className="text-[11px] text-muted-foreground">
                  {editRole === "admin"
                    ? "Admins can always create profiles"
                    : "Allow this user to add new YouTube profiles"}
                </span>
              </div>
              <button
                onClick={() => setEditCanCreate(!editCanCreate)}
                disabled={editRole === "admin"}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  editCanCreate || editRole === "admin" ? "bg-primary" : "bg-border"
                } ${editRole === "admin" ? "opacity-60" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    editCanCreate || editRole === "admin" ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Page Access */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-semibold text-foreground">Page Access</label>
                {editRole !== "admin" && (
                  <button
                    onClick={() => {
                      const allSlugs = pages.map((p) => p.slug);
                      setEditPages(editPages.length === allSlugs.length ? [] : allSlugs);
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {editPages.length === pages.length ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              {editRole === "admin" ? (
                <p className="text-[11px] text-muted-foreground">Admins have access to all pages.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pages.map((page) => {
                    const active = editPages.includes(page.slug);
                    return (
                      <button
                        key={page.slug}
                        onClick={() => togglePage(page.slug)}
                        className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-full border transition-colors ${
                          active
                            ? "text-foreground border-primary/40 bg-primary/10"
                            : "text-muted-foreground border-border hover:border-border/80"
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {page.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Profile Access */}
            {profiles.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold text-foreground">Profile Access</label>
                  {editRole !== "admin" && (
                    <button
                      onClick={() => {
                        const allIds = profiles.map((p) => p.id);
                        setEditChannels(editChannels.length === allIds.length ? [] : allIds);
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {editChannels.length === profiles.length ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>
                {editRole === "admin" ? (
                  <p className="text-[11px] text-muted-foreground">Admins have access to all profiles.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profiles.map((p) => {
                      const active = editChannels.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleChannel(p.id)}
                          className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-full border transition-colors ${
                            active
                              ? "text-foreground border-primary/40 bg-primary/10"
                              : "text-muted-foreground border-border hover:border-border/80"
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color || "#3b82f6" }} />
                          )}
                          {p.nameAr || p.nameEn || p.handle}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div>
                <label className="text-[12px] font-semibold text-foreground block">Account Active</label>
                <span className="text-[11px] text-muted-foreground">Disabled users cannot log in</span>
              </div>
              <button
                onClick={() => {
                  if (!editUser) return;
                  setEditUser({ ...editUser, isActive: !editUser.isActive });
                }}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  editUser?.isActive ? "bg-primary" : "bg-border"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    editUser?.isActive ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setEditOpen(false)}
              className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={editLoading}
              className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent className="sm:max-w-[380px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Remove User</DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground">
              Remove <strong>{deleteUser?.name || deleteUser?.email}</strong> from Falak?
              They will no longer be able to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setDeleteUser(null)}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="flex-1 px-4 py-2 text-[13px] font-semibold rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Remove
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DangerZone() {
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    if (confirmText !== "DELETE ALL") return;
    setResetting(true);
    try {
      const res = await fetch("/api/article-pipeline/reset", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      const summary = Object.entries(data.deleted as Record<string, number>)
        .filter(([, count]) => count > 0)
        .map(([table, count]) => `${count} ${table}`)
        .join(", ");
      toast.success(summary ? `Deleted: ${summary}` : "Pipeline is already empty");
      setShowConfirm(false);
      setConfirmText("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 mb-10">
      <div className="flex items-center gap-2.5 mb-1">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <span className="text-[14px] font-semibold text-destructive">Danger Zone</span>
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">
        Irreversible actions that affect all pipeline data.
      </p>

      <div className="rounded-lg border border-border bg-background p-4 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="text-[13px] font-semibold">Reset Article Pipeline</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Deletes all articles, stories, alerts, score profiles, and Apify run history. Source configs are kept but polling state is reset.
          </div>
        </div>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="shrink-0 px-4 py-2 text-[12px] font-semibold rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
          >
            Reset Pipeline
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0 max-sm:w-full">
            <input
              type="text"
              placeholder='Type "DELETE ALL"'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="px-3 py-2 text-[12px] bg-background border border-destructive/30 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/60 w-[160px]"
              autoFocus
            />
            <button
              onClick={handleReset}
              disabled={confirmText !== "DELETE ALL" || resetting}
              className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setConfirmText(""); }}
              className="px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
