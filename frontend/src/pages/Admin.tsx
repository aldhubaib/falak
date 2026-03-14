import { useState } from "react";
import { Shield, Mail, Search, Pencil, Trash2, ChevronDown, Key, Eye } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

type Role = "admin" | "editor" | "viewer";

interface AllowedUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  note: string;
  addedBy: string;
  addedDate: string;
  color: string;
  pages: PageAccess[];
  isOwner?: boolean;
}

interface PageAccess {
  name: string;
  active: boolean;
}

const allPages = ["Channels", "Pipeline", "Monitor", "Analytics", "Stories", "Brain", "Settings", "Admin", "Fun", "Horror", "Travel"];

const initialUsers: AllowedUser[] = [
  {
    id: "1",
    name: "Abdulaziz Aldhubaib",
    initials: "AA",
    email: "a@falak.io",
    role: "admin",
    note: "Project owner",
    addedBy: "Added by system",
    addedDate: "1/1/2026",
    color: "bg-blue",
    isOwner: true,
    pages: allPages.map((p) => ({ name: p, active: true })),
  },
  {
    id: "2",
    name: "Sara Al-Mutairi",
    initials: "SM",
    email: "sara@falak.io",
    role: "editor",
    note: "Content team",
    addedBy: "Added by abdulaziz aldhubaib",
    addedDate: "3/5/2026",
    color: "bg-success",
    pages: allPages.map((p) => ({
      name: p,
      active: ["Channels", "Pipeline", "Analytics", "Fun", "Travel"].includes(p),
    })),
  },
  {
    id: "3",
    name: "Faisal Al-Rashidi",
    initials: "FR",
    email: "faisal@falak.io",
    role: "viewer",
    note: "Client",
    addedBy: "Added by abdulaziz aldhubaib",
    addedDate: "3/8/2026",
    color: "bg-purple",
    pages: allPages.map((p) => ({
      name: p,
      active: ["Channels", "Analytics", "Horror"].includes(p),
    })),
  },
];

const roleColors: Record<Role, string> = {
  admin: "text-destructive border-destructive/30 bg-destructive/10",
  editor: "text-blue border-blue/30 bg-blue/10",
  viewer: "text-dim border-border bg-surface",
};

const roleIcons: Record<Role, typeof Key> = {
  admin: Key,
  editor: Pencil,
  viewer: Eye,
};

export default function Admin() {
  const [users] = useState<AllowedUser[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const filteredUsers = users.filter(
    (u) =>
      !searchQuery ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Access Control</h1>
          <span className="text-[11px] text-dim font-mono">
            Manage which users can log in and what they can do inside Falak.
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5">

          {/* Owner notice */}
          <div className="rounded-xl bg-blue/5 border border-blue/15 px-5 py-4 flex items-start gap-3.5">
            <Shield className="w-5 h-5 text-blue shrink-0 mt-0.5" />
            <p className="text-[13px] text-sensor leading-relaxed">
              The <strong className="text-foreground">project owner</strong> always has full access and cannot be removed. Users not on this list will see an{" "}
              <strong className="text-foreground">"Access Denied"</strong> page after login. You can control which pages and projects each user can access.
            </p>
          </div>

          {/* Add Allowed User */}
          <div className="rounded-xl bg-background p-5">
            <div className="mb-1">
              <span className="text-[14px] font-semibold">Add Allowed User</span>
            </div>
            <p className="text-[12px] text-dim mb-4">
              Enter an email address and add the user.
            </p>
            <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
              <div className="relative flex-1 max-sm:w-full">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40"
                />
              </div>
              <button className="px-5 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
                + Add
              </button>
            </div>
          </div>

          {/* Allowed Users */}
          <div className="rounded-xl bg-background p-5">
            <div className="flex items-center justify-between mb-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold">Allowed Users</span>
                <span className="text-[11px] text-dim font-mono bg-surface px-2 py-0.5 rounded-full">{users.length}</span>
              </div>
              <div className="relative max-sm:w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-border/50 rounded-full text-sensor placeholder:text-dim focus:outline-none focus:border-border w-[180px] max-sm:w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const RoleIcon = roleIcons[user.role];
                return (
                  <div
                    key={user.id}
                    className="rounded-xl border border-border p-4 hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-start gap-3.5 max-sm:flex-col max-sm:gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full ${user.color} flex items-center justify-center text-[13px] font-semibold text-foreground shrink-0`}>
                        {user.initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold">{user.name}</span>
                          {user.isOwner && (
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-orange/10 text-orange">
                              owner
                            </span>
                          )}
                          {user.isOwner && <span className="text-[11px] text-dim font-mono">(you)</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-dim font-mono">{user.email}</span>
                          <span className="text-[11px] text-dim">·</span>
                          <span className="text-[11px] text-dim font-mono">{user.note}</span>
                          <span className="text-[11px] text-dim">·</span>
                          <span className="text-[11px] text-dim font-mono">{user.addedBy}</span>
                          <span className="text-[11px] text-dim">·</span>
                          <span className="text-[11px] text-dim font-mono">{user.addedDate}</span>
                        </div>

                        {/* Page access pills */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          {user.pages.map((page) => (
                            <span
                              key={page.name}
                              className={`text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors ${
                                page.active
                                  ? "text-foreground border border-border"
                                  : "text-dim/30 border border-transparent"
                              }`}
                            >
                              {page.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 max-sm:w-full max-sm:justify-end">
                        <span className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${roleColors[user.role]}`}>
                          {user.role}
                        </span>
                        {!user.isOwner && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="w-8 h-8 rounded-full flex items-center justify-center text-dim hover:text-sensor hover:bg-elevated/60 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit user</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="w-8 h-8 rounded-full flex items-center justify-center text-dim hover:text-destructive hover:bg-destructive/10 transition-colors">
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
            </div>
          </div>

          {/* Role Permissions */}
          <div className="rounded-xl bg-background p-5">
            <span className="text-[14px] font-semibold mb-4 block">Role Permissions</span>
            <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3">
              {[
                {
                  role: "Admin" as const,
                  icon: "🔑",
                  color: "border-destructive/20 bg-destructive/5",
                  textColor: "text-destructive",
                  desc: "Full access to all pages · Can manage users · Can add/remove channels · Can modify system settings",
                },
                {
                  role: "Editor" as const,
                  icon: "✏️",
                  color: "border-blue/20 bg-blue/5",
                  textColor: "text-blue",
                  desc: "Access assigned pages · Can view & interact with data · Cannot manage users or system settings",
                },
                {
                  role: "Viewer" as const,
                  icon: "👁",
                  color: "border-border bg-surface/30",
                  textColor: "text-dim",
                  desc: "Read-only access to assigned pages · Cannot make changes · Perfect for stakeholders or clients",
                },
              ].map((r) => (
                <div key={r.role} className={`rounded-xl border p-4 ${r.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>{r.icon}</span>
                    <span className={`text-[13px] font-semibold ${r.textColor}`}>{r.role}</span>
                  </div>
                  <p className="text-[11px] text-dim leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
