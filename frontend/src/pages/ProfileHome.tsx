import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  Users, Eye, PlayCircle, TrendingUp, TrendingDown,
  BarChart3, Swords, Sparkles, Zap, ArrowUpRight,
  Activity, Video, Film, ThumbsUp, MessageSquare, Clock,
  Globe, Loader2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { COUNTRIES, getCountryName } from "@/data/countries";
import { fmtDate, fmtDateTime, parseDuration } from "@/lib/utils";

function fmtCount(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDelta(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 0 ? `+${fmtCount(v)}` : fmtCount(v);
}

interface ChannelData {
  id: string;
  handle: string;
  nameAr: string | null;
  nameEn: string | null;
  avatarUrl: string | null;
  subscribers: string;
  totalViews: string;
  videoCount: number;
  avgViews?: number;
  engagement?: number;
  deltas?: Record<string, number | null>;
  lastFetchedAt: string | null;
  createdAt: string;
  status: string;
  nationality?: string | null;
  startHook?: string | null;
  endHook?: string | null;
}

interface ApiVideo {
  id: string;
  channelId: string;
  titleAr: string | null;
  titleEn: string | null;
  viewCount: number;
  likeCount: number;
  commentCount?: number;
  publishedAt: string | null;
  duration: string | null;
  videoType: string;
  thumbnailUrl: string | null;
  pipelineItem?: { stage: string; status: string } | null;
}

interface StorySummary {
  total: number;
  suggestion: number;
  liked: number;
  scripting: number;
  filmed: number;
  publish: number;
  done: number;
  passed: number;
  omit: number;
  firstMovers: number;
  firstMoverPct: number;
}

interface GrowthSnapshot {
  subscribers: number;
  totalViews: number;
  videoCount: number;
  engagement: number;
  date: string;
}

interface ContentMixEntry {
  channelId: string;
  videos: { count: number; views: number; avgViews: number; engagement: number };
  shorts: { count: number; views: number; avgViews: number; engagement: number };
}

export default function ProfileHome() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [recentVideos, setRecentVideos] = useState<ApiVideo[]>([]);
  const [competitorCount, setCompetitorCount] = useState(0);
  const [storySummary, setStorySummary] = useState<StorySummary | null>(null);
  const [growth, setGrowth] = useState<GrowthSnapshot[]>([]);
  const [contentMix, setContentMix] = useState<ContentMixEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [nationality, setNationality] = useState("");
  const [savingCountry, setSavingCountry] = useState(false);
  const [hookStart, setHookStart] = useState("");
  const [hookEnd, setHookEnd] = useState("");
  const [savingHooks, setSavingHooks] = useState(false);
  const [hooksSaved, setHooksSaved] = useState(false);

  useEffect(() => {
    if (channel) {
      setNationality(channel.nationality ?? "");
      setHookStart(channel.startHook ?? "");
      setHookEnd(channel.endHook ?? "");
    }
  }, [channel]);

  useEffect(() => {
    if (!channelId) return;
    setLoading(true);

    const fetchAll = async () => {
      const [chRes, vidRes, compRes, storyRes, analyticsRes] = await Promise.allSettled([
        fetch(`/api/channels/${channelId}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`/api/channels/${channelId}/videos?limit=6`, { credentials: "include" }).then(r => r.ok ? r.json() : { videos: [] }),
        fetch(`/api/channels?parentChannelId=${channelId}&limit=200`, { credentials: "include" }).then(r => r.ok ? r.json() : { channels: [] }),
        fetch(`/api/stories/summary?channelId=${channelId}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`/api/analytics?channelId=${channelId}&period=30d`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);

      if (chRes.status === "fulfilled" && chRes.value) setChannel(chRes.value);
      if (vidRes.status === "fulfilled") setRecentVideos(vidRes.value?.videos || []);
      if (compRes.status === "fulfilled") setCompetitorCount(compRes.value?.channels?.length || 0);
      if (storyRes.status === "fulfilled" && storyRes.value) setStorySummary(storyRes.value);

      if (analyticsRes.status === "fulfilled" && analyticsRes.value) {
        const data = analyticsRes.value;
        const ownGrowth = data.growth?.[channelId] || [];
        setGrowth(ownGrowth);
        const ownMix = (data.contentMix || []).find((m: ContentMixEntry) => m.channelId === channelId);
        if (ownMix) setContentMix(ownMix);
      }

      setLoading(false);
    };

    fetchAll();
  }, [channelId]);

  const name = channel ? (channel.nameEn || channel.nameAr || channel.handle) : "";
  const subs = channel ? Number(channel.subscribers) || 0 : 0;
  const views = channel ? Number(channel.totalViews) || 0 : 0;

  const activeStories = storySummary
    ? storySummary.suggestion + storySummary.liked + storySummary.scripting + storySummary.filmed + storySummary.publish
    : 0;

  const growthChart = useMemo(() => {
    if (!growth.length) return null;
    const sorted = [...growth].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const subsValues = sorted.map(s => s.subscribers);
    const maxSubs = Math.max(...subsValues);
    const minSubs = Math.min(...subsValues);
    const range = maxSubs - minSubs || 1;
    const chartH = 48;
    const points = subsValues.map((v, i) => {
      const x = (i / Math.max(subsValues.length - 1, 1)) * 100;
      const y = chartH - ((v - minSubs) / range) * chartH;
      return `${x},${y}`;
    });
    return {
      polyline: points.join(" "),
      first: subsValues[0],
      last: subsValues[subsValues.length - 1],
      change: subsValues[subsValues.length - 1] - subsValues[0],
    };
  }, [growth]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-sensor border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[13px] text-dim">Loading profile…</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6">
        <p className="text-foreground text-[14px] mb-2">Profile not found.</p>
        <Link to="/" className="text-sensor hover:text-foreground underline text-[13px]">
          Back to profiles
        </Link>
      </div>
    );
  }

  const saveCountry = (value: string) => {
    setNationality(value);
    setSavingCountry(true);
    fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nationality: value || null }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        toast.success("Country updated");
      })
      .catch(() => toast.error("Failed to update country"))
      .finally(() => setSavingCountry(false));
  };

  const saveHooks = () => {
    setSavingHooks(true);
    fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ startHook: hookStart.trim() || null, endHook: hookEnd.trim() || null }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        toast.success("Branded hooks saved");
        setHooksSaved(true);
        setTimeout(() => setHooksSaved(false), 2000);
      })
      .catch(() => toast.error("Failed to save branded hooks"))
      .finally(() => setSavingHooks(false));
  };

  const statCards = [
    {
      label: "Subscribers",
      value: fmtCount(subs),
      delta: fmtDelta(channel.deltas?.subscribers),
      icon: Users,
      positive: (channel.deltas?.subscribers ?? 0) >= 0,
    },
    {
      label: "Total Views",
      value: fmtCount(views),
      delta: fmtDelta(channel.deltas?.totalViews),
      icon: Eye,
      positive: (channel.deltas?.totalViews ?? 0) >= 0,
    },
    {
      label: "Videos",
      value: fmtCount(channel.videoCount || 0),
      delta: fmtDelta(channel.deltas?.videoCount),
      icon: PlayCircle,
      positive: (channel.deltas?.videoCount ?? 0) >= 0,
    },
    {
      label: "Avg. Views",
      value: channel.avgViews != null ? fmtCount(channel.avgViews) : "—",
      delta: fmtDelta(channel.deltas?.avgViews),
      icon: BarChart3,
      positive: (channel.deltas?.avgViews ?? 0) >= 0,
    },
    {
      label: "Engagement",
      value: channel.engagement != null ? `${channel.engagement.toFixed(1)}%` : "—",
      delta: channel.deltas?.engagement != null ? `${channel.deltas.engagement >= 0 ? "+" : ""}${channel.deltas.engagement.toFixed(1)}%` : "—",
      icon: ThumbsUp,
      positive: (channel.deltas?.engagement ?? 0) >= 0,
    },
  ];

  const quickLinks = [
    { label: "Competitors", path: "/competitors", icon: Swords, count: competitorCount, color: "text-orange-400" },
    { label: "AI Stories", path: "/stories", icon: Sparkles, count: storySummary?.total || 0, color: "text-purple-400" },
    { label: "Pipeline", path: "/pipeline", icon: Activity, count: undefined, color: "text-blue-400" },
    { label: "Analytics", path: "/analytics", icon: TrendingUp, count: undefined, color: "text-emerald-400" },
  ];

  const videoMix = contentMix ? {
    videoCount: contentMix.videos.count,
    shortCount: contentMix.shorts.count,
    videoViews: contentMix.videos.views,
    shortViews: contentMix.shorts.views,
    videoAvg: contentMix.videos.avgViews,
    shortAvg: contentMix.shorts.avgViews,
    total: contentMix.videos.count + contentMix.shorts.count,
  } : null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 max-lg:px-4">
        <div className="flex items-start gap-4">
          <img
            src={channel.avatarUrl || "/placeholder.svg"}
            alt={name}
            className="w-14 h-14 rounded-full object-cover shrink-0 bg-elevated"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='%23666'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='14'%3E" +
                (name.charAt(0) || "?") +
                "%3C/text%3E%3C/svg%3E";
            }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight mb-0.5" dir="rtl">{name}</h1>
            <a
              href={`https://youtube.com/${channel.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-dim font-mono hover:text-sensor transition-colors no-underline"
            >
              {channel.handle}
            </a>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-success/10 text-success">
                {channel.status === "active" ? "Active" : channel.status}
              </span>
              {nationality && (
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-blue/10 text-blue">
                  <Globe className="w-3 h-3" /> {getCountryName(nationality)}
                </span>
              )}
              {channel.lastFetchedAt && (
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-elevated text-dim">
                  Synced {fmtDateTime(channel.lastFetchedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Settings: Country & Branded Hooks */}
      <div className="px-6 max-lg:px-4 pb-1">
        <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-3">
          {/* Country */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Globe className="w-3.5 h-3.5 text-dim" />
              <span className="text-[11px] text-dim font-medium uppercase tracking-wider">Country / Dialect</span>
            </div>
            <select
              value={nationality}
              onChange={(e) => saveCountry(e.target.value)}
              disabled={savingCountry}
              className="w-full px-3 py-2 text-[12px] bg-elevated border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
            >
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-dim mt-1.5">Sets the Arabic dialect for AI-generated content.</p>
          </div>

          {/* Start Hook */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] text-dim font-medium uppercase tracking-wider">Start Hook</span>
            </div>
            <input
              type="text"
              value={hookStart}
              onChange={(e) => setHookStart(e.target.value)}
              placeholder="e.g. أهلاً وسهلاً بكم في قناة..."
              className="w-full px-3 py-2 text-[12px] bg-elevated border border-border rounded-lg text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40"
              dir="auto"
            />
            <p className="text-[10px] text-dim mt-1.5">Branded intro added to every AI script.</p>
          </div>

          {/* End Hook */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] text-dim font-medium uppercase tracking-wider">End Hook</span>
              <button
                onClick={saveHooks}
                disabled={savingHooks}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingHooks ? <Loader2 className="w-3 h-3 animate-spin" /> : hooksSaved ? <Check className="w-3 h-3" /> : null}
                {savingHooks ? "Saving…" : hooksSaved ? "Saved" : "Save Hooks"}
              </button>
            </div>
            <input
              type="text"
              value={hookEnd}
              onChange={(e) => setHookEnd(e.target.value)}
              placeholder="e.g. لا تنسوا الاشتراك وتفعيل الجرس..."
              className="w-full px-3 py-2 text-[12px] bg-elevated border border-border rounded-lg text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40"
              dir="auto"
            />
            <p className="text-[10px] text-dim mt-1.5">Branded outro added to every AI script.</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="px-6 max-lg:px-4">
        <div className="grid grid-cols-5 max-xl:grid-cols-3 max-md:grid-cols-2 gap-3">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-xl border border-border bg-background p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim font-medium uppercase tracking-wider">{s.label}</span>
                  <Icon className="w-3.5 h-3.5 text-dim/50" strokeWidth={1.5} />
                </div>
                <div className="text-xl font-semibold font-mono tracking-tight">{s.value}</div>
                <div className={`text-[11px] font-mono flex items-center gap-1 ${
                  s.delta === "—" ? "text-dim" : s.positive ? "text-success" : "text-destructive"
                }`}>
                  {s.delta !== "—" && (s.positive
                    ? <TrendingUp className="w-3 h-3" />
                    : <TrendingDown className="w-3 h-3" />
                  )}
                  {s.delta}
                  {s.delta !== "—" && <span className="text-dim ml-0.5">vs last snapshot</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid */}
      <div className="px-6 py-5 grid grid-cols-3 max-lg:grid-cols-1 gap-4 max-lg:px-4">

        {/* Quick Navigation */}
        <div className="col-span-1 rounded-xl border border-border bg-background p-4">
          <h3 className="text-[12px] text-dim font-medium uppercase tracking-wider mb-3">Quick Access</h3>
          <div className="grid grid-cols-2 gap-2">
            {quickLinks.map((ql) => {
              const Icon = ql.icon;
              return (
                <Link
                  key={ql.path}
                  to={channelPath(ql.path)}
                  className="flex items-center gap-2.5 p-3 rounded-lg border border-border/50 hover:border-border hover:bg-elevated/40 transition-all no-underline group"
                >
                  <Icon className={`w-4 h-4 ${ql.color} shrink-0`} strokeWidth={1.5} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground truncate">{ql.label}</div>
                    {ql.count != null && (
                      <div className="text-[11px] text-dim font-mono">{ql.count}</div>
                    )}
                  </div>
                  <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                </Link>
              );
            })}
          </div>

          {/* Story Pipeline mini */}
          {storySummary && storySummary.total > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-dim font-medium">Story Pipeline</span>
                <Link to={channelPath("/stories")} className="text-[11px] text-sensor hover:text-foreground no-underline">
                  View all →
                </Link>
              </div>
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-elevated">
                {[
                  { key: "suggestion", color: "bg-zinc-500" },
                  { key: "liked", color: "bg-blue-500" },
                  { key: "scripting", color: "bg-purple-500" },
                  { key: "filmed", color: "bg-amber-500" },
                  { key: "publish", color: "bg-emerald-500" },
                  { key: "done", color: "bg-success" },
                ].map((s) => {
                  const count = (storySummary as Record<string, number>)[s.key] || 0;
                  if (!count) return null;
                  return (
                    <div
                      key={s.key}
                      className={`${s.color} rounded-full`}
                      style={{ flex: count }}
                      title={`${s.key}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-dim">{activeStories} active</span>
                <span className="text-[10px] text-dim">{storySummary.done} done</span>
              </div>
              {storySummary.firstMoverPct > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="text-foreground font-medium">{storySummary.firstMoverPct}%</span>
                  <span className="text-dim">first mover stories</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Growth Chart */}
        <div className="col-span-1 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] text-dim font-medium uppercase tracking-wider">Subscriber Growth</h3>
            {growthChart && (
              <span className={`text-[11px] font-mono ${growthChart.change >= 0 ? "text-success" : "text-destructive"}`}>
                {growthChart.change >= 0 ? "+" : ""}{fmtCount(growthChart.change)}
              </span>
            )}
          </div>
          {growthChart ? (
            <div className="mt-2">
              <svg viewBox="0 0 100 48" className="w-full h-[120px]" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={growthChart.change >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={growthChart.change >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`0,48 ${growthChart.polyline} 100,48`}
                  fill="url(#growthGrad)"
                />
                <polyline
                  points={growthChart.polyline}
                  fill="none"
                  stroke={growthChart.change >= 0 ? "#22c55e" : "#ef4444"}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-dim font-mono">{fmtCount(growthChart.first)}</span>
                <span className="text-[10px] text-dim font-mono">{fmtCount(growthChart.last)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-[12px] text-dim">
              No growth data yet
            </div>
          )}

          {/* Content Mix */}
          {videoMix && videoMix.total > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <h4 className="text-[11px] text-dim font-medium mb-2">Content Mix (30d)</h4>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-elevated mb-2">
                <div className="bg-blue-500 rounded-full" style={{ flex: videoMix.videoCount || 0 }} />
                <div className="bg-violet-500 rounded-full" style={{ flex: videoMix.shortCount || 0 }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Video className="w-3.5 h-3.5 text-blue-500" />
                  <div>
                    <div className="text-[12px] font-medium">{videoMix.videoCount} Videos</div>
                    <div className="text-[10px] text-dim font-mono">avg {fmtCount(videoMix.videoAvg)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-violet-500" />
                  <div>
                    <div className="text-[12px] font-medium">{videoMix.shortCount} Shorts</div>
                    <div className="text-[10px] text-dim font-mono">avg {fmtCount(videoMix.shortAvg)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent Videos */}
        <div className="col-span-1 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] text-dim font-medium uppercase tracking-wider">Latest Videos</h3>
            <Link to={channelPath(`/channel/${channelId}`)} className="text-[11px] text-sensor hover:text-foreground no-underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {recentVideos.length === 0 && (
              <div className="text-[12px] text-dim py-6 text-center">No videos yet</div>
            )}
            {recentVideos.slice(0, 6).map((v) => {
              const title = v.titleEn || v.titleAr || "Untitled";
              const viewCount = Number(v.viewCount) || 0;
              const likeCount = Number(v.likeCount) || 0;
              const isShort = (v.videoType || "").toLowerCase() === "short";
              return (
                <Link
                  key={v.id}
                  to={channelPath(`/video/${v.id}`)}
                  className="flex items-start gap-2.5 p-2 -mx-1 rounded-lg hover:bg-elevated/50 transition-colors no-underline group"
                >
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="w-16 h-9 rounded object-cover shrink-0 bg-elevated" />
                  ) : (
                    <div className="w-16 h-9 rounded bg-elevated shrink-0 flex items-center justify-center">
                      <PlayCircle className="w-4 h-4 text-dim/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-foreground truncate group-hover:text-sensor transition-colors" dir="auto">
                      {title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-dim font-mono">
                      <span className="flex items-center gap-0.5">
                        <Eye className="w-2.5 h-2.5" /> {fmtCount(viewCount)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="w-2.5 h-2.5" /> {fmtCount(likeCount)}
                      </span>
                      {v.duration && !isShort && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {parseDuration(v.duration)}
                        </span>
                      )}
                      {isShort && (
                        <span className="px-1 py-px rounded text-[9px] bg-violet-500/15 text-violet-400">Short</span>
                      )}
                    </div>
                    {v.publishedAt && (
                      <div className="text-[10px] text-dim/60 mt-0.5">{fmtDate(v.publishedAt)}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
