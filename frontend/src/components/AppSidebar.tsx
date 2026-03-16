import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LayoutGrid, GitBranch, Circle, TrendingUp, Sparkles, CircleDot, Brain, Settings, ChevronDown, Check, Pencil, Plus, Activity, Pin, PinOff, ImagePlus, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutGrid, label: "Channels", path: "" },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline" },
  { icon: Activity, label: "Monitor", path: "/monitor" },
  { icon: TrendingUp, label: "Analytics", path: "/analytics" },
  { icon: Sparkles, label: "AI Intelligence", path: "/stories" },
  { icon: Sparkles, label: "Stories v2", path: "/stories-v2" },
  { icon: CircleDot, label: "Brain", path: "/brain" },
  { icon: Brain, label: "Brain v2", path: "/brain-v2" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const adminItems = [
  { icon: Circle, label: "Admin", path: "/admin" },
];

/** Shape from GET /api/projects */
interface ApiProject {
  id: string;
  name: string;
  nameAr?: string | null;
  color?: string;
}

interface AppSidebarProps {
  projectId: string;
  onClose?: () => void;
  isMobile?: boolean;
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function AppSidebar({ projectId, onClose, isMobile, collapsed = false, pinned = false, onTogglePin }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const base = `/p/${projectId}`;
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHookStart, setEditHookStart] = useState("");
  const [editHookEnd, setEditHookEnd] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newHookStart, setNewHookStart] = useState("");
  const [newHookEnd, setNewHookEnd] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectHookStart, setProjectHookStart] = useState("");
  const [projectHookEnd, setProjectHookEnd] = useState("");
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const newFileRef = useRef<HTMLInputElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Fetch projects and sync current project display name
  useEffect(() => {
    fetch("/api/projects", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ApiProject[]) => {
        const arr = Array.isArray(list) ? list : [];
        setProjects(arr);
        const current = arr.find((p) => p.id === projectId);
        if (current) {
          setProjectName(current.name);
          setProjectHookStart("");
          setProjectHookEnd("");
          setProjectImage(null);
        }
      })
      .catch(() => setProjects([]));
  }, [projectId]);

  const isActive = (path: string) => {
    if (path === "" || path === "/") return location.pathname === base || location.pathname.startsWith(`${base}/channel`);
    return location.pathname === `${base}${path}` || location.pathname.startsWith(`${base}${path}/`);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sidebarWidth = collapsed ? "w-[56px] min-w-[56px]" : "w-[220px] min-w-[220px]";

  return (
    <div className={`flex flex-col h-full bg-[#080808] transition-all duration-200 ${isMobile ? "" : `${sidebarWidth} sticky top-0 h-screen`}`}>
      {/* Brand / Project Switcher */}
      <div className="relative px-3 h-12 flex items-center justify-between shrink-0" ref={switcherRef}>
        {!collapsed ? (
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0"
          >
            <span className="font-semibold text-[13px] text-foreground truncate">{projectName || "Project"}</span>
            <ChevronDown className={`w-3 h-3 text-dim shrink-0 transition-transform ${switcherOpen ? "rotate-180" : ""}`} />
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary mx-auto"
              >
                {(projectName && projectName.charAt(0).toUpperCase()) || "P"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{projectName || "Project"}</TooltipContent>
          </Tooltip>
        )}

        {/* Pin toggle (desktop, expanded only) */}
        {!isMobile && !collapsed && onTogglePin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onTogglePin}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  pinned ? "text-blue hover:bg-elevated/60" : "text-dim hover:bg-elevated/60 hover:text-sensor"
                }`}
              >
                {pinned ? <Pin className="w-3.5 h-3.5" strokeWidth={1.5} /> : <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{pinned ? "Unpin sidebar" : "Pin sidebar"}</TooltipContent>
          </Tooltip>
        )}

        {/* Dropdown */}
        {switcherOpen && !collapsed && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2 text-[10px] font-medium text-dim uppercase tracking-wider">Projects</div>
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-dim">No projects</div>
            ) : (
              projects.map((project) => {
                const isCurrent = project.id === projectId;
                return (
                  <button
                    key={project.id}
                    onClick={() => {
                      setSwitcherOpen(false);
                      navigate(`/p/${project.id}`);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] hover:bg-elevated/60 transition-colors"
                  >
                    <span className={`flex-1 text-left truncate ${isCurrent ? "text-foreground font-medium" : "text-dim"}`}>
                      {project.name}
                    </span>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
            <div className="border-t border-border mt-1.5 pt-1.5">
              <button
                onClick={() => { setSwitcherOpen(false); setEditName(projectName); setEditHookStart(projectHookStart); setEditHookEnd(projectHookEnd); setEditImage(projectImage); setEditOpen(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] text-dim hover:text-sensor hover:bg-elevated/60 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit project</span>
              </button>
              <button
                onClick={() => { setSwitcherOpen(false); setNewName(""); setNewHookStart(""); setNewHookEnd(""); setNewOpen(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] text-dim hover:text-sensor hover:bg-elevated/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New project</span>
              </button>
            </div>
            <div className="pb-1.5" />
          </div>
        )}
      </div>

      {isMobile && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-dim text-sm hover:text-sensor hover:bg-elevated transition-colors"
        >
          ✕
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 py-1.5 px-2 bg-[#080808]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const target = `${base}${item.path}`;
          const btn = (
            <button
              key={item.path}
              onClick={() => {
                navigate(target);
                onClose?.();
              }}
              className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2.5 ${collapsed ? "px-0 py-2" : "px-2.5 py-[7px]"} rounded-full text-[13px] font-medium transition-colors mb-0.5 ${
                active
                  ? "bg-elevated text-foreground"
                  : "text-dim hover:bg-elevated/60 hover:text-sensor"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && item.label}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return btn;
        })}

        {adminItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const target = `${base}${item.path}`;
          const btn = (
            <button
              key={item.path}
              onClick={() => {
                navigate(target);
                onClose?.();
              }}
              className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2.5 ${collapsed ? "px-0 py-2" : "px-2.5 py-[7px]"} rounded-full text-[13px] font-medium transition-colors mb-0.5 ${
                active
                  ? "bg-elevated text-foreground"
                  : "text-dim hover:bg-elevated/60 hover:text-sensor"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && item.label}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return btn;
        })}
      </nav>

      {/* User */}
      <button
        onClick={() => setLogoutOpen(true)}
        className={`px-3 py-3 flex items-center gap-2.5 bg-[#080808] hover:bg-elevated/60 transition-colors w-full text-left ${collapsed ? "justify-center" : ""}`}
      >
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">Abdulaziz</div>
            <div className="text-[11px] text-dim truncate">a@falak.io</div>
          </div>
        )}
      </button>

      {/* Logout dialog */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="sm:max-w-[360px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Sign out</DialogTitle>
            <DialogDescription className="text-[12px] text-dim">
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setLogoutOpen(false)}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setLogoutOpen(false);
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch (_) {}
                // Full-page redirect so the browser applies the cleared cookie before any new request
                window.location.href = "/login";
              }}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Edit project</DialogTitle>
            <DialogDescription className="text-[12px] text-dim">
              Update project name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            {/* Image upload */}
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Project image</label>
              <input type="file" accept="image/*" ref={editFileRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setEditImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {editImage ? (
                <div className="relative w-16 h-16">
                  <img src={editImage} alt="Project" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  <button onClick={() => setEditImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => editFileRef.current?.click()} className="w-16 h-16 rounded-xl border border-dashed border-border bg-surface flex items-center justify-center text-dim hover:text-sensor hover:border-foreground/20 transition-colors">
                  <ImagePlus className="w-5 h-5" />
                </button>
              )}
            </div>
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Project name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40" placeholder="Project name" autoFocus />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setEditOpen(false)} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
            <button
              onClick={() => {
                setProjectName(editName.trim() || projectName);
                setProjectHookStart(editHookStart);
                setProjectHookEnd(editHookEnd);
                setProjectImage(editImage);
                setEditOpen(false);
              }}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New project dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">New project</DialogTitle>
            <DialogDescription className="text-[12px] text-dim">
              Create a new project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            {/* Image upload */}
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Project image</label>
              <input type="file" accept="image/*" ref={newFileRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setNewImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {newImage ? (
                <div className="relative w-16 h-16">
                  <img src={newImage} alt="Project" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  <button onClick={() => setNewImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => newFileRef.current?.click()} className="w-16 h-16 rounded-xl border border-dashed border-border bg-surface flex items-center justify-center text-dim hover:text-sensor hover:border-foreground/20 transition-colors">
                  <ImagePlus className="w-5 h-5" />
                </button>
              )}
            </div>
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Project name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40" placeholder="Project name" autoFocus />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setNewOpen(false)} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
            <button
              onClick={() => {
                if (newName.trim()) {
                  setProjectName(newName.trim());
                  setProjectHookStart(newHookStart);
                  setProjectHookEnd(newHookEnd);
                  setProjectImage(newImage);
                }
                setNewOpen(false);
              }}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity"
            >
              Create
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
