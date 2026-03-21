import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  Star, Circle, CheckCircle, XCircle, ChevronDown, ArrowUpRight,
  Loader2, RotateCw, TrendingUp, TrendingDown, BarChart3, Layers,
  MessageSquare, ThumbsUp, Calendar,
} from "lucide-react";
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
  duration: string | null;
  videoType: string;
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
  channels: { id: string; name: string; type: string; data: number[]; viewData?: number[]; likeData?: number[] }[];
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

interface EngagementBreakdownEntry {
  channelId: string;
  name: string;
  type: string;
  likes: number;
  comments: number;
  views: number;
  likeRate: number;
  commentRate: number;
}

interface PublishingPatternEntry {
  channelId: string;
  name: string;
  type: string;
  dayOfWeek: number[];
  hourOfDay: number[];
}

interface PerformanceDistribution {
  total: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
  buckets: { label: string; count: number }[];
}

interface AnalyticsData {
  universe: Universe;
  channels: ApiChannel[];
  topVideos: TopVideo[];
  trend: TrendData;
  growth: Record<string, GrowthSnapshot[]>;
  contentMix: ContentMixEntry[];
  engagementBreakdown: EngagementBreakdownEntry[];
  publishingPatterns: PublishingPatternEntry[];
  performanceDistribution: PerformanceDistribution;
}

type FieldTab = "Subscribers" | "Engagement" | "Views" | "Upload rate";

const PERIOD_TABS = ["30d", "90d", "12m"];
const FIELD_TABS: FieldTab[] = ["Subscribers", "Engagement", "Views", "Upload rate"];
const TREND_TABS = ["Videos", "Views", "Likes"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
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

function isOurs(c: ApiChannel) { return c.type === "ours"; }

function pctChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return newVal > 0 ? 100 : 0;
  return ((newVal - oldVal) / oldVal) * 100;
}

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
  const channelPath = useChannelPath();
  const px = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const textPx = size === "sm" ? "text-[8px]" : "text-[10px]";

  const Wrapper = channelId ? Link : "div";
  const wrapperProps = channelId
    ? { to: channelPath(`/channel/${channelId}`), onClick: (e: React.MouseEvent) => e.stopPropagation() }
    : {};

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Wrapper
            className={`shrink-0 no-underline ${channelId ? "cursor-pointer" : ""}`}
            {...(wrapperProps as any)}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className={`${px} rounded-full object-cover hover:ring-2 hover:ring-blue transition-all`}
              />
            ) : (
              <div
                className={`${px} ${textPx} rounded-full bg-card flex items-center justify-center text-muted-foreground font-mono font-bold uppercase`}
              >
                {name.slice(0, 2)}
              </div>
            )}
          </Wrapper>
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
        {topLabel && <span className="text-[10px] text-muted-foreground font-mono">{topLabel}</span>}
      </div>
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{label}</div>
      {topLabel && <div className="h-0.5 bg-blue rounded-full mt-2 mb-1 w-1/3" />}
      <div className="text-[11px] text-muted-foreground font-mono mt-2 whitespace-pre">{sub}</div>
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
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-2">{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight mb-1">{value}</div>
      <div className="text-[11px] text-muted-foreground font-mono mb-2">{sub}</div>
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
            : "text-muted-foreground bg-transparent border border-border hover:text-muted-foreground"
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
          <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
            {options.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  onChange(ch);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono hover:bg-card/50 transition-colors text-left ${
                  ch.id === value?.id ? (isYou ? "text-blue" : "text-foreground") : "text-muted-foreground"
                }`}
              >
                {ch.avatarUrl ? (
                  <img src={ch.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-card shrink-0 flex items-center justify-center text-[8px] text-muted-foreground font-mono uppercase">
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

// ─── Growth & Momentum section ────────────────────────────────────────────────

function GrowthMomentumSection({
  channels,
  growth,
}: {
  channels: ApiChannel[];
  growth: Record<string, GrowthSnapshot[]>;
}) {
  const channelGrowth = useMemo(() => {
    return channels
      .map((ch) => {
        const snaps = growth[ch.id] || [];
        if (snaps.length < 2) return null;
        const first = snaps[0];
        const last = snaps[snaps.length - 1];
        const subGrowth = pctChange(first.subscribers, last.subscribers);
        const viewGrowth = pctChange(first.totalViews, last.totalViews);
        const engDelta = last.engagement - first.engagement;
        const subDelta = last.subscribers - first.subscribers;
        const viewDelta = last.totalViews - first.totalViews;
        return {
          ch,
          snaps,
          subGrowth,
          viewGrowth,
          engDelta,
          subDelta,
          viewDelta,
          momentum: subGrowth + viewGrowth,
        };
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];
  }, [channels, growth]);

  if (channelGrowth.length === 0) {
    return (
      <div className="rounded-lg bg-background p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-success" />
          <span className="text-[13px] font-semibold">Growth & Momentum</span>
        </div>
        <p className="text-[12px] text-muted-foreground font-mono">
          No historical snapshots yet. Growth tracking starts once channel data is collected over time.
        </p>
      </div>
    );
  }

  const sorted = [...channelGrowth].sort((a, b) => b.momentum - a.momentum);
  const accelerating = sorted.filter((c) => c.momentum > 5);
  const declining = sorted.filter((c) => c.momentum < -5);

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <TrendingUp className="w-4 h-4 text-success" />
        <span className="text-[13px] font-semibold">Growth & Momentum</span>
        <span className="text-[11px] text-muted-foreground font-mono">— who's growing, who's stalling</span>
      </div>

      {/* Growth summary cards */}
      {(accelerating.length > 0 || declining.length > 0) && (
        <div className="mx-5 mb-4 grid grid-cols-2 max-lg:grid-cols-1 gap-3">
          {accelerating.length > 0 && (
            <div className="px-4 py-3 rounded-lg border border-success/30 bg-success/5">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
                <span className="text-[10px] font-mono text-success uppercase tracking-widest">
                  Accelerating ({accelerating.length})
                </span>
              </div>
              {accelerating.slice(0, 3).map((g) => (
                <div key={g.ch.id} className="flex items-center gap-2 py-1.5">
                  <ChannelAvatar name={chName(g.ch)} avatarUrl={g.ch.avatarUrl} channelId={g.ch.id} size="sm" />
                  <span className="text-[12px] font-medium flex-1 truncate">{chName(g.ch)}</span>
                  <span className="text-[11px] font-mono text-success">
                    +{g.subGrowth.toFixed(1)}% subs
                  </span>
                </div>
              ))}
            </div>
          )}
          {declining.length > 0 && (
            <div className="px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                <span className="text-[10px] font-mono text-destructive uppercase tracking-widest">
                  Slowing ({declining.length})
                </span>
              </div>
              {declining.slice(0, 3).map((g) => (
                <div key={g.ch.id} className="flex items-center gap-2 py-1.5">
                  <ChannelAvatar name={chName(g.ch)} avatarUrl={g.ch.avatarUrl} channelId={g.ch.id} size="sm" />
                  <span className="text-[12px] font-medium flex-1 truncate">{chName(g.ch)}</span>
                  <span className="text-[11px] font-mono text-destructive">
                    {g.subGrowth.toFixed(1)}% subs
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-channel growth table */}
      <div className="mx-5 mb-4 rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_90px_90px] gap-4 px-5 py-3 bg-card/30 border-b border-border">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">CHANNEL</span>
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-right">SUB GROWTH</span>
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-right">VIEW GROWTH</span>
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-right">ENG Δ</span>
        </div>
        {sorted.map((g, i) => (
          <div
            key={g.ch.id}
            className={`grid grid-cols-[1fr_90px_90px_90px] gap-4 px-5 py-3 items-center ${
              i < sorted.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ChannelAvatar name={chName(g.ch)} avatarUrl={g.ch.avatarUrl} channelId={g.ch.id} size="sm" />
              <span className={`text-[12px] font-medium truncate ${isOurs(g.ch) ? "text-blue" : ""}`}>
                {chName(g.ch)}
              </span>
              {isOurs(g.ch) && <span className="text-[9px] text-blue font-mono shrink-0">YOU</span>}
            </div>
            <span className={`text-[12px] font-mono text-right ${g.subGrowth >= 0 ? "text-success" : "text-destructive"}`}>
              {g.subGrowth >= 0 ? "+" : ""}{g.subGrowth.toFixed(1)}%
            </span>
            <span className={`text-[12px] font-mono text-right ${g.viewGrowth >= 0 ? "text-success" : "text-destructive"}`}>
              {g.viewGrowth >= 0 ? "+" : ""}{g.viewGrowth.toFixed(1)}%
            </span>
            <span className={`text-[12px] font-mono text-right ${g.engDelta >= 0 ? "text-success" : "text-destructive"}`}>
              {g.engDelta >= 0 ? "+" : ""}{g.engDelta.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Content Mix section (Videos vs Shorts) ───────────────────────────────────

function ContentMixSection({
  channels,
  contentMix,
}: {
  channels: ApiChannel[];
  contentMix: ContentMixEntry[];
}) {
  const chMap = new Map(channels.map((c) => [c.id, c]));
  const mixWithNames = contentMix.map((m) => ({ ...m, ch: chMap.get(m.channelId) })).filter((m) => m.ch);
  const totalVideos = mixWithNames.reduce((s, m) => s + m.videos.count, 0);
  const totalShorts = mixWithNames.reduce((s, m) => s + m.shorts.count, 0);
  const totalVideoViews = mixWithNames.reduce((s, m) => s + m.videos.views, 0);
  const totalShortViews = mixWithNames.reduce((s, m) => s + m.shorts.views, 0);

  if (totalShorts === 0 && totalVideos === 0) return null;

  const videoPct = totalVideos + totalShorts > 0 ? (totalVideos / (totalVideos + totalShorts)) * 100 : 0;
  const videoViewPct = totalVideoViews + totalShortViews > 0
    ? (totalVideoViews / (totalVideoViews + totalShortViews)) * 100
    : 0;

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Layers className="w-4 h-4 text-purple" />
        <span className="text-[13px] font-semibold">Content Mix</span>
        <span className="text-[11px] text-muted-foreground font-mono">— long-form vs shorts performance</span>
      </div>

      <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-[1px] bg-border mx-5 mb-4 rounded-lg overflow-hidden">
        <div className="bg-background px-5 py-4">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">LONG-FORM VIDEOS</div>
          <div className="text-2xl font-semibold font-mono tracking-tight text-purple">{totalVideos}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-1">
            {fmtNum(totalVideoViews)} total views · {totalVideos > 0 ? fmtNum(Math.round(totalVideoViews / totalVideos)) : "0"} avg/video
          </div>
          <div className="h-1.5 bg-card rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-purple rounded-full" style={{ width: `${videoPct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">{videoPct.toFixed(0)}% of content</div>
        </div>
        <div className="bg-background px-5 py-4">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">SHORTS</div>
          <div className="text-2xl font-semibold font-mono tracking-tight text-orange">{totalShorts}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-1">
            {fmtNum(totalShortViews)} total views · {totalShorts > 0 ? fmtNum(Math.round(totalShortViews / totalShorts)) : "0"} avg/short
          </div>
          <div className="h-1.5 bg-card rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-orange rounded-full" style={{ width: `${100 - videoPct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">{(100 - videoPct).toFixed(0)}% of content</div>
        </div>
      </div>

      {/* Insight */}
      {totalShorts > 0 && totalVideos > 0 && (
        <div className="px-5 pb-4">
          <div className="px-4 py-3 rounded-lg border border-border">
            <p className="text-[12px] font-medium">
              {videoViewPct > 80
                ? "Long-form drives the vast majority of views — shorts are supplementary in this space"
                : videoViewPct > 60
                ? "Long-form still dominates views, but shorts are gaining traction"
                : "Shorts are pulling significant views — consider increasing short-form output"}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono mt-1">
              Videos: {videoViewPct.toFixed(0)}% of views from {videoPct.toFixed(0)}% of content ·
              Shorts: {(100 - videoViewPct).toFixed(0)}% of views from {(100 - videoPct).toFixed(0)}% of content
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Engagement Decomposition section ─────────────────────────────────────────

function EngagementDecompositionSection({
  breakdown,
}: {
  breakdown: EngagementBreakdownEntry[];
}) {
  if (breakdown.length === 0) return null;

  const sorted = [...breakdown].sort((a, b) => (b.likeRate + b.commentRate) - (a.likeRate + a.commentRate));
  const maxRate = Math.max(...sorted.map((e) => e.likeRate + e.commentRate), 0.01);
  const avgCommentRate = breakdown.reduce((s, e) => s + e.commentRate, 0) / breakdown.length;
  const avgLikeRate = breakdown.reduce((s, e) => s + e.likeRate, 0) / breakdown.length;

  const highCommenters = sorted.filter((e) => e.commentRate > avgCommentRate * 1.3);
  const highLikers = sorted.filter((e) => e.likeRate > avgLikeRate * 1.3 && e.commentRate < avgCommentRate);

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <MessageSquare className="w-4 h-4 text-blue" />
        <span className="text-[13px] font-semibold">Engagement Breakdown</span>
        <span className="text-[11px] text-muted-foreground font-mono">— likes vs comments per channel</span>
      </div>

      <div className="px-5 pb-4 space-y-2.5">
        {sorted.map((entry) => {
          const total = entry.likeRate + entry.commentRate;
          const likeWidth = total > 0 ? (entry.likeRate / maxRate) * 100 : 0;
          const commentWidth = total > 0 ? (entry.commentRate / maxRate) * 100 : 0;
          const isUs = entry.type === "ours";
          return (
            <div key={entry.channelId} className="flex items-center gap-3">
              <div className="w-32 shrink-0 flex items-center gap-2 min-w-0">
                <span className={`text-[11px] font-mono truncate ${isUs ? "text-blue" : "text-muted-foreground"}`}>
                  {entry.name}
                </span>
                {isUs && <span className="text-[8px] text-blue font-mono shrink-0">YOU</span>}
              </div>
              <div className="flex-1 flex gap-0.5 h-3">
                <div
                  className="bg-blue rounded-l-full h-full transition-all"
                  style={{ width: `${likeWidth}%` }}
                  title={`Likes: ${entry.likeRate.toFixed(3)}%`}
                />
                <div
                  className="bg-orange rounded-r-full h-full transition-all"
                  style={{ width: `${commentWidth}%` }}
                  title={`Comments: ${entry.commentRate.toFixed(3)}%`}
                />
              </div>
              <div className="w-28 shrink-0 text-right">
                <span className="text-[10px] font-mono text-blue">{entry.likeRate.toFixed(2)}%</span>
                <span className="text-[10px] font-mono text-muted-foreground mx-1">·</span>
                <span className="text-[10px] font-mono text-orange">{entry.commentRate.toFixed(2)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend + insight */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-mono">
            <ThumbsUp className="w-3 h-3 text-blue" /> <span className="text-blue">Like rate</span>
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-mono">
            <MessageSquare className="w-3 h-3 text-orange" /> <span className="text-orange">Comment rate</span>
          </span>
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">
            field avg: {avgLikeRate.toFixed(2)}% likes · {avgCommentRate.toFixed(3)}% comments
          </span>
        </div>
        {highCommenters.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            <span className="text-orange font-medium">High comment engagement:</span>{" "}
            {highCommenters.map((e) => e.name).join(", ")} — audiences that comment are deeply invested. Study their CTAs.
          </p>
        )}
        {highLikers.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="text-blue font-medium">Like-heavy, low comments:</span>{" "}
            {highLikers.map((e) => e.name).join(", ")} — passive approval without discussion. Content entertains but doesn't provoke.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Publishing Patterns section ──────────────────────────────────────────────

function PublishingPatternsSection({
  patterns,
}: {
  patterns: PublishingPatternEntry[];
}) {
  if (patterns.length === 0) return null;

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ourPatterns = patterns.filter((p) => p.type === "ours");
  const compPatterns = patterns.filter((p) => p.type !== "ours");

  const aggregateDays = (arr: PublishingPatternEntry[]) => {
    const agg = [0, 0, 0, 0, 0, 0, 0];
    arr.forEach((p) => p.dayOfWeek.forEach((v, i) => (agg[i] += v)));
    return agg;
  };

  const aggregateHours = (arr: PublishingPatternEntry[]) => {
    const agg = new Array(24).fill(0);
    arr.forEach((p) => p.hourOfDay.forEach((v, i) => (agg[i] += v)));
    return agg;
  };

  const ourDays = aggregateDays(ourPatterns);
  const compDays = aggregateDays(compPatterns);
  const allDays = aggregateDays(patterns);
  const maxDayVal = Math.max(...allDays, 1);

  const allHours = aggregateHours(patterns);
  const maxHourVal = Math.max(...allHours, 1);

  const peakDay = DAY_LABELS[allDays.indexOf(Math.max(...allDays))];
  const peakHour = allHours.indexOf(Math.max(...allHours));
  const peakHourLabel = `${peakHour}:00–${peakHour + 1}:00`;

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Calendar className="w-4 h-4 text-orange" />
        <span className="text-[13px] font-semibold">Publishing Patterns</span>
        <span className="text-[11px] text-muted-foreground font-mono">— when the field publishes (Riyadh time)</span>
      </div>

      <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-5 px-5 pb-5">
        {/* Day of week */}
        <div>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">DAY OF WEEK</div>
          <div className="space-y-2">
            {DAY_LABELS.map((day, i) => (
              <div key={day} className="flex items-center gap-2">
                <span className="text-[11px] font-mono w-8 text-muted-foreground">{day}</span>
                <div className="flex-1 flex gap-0.5 h-2.5">
                  {ourPatterns.length > 0 && (
                    <div
                      className="bg-blue rounded-l-sm h-full"
                      style={{ width: `${(ourDays[i] / maxDayVal) * 100}%` }}
                    />
                  )}
                  <div
                    className="bg-dim/30 rounded-r-sm h-full"
                    style={{ width: `${(compDays[i] / maxDayVal) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{allDays[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hour of day */}
        <div>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">HOUR OF DAY</div>
          <div className="flex items-end gap-[2px] h-20">
            {allHours.map((count, hr) => (
              <div
                key={hr}
                className="flex-1 rounded-t-sm bg-blue/60 hover:bg-blue transition-colors"
                style={{ height: `${(count / maxHourVal) * 100}%`, minHeight: count > 0 ? "2px" : "0" }}
                title={`${hr}:00 — ${count} videos`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-mono text-muted-foreground">0:00</span>
            <span className="text-[9px] font-mono text-muted-foreground">6:00</span>
            <span className="text-[9px] font-mono text-muted-foreground">12:00</span>
            <span className="text-[9px] font-mono text-muted-foreground">18:00</span>
            <span className="text-[9px] font-mono text-muted-foreground">23:00</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          Peak publishing: <span className="text-foreground font-medium">{peakDay}</span> at{" "}
          <span className="text-foreground font-medium">{peakHourLabel}</span> Riyadh time.
          {ourPatterns.length > 0 && " Consider aligning with — or deliberately counter-programming — these slots."}
        </p>
      </div>
    </div>
  );
}

// ─── Video Performance Distribution section ───────────────────────────────────

function PerformanceDistributionSection({
  dist,
}: {
  dist: PerformanceDistribution;
}) {
  if (dist.total === 0) return null;

  const maxBucket = Math.max(...dist.buckets.map((b) => b.count), 1);

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <BarChart3 className="w-4 h-4 text-success" />
        <span className="text-[13px] font-semibold">Video Performance Distribution</span>
        <span className="text-[11px] text-muted-foreground font-mono">— how views spread across {dist.total} videos</span>
      </div>

      {/* Percentile cards */}
      <div className="grid grid-cols-5 max-lg:grid-cols-3 gap-[1px] bg-border mx-5 mb-4 rounded-lg overflow-hidden">
        {[
          { label: "MEDIAN", value: dist.median, color: "text-blue" },
          { label: "MEAN", value: dist.mean, color: "text-purple" },
          { label: "P90", value: dist.p90, color: "text-success" },
          { label: "P10", value: dist.p10, color: "text-muted-foreground" },
          { label: "MAX", value: dist.max, color: "text-orange" },
        ].map((item) => (
          <div key={item.label} className="bg-background px-4 py-3">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">{item.label}</div>
            <div className={`text-lg font-semibold font-mono ${item.color}`}>{fmtNum(item.value)}</div>
          </div>
        ))}
      </div>

      {/* Histogram */}
      <div className="px-5 pb-4">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">VIEW RANGE DISTRIBUTION</div>
        <div className="space-y-1.5">
          {dist.buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-[11px] font-mono w-20 text-muted-foreground text-right">{bucket.label}</span>
              <div className="flex-1 h-3 bg-card rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue/70 rounded-full transition-all"
                  style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-mono w-10 text-muted-foreground">
                {bucket.count}
              </span>
              <span className="text-[10px] font-mono w-10 text-muted-foreground text-right">
                {dist.total > 0 ? `${((bucket.count / dist.total) * 100).toFixed(0)}%` : "0%"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Insight */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          {dist.mean > dist.median * 2
            ? `Mean (${fmtNum(dist.mean)}) is ${(dist.mean / dist.median).toFixed(1)}× the median (${fmtNum(dist.median)}) — a few viral hits skew the average heavily. Median is the truer benchmark.`
            : `Mean (${fmtNum(dist.mean)}) and median (${fmtNum(dist.median)}) are close — performance is relatively evenly distributed across videos.`}
          {" "}Top 10% of videos get {fmtNum(dist.p90)}+ views.
        </p>
      </div>
    </div>
  );
}

// ─── Channel Analysis section ─────────────────────────────────────────────────

function ChannelAnalysisSection({ channels }: { channels: ApiChannel[] }) {
  const ourChannels = channels.filter(isOurs);
  const competitorChannels = channels.filter((c) => !isOurs(c));

  const [yourCh, setYourCh] = useState<ApiChannel | null>(ourChannels[0] || null);
  const [theirCh, setTheirCh] = useState<ApiChannel | null>(competitorChannels[0] || null);

  if (!yourCh || !theirCh) {
    return (
      <div className="rounded-lg bg-background p-5">
        <p className="text-[13px] font-medium mb-1">Channel Analysis</p>
        <p className="text-[12px] text-muted-foreground font-mono leading-relaxed">
          {ourChannels.length === 0
            ? 'No "ours" channels found. Go to a Channel → panel → set Classification to "Ours", then click Refresh at the top of this page.'
            : 'No competitor channels found. Add competitor channels to enable head-to-head comparison.'}
        </p>
      </div>
    );
  }

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

  const losing = metrics.filter((m) => !m.winning);
  const winning = metrics.filter((m) => m.winning);

  return (
    <div className="rounded-lg bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold">Channel Analysis</span>
        <span className="text-[11px] font-mono text-muted-foreground">—</span>
        <ChannelDropdown value={yourCh} onChange={setYourCh} options={ourChannels} variant="you" />
        <span className="text-[11px] text-muted-foreground font-mono">vs</span>
        <ChannelDropdown
          value={theirCh}
          onChange={setTheirCh}
          options={competitorChannels}
          variant="competitor"
        />
      </div>

      <div className="mx-5 mb-4 px-4 py-3 border border-border rounded-lg">
        <p className="text-[13px] font-medium">{summary}</p>
        <p className="text-[11px] text-muted-foreground font-mono mt-1">
          {chName(yourCh)} vs {chName(theirCh)} · Winning {winsCount}/{metrics.length} metrics
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {metrics.map((m) => (
            <span
              key={m.label}
              className={`text-[10px] font-mono px-2 py-0.5 border rounded-full ${
                m.winning ? "text-success border-success/30" : "text-muted-foreground border-border"
              }`}
            >
              {m.winning ? "✓" : "↑"} {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-5 mb-4 rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_120px_50px] gap-4 px-5 py-3 bg-card/30 border-b border-border">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">METRIC</span>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={chName(yourCh)} avatarUrl={yourCh.avatarUrl} size="sm" />
            <span className="text-[10px] text-blue font-mono uppercase tracking-widest">You</span>
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={chName(theirCh)} avatarUrl={theirCh.avatarUrl} size="sm" />
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Competitor</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-right">STATUS</span>
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
            <span className="text-[13px] font-mono text-muted-foreground text-right">{m.theirVal}</span>
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

      <div className="px-5 pb-5">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">
          ACTION PLAN — IN ORDER OF IMPACT
        </div>
        <div className="space-y-2">
          {losing.map((m, i) => (
            <div key={m.label} className="px-4 py-3 rounded-lg border border-border">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-blue/15 text-blue">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-semibold mb-1">{m.label}</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Your {m.label.toLowerCase()} is {m.youVal} vs their {m.theirVal}. Close this
                    gap to compete more effectively.
                  </p>
                </div>
              </div>
            </div>
          ))}
          {winning.map((m) => (
            <div key={m.label} className="px-4 py-3 rounded-lg border border-success/30">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-success/15 text-success">
                  ✓
                </span>
                <div>
                  <p className="text-[13px] font-semibold mb-1">Already winning: {m.label}</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
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
  const chMap = new Map(channels.map((c) => [c.id, c]));

  const getChannelMonthData = (trendCh: { id: string; data: number[]; viewData?: number[]; likeData?: number[] }) => {
    if (trendTab === "Views" && trendCh.viewData) return trendCh.viewData;
    if (trendTab === "Likes" && trendCh.likeData) return trendCh.likeData;
    return trendCh.data;
  };

  const ourChannels = trend.channels.filter((c) => {
    const ch = chMap.get(c.id);
    return ch ? isOurs(ch) : false;
  });

  const competitorChannels = trend.channels.filter((c) => {
    const ch = chMap.get(c.id);
    return ch ? !isOurs(ch) : false;
  });

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

  const series = [
    ...ourSeries.map((s) => ({ ...s, tone: "you" as const })),
    ...compSeries.map((s) => ({ ...s, tone: "competitor" as const })),
  ];

  const [hovered, setHovered] = useState<{
    seriesId: string;
    monthIndex: number;
    x: number;
    y: number;
    monthLabel: string;
    channelName: string;
    value: number;
    tone: "you" | "competitor";
  } | null>(null);

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

  const closestMonthIndex = (x: number) => {
    let closest = 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < months.length; i += 1) {
      const dist = Math.abs(getX(i) - x);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  };

  const handleHover = (
    e: React.MouseEvent<SVGPathElement | SVGCircleElement>,
    s: (typeof series)[number],
    forcedIndex?: number,
  ) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const idx = typeof forcedIndex === "number" ? forcedIndex : closestMonthIndex(localX);
    const value = s.values[idx] ?? 0;
    setHovered({
      seriesId: s.id,
      monthIndex: idx,
      x: getX(idx),
      y: getY(value),
      monthLabel: months[idx] || "",
      channelName: s.name,
      value,
      tone: s.tone,
    });
  };

  const makePath = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? "M" : "L"}${getX(i).toFixed(1)},${getY(v).toFixed(1)}`)
      .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxVal));

  if (months.length === 0) {
    return <p className="text-[12px] text-muted-foreground font-mono">No monthly data available.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative min-w-[700px]">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full"
          style={{ height: "280px" }}
          onMouseLeave={() => setHovered(null)}
        >
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

          {hovered && (
            <line
              x1={getX(hovered.monthIndex)}
              y1={pad.top}
              x2={getX(hovered.monthIndex)}
              y2={pad.top + chartH}
              stroke="hsl(var(--border))"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {series.map((s) => {
            const active = hovered?.seriesId === s.id;
            const dimmed = hovered && !active;
            const stroke = s.tone === "you" ? "hsl(var(--blue))" : "hsl(var(--dim))";
            const width = s.tone === "you" ? 2.5 : 1.25;
            const opacity = s.tone === "you" ? 1 : 0.35;
            return (
              <g key={s.id}>
                <path
                  d={makePath(s.values)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={width}
                  strokeOpacity={dimmed ? 0.12 : opacity}
                  style={{ transition: "stroke-opacity 120ms ease" }}
                />
                <path
                  d={makePath(s.values)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  onMouseMove={(e) => handleHover(e, s)}
                />
                {s.values.map((v, i) => {
                  const pointActive = active && hovered?.monthIndex === i;
                  return (
                    <circle
                      key={`${s.id}-${i}`}
                      cx={getX(i)}
                      cy={getY(v)}
                      r={pointActive ? 4.5 : s.tone === "you" ? 3 : 2.5}
                      fill={s.tone === "you" ? "hsl(var(--blue))" : "hsl(var(--dim))"}
                      fillOpacity={dimmed ? 0.12 : s.tone === "you" ? 1 : 0.45}
                      style={{ transition: "r 120ms ease, fill-opacity 120ms ease" }}
                      onMouseMove={(e) => handleHover(e, s, i)}
                    />
                  );
                })}
              </g>
            );
          })}

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

        {hovered && (
          <div
            className="absolute z-10 pointer-events-none rounded-lg border border-border/60 bg-background/95 px-2.5 py-1.5 shadow-lg"
            style={{
              left: Math.min(Math.max(hovered.x + 12, 8), svgWidth - 190),
              top: Math.max(hovered.y - 56, 8),
            }}
          >
            <div className="text-[10px] text-muted-foreground font-mono">{hovered.monthLabel}</div>
            <div className={`text-[11px] font-mono ${hovered.tone === "you" ? "text-blue" : "text-muted-foreground"}`}>
              {hovered.channelName}
            </div>
            <div className="text-[12px] font-semibold font-mono">
              {trendTab}: {trendTab === "Videos" ? hovered.value : fmtNum(hovered.value)}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="text-[10px] text-blue font-mono uppercase tracking-widest">YOUR CHANNELS</span>
        {ourSeries.map((c) => {
          const active = hovered?.seriesId === c.id;
          const dimmed = hovered && !active;
          return (
            <span
              key={c.id}
              className={`flex items-center gap-1.5 text-[11px] font-mono rounded-lg px-1.5 py-0.5 transition-colors ${active ? "bg-blue/10 text-blue" : dimmed ? "opacity-45" : ""}`}
            >
              <span className="w-3 h-0.5 bg-blue rounded-full inline-block" />
              <ChannelAvatar name={c.name} avatarUrl={c.ch?.avatarUrl} channelId={c.id} size="sm" />
              <span className="max-w-[140px] truncate">{c.name}</span>
            </span>
          );
        })}
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest ml-4">COMPETITORS</span>
        {compSeries.map((c) => {
          const active = hovered?.seriesId === c.id;
          const dimmed = hovered && !active;
          return (
            <span
              key={c.id}
              className={`flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground rounded-lg px-1.5 py-0.5 transition-colors ${active ? "bg-card text-muted-foreground" : dimmed ? "opacity-45" : ""}`}
            >
              <span className="w-3 h-0.5 bg-dim/40 rounded-full inline-block" />
              <ChannelAvatar name={c.name} avatarUrl={c.ch?.avatarUrl} channelId={c.id} size="sm" />
              <span className="max-w-[140px] truncate">{c.name}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Key Insights derived from real data ──────────────────────────────────────

function buildInsights(
  channels: ApiChannel[],
  universe: Universe,
  engBreakdown: EngagementBreakdownEntry[],
  contentMix: ContentMixEntry[],
  growth: Record<string, GrowthSnapshot[]>,
) {
  const insights: { type: string; color: string; title: string; description: string }[] = [];

  const sorted = [...channels].sort((a, b) => b.avgEngagement - a.avgEngagement);
  const topEngCh = sorted[0];
  const ourChannels = channels.filter((c) => c.type === "ours");

  // 1. Engagement leader analysis
  if (topEngCh) {
    const engEntry = engBreakdown.find((e) => e.channelId === topEngCh.id);
    const commentDetail = engEntry ? ` (${engEntry.commentRate.toFixed(3)}% comment rate)` : "";
    insights.push({
      type: "EFFICIENCY",
      color: "text-purple bg-purple/10",
      title: `${chName(topEngCh)} leads engagement at ${topEngCh.avgEngagement.toFixed(2)}%`,
      description: `With ${fmtNum(parseInt(topEngCh.subscribers))} subscribers they drive the highest engagement${commentDetail}. ${
        topEngCh.uploadsPerMonth > 0 ? `They upload ${topEngCh.uploadsPerMonth}/mo.` : ""
      } Content depth is the driver — study their format.`,
    });
  }

  // 2. Fastest growing channel (from snapshots)
  const growthEntries = Object.entries(growth)
    .map(([chId, snaps]) => {
      if (snaps.length < 2) return null;
      const ch = channels.find((c) => c.id === chId);
      if (!ch) return null;
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      const subGrowthPct = pctChange(first.subscribers, last.subscribers);
      return { ch, subGrowthPct, subDelta: last.subscribers - first.subscribers };
    })
    .filter(Boolean) as { ch: ApiChannel; subGrowthPct: number; subDelta: number }[];

  const fastestGrower = growthEntries.sort((a, b) => b.subGrowthPct - a.subGrowthPct)[0];
  if (fastestGrower && fastestGrower.subGrowthPct > 1) {
    const isUs = fastestGrower.ch.type === "ours";
    insights.push({
      type: isUs ? "MOMENTUM" : "THREAT",
      color: isUs ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
      title: `${chName(fastestGrower.ch)} grew subscribers ${fastestGrower.subGrowthPct.toFixed(1)}% (+${fmtNum(fastestGrower.subDelta)})`,
      description: isUs
        ? "Your channel is the fastest-growing in the field. Maintain the content cadence that's driving this growth."
        : `This competitor is building momentum faster than anyone else. Subscriber velocity is a compounding advantage — analyze what's driving their growth.`,
    });
  }

  // 3. Upload frequency leader
  const fastestUploader = [...channels].sort((a, b) => b.uploadsPerMonth - a.uploadsPerMonth)[0];
  if (fastestUploader && fastestUploader.uploadsPerMonth > 0) {
    const isUs = fastestUploader.type === "ours";
    insights.push({
      type: isUs ? "STRENGTH" : "THREAT",
      color: isUs ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
      title: `${chName(fastestUploader)} uploads fastest at ${fastestUploader.uploadsPerMonth}/mo`,
      description: isUs
        ? "Your channel leads on upload frequency — consistency compounds over months. Maintain this cadence."
        : `A competitor is uploading faster than anyone in the field. Volume + reach is a compounding advantage — watch their output closely.`,
    });
  }

  // 4. Reach gap analysis
  const topViewsCh = [...channels].sort((a, b) => parseInt(b.totalViews) - parseInt(a.totalViews))[0];
  const ourTopViewsCh = [...ourChannels].sort((a, b) => parseInt(b.totalViews) - parseInt(a.totalViews))[0];
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

  // 5. Comment engagement opportunity
  const highCommentChs = engBreakdown
    .filter((e) => e.type !== "ours")
    .sort((a, b) => b.commentRate - a.commentRate);
  const ourCommentRate = engBreakdown
    .filter((e) => e.type === "ours")
    .reduce((s, e) => s + e.commentRate, 0) / Math.max(ourChannels.length, 1);
  const topCommenter = highCommentChs[0];
  if (topCommenter && topCommenter.commentRate > ourCommentRate * 1.5) {
    insights.push({
      type: "SIGNAL",
      color: "text-orange bg-orange/10",
      title: `${topCommenter.name} has ${(topCommenter.commentRate / ourCommentRate).toFixed(1)}× your comment rate`,
      description: `Their audience actively discusses content (${topCommenter.commentRate.toFixed(3)}% comment rate vs your ${ourCommentRate.toFixed(3)}%). Comments signal deep engagement and boost algorithmic reach. Study their calls-to-action and how they frame questions.`,
    });
  }

  // 6. Content mix insight (if shorts data exists)
  const totalShorts = contentMix.reduce((s, m) => s + m.shorts.count, 0);
  const totalVids = contentMix.reduce((s, m) => s + m.videos.count, 0);
  if (totalShorts > 0) {
    const shortAvgViews = contentMix.reduce((s, m) => s + m.shorts.views, 0) / Math.max(totalShorts, 1);
    const vidAvgViews = contentMix.reduce((s, m) => s + m.videos.views, 0) / Math.max(totalVids, 1);
    const ratio = vidAvgViews > 0 ? shortAvgViews / vidAvgViews : 0;
    insights.push({
      type: "FORMAT",
      color: "text-purple bg-purple/10",
      title: `Shorts avg ${fmtNum(shortAvgViews)} views vs long-form ${fmtNum(vidAvgViews)} (${ratio > 1 ? "shorts win" : `${(ratio * 100).toFixed(0)}% of long-form`})`,
      description: ratio > 1
        ? `Shorts are outperforming long-form on average views. Consider increasing short-form output for reach, then converting viewers to long-form subscribers.`
        : `Long-form content delivers higher per-video views. Shorts can supplement for discoverability, but the core strategy should remain long-form depth.`,
    });
  }

  // 7. Low engagement competitor — audience is underserved
  const bottomEngCh = sorted[sorted.length - 1];
  if (bottomEngCh && !isOurs(bottomEngCh) && bottomEngCh.avgEngagement < 3) {
    insights.push({
      type: "SIGNAL",
      color: "text-orange bg-orange/10",
      title: `${chName(bottomEngCh)} has low engagement at ${bottomEngCh.avgEngagement.toFixed(2)}% — their audience is underserved`,
      description: `Despite ${fmtNum(parseInt(bottomEngCh.subscribers))} subscribers, their engagement is below 3%. Their audience is watching but not reacting. Channels that engage better in this space can pull viewers away.`,
    });
  }

  // 8. Market summary
  insights.push({
    type: "MARKET",
    color: "text-success bg-success/10",
    title: `${universe.channels} channels tracked · ${universe.videosTracked} videos · avg ${universe.avgEngagement.toFixed(2)}% engagement`,
    description: `The field spans ${fmtNum(universe.totalSubscribers)} total subscribers across all channels. Average uploads are ${universe.avgUploads}/mo. Your channels produce ${ourChannels.length > 0 ? ourChannels.reduce((s, c) => s + c.videoCount, 0) : 0} videos in this period across ${ourChannels.length} channel${ourChannels.length !== 1 ? "s" : ""}.`,
  });

  return insights;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();

  const [period, setPeriod] = useState("12m");
  const [fieldTab, setFieldTab] = useState<FieldTab>("Engagement");
  const [trendTab, setTrendTab] = useState("Videos");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);

  const fetchData = useCallback(
    async (p: string) => {
      if (!channelId) return;
      setLoading(true);
      try {
        const r = await fetch(`/api/analytics?channelId=${channelId}&period=${p}`, {
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
    [channelId]
  );

  useEffect(() => {
    fetchData(period);
  }, [fetchData, period]);

  const handlePeriod = (p: string) => {
    setPeriod(p);
  };

  const handleRefresh = async () => {
    if (!channelId || flushing) return;
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

  const channels = data?.channels ?? [];
  const universe = data?.universe;
  const topVideos = data?.topVideos ?? [];
  const trend = data?.trend ?? { months: [], channels: [] };
  const growth = data?.growth ?? {};
  const contentMix = data?.contentMix ?? [];
  const engagementBreakdown = data?.engagementBreakdown ?? [];
  const publishingPatterns = data?.publishingPatterns ?? [];
  const performanceDistribution = data?.performanceDistribution;

  const { ourChannels, competitorChannels, ourTotalSubs, topBySubs, topByViews, topByEngagement, topByUploads, ourPeriodViews, ourAvgEngagement, ourUploadsPerMonth } = useMemo(() => {
    const ours = channels.filter(isOurs);
    const comps = channels.filter((c) => !isOurs(c));
    const sorted = [...channels];
    return {
      ourChannels: ours,
      competitorChannels: comps,
      ourTotalSubs: ours.reduce((s, c) => s + parseInt(c.subscribers), 0),
      topBySubs: sorted.sort((a, b) => parseInt(b.subscribers) - parseInt(a.subscribers))[0],
      topByViews: [...channels].sort((a, b) => b.periodViews - a.periodViews)[0],
      topByEngagement: [...channels].sort((a, b) => b.avgEngagement - a.avgEngagement)[0],
      topByUploads: [...channels].sort((a, b) => b.uploadsPerMonth - a.uploadsPerMonth)[0],
      ourPeriodViews: ours.reduce((s, c) => s + c.periodViews, 0),
      ourAvgEngagement: ours.length > 0 ? ours.reduce((s, c) => s + c.avgEngagement, 0) / ours.length : 0,
      ourUploadsPerMonth: ours.length > 0 ? ours.reduce((s, c) => s + c.uploadsPerMonth, 0) : 0,
    };
  }, [channels]);
  const ourVideoCount = ourChannels.reduce((s, c) => s + c.videoCount, 0);
  const compVideoCount = competitorChannels.reduce((s, c) => s + c.videoCount, 0);

  const rankingsMap = useMemo(() => {
    const tabs: FieldTab[] = ["Subscribers", "Engagement", "Views", "Upload rate"];
    const map = {} as Record<FieldTab, { id: string; name: string; avatarUrl: string | null; isYou: boolean; rawVal: number; value: string; rank: number }[]>;
    for (const tab of tabs) {
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
        return { id: ch.id, name: chName(ch), avatarUrl: ch.avatarUrl, isYou: isOurs(ch), rawVal, value: displayVal };
      });
      map[tab] = entries.sort((a, b) => b.rawVal - a.rawVal).map((e, i) => ({ ...e, rank: i + 1 }));
    }
    return map;
  }, [channels]);

  const rankings = rankingsMap[fieldTab] ?? [];

  const { engRank, subRank, marketAvgEng, viewsMultiplier, topViewCh, benchmarks } = useMemo(() => {
    const engRanks = rankingsMap["Engagement"] ?? [];
    const firstOurEngIdx = engRanks.findIndex((r) => r.isYou);
    const _engRank = firstOurEngIdx >= 0 ? firstOurEngIdx + 1 : engRanks.length;

    const subRanks = rankingsMap["Subscribers"] ?? [];
    const firstOurSubIdx = subRanks.findIndex((r) => r.isYou);
    const _subRank = firstOurSubIdx >= 0 ? firstOurSubIdx + 1 : subRanks.length;

    const _marketAvgEng = channels.length > 0
      ? channels.reduce((s, c) => s + c.avgEngagement, 0) / channels.length
      : 0;

    const viewRanks = rankingsMap["Views"] ?? [];
    const _topViewCh = viewRanks[0];
    const firstOurViewIdx = viewRanks.findIndex((r) => r.isYou);
    const ourTopViews = firstOurViewIdx >= 0 ? viewRanks[firstOurViewIdx] : null;
    const _viewsMultiplier = _topViewCh && ourTopViews && ourTopViews.rawVal > 0
      ? `×${Math.round(_topViewCh.rawVal / ourTopViews.rawVal)}`
      : "×∞";

    const toBenchmark = (label: string, tab: FieldTab) => ({
      label,
      items: (rankingsMap[tab] ?? []).map((r) => ({ rank: r.rank, name: r.name, avatarUrl: r.avatarUrl, channelId: r.id, value: r.value, isYou: r.isYou })),
    });

    return {
      engRank: _engRank,
      subRank: _subRank,
      marketAvgEng: _marketAvgEng,
      viewsMultiplier: _viewsMultiplier,
      topViewCh: _topViewCh,
      benchmarks: [
        toBenchmark("SUBSCRIBERS", "Subscribers"),
        toBenchmark("TOTAL VIDEO VIEWS", "Views"),
        toBenchmark("AVG ENGAGEMENT RATE", "Engagement"),
      ],
    };
  }, [rankingsMap, channels]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
          <h1 className="text-sm font-semibold">Analytics</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data || !universe) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
          <h1 className="text-sm font-semibold">Analytics</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">No data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Analytics</h1>
          <span className="text-[11px] text-muted-foreground font-mono">
            {universe.channels} channels tracked
          </span>
          <button
            onClick={handleRefresh}
            disabled={flushing}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono hover:text-muted-foreground transition-colors disabled:opacity-50"
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
                period === t ? "bg-card text-foreground" : "text-muted-foreground hover:text-muted-foreground"
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
          <div className="grid grid-cols-6 max-lg:grid-cols-3 rounded-lg overflow-hidden gap-[1px] bg-border">
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
          <div className="rounded-lg bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-orange" />
                <span className="text-[13px] font-semibold">You vs the Field</span>
                <span className="text-[11px] text-muted-foreground font-mono">
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
                        ? "bg-card text-foreground border-border"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison cards */}
            <div className="grid grid-cols-4 max-lg:grid-cols-2 gap-[1px] bg-border mx-5 mb-4 rounded-lg overflow-hidden">
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
                        entry.isYou ? "text-blue" : "text-muted-foreground"
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
                    <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${entry.isYou ? "bg-blue" : "bg-dim/40"}`}
                        style={{ width: `${getBarWidth(entry.rawVal, maxRaw)}%` }}
                      />
                    </div>
                    <span
                      className={`text-[12px] font-mono shrink-0 w-16 text-right ${
                        entry.isYou ? "text-blue" : "text-muted-foreground"
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
                    <p className="text-[12px] text-muted-foreground mt-1">
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

        {/* Growth & Momentum — NEW */}
        {growth && Object.keys(growth).length > 0 && (
          <div className="px-6 max-lg:px-4 mb-5">
            <GrowthMomentumSection channels={channels} growth={growth} />
          </div>
        )}

        {/* Channel Analysis */}
        <div className="px-6 max-lg:px-4 mb-5">
          <ChannelAnalysisSection channels={channels} />
        </div>

        {/* Engagement Breakdown — NEW */}
        {engagementBreakdown && engagementBreakdown.length > 0 && (
          <div className="px-6 max-lg:px-4 mb-5">
            <EngagementDecompositionSection breakdown={engagementBreakdown} />
          </div>
        )}

        {/* Content Mix — NEW */}
        {contentMix && contentMix.length > 0 && (
          <div className="px-6 max-lg:px-4 mb-5">
            <ContentMixSection channels={channels} contentMix={contentMix} />
          </div>
        )}

        {/* Video Performance Distribution — NEW */}
        {performanceDistribution && performanceDistribution.total > 0 && (
          <div className="px-6 max-lg:px-4 mb-5">
            <PerformanceDistributionSection dist={performanceDistribution} />
          </div>
        )}

        {/* Channel Benchmarks */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-lg bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2">
              <Circle className="w-3.5 h-3.5 text-blue fill-blue" />
              <span className="text-[13px] font-semibold">Channel Benchmarks</span>
            </div>
            <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-[1px] bg-border">
              {benchmarks.map((cat) => (
                <div key={cat.label} className="bg-background px-5 py-4">
                  <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">
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
                            item.isYou ? "text-blue" : "text-muted-foreground"
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
                          item.isYou ? "text-blue" : "text-muted-foreground"
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
          <div className="rounded-lg bg-background overflow-hidden">
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
                        ? "bg-card text-foreground border-border"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-muted-foreground"
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

        {/* Publishing Patterns — NEW */}
        {publishingPatterns && publishingPatterns.length > 0 && (
          <div className="px-6 max-lg:px-4 mb-5">
            <PublishingPatternsSection patterns={publishingPatterns} />
          </div>
        )}

        {/* Top Videos */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-lg bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Top Videos by Views</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                across all tracked channels · {period}
              </span>
            </div>
            {topVideos.length === 0 ? (
              <p className="px-5 pb-5 text-[12px] text-muted-foreground font-mono">
                No video data in this period.
              </p>
            ) : (
              topVideos.map((v) => (
                <Link
                  key={v.id}
                  to={channelPath(`/video/${v.id}`)}
                  className="group flex items-center gap-5 px-5 py-3.5 border-t border-border hover:bg-card/30 transition-colors cursor-pointer no-underline"
                >
                  <span className="text-[12px] text-muted-foreground font-mono w-6 text-right shrink-0">
                    {v.rank}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate group-hover:opacity-80 transition-opacity">
                      {v.title}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <ChannelAvatar
                    name={v.channelName}
                    avatarUrl={v.avatarUrl}
                    channelId={v.channelId}
                    size="sm"
                  />
                  <span className="text-[13px] font-mono text-muted-foreground shrink-0 w-16 text-right">
                    {v.views}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Key Insights — Enhanced */}
        <div className="px-6 max-lg:px-4 mb-8">
          <div className="rounded-lg bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <span className="text-[13px] font-semibold">Key Insights</span>
              <span className="text-[11px] text-muted-foreground font-mono px-2 py-0.5 border border-border rounded-full">
                derived from real data
              </span>
            </div>
            {buildInsights(channels, universe, engagementBreakdown || [], contentMix || [], growth || {}).map((insight, i) => (
              <div key={i} className="px-5 py-4 border-t border-border">
                <div className="flex items-start gap-3">
                  <span
                    className={`text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5 ${insight.color}`}
                  >
                    {insight.type}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium mb-1">{insight.title}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{insight.description}</p>
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
