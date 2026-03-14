import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Star, Circle, CheckCircle, XCircle, ChevronDown, ArrowUpRight, Loader2, RotateCw } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiVideo {
  id: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  titleAr: string | null;
  titleEn: string | null;
}

interface ApiChannel {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  handle: string;
  avatarUrl: string | null;
  type: string;
  subscribers: string;
  totalViews: string;
  periodViews: number;
  videoCount: number;
  avgEngagement: number;
  uploadsPerMonth: number;
  videos: ApiVideo[];
}

interface TopVideo {
  rank: number;
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  avatarUrl: string | null;
  views: string;
  viewCount: number;
}

interface TrendData {
  months: string[];
  channels: { id: string; name: string; type: string; data: number[] }[];
}

interface Universe {
  channels: number;
  owned: number;
  competitors: number;
  totalSubscribers: number;
  totalViews: number;
  videosTracked: number;
  avgEngagement: number;
  avgUploads: number;
}

interface AnalyticsData {
  universe: Universe;
  channels: ApiChannel[];
  topVideos: TopVideo[];
  trend: TrendData;
}

type FieldTab = "Subscribers" | "Engagement" | "Views" | "Upload rate";

const PERIOD_TABS = ["30d", "90d", "12m"];
const FIELD_TABS: FieldTab[] = ["Subscribers", "Engagement", "Views", "Upload rate"];
const TREND_TABS = ["Videos", "Views", "Likes"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function fmtSubs(s: string): string {
  const n = parseInt(s);
  return isNaN(n) ? s : fmtNum(n);
}

function chName(ch: ApiChannel): string {
  return ch.nameAr || ch.nameEn || ch.handle;
}

function getBarWidth(val: number, max: number): number {
  return max > 0 ? Math.min((val / max) * 100, 100) : 0;
}

const COLORS = ["bg-blue", "bg-purple", "bg-orange", "bg-success", "bg-destructive", "bg-sensor"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelAvatar({
  name,
  avatarUrl,
  channelId,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  channelId?: string;
  size?: "sm" | "md";
}) {
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const px = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const textPx = size === "sm" ? "text-[8px]" : "text-[10px]";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (channelId) navigate(projectPath(`/channel/${channelId}`));
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`shrink-0 ${channelId ? "cursor-pointer" : ""}`}
            onClick={channelId ? handleClick : undefined}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className={`${px} rounded-full object-cover hover:ring-2 hover:ring-blue transition-all`}
              />
            ) : (
              <div
                className={`${px} ${textPx} rounded-full bg-elevated flex items-center justify-center text-dim font-mono font-bold uppercase`}
              >
                {name.slice(0, 2)}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span>{name}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatCard({
  value,
  label,
  color,
  topLabel,
  sub,
}: {
  value: string;
  label: string;
  color?: string;
  topLabel?: string;
  sub: string;
}) {
  return (
    <div className="bg-background px-5 py-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className={`text-2xl font-semibold font-mono tracking-tight ${color || ""}`}>
          {value}
        </span>
        {topLabel && <span className="text-[10px] text-dim font-mono">{topLabel}</span>}
      </div>
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{label}</div>
      {topLabel && <div className="h-0.5 bg-blue rounded-full mt-2 mb-1 w-1/3" />}
      <div className="text-[11px] text-dim font-mono mt-2 whitespace-pre">{sub}</div>
    </div>
  );
}

function ComparisonCard({
  label,
  value,
  sub,
  note,
  noteColor,
}: {
  label: string;
  value: string;
  sub: string;
  note: string;
  noteColor: string;
}) {
  return (
    <div className="bg-background px-5 py-4">
      <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight mb-1">{value}</div>
      <div className="text-[11px] text-dim font-mono mb-2">{sub}</div>
      <div className={`text-[11px] font-mono ${noteColor}`}>{note}</div>
    </div>
  );
}

// ─── Channel selector dropdown ────────────────────────────────────────────────

function ChannelDropdown({
  value,
  onChange,
  options,
  variant,
}: {
  value: ApiChannel | null;
  onChange: (ch: ApiChannel) => void;
  options: ApiChannel[];
  variant: "you" | "competitor";
}) {
  const [open, setOpen] = useState(false);
  const isYou = variant === "you";
  const label = value ? chName(value) : "—";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 text-[11px] font-mono px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
          isYou
            ? "text-blue bg-blue/10 border border-blue/30 hover:bg-blue/20"
            : "text-dim bg-transparent border border-border hover:text-sensor"
        }`}
      >
        {value?.avatarUrl && (
          <img src={value.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
        )}
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[220px]">
            {options.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  onChange(ch);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono hover:bg-surface/50 transition-colors text-left ${
                  ch.id === value?.id ? (isYou ? "text-blue" : "text-foreground") : "text-dim"
                }`}
              >
                {ch.avatarUrl ? (
                  <img src={ch.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-elevated shrink-0 flex items-center justify-center text-[8px] text-dim font-mono uppercase">
                    {chName(ch).slice(0, 2)}
                  </div>
                )}
                <span className="truncate">{chName(ch)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Channel Analysis section ─────────────────────────────────────────────────

function isOurs(c: ApiChannel) { return c.type === "ours"; }

function ChannelAnalysisSection({ channels }: { channels: ApiChannel[] }) {
  const ourChannels = channels.filter(isOurs);
  const competitorChannels = channels.filter((c) => !isOurs(c));

  const [yourCh, setYourCh] = useState<ApiChannel | null>(ourChannels[0] || null);
  const [theirCh, setTheirCh] = useState<ApiChannel | null>(competitorChannels[0] || null);

  if (!yourCh || !theirCh) {
    return (
      <div className="rounded-xl bg-background p-5">
        <p className="text-[13px] font-medium mb-1">Channel Analysis</p>
        <p className="text-[12px] text-dim font-mono leading-relaxed">
          {ourChannels.length === 0
            ? 'No "ours" channels found. Go to a Channel → panel → set Classification to "Ours", then click Refresh at the top of this page.'
            : 'No competitor channels found. Add competitor channels to enable head-to-head comparison.'}
        </p>
      </div>
    );
  }

  // Compute metrics for chosen pair
  const youSubs = parseInt(yourCh.subscribers);
  const theirSubs = parseInt(theirCh.subscribers);

  const youAvgViews =
    yourCh.videoCount > 0 ? Math.round(yourCh.periodViews / yourCh.videoCount) : 0;
  const theirAvgViews =
    theirCh.videoCount > 0 ? Math.round(theirCh.periodViews / theirCh.videoCount) : 0;

  const metrics = [
    {
      label: "Avg views / video",
      youVal: fmtNum(youAvgViews),
      theirVal: fmtNum(theirAvgViews),
      winning: youAvgViews >= theirAvgViews,
    },
    {
      label: "Upload rate",
      youVal: `${yourCh.uploadsPerMonth}/mo`,
      theirVal: `${theirCh.uploadsPerMonth}/mo`,
      winning: yourCh.uploadsPerMonth >= theirCh.uploadsPerMonth,
    },
    {
      label: "Engagement rate",
      youVal: `${yourCh.avgEngagement.toFixed(2)}%`,
      theirVal: `${theirCh.avgEngagement.toFixed(2)}%`,
      winning: yourCh.avgEngagement >= theirCh.avgEngagement,
    },
    {
      label: "Subscribers",
      youVal: fmtSubs(yourCh.subscribers),
      theirVal: fmtSubs(theirCh.subscribers),
      winning: youSubs >= theirSubs,
    },
  ];

  const winsCount = metrics.filter((m) => m.winning).length;
  const summary =
    winsCount >= 3
      ? "You are ahead on most metrics — maintain your lead"
      : winsCount === 2
      ? "Competitive — winning half the metrics"
      : "Behind on most metrics — clear action plan below";

  // Action plan: losing metrics first, then winning ones
  const losing = metrics.filter((m) => !m.winning);
  const winning = metrics.filter((m) => m.winning);

  return (
    <div className="rounded-xl bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold">Channel Analysis</span>
        <span className="text-[11px] font-mono text-dim">—</span>
        <ChannelDropdown value={yourCh} onChange={setYourCh} options={ourChannels} variant="you" />
        <span className="text-[11px] text-dim font-mono">vs</span>
        <ChannelDropdown
          value={theirCh}
          onChange={setTheirCh}
          options={competitorChannels}
          variant="competitor"
        />
      </div>

      {/* Summary */}
      <div className="mx-5 mb-4 px-4 py-3 border border-border rounded-xl">
        <p className="text-[13px] font-medium">{summary}</p>
        <p className="text-[11px] text-dim font-mono mt-1">
          {chName(yourCh)} vs {chName(theirCh)} · Winning {winsCount}/{metrics.length} metrics
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {metrics.map((m) => (
            <span
              key={m.label}
              className={`text-[10px] font-mono px-2 py-0.5 border rounded-full ${
                m.winning ? "text-success border-success/30" : "text-dim border-border"
              }`}
            >
              {m.winning ? "✓" : "↑"} {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Metric comparison table */}
      <div className="mx-5 mb-4 rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_120px_50px] gap-4 px-5 py-3 bg-surface/30 border-b border-border">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">METRIC</span>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={chName(yourCh)} avatarUrl={yourCh.avatarUrl} size="sm" />
            <span className="text-[10px] text-blue font-mono uppercase tracking-widest">You</span>
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={chName(theirCh)} avatarUrl={theirCh.avatarUrl} size="sm" />
            <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
              Competitor
            </span>
          </div>
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest text-right">
            STATUS
          </span>
        </div>
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={`grid grid-cols-[1fr_100px_120px_50px] gap-4 px-5 py-3.5 items-center ${
              i < metrics.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="text-[13px] font-medium">{m.label}</span>
            <span
              className={`text-[13px] font-mono font-semibold text-right ${
                m.winning ? "text-success" : "text-blue"
              }`}
            >
              {m.youVal}
            </span>
            <span className="text-[13px] font-mono text-dim text-right">{m.theirVal}</span>
            <div className="flex justify-end">
              {m.winning ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action Plan */}
      <div className="px-5 pb-5">
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
          ACTION PLAN — IN ORDER OF IMPACT
        </div>
        <div className="space-y-2">
          {losing.map((m, i) => (
            <div key={m.label} className="px-4 py-3 rounded-xl border border-border">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-blue/15 text-blue">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-semibold mb-1">{m.label}</p>
                  <p className="text-[12px] text-dim leading-relaxed">
                    Your {m.label.toLowerCase()} is {m.youVal} vs their {m.theirVal}. Close this
                    gap to compete more effectively.
                  </p>
                </div>
              </div>
            </div>
          ))}
          {winning.map((m) => (
            <div key={m.label} className="px-4 py-3 rounded-xl border border-success/30">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-success/15 text-success">
                  ✓
                </span>
                <div>
                  <p className="text-[13px] font-semibold mb-1">Already winning: {m.label}</p>
                  <p className="text-[12px] text-dim leading-relaxed">
                    You lead {m.youVal} vs {m.theirVal}. Maintain this advantage.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Monthly trend chart ───────────────────────────────────────────────────────

function TrendChart({
  trend,
  channels,
  trendTab,
}: {
  trend: TrendData;
  channels: ApiChannel[];
  trendTab: string;
}) {
  // For "Videos" tab we use upload count; for "Views" / "Likes" we aggregate per-month from videos
  const chMap = new Map(channels.map((c) => [c.id, c]));

  const getChannelMonthData = (trendCh: { id: string; data: number[] }) => {
    if (trendTab === "Videos") return trendCh.data;

    // For views/likes we need per-month data from video publishedAt
    const ch = chMap.get(trendCh.id);
    if (!ch) return trendCh.data.map(() => 0);

    return trend.months.map((label) => {
      return (ch.videos || [])
        .filter((v) => {
          if (!v.publishedAt) return false;
          const pd = new Date(v.publishedAt);
          const bucket = pd.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "Asia/Riyadh" });
          return bucket === label;
        })
        .reduce((sum, v) => {
          if (trendTab === "Views") return sum + v.viewCount;
          if (trendTab === "Likes") return sum + v.likeCount;
          return sum + 1;
        }, 0);
    });
  };

  const ourChannels = trend.channels.filter((c) => {
    const ch = chMap.get(c.id);
    return ch ? isOurs(ch) : false;
  });

  const competitorChannels = trend.channels.filter((c) => {
    const ch = chMap.get(c.id);
    return ch ? !isOurs(ch) : false;
  });

  // Build all series
  const ourSeries = ourChannels.map((c) => ({
    ...c,
    values: getChannelMonthData(c),
    ch: chMap.get(c.id),
  }));

  const compSeries = competitorChannels.map((c) => ({
    ...c,
    values: getChannelMonthData(c),
    ch: chMap.get(c.id),
  }));

  const allValues = [...ourSeries, ...compSeries].flatMap((s) => s.values);
  const maxVal = Math.max(...allValues, 1);

  const svgWidth = 900;
  const svgHeight = 280;
  const pad = { top: 20, right: 60, bottom: 50, left: 50 };
  const chartW = svgWidth - pad.left - pad.right;
  const chartH = svgHeight - pad.top - pad.bottom;
  const months = trend.months;

  const getX = (i: number) => pad.left + (i / Math.max(months.length - 1, 1)) * chartW;
  const getY = (v: number) => pad.top + chartH - (v / maxVal) * chartH;

  const makePath = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? "M" : "L"}${getX(i).toFixed(1)},${getY(v).toFixed(1)}`)
      .join(" ");

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxVal));

  if (months.length === 0) {
    return <p className="text-[12px] text-dim font-mono">No monthly data available.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full min-w-[700px]"
        style={{ height: "280px" }}
      >
        {/* Y axis lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              y1={getY(v)}
              x2={svgWidth - pad.right}
              y2={getY(v)}
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
            />
            <text
              x={pad.left - 8}
              y={getY(v) + 4}
              textAnchor="end"
              className="fill-dim"
              fontSize="10"
              fontFamily="monospace"
            >
              {trendTab === "Videos" ? v : fmtNum(v)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {months.map((m, i) => (
          <text
            key={m}
            x={getX(i)}
            y={svgHeight - 10}
            textAnchor="middle"
            className="fill-dim"
            fontSize="10"
            fontFamily="monospace"
          >
            {m}
          </text>
        ))}

        {/* Competitor lines */}
        {compSeries.map((c) => (
          <path
            key={c.id}
            d={makePath(c.values)}
            fill="none"
            stroke="hsl(var(--dim))"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
        ))}

        {/* Our channel lines */}
        {ourSeries.map((c) => (
          <g key={c.id}>
            <path d={makePath(c.values)} fill="none" stroke="hsl(var(--blue))" strokeWidth="2.5" />
            {c.values.map((v, i) => (
              <circle key={i} cx={getX(i)} cy={getY(v)} r="3" fill="hsl(var(--blue))" />
            ))}
          </g>
        ))}

        {/* YOU labels on right */}
        {ourSeries.map((c) => {
          const lastVal = c.values[c.values.length - 1] ?? 0;
          return (
            <text
              key={c.id}
              x={svgWidth - pad.right + 8}
              y={getY(lastVal) + 4}
              className="fill-blue"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="600"
            >
              YOU
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="text-[10px] text-blue font-mono uppercase tracking-widest">
          YOUR CHANNELS
        </span>
        {ourSeries.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 text-[11px] font-mono">
            <span className="w-3 h-0.5 bg-blue rounded-full inline-block" />
            <ChannelAvatar
              name={c.name}
              avatarUrl={c.ch?.avatarUrl}
              channelId={c.id}
              size="sm"
            />
          </span>
        ))}
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest ml-4">
          COMPETITORS
        </span>
        {compSeries.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 text-[11px] font-mono text-dim">
            <span className="w-3 h-0.5 bg-dim/40 rounded-full inline-block" />
            <ChannelAvatar
              name={c.name}
              avatarUrl={c.ch?.avatarUrl}
              channelId={c.id}
              size="sm"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();

  const [period, setPeriod] = useState("12m");
  const [fieldTab, setFieldTab] = useState<FieldTab>("Engagement");
  const [trendTab, setTrendTab] = useState("Videos");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);

  const fetchData = useCallback(
    async (p: string) => {
      if (!projectId) return;
      setLoading(true);
      try {
        const r = await fetch(`/api/analytics?projectId=${projectId}&period=${p}`, {
          credentials: "include",
        });
        if (!r.ok) throw new Error("Failed");
        const d: AnalyticsData = await r.json();
        setData(d);
      } catch {
        toast.error("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchData(period);
  }, [fetchData, period]);

  const handlePeriod = (p: string) => {
    setPeriod(p);
  };

  const handleRefresh = async () => {
    if (!projectId || flushing) return;
    setFlushing(true);
    try {
      await fetch("/api/analytics/flush-cache", { method: "POST", credentials: "include" });
      await fetchData(period);
      toast.success("Analytics refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setFlushing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <h1 className="text-sm font-semibold">Analytics</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <h1 className="text-sm font-semibold">Analytics</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-dim text-sm">No data available.</p>
        </div>
      </div>
    );
  }

  const { universe, channels, topVideos, trend } = data;

  // ── Stats bar derivations ─────────────────────────────────────────────────
  const ourChannels = channels.filter(isOurs);
  const competitorChannels = channels.filter((c) => !isOurs(c));

  const ourTotalSubs = ourChannels.reduce((s, c) => s + parseInt(c.subscribers), 0);
  const topBySubs = [...channels].sort((a, b) => parseInt(b.subscribers) - parseInt(a.subscribers))[0];
  const topByViews = [...channels].sort((a, b) => b.periodViews - a.periodViews)[0];
  const topByEngagement = [...channels].sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
  const topByUploads = [...channels].sort((a, b) => b.uploadsPerMonth - a.uploadsPerMonth)[0];

  const ourPeriodViews = ourChannels.reduce((s, c) => s + c.periodViews, 0);
  const ourAvgEngagement =
    ourChannels.length > 0
      ? ourChannels.reduce((s, c) => s + c.avgEngagement, 0) / ourChannels.length
      : 0;
  const ourUploadsPerMonth =
    ourChannels.length > 0
      ? ourChannels.reduce((s, c) => s + c.uploadsPerMonth, 0)
      : 0;
  const ourVideoCount = ourChannels.reduce((s, c) => s + c.videoCount, 0);
  const compVideoCount = competitorChannels.reduce((s, c) => s + c.videoCount, 0);

  // ── "You vs the Field" rankings ───────────────────────────────────────────
  const buildRankings = (tab: FieldTab) => {
    const entries = channels.map((ch) => {
      let rawVal = 0;
      let displayVal = "";
      if (tab === "Subscribers") {
        rawVal = parseInt(ch.subscribers);
        displayVal = fmtSubs(ch.subscribers);
      } else if (tab === "Engagement") {
        rawVal = ch.avgEngagement;
        displayVal = `${ch.avgEngagement.toFixed(2)}%`;
      } else if (tab === "Views") {
        rawVal = parseInt(ch.totalViews);
        displayVal = fmtNum(parseInt(ch.totalViews));
      } else {
        rawVal = ch.uploadsPerMonth;
        displayVal = `${ch.uploadsPerMonth}/mo`;
      }
      return {
        id: ch.id,
        name: chName(ch),
        avatarUrl: ch.avatarUrl,
        isYou: isOurs(ch),
        rawVal,
        value: displayVal,
      };
    });

    return entries
      .sort((a, b) => b.rawVal - a.rawVal)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  };

  const rankings = buildRankings(fieldTab);

  // Engagement rank of our combined channels
  const ourEngagementRank = rankings.findIndex((r) => r.isYou) + 1 || rankings.length;

  // ── Comparison cards ──────────────────────────────────────────────────────
  const engRanks = buildRankings("Engagement");
  const firstOurEngIdx = engRanks.findIndex((r) => r.isYou);
  const engRank = firstOurEngIdx >= 0 ? firstOurEngIdx + 1 : engRanks.length;

  const subRanks = buildRankings("Subscribers");
  const firstOurSubIdx = subRanks.findIndex((r) => r.isYou);
  const subRank = firstOurSubIdx >= 0 ? firstOurSubIdx + 1 : subRanks.length;

  const marketAvgEng =
    channels.length > 0
      ? channels.reduce((s, c) => s + c.avgEngagement, 0) / channels.length
      : 0;

  const viewRanks = buildRankings("Views");
  const topViewCh = viewRanks[0];
  const firstOurViewIdx = viewRanks.findIndex((r) => r.isYou);
  const ourTopViews = firstOurViewIdx >= 0 ? viewRanks[firstOurViewIdx] : null;
  const viewsMultiplier =
    topViewCh && ourTopViews && ourTopViews.rawVal > 0
      ? `×${Math.round(topViewCh.rawVal / ourTopViews.rawVal)}`
      : "×∞";

  // ── Benchmark categories ───────────────────────────────────────────────────
  const buildBenchmark = (label: string, tab: FieldTab) => ({
    label,
    items: buildRankings(tab).map((r) => ({
      rank: r.rank,
      name: r.name,
      avatarUrl: r.avatarUrl,
      channelId: r.id,
      value: r.value,
      isYou: r.isYou,
    })),
  });

  const benchmarks = [
    buildBenchmark("SUBSCRIBERS", "Subscribers"),
    buildBenchmark("TOTAL VIDEO VIEWS", "Views"),
    buildBenchmark("AVG ENGAGEMENT RATE", "Engagement"),
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Analytics</h1>
          <span className="text-[11px] text-dim font-mono">
            {universe.channels} channels tracked
          </span>
          <button
            onClick={handleRefresh}
            disabled={flushing}
            className="inline-flex items-center gap-1 text-[11px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50"
            title="Bust cache and reload"
          >
            <RotateCw className={`w-3 h-3 ${flushing ? "animate-spin" : ""}`} />
            {flushing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          {PERIOD_TABS.map((t) => (
            <button
              key={t}
              onClick={() => handlePeriod(t)}
              className={`px-3 py-1 text-[11px] font-mono rounded-full transition-colors ${
                period === t ? "bg-surface text-foreground" : "text-dim hover:text-sensor"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Stats row */}
        <div className="px-6 pt-5 max-lg:px-4 mb-5">
          <div className="grid grid-cols-6 max-lg:grid-cols-3 rounded-xl overflow-hidden gap-[1px] bg-border">
            <StatCard
              value={String(universe.channels)}
              label="CHANNELS"
              sub={`${universe.owned} owned   ${universe.competitors} competitors`}
            />
            <StatCard
              value={fmtNum(parseInt(topBySubs?.subscribers || "0"))}
              label="TOP SUBSCRIBERS"
              color="text-success"
              topLabel={`${topBySubs ? chName(topBySubs).slice(0, 10) : "—"} ▲`}
              sub={`yours ${fmtNum(ourTotalSubs)}   top ${fmtNum(parseInt(topBySubs?.subscribers || "0"))}`}
            />
            <StatCard
              value={fmtNum(topByViews?.periodViews || 0)}
              label="TOP PERIOD VIEWS"
              color="text-purple"
              topLabel={`${topByViews ? chName(topByViews).slice(0, 10) : "—"} ▲`}
              sub={`yours ${fmtNum(ourPeriodViews)}   top ${fmtNum(topByViews?.periodViews || 0)}`}
            />
            <StatCard
              value={String(universe.videosTracked)}
              label="VIDEOS TRACKED"
              sub={`${ourVideoCount} owned   ${compVideoCount} competitors`}
            />
            <StatCard
              value={`${universe.avgEngagement.toFixed(2)}%`}
              label="AVG ENGAGEMENT"
              color="text-success"
              topLabel={`${topByEngagement ? chName(topByEngagement).slice(0, 10) : "—"} ▲`}
              sub={`yours ${ourAvgEngagement.toFixed(2)}%   top ${topByEngagement?.avgEngagement.toFixed(2) || "—"}%`}
            />
            <StatCard
              value={`${universe.avgUploads}`}
              label="UPLOADS / MONTH"
              color="text-blue"
              topLabel={`${topByUploads ? chName(topByUploads).slice(0, 10) : "—"} ▲`}
              sub={`yours ${ourUploadsPerMonth.toFixed(1)}/mo   top ${topByUploads?.uploadsPerMonth || "—"}/mo`}
            />
          </div>
        </div>

        {/* You vs the Field */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-orange" />
                <span className="text-[13px] font-semibold">You vs the Field</span>
                <span className="text-[11px] text-dim font-mono">
                  — {ourChannels.length} your channel{ourChannels.length !== 1 ? "s" : ""} vs{" "}
                  {competitorChannels.length} competitor{competitorChannels.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                {FIELD_TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFieldTab(t)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors border ${
                      fieldTab === t
                        ? "bg-surface text-foreground border-border"
                        : "bg-transparent text-dim border-transparent hover:text-sensor"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison cards */}
            <div className="grid grid-cols-4 max-lg:grid-cols-2 gap-[1px] bg-border mx-5 mb-4 rounded-xl overflow-hidden">
              <ComparisonCard
                label="ENGAGEMENT RANK"
                value={`#${engRank}`}
                sub={`out of ${channels.length} channels`}
                note={engRank <= Math.ceil(channels.length / 2) ? "↑ Above half the field" : "→ Room to improve"}
                noteColor={engRank <= Math.ceil(channels.length / 2) ? "text-success" : "text-orange"}
              />
              <ComparisonCard
                label="SUBSCRIBER RANK"
                value={`#${subRank}`}
                sub={`out of ${channels.length} channels`}
                note={subRank === channels.length ? "→ Most room to grow" : subRank <= 3 ? "↑ Top 3" : "→ Building"}
                noteColor={subRank <= 3 ? "text-success" : "text-orange"}
              />
              <ComparisonCard
                label="YOUR ENGAGEMENT"
                value={`${ourAvgEngagement.toFixed(2)}%`}
                sub={`market avg ${marketAvgEng.toFixed(2)}%`}
                note={ourAvgEngagement >= marketAvgEng ? "↑ Above market average" : "→ Below market average"}
                noteColor={ourAvgEngagement >= marketAvgEng ? "text-success" : "text-orange"}
              />
              <ComparisonCard
                label="VIEWS GAP VS #1"
                value={viewsMultiplier}
                sub={`${topViewCh ? topViewCh.name.slice(0, 18) : "—"} leads`}
                note="→ Reach is the gap, not quality"
                noteColor="text-orange"
              />
            </div>

            {/* Rankings bar chart */}
            <div className="px-5 pb-5">
              {rankings.map((entry) => {
                const maxRaw = rankings[0]?.rawVal || 1;
                return (
                  <div key={entry.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`w-6 text-right text-[12px] font-mono shrink-0 ${
                        entry.isYou ? "text-blue" : "text-dim"
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <ChannelAvatar
                      name={entry.name}
                      avatarUrl={entry.avatarUrl}
                      channelId={entry.id}
                    />
                    {entry.isYou && (
                      <span className="text-[10px] text-blue font-mono shrink-0">YOU</span>
                    )}
                    <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${entry.isYou ? "bg-blue" : "bg-dim/40"}`}
                        style={{ width: `${getBarWidth(entry.rawVal, maxRaw)}%` }}
                      />
                    </div>
                    <span
                      className={`text-[12px] font-mono shrink-0 w-16 text-right ${
                        entry.isYou ? "text-blue" : "text-dim"
                      }`}
                    >
                      {entry.value}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Insight footer */}
            {rankings.length > 0 && (
              <div className="px-5 py-4 border-t border-border">
                <div className="flex items-start gap-2">
                  <span className="text-blue mt-0.5">↑</span>
                  <div>
                    <p className="text-[13px] font-medium">
                      {engRank <= Math.ceil(channels.length / 2)
                        ? "You are competitive on engagement — this is your foundation"
                        : "Focus on engagement — it's your fastest lever for growth"}
                    </p>
                    <p className="text-[12px] text-dim mt-1">
                      Your engagement is {ourAvgEngagement.toFixed(2)}% vs market average of{" "}
                      {marketAvgEng.toFixed(2)}%.{" "}
                      {topByEngagement
                        ? `${chName(topByEngagement)} leads at ${topByEngagement.avgEngagement.toFixed(2)}%.`
                        : ""}{" "}
                      The gap to close is reach, not quality.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Channel Analysis */}
        <div className="px-6 max-lg:px-4 mb-5">
          <ChannelAnalysisSection channels={channels} />
        </div>

        {/* Channel Benchmarks */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2">
              <Circle className="w-3.5 h-3.5 text-blue fill-blue" />
              <span className="text-[13px] font-semibold">Channel Benchmarks</span>
            </div>
            <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-[1px] bg-border">
              {benchmarks.map((cat) => (
                <div key={cat.label} className="bg-background px-5 py-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
                    {cat.label}
                  </div>
                  {cat.items.map((item) => (
                    <div
                      key={item.rank}
                      className="flex items-center justify-between py-2 -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-[11px] font-mono w-5 text-right ${
                            item.isYou ? "text-blue" : "text-dim"
                          }`}
                        >
                          {item.rank}
                        </span>
                        <ChannelAvatar
                          name={item.name}
                          avatarUrl={item.avatarUrl}
                          channelId={item.channelId}
                          size="sm"
                        />
                      </div>
                      <span
                        className={`text-[12px] font-mono ${
                          item.isYou ? "text-blue" : "text-dim"
                        }`}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold">Monthly Trend — Last 12 Months</span>
                <span className="text-[11px] text-blue font-mono px-2 py-0.5 border border-blue/30 rounded-full">
                  — blue = your channels
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                {TREND_TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTrendTab(t)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors border ${
                      trendTab === t
                        ? "bg-surface text-foreground border-border"
                        : "bg-transparent text-dim border-transparent hover:text-sensor"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5">
              <TrendChart trend={trend} channels={channels} trendTab={trendTab} />
            </div>
          </div>
        </div>

        {/* Top Videos */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Top Videos by Views</span>
              <span className="text-[11px] text-dim font-mono">
                across all tracked channels · {period}
              </span>
            </div>
            {topVideos.length === 0 ? (
              <p className="px-5 pb-5 text-[12px] text-dim font-mono">
                No video data in this period.
              </p>
            ) : (
              topVideos.map((v) => (
                <div
                  key={v.id}
                  className="group flex items-center gap-5 px-5 py-3.5 border-t border-border hover:bg-surface/30 transition-colors cursor-pointer"
                  onClick={() => navigate(projectPath(`/video/${v.id}`))}
                >
                  <span className="text-[12px] text-dim font-mono w-6 text-right shrink-0">
                    {v.rank}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate group-hover:opacity-80 transition-opacity">
                      {v.title}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <ChannelAvatar
                    name={v.channelName}
                    avatarUrl={v.avatarUrl}
                    channelId={v.channelId}
                    size="sm"
                  />
                  <span className="text-[13px] font-mono text-dim shrink-0 w-16 text-right">
                    {v.views}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Derived Key Insights */}
        <div className="px-6 max-lg:px-4 mb-8">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <span className="text-[13px] font-semibold">Key Insights</span>
              <span className="text-[11px] text-dim font-mono px-2 py-0.5 border border-border rounded-full">
                derived from real data
              </span>
            </div>
            {buildInsights(channels, universe).map((insight, i) => (
              <div key={i} className="px-5 py-4 border-t border-border">
                <div className="flex items-start gap-3">
                  <span
                    className={`text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5 ${insight.color}`}
                  >
                    {insight.type}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium mb-1">{insight.title}</p>
                    <p className="text-[12px] text-dim leading-relaxed">{insight.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Key Insights derived from real data ──────────────────────────────────────

function buildInsights(channels: ApiChannel[], universe: Universe) {
  const insights: { type: string; color: string; title: string; description: string }[] = [];

  const sorted = [...channels].sort((a, b) => b.avgEngagement - a.avgEngagement);
  const topEngCh = sorted[0];
  const bottomEngCh = sorted[sorted.length - 1];
  const ourChannels = channels.filter((c) => c.type === "ours");
  const competitors = channels.filter((c) => !isOurs(c));

  // Top engagement insight
  if (topEngCh) {
    insights.push({
      type: "EFFICIENCY",
      color: "text-purple bg-purple/10",
      title: `${chName(topEngCh)} leads engagement at ${topEngCh.avgEngagement.toFixed(2)}%`,
      description: `With ${fmtNum(parseInt(topEngCh.subscribers))} subscribers they drive the highest engagement in the field. ${
        topEngCh.uploadsPerMonth > 0
          ? `They upload ${topEngCh.uploadsPerMonth}/mo.`
          : ""
      } Content depth is the driver — study their format.`,
    });
  }

  // Fastest uploader
  const fastestUploader = [...channels].sort((a, b) => b.uploadsPerMonth - a.uploadsPerMonth)[0];
  if (fastestUploader && fastestUploader.uploadsPerMonth > 0) {
    const isUs = fastestUploader.type === "ours";
    insights.push({
      type: isUs ? "MARKET" : "THREAT",
      color: isUs ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
      title: `${chName(fastestUploader)} uploads fastest at ${fastestUploader.uploadsPerMonth}/mo`,
      description: isUs
        ? "Your channel leads on upload frequency — consistency compounds over months. Maintain this cadence."
        : `A competitor is uploading faster than anyone in the field. Volume + reach is a compounding advantage — watch their output closely.`,
    });
  }

  // Reach gap
  const topViewsCh = [...channels].sort((a, b) => parseInt(b.totalViews) - parseInt(a.totalViews))[0];
  const ourTopViewsCh = ourChannels.sort((a, b) => parseInt(b.totalViews) - parseInt(a.totalViews))[0];
  if (topViewsCh && ourTopViewsCh && topViewsCh.id !== ourTopViewsCh.id) {
    const mult = parseInt(ourTopViewsCh.totalViews) > 0
      ? Math.round(parseInt(topViewsCh.totalViews) / parseInt(ourTopViewsCh.totalViews))
      : "∞";
    insights.push({
      type: "OPPORTUNITY",
      color: "text-orange bg-orange/10",
      title: `Reach gap: ${chName(topViewsCh)} has ×${mult} more total views`,
      description: `${chName(topViewsCh)} has ${fmtNum(parseInt(topViewsCh.totalViews))} total views vs your ${fmtNum(parseInt(ourTopViewsCh.totalViews))}. The gap is subscriber base, not content quality. Engagement parity means your content is there — distribution is the lever.`,
    });
  }

  // Low engagement competitor — opportunity
  if (bottomEngCh && !isOurs(bottomEngCh) && bottomEngCh.avgEngagement < 3) {
    insights.push({
      type: "SIGNAL",
      color: "text-orange bg-orange/10",
      title: `${chName(bottomEngCh)} has low engagement at ${bottomEngCh.avgEngagement.toFixed(2)}% — their audience is underserved`,
      description: `Despite ${fmtNum(parseInt(bottomEngCh.subscribers))} subscribers, their engagement is below 3%. Their audience is watching but not reacting. Channels that engage better in this space can pull viewers away.`,
    });
  }

  // Overall market summary
  insights.push({
    type: "MARKET",
    color: "text-success bg-success/10",
    title: `${universe.channels} channels tracked · ${universe.videosTracked} videos · avg ${universe.avgEngagement.toFixed(2)}% engagement`,
    description: `The field spans ${fmtNum(universe.totalSubscribers)} total subscribers across all channels. Average uploads are ${universe.avgUploads}/mo. Your channels produce ${ourChannels.length > 0 ? ourChannels.reduce((s, c) => s + c.videoCount, 0) : 0} videos in this period across ${ourChannels.length} channel${ourChannels.length !== 1 ? "s" : ""}.`,
  });

  return insights;
}
