import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LayoutDashboard, GitBranch, TrendingUp, Sparkles, Settings, Circle, Pin, PinOff, FileText, Home, Images, Palette, Flame } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const allNavItems = [
  { icon: LayoutDashboard, label: "Home", path: "", slug: "home" },
  { icon: GitBranch, label: "Pipeline", path: "/pipeline", slug: "pipeline" },
  { icon: TrendingUp, label: "Analytics", path: "/analytics", slug: "analytics" },
  { icon: Sparkles, label: "AI Intelligence", path: "/stories", slug: "stories" },
  { icon: FileText, label: "Article Pipeline", path: "/article-pipeline", slug: "article-pipeline" },
  { icon: Images, label: "Gallery", path: "/gallery", slug: "gallery" },
  { icon: Flame, label: "Trending", path: "/trending", slug: "trending" },
  { icon: Settings, label: "Settings", path: "/settings", slug: "settings" },
  { icon: Palette, label: "Design System", path: "/design-system", slug: "design-system" },
];

const adminItem = { icon: Circle, label: "Admin", path: "/admin", slug: "admin" };

interface ChannelInfo {
  id: string;
  handle: string;
  nameAr: string | null;
  nameEn: string | null;
  avatarUrl: string | null;
}

interface AppSidebarProps {
  channelId: string;
  onClose?: () => void;
  isMobile?: boolean;
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function AppSidebar({ channelId, onClose, isMobile, collapsed = false, pinned = false, onTogglePin }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const base = `/c/${channelId}`;
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    fetch("/api/profiles", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ChannelInfo[]) => {
        const current = Array.isArray(list) ? list.find((p) => p.id === channelId) : null;
        if (current) setChannelInfo(current);
      })
      .catch(() => {});
  }, [channelId]);

  const isActive = (path: string) => {
    if (path === "" || path === "/") return location.pathname === base || location.pathname === base + "/";
    return location.pathname === `${base}${path}` || location.pathname.startsWith(`${base}${path}/`);
  };

  const sidebarWidth = collapsed ? "w-[56px] min-w-[56px]" : "w-[220px] min-w-[220px]";
  const displayName = channelInfo?.nameAr || channelInfo?.nameEn || channelInfo?.handle || "Channel";

  return (
    <div className={`flex flex-col bg-sidebar transition-all duration-200 ${isMobile ? "h-full" : `${sidebarWidth} h-screen sticky top-0 overflow-y-auto`}`}>
      {/* Channel header + home button */}
      <div className="relative px-3 h-12 flex items-center justify-between shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {channelInfo?.avatarUrl ? (
              <img src={channelInfo.avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-[13px] text-foreground truncate">{displayName}</span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mx-auto">
                {channelInfo?.avatarUrl ? (
                  <img src={channelInfo.avatarUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{displayName}</TooltipContent>
          </Tooltip>
        )}

        {/* Pin toggle + Home (desktop, expanded only) */}
        {!isMobile && !collapsed && (
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate("/")}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card/60 hover:text-muted-foreground transition-colors"
                >
                  <Home className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Back to profiles</TooltipContent>
            </Tooltip>
            {onTogglePin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onTogglePin}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      pinned ? "text-primary hover:bg-card/60" : "text-muted-foreground hover:bg-card/60 hover:text-muted-foreground"
                    }`}
                  >
                    {pinned ? <Pin className="w-3.5 h-3.5" strokeWidth={1.5} /> : <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{pinned ? "Unpin sidebar" : "Pin sidebar"}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {isMobile && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground text-sm hover:text-muted-foreground hover:bg-card transition-colors"
        >
          ✕
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 py-1.5 px-2 bg-sidebar overflow-y-auto">
        {(() => {
          const role = currentUser?.role;
          const pa = currentUser?.pageAccess;
          const hasFullAccess = role === "owner" || role === "admin" || !pa;

          const navItems = hasFullAccess
            ? allNavItems
            : allNavItems.filter((item) => pa!.includes(item.slug));

          const showAdmin = hasFullAccess || (pa && pa.includes("admin"));

          return (
            <>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                const target = `${base}${item.path}`;
                const link = (
                  <Link
                    key={item.path}
                    to={target}
                    onClick={() => onClose?.()}
                    className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2.5 ${collapsed ? "px-0 py-2" : "px-2.5 py-[7px]"} rounded-full text-[13px] font-medium transition-colors mb-0.5 no-underline ${
                      active
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:bg-card/60 hover:text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                    {!collapsed && item.label}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return link;
              })}

              {showAdmin && (() => {
                const Icon = adminItem.icon;
                const active = isActive(adminItem.path);
                const target = `${base}${adminItem.path}`;
                const link = (
                  <Link
                    key={adminItem.path}
                    to={target}
                    onClick={() => onClose?.()}
                    className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2.5 ${collapsed ? "px-0 py-2" : "px-2.5 py-[7px]"} rounded-full text-[13px] font-medium transition-colors mb-0.5 no-underline ${
                      active
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:bg-card/60 hover:text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                    {!collapsed && adminItem.label}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={adminItem.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{adminItem.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return link;
              })()}
            </>
          );
        })()}
      </nav>

      {/* User */}
      <button
        onClick={() => setLogoutOpen(true)}
        className={`px-3 py-3 flex items-center gap-2.5 bg-sidebar hover:bg-card/60 transition-colors w-full text-left ${collapsed ? "justify-center" : ""}`}
      >
        {currentUser?.avatarUrl ? (
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.name}
            className="w-7 h-7 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
            {(currentUser?.name ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">{currentUser?.name ?? "User"}</div>
            <div className="text-[11px] text-muted-foreground truncate">{currentUser?.email ?? (currentUser?.id ? "Signed in" : "—")}</div>
          </div>
        )}
      </button>

      {/* Logout dialog */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="sm:max-w-[360px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Sign out</DialogTitle>
            <DialogDescription className="text-[12px] text-muted-foreground">
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setLogoutOpen(false)}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setLogoutOpen(false);
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch (_) {}
                window.location.href = "/login";
              }}
              className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
