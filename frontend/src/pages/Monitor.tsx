import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Circle, Pause, Play, RotateCw, Search, ChevronDown, ArrowUpRight } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";
import { toast } from "sonner";

// ── Types matching GET /api/monitor ────────────────────────────────────────

interface ApiChannel {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  type: string;           // "ours" | "competition"
  status?: string | null;
  lastFetchedAt?: string | null;
  uploadCadence?: number | null;  // days between uploads (learned)
  lastVideoPublishedAt?: string | null;
  _count: { videos: number };
}

// ── Derived shape used in the table ────────────────────────────────────────

type ChannelStatus = "active" | "regular" | "slow" | "inactive";

interface MonitorRow {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  status: ChannelStatus;
  lastFetchedMs: number;
  lastCheck: string;
  lastVideo: string;
  daysSinceVideo: number;
  nextCheck: string;
  cadence: string;
  checkIntervalDays: number;
  cadenceType: "auto" | "owned";
  isStale: boolean;
  totalVideos: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function futureRelative(days: number): string {
  if (days < 1) return "soon";
  if (days < 2) return `in ${Math.round(days * 24)}h`;
  return `in ${Math.round(days)}d`;
}

function formatRemainingSeconds(seconds: number): string {
  if (seconds <= 0) return "soon";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function deriveStatus(daysSince: number): ChannelStatus {
  if (daysSince < 3)  return "active";
  if (daysSince < 14) return "regular";
  if (daysSince < 30) return "slow";
  return "inactive";
}

const DAY_MS = 86400000;

function deriveCheckInterval(status: ChannelStatus, cadenceType: "auto" | "owned"): number {
  if (cadenceType === "owned") return 1;
  if (status === "active") return 2;
  if (status === "regular") return 5;
  if (status === "slow") return 10;
  return 20;
}

function toRow(ch: ApiChannel): MonitorRow {
  const name = ch.nameAr || ch.nameEn || ch.handle || ch.id;
  const handle = ch.handle ? (ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`) : "—";
  const lastCheck = relativeTime(ch.lastFetchedAt);
  const daysSinceVideo = ch.lastVideoPublishedAt
    ? (Date.now() - new Date(ch.lastVideoPublishedAt).getTime()) / 86400000
    : 999;
  const status = deriveStatus(daysSinceVideo);
  const cadenceType = ch.type === "ours" ? "owned" : "auto";
  const cadenceDays = deriveCheckInterval(status, cadenceType);
  const cadenceLabel = cadenceDays < 2 ? `${Math.round(cadenceDays * 24)}h` : `${Math.round(cadenceDays)}d`;
  // next check = last fetched + status-based cadence
  const lastFetchedMs = ch.lastFetchedAt ? new Date(ch.lastFetchedAt).getTime() : Date.now();
  const nextCheckAt = new Date(lastFetchedMs + cadenceDays * DAY_MS);
  const nextCheckDays = Math.max(0, (nextCheckAt.getTime() - Date.now()) / 86400000);

  return {
    id: ch.id,
    name,
    handle,
    avatarUrl: ch.avatarUrl ?? null,
    status,
    lastFetchedMs,
    lastCheck,
    lastVideo: relativeTime(ch.lastVideoPublishedAt),
    daysSinceVideo,
    nextCheck: `${futureRelative(nextCheckDays)} · ${fmtDateTime(nextCheckAt)}`,
    cadence: cadenceLabel,
    checkIntervalDays: cadenceDays,
    cadenceType,
    isStale: daysSinceVideo > 14,
    totalVideos: ch._count.videos,
  };
}

const STATUS_COLOR: Record<ChannelStatus, string> = {
  active:   "bg-success",
  regular:  "bg-blue",
  slow:     "bg-orange",
  inactive: "bg-destructive",
};

const filterTabs = ["All", "Active", "Regular", "Slow", "Inactive"];

// ── Component ──────────────────────────────────────────────────────────────

export default function Monitor() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();

  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(() => {
    const url = projectId
      ? `/api/monitor?projectId=${encodeURIComponent(projectId)}`
      : "/api/monitor";
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((channels: ApiChannel[]) => {
        if (!Array.isArray(channels)) return;
        setRows(channels.map(toRow));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh when the next channel is due.
  useEffect(() => {
    if (paused || rows.length === 0) {
      setCountdown(0);
      return;
    }

    const now = Date.now();
    const nextDueAt = Math.min(...rows.map((r) => r.lastFetchedMs + r.checkIntervalDays * DAY_MS));
    const waitMs = Math.max(1000, nextDueAt - now);
    setCountdown(Math.ceil(waitMs / 1000));

    const timer = window.setTimeout(() => {
      fetchData();
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [fetchData, paused, rows]);

  useEffect(() => {
    if (paused) return;
    const tick = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [paused]);

  // ── Derived stats ──────────────────────────────────────────────────────

  const activeCount   = rows.filter((r) => r.status === "active").length;
  const regularCount  = rows.filter((r) => r.status === "regular").length;
  const slowCount     = rows.filter((r) => r.status === "slow").length;
  const inactiveCount = rows.filter((r) => r.status === "inactive").length;

  const cadenceGroups = [
    { label: "Active",   desc: "uploaded <3d ago",  color: "success"     as const, channels: activeCount,   freq: "every 2d" },
    { label: "Regular",  desc: "3-14d",              color: "blue"        as const, channels: regularCount,  freq: "every 5d" },
    { label: "Slow",     desc: "14-30d",             color: "orange"      as const, channels: slowCount,     freq: "every 10d" },
    { label: "Inactive", desc: "30d+",               color: "destructive" as const, channels: inactiveCount, freq: "every 20d" },
  ];

  const counts: Record<string, number> = {
    All: rows.length,
    Active: activeCount,
    Regular: regularCount,
    Slow: slowCount,
    Inactive: inactiveCount,
  };

  // ── Filter ─────────────────────────────────────────────────────────────

  const filtered = rows.filter((ch) => {
    const q = search.toLowerCase();
    if (q && !ch.name.toLowerCase().includes(q) && !ch.handle.toLowerCase().includes(q)) return false;
    if (activeFilter === "Active")   return ch.status === "active";
    if (activeFilter === "Regular")  return ch.status === "regular";
    if (activeFilter === "Slow")     return ch.status === "slow";
    if (activeFilter === "Inactive") return ch.status === "inactive";
    return true;
  });

  const handlePauseResume = () => {
    setPaused((p) => {
      toast.success(p ? "Monitor resumed" : "Monitor paused");
      return !p;
    });
  };

  const handleForceRun = () => {
    fetchData();
    toast.success("Refreshing channel data…");
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Monitor</h1>
          <span className="text-[11px] text-dim font-mono">
            {loading ? "Loading…" : `${filtered.length} channels`}
          </span>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${paused ? "bg-orange/15 text-orange" : "bg-success/15 text-success"}`}>
            <Circle className="w-2 h-2 fill-current" />
            {paused ? "Paused" : `Running · next ${formatRemainingSeconds(countdown)}`}
          </span>
          <button
            onClick={handlePauseResume}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span className="max-sm:hidden">{paused ? "Resume" : "Pause"}</span>
          </button>
          <button
            onClick={handleForceRun}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
          >
            <RotateCw className="w-3 h-3" />
            <span className="max-sm:hidden">Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Cards row */}
            <div className="px-6 pt-5 max-lg:px-4 grid grid-cols-2 max-md:grid-cols-1 gap-4 mb-5">
              {/* Channel Health */}
              <div className="rounded-xl bg-background overflow-hidden">
                <div className="px-4 py-3">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Channel Health</div>
                  <div className="grid grid-cols-5 max-sm:grid-cols-3 gap-3 max-sm:gap-y-3">
                    {[
                      { val: rows.length,  label: "TOTAL",    color: "" },
                      { val: activeCount,   label: "ACTIVE",   color: "text-success" },
                      { val: regularCount,  label: "REGULAR",  color: "text-blue" },
                      { val: slowCount,     label: "SLOW",     color: "text-orange" },
                      { val: inactiveCount, label: "INACTIVE", color: "text-destructive" },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className={`text-xl font-semibold font-mono tracking-tight ${s.color}`}>{s.val}</div>
                        <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2.5">Check Cadence (Status-based)</div>
                  {cadenceGroups.map((c) => {
                    const dotColor =
                      c.color === "success"     ? "bg-success" :
                      c.color === "blue"        ? "bg-blue" :
                      c.color === "orange"      ? "bg-orange" :
                      c.color === "destructive" ? "bg-destructive" : "";
                    return (
                      <div key={c.label} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                          <span className="text-[12px] text-sensor font-medium">{c.label}</span>
                          <span className="text-[11px] text-dim font-mono max-sm:hidden">{c.desc}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-dim">
                          <span>{c.channels} ch</span>
                          <span>{c.freq}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Last Synced summary */}
              <div className="rounded-xl bg-background overflow-hidden">
                <div className="px-4 py-3">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Channels Overview</div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xl font-semibold font-mono tracking-tight">{rows.filter(r => r.cadenceType === "owned").length}</div>
                      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Our Channels</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold font-mono tracking-tight">{rows.filter(r => r.cadenceType === "auto").length}</div>
                      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Competitors</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold font-mono tracking-tight text-success">{rows.reduce((a, r) => a + r.totalVideos, 0).toLocaleString()}</div>
                      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Total Videos</div>
                    </div>
                    <div>
                      <div className="text-xl font-semibold font-mono tracking-tight text-orange">{rows.filter(r => r.isStale).length}</div>
                      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Stale (&gt;14d)</div>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-border">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2.5">Most Recent Checks</div>
                  {rows
                    .filter(r => r.lastCheck !== "—")
                    .slice(0, 4)
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          {r.avatarUrl ? (
                            <img src={r.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-elevated shrink-0" />
                          )}
                          <span className="text-[12px] text-sensor truncate max-w-[120px]">{r.name}</span>
                        </div>
                        <span className="text-[11px] text-dim font-mono">{r.lastCheck}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Channel table */}
            <div className="px-6 pb-8 max-lg:px-4">
              {/* Filters + search */}
              <div className="flex items-center justify-between mb-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {filterTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFilter(tab)}
                      className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors whitespace-nowrap border ${
                        activeFilter === tab
                          ? "bg-surface text-foreground border-border"
                          : "bg-transparent text-dim border-border/50 hover:text-sensor hover:border-border"
                      }`}
                    >
                      {tab} <span className="text-[11px] opacity-60">({counts[tab]})</span>
                    </button>
                  ))}
                </div>
                <div className="relative max-sm:w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                  <input
                    type="text"
                    placeholder="Search channels..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-border/50 rounded-full text-sensor placeholder:text-dim focus:outline-none focus:border-border w-[180px] max-sm:w-full"
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[13px] text-dim font-mono">No channels found</div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="rounded-xl border border-border overflow-hidden max-sm:hidden">
                    <div className="grid grid-cols-[1fr_70px_110px_110px_100px] px-4 py-2.5 bg-background border-b border-border">
                      {["CHANNEL", "STATUS", "LAST CHECK", "LAST VIDEO", "NEXT CHECK"].map((h) => (
                        <span key={h} className="text-[10px] text-dim font-mono uppercase tracking-wider">{h}</span>
                      ))}
                    </div>
                    {filtered.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => navigate(projectPath(`/channel/${ch.id}`))}
                        className="grid grid-cols-[1fr_70px_110px_110px_100px] px-4 py-3 bg-background border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors cursor-pointer group items-center"
                      >
                        <div className="flex items-center gap-2.5">
                          {ch.avatarUrl ? (
                            <img src={ch.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-elevated shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[13px] font-medium truncate">{ch.name}</span>
                              <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                            <span className="text-[11px] text-dim font-mono">{ch.handle}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-center">
                          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLOR[ch.status]}`} />
                        </div>
                        <span className="text-[12px] text-dim font-mono">{ch.lastCheck}</span>
                        <span className={`text-[12px] font-mono ${ch.isStale ? "text-orange" : "text-dim"}`}>{ch.lastVideo}</span>
                        <span className="text-[12px] text-dim font-mono">{ch.nextCheck}</span>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Card Layout */}
                  <div className="sm:hidden space-y-2">
                    {filtered.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => navigate(projectPath(`/channel/${ch.id}`))}
                        className="rounded-xl bg-background p-4 cursor-pointer active:bg-[#0d0d10] transition-colors"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          {ch.avatarUrl ? (
                            <img src={ch.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-elevated shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-medium truncate">{ch.name}</span>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[ch.status]}`} />
                            </div>
                            <span className="text-[11px] text-dim font-mono">{ch.handle}</span>
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-dim shrink-0" />
                        </div>
                        <div className="grid grid-cols-3 gap-y-2.5 gap-x-4">
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Last check</div>
                            <div className="text-[12px] text-dim font-mono">{ch.lastCheck}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Last video</div>
                            <div className={`text-[12px] font-mono ${ch.isStale ? "text-orange" : "text-dim"}`}>{ch.lastVideo}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Next check</div>
                            <div className="text-[12px] text-dim font-mono">{ch.nextCheck}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Cadence</div>
                            <div className={`text-[12px] font-mono ${ch.cadenceType === "owned" ? "text-orange" : "text-dim"}`}>{ch.cadence}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Videos</div>
                            <div className="text-[12px] text-dim font-mono">{ch.totalVideos.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Type</div>
                            <div className={`text-[11px] font-mono ${ch.cadenceType === "owned" ? "text-orange" : "text-dim"}`}>
                              {ch.cadenceType === "owned" ? "Ours" : "Competitor"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
