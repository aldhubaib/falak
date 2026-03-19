import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  RotateCw, Pause, Play, Circle, AlertTriangle, ArrowUpRight,
  Search, Eye,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { fmtDateTime } from "@/lib/utils";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════════
// Shared types
// ═══════════════════════════════════════════════════════════════════════════

const TABS = ["pipeline", "monitor"] as const;
type Tab = (typeof TABS)[number];

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline types
// ═══════════════════════════════════════════════════════════════════════════

interface ApiVideo {
  id: string;
  youtubeId?: string;
  titleAr?: string;
  thumbnailUrl?: string;
  channel?: { id: string; nameAr?: string; handle?: string; avatarUrl?: string | null };
}

interface ApiPipelineItem {
  id: string;
  stage: string;
  status: string;
  error?: string | null;
  retries: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  video?: ApiVideo | null;
}

interface PipelineData {
  stats: {
    total: number;
    import: number;
    transcribe: number;
    comments: number;
    analyzing: number;
    done: number;
    failed: number;
  };
  byStage: Record<string, ApiPipelineItem[]>;
  paused: boolean;
}

const STAGE_DEFS: { id: string; number: number; label: string; color: string }[] = [
  { id: "import",    number: 1, label: "Import",        color: "text-orange" },
  { id: "transcribe",number: 2, label: "Transcribe",    color: "text-blue" },
  { id: "comments",  number: 3, label: "Comments",      color: "text-purple" },
  { id: "analyzing", number: 4, label: "AI Analysis",   color: "text-success" },
  { id: "failed",    number: 0, label: "Failed",        color: "text-destructive" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Monitor types
// ═══════════════════════════════════════════════════════════════════════════

interface MonitorApiChannel {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  type: string;
  status?: string | null;
  lastFetchedAt?: string | null;
  uploadCadence?: number | null;
  lastVideoPublishedAt?: string | null;
  _count: { videos: number };
}

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

// ═══════════════════════════════════════════════════════════════════════════
// Monitor helpers
// ═══════════════════════════════════════════════════════════════════════════

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

function toRow(ch: MonitorApiChannel): MonitorRow {
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
  const lastFetchedMs = ch.lastFetchedAt ? new Date(ch.lastFetchedAt).getTime() : Date.now();
  const nextCheckAt = new Date(lastFetchedMs + cadenceDays * DAY_MS);
  const nextCheckDays = Math.max(0, (nextCheckAt.getTime() - Date.now()) / 86400000);

  return {
    id: ch.id, name, handle,
    avatarUrl: ch.avatarUrl ?? null,
    status, lastFetchedMs, lastCheck,
    lastVideo: relativeTime(ch.lastVideoPublishedAt),
    daysSinceVideo,
    nextCheck: `${futureRelative(nextCheckDays)} · ${fmtDateTime(nextCheckAt)}`,
    cadence: cadenceLabel, checkIntervalDays: cadenceDays, cadenceType,
    isStale: daysSinceVideo > 14,
    totalVideos: ch._count.videos,
  };
}

const STATUS_COLOR: Record<ChannelStatus, string> = {
  active: "bg-success", regular: "bg-blue", slow: "bg-orange", inactive: "bg-destructive",
};

const monitorFilterTabs = ["All", "Active", "Regular", "Slow", "Inactive"];

// ═══════════════════════════════════════════════════════════════════════════
// Main Pipeline page (with tabs)
// ═══════════════════════════════════════════════════════════════════════════

export default function Pipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab = rawTab === "monitor" ? "monitor" : "pipeline";

  const setTab = (tab: Tab) => {
    setSearchParams(tab === "pipeline" ? {} : { tab }, { replace: true });
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div className="h-12 flex items-center gap-0 px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`relative h-full px-4 text-[13px] font-medium transition-colors capitalize ${
              activeTab === tab
                ? "text-foreground"
                : "text-dim hover:text-sensor"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === "pipeline" ? <PipelineTab /> : <MonitorTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Tab
// ═══════════════════════════════════════════════════════════════════════════

function PipelineTab() {
  const { channelId } = useParams();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const fetchPipeline = useCallback(() => {
    const url = channelId
      ? `/api/pipeline?limit=2000&channelId=${encodeURIComponent(channelId)}`
      : "/api/pipeline?limit=2000";
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: PipelineData) => {
        setData(d);
        setPaused(d.paused);
      })
      .catch(() => toast.error("Failed to load pipeline data"))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  useEffect(() => {
    setCountdown(30);
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { fetchPipeline(); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchPipeline]);

  const handlePauseResume = () => {
    const endpoint = paused ? "/api/pipeline/resume" : "/api/pipeline/pause";
    fetch(endpoint, { method: "POST", credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); setPaused(!paused); toast.success(paused ? "Pipeline resumed" : "Pipeline paused"); })
      .catch(() => toast.error("Failed to update pipeline state"));
  };

  const handleRetryAll = () => {
    setRetryingAll(true);
    fetch("/api/pipeline/retry-all-failed", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} failed items`); fetchPipeline(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  const failedCount = data?.stats.failed ?? 0;
  const totalVideos = data?.stats.total ?? 0;
  const doneCount = data?.stats.done ?? 0;
  const inPipeline = totalVideos - doneCount;

  return (
    <div className="flex-1 relative overflow-auto">
      {/* Controls */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-end gap-2 max-lg:px-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
          paused ? "bg-orange/15 text-orange" : "bg-success/15 text-success"
        }`}>
          <Circle className="w-2 h-2 fill-current" />
          {paused ? "Paused" : `Running · ${countdown}s`}
        </span>
        <button onClick={handlePauseResume} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
          {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {paused ? "Resume" : "Pause"}
        </button>
        {failedCount > 0 && (
          <button onClick={handleRetryAll} disabled={retryingAll} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
            <RotateCw className={`w-3 h-3 ${retryingAll ? "animate-spin" : ""}`} />
            Retry all failed ({failedCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="px-6 max-lg:px-4 mb-5">
            <div className="flex rounded-xl overflow-hidden border border-border">
              <div className="px-5 py-4 bg-background border-r border-border min-w-[140px]">
                <div className="text-2xl font-semibold font-mono tracking-tight">{totalVideos}</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Total Videos</div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-dim font-mono">
                  <span>{inPipeline} in pipeline</span>
                  <span>{doneCount} done</span>
                </div>
              </div>
              {STAGE_DEFS.filter(s => s.id !== "failed").map((stage) => {
                const count = data?.stats[stage.id as keyof typeof data.stats] ?? 0;
                return (
                  <div key={stage.id} className="flex-1 px-5 py-4 bg-background border-r border-border last:border-r-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-semibold font-mono tracking-tight ${stage.color}`}>{count}</span>
                    </div>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">{stage.label}</div>
                  </div>
                );
              })}
              <div className="px-5 py-4 bg-background min-w-[120px]">
                <span className="text-2xl font-semibold font-mono tracking-tight text-destructive">{failedCount}</span>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Failed</div>
              </div>
            </div>
          </div>

          {/* Stage columns */}
          <div className="px-6 pb-8 max-lg:px-4 overflow-x-auto">
            <div className="grid grid-cols-3 gap-4 mb-4 max-lg:grid-cols-1 items-start">
              {STAGE_DEFS.slice(0, 3).map((stage) => (
                <StageColumn key={stage.id} stage={stage} items={data?.byStage[stage.id] ?? []} onRetry={fetchPipeline} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 items-start">
              {STAGE_DEFS.slice(3).map((stage) => (
                <StageColumn key={stage.id} stage={stage} items={data?.byStage[stage.id] ?? []} onRetry={fetchPipeline} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Monitor Tab
// ═══════════════════════════════════════════════════════════════════════════

function MonitorTab() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();

  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(() => {
    const url = channelId
      ? `/api/monitor?channelId=${encodeURIComponent(channelId)}`
      : "/api/monitor";
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((channels: MonitorApiChannel[]) => {
        if (!Array.isArray(channels)) return;
        setRows(channels.map(toRow));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (paused || rows.length === 0) { setCountdown(0); return; }
    const now = Date.now();
    const nextDueAt = Math.min(...rows.map((r) => r.lastFetchedMs + r.checkIntervalDays * DAY_MS));
    const waitMs = Math.max(1000, nextDueAt - now);
    setCountdown(Math.ceil(waitMs / 1000));
    const timer = window.setTimeout(() => fetchData(), waitMs);
    return () => window.clearTimeout(timer);
  }, [fetchData, paused, rows]);

  useEffect(() => {
    if (paused) return;
    const tick = window.setInterval(() => setCountdown((prev) => Math.max(0, prev - 1)), 1000);
    return () => window.clearInterval(tick);
  }, [paused]);

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
    All: rows.length, Active: activeCount, Regular: regularCount, Slow: slowCount, Inactive: inactiveCount,
  };

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
    setPaused((p) => { toast.success(p ? "Monitor resumed" : "Monitor paused"); return !p; });
  };

  const handleForceRun = () => { fetchData(); toast.success("Refreshing channel data…"); };

  return (
    <div className="flex-1 overflow-auto">
      {/* Controls */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-end gap-2 max-lg:px-4 max-sm:flex-wrap">
        <span className="text-[11px] text-dim font-mono mr-auto">
          {loading ? "Loading…" : `${filtered.length} channels`}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${paused ? "bg-orange/15 text-orange" : "bg-success/15 text-success"}`}>
          <Circle className="w-2 h-2 fill-current" />
          {paused ? "Paused" : `Running · next ${formatRemainingSeconds(countdown)}`}
        </span>
        <button onClick={handlePauseResume} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
          {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          <span className="max-sm:hidden">{paused ? "Resume" : "Pause"}</span>
        </button>
        <button onClick={handleForceRun} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
          <RotateCw className="w-3 h-3" />
          <span className="max-sm:hidden">Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Cards row */}
          <div className="px-6 max-lg:px-4 grid grid-cols-2 max-md:grid-cols-1 gap-4 mb-5">
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
                    c.color === "success" ? "bg-success" :
                    c.color === "blue" ? "bg-blue" :
                    c.color === "orange" ? "bg-orange" : "bg-destructive";
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
                {rows.filter(r => r.lastCheck !== "—").slice(0, 4).map((r) => (
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
            <div className="flex items-center justify-between mb-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
              <div className="flex flex-wrap gap-1.5">
                {monitorFilterTabs.map((tab) => (
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
                    <Link
                      key={ch.id}
                      to={channelPath(`/channel/${ch.id}`)}
                      className="grid grid-cols-[1fr_70px_110px_110px_100px] px-4 py-3 bg-background border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors cursor-pointer group items-center no-underline"
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
                    </Link>
                  ))}
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden space-y-2">
                  {filtered.map((ch) => (
                    <Link
                      key={ch.id}
                      to={channelPath(`/channel/${ch.id}`)}
                      className="block rounded-xl bg-background p-4 cursor-pointer active:bg-[#0d0d10] transition-colors no-underline"
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
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline sub-components
// ═══════════════════════════════════════════════════════════════════════════

function StageColumn({
  stage, items, onRetry,
}: {
  stage: { id: string; number: number; label: string; color: string };
  items: ApiPipelineItem[];
  onRetry: () => void;
}) {
  const isFailed = stage.id === "failed";
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryAll = () => {
    setRetryingAll(true);
    fetch("/api/pipeline/retry-all-failed", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} items`); onRetry(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ height: "420px" }}>
      <div className="px-4 py-3 bg-background shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              isFailed ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            }`}>
              {isFailed ? <AlertTriangle className="w-3 h-3" /> : stage.number}
            </span>
            <span className="text-[13px] font-semibold">{stage.label}</span>
            <span className="text-[12px] text-dim font-mono">({items.length})</span>
          </div>
          {isFailed && items.length > 0 && (
            <button onClick={handleRetryAll} disabled={retryingAll} className="inline-flex items-center gap-1 text-[11px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
              <RotateCw className={`w-3 h-3 ${retryingAll ? "animate-spin" : ""}`} /> Retry all
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-background">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[12px] text-dim font-mono">Empty</div>
        ) : (
          items.map((item) => <PipelineItemRow key={item.id} item={item} isFailed={isFailed} onRetry={onRetry} />)
        )}
      </div>
    </div>
  );
}

function PipelineItemRow({ item, isFailed, onRetry }: { item: ApiPipelineItem; isFailed: boolean; onRetry: () => void }) {
  const channelPath = useChannelPath();
  const [retrying, setRetrying] = useState(false);
  const video = item.video;
  const channel = video?.channel;
  const timeInStage = item.startedAt ? formatElapsed(new Date(item.startedAt)) : undefined;

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    fetch(`/api/pipeline/${item.id}/retry`, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Item queued for retry"); onRetry(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetrying(false));
  };

  const Wrapper = video?.id ? Link : "div";
  const wrapperProps = video?.id ? { to: channelPath(`/video/${video.id}`) } : {};

  return (
    <Wrapper
      className={`block px-4 py-3 border-t border-border hover:bg-surface/50 transition-colors group no-underline ${video?.id ? "cursor-pointer" : ""}`}
      {...(wrapperProps as any)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {channel?.avatarUrl ? (
            <img src={channel.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-elevated shrink-0" />
          )}
          <div className="min-w-0">
            {item.status === "running" && !isFailed && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                <span className="text-[11px] text-success font-mono">Processing…</span>
              </div>
            )}
            {item.status === "queued" && !isFailed && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-dim/50 shrink-0" />
                <span className="text-[11px] text-dim font-mono">Queued</span>
              </div>
            )}
            {isFailed && item.error && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-[11px] text-destructive/80 font-mono truncate max-w-[100px]">{item.error}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[13px] text-foreground font-medium text-right truncate" dir="rtl">
            {video?.titleAr || video?.youtubeId || item.id}
          </span>
          {video?.id && (
            <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-dim font-mono">{timeInStage ? `⏱ ${timeInStage}` : ""}</span>
        <div className="flex items-center gap-2">
          {item.retries > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[10px] text-dim font-mono">
                  <RotateCw className="w-2.5 h-2.5" /> {item.retries}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">Attempted {item.retries} times</TooltipContent>
            </Tooltip>
          )}
          {isFailed && (
            <button onClick={handleRetry} disabled={retrying} className="text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
              {retrying ? "…" : "Retry"}
            </button>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function formatElapsed(from: Date): string {
  const ms = Date.now() - from.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
