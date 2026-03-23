import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  RotateCw, Loader2, Zap, TrendingUp, Bell, Activity,
  Target, Brain, Settings, ChevronRight, ChevronDown,
  Sparkles, Eye, ThumbsUp, BarChart3, Globe, Tag, Layers,
  CheckCircle2, AlertTriangle, Info,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as RechartsTooltip,
} from "recharts";

/* ─── Types ─── */

interface VectorIntelligenceData {
  hasEmbeddingKey: boolean;
  lastStatsRefreshAt: string | null;
  rescoreIntervalHours: number;
  embeddings: {
    videos: { total: number; embedded: number };
    stories: { total: number; embedded: number };
  };
  rescoreStats: { total: number; rescored: number };
  scoreProfile: {
    totalOutcomes: number;
    totalDecisions: number;
    aiViralAccuracy: number;
    aiRelevanceAccuracy: number;
    channelAvgViews: string;
    tagSignals: Record<string, number> | null;
    contentTypeSignals: Record<string, number> | null;
    regionSignals: Record<string, number> | null;
    lastLearnedAt: string | null;
  } | null;
  alerts: {
    items: Array<{ id: string; type: string; title: string; detail: unknown; storyId: string | null; isRead: boolean; createdAt: string }>;
    unreadCount: number;
  };
  recentRescores: Array<{
    id: string; headline: string; compositeScore: number; lastRescoredAt: string | null;
    latestEntry: {
      before: Record<string, number>;
      after: Record<string, number>;
      factors: Record<string, unknown>;
      trigger: string;
    } | null;
  }>;
  topSimilarity: Array<{
    id: string; headline: string; competitionMatches: number;
    viralBoost: number; freshness: number; compositeScore: number;
  }>;
  scoringFormula?: {
    base: Array<{ key: string; weight: number; label: string; description: string }>;
    learned: Array<{ key: string; weight: number; label: string; description: string }>;
  };
}

/* ─── Main Component ─── */

export default function VectorIntelligence() {
  const { channelId } = useParams();
  const pp = useChannelPath();
  const [data, setData] = useState<VectorIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"all" | "competition" | "scores" | "alerts">("all");
  const [techOpen, setTechOpen] = useState(false);

  const fetchData = useCallback(() => {
    if (!channelId) return;
    fetch(`/api/vector-intelligence/status?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const tick = setInterval(fetchData, 60000);
    return () => clearInterval(tick);
  }, [fetchData]);

  const handleReEvaluate = () => {
    if (!channelId) return;
    setReEvaluating(true);
    fetch(`/api/stories/re-evaluate?channelId=${encodeURIComponent(channelId)}`, {
      method: "POST", credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        toast.success(`Refreshed ${d.evaluated} stories — ${d.changed} scores updated`);
        fetchData();
      })
      .catch(() => toast.error("Could not refresh scores right now"))
      .finally(() => setReEvaluating(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.hasEmbeddingKey) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="rounded-lg border border-border bg-card p-8 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-purple/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-purple" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">Intelligence Not Set Up Yet</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The AI needs an OpenAI API key to analyze your content, find competition overlaps, and learn your preferences.
          </p>
          <Link to={pp("/settings")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple text-white text-sm font-semibold hover:bg-purple/90 transition-colors no-underline">
            <Settings className="w-4 h-4" />
            Set Up in Settings
          </Link>
        </div>
      </div>
    );
  }

  const vEmb = data.embeddings.videos;
  const sEmb = data.embeddings.stories;
  const totalEmbedded = vEmb.embedded + sEmb.embedded;
  const totalItems = vEmb.total + sEmb.total;
  const coveragePct = totalItems > 0 ? Math.round((totalEmbedded / totalItems) * 100) : 0;
  const sp = data.scoreProfile;
  const confidence = getConfidenceLevel(sp);
  const grade = getGrade(sp, coveragePct, confidence);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple" />
          <span className="text-sm font-semibold text-foreground">Intelligence</span>
          {data.lastStatsRefreshAt && (
            <span className="text-xs text-muted-foreground">
              Updated {fmtShortAgo(data.lastStatsRefreshAt)}
            </span>
          )}
        </div>
        <button onClick={handleReEvaluate} disabled={reEvaluating}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-purple/30 bg-purple/10 text-purple text-xs font-semibold hover:bg-purple/20 transition-colors disabled:opacity-50">
          {reEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          {reEvaluating ? "Refreshing…" : "Refresh Scores"}
        </button>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div className="max-w-5xl mx-auto px-6 max-lg:px-4 py-6 space-y-6">

          {/* ── HERO: AI Health ── */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start gap-6 max-sm:flex-col max-sm:items-center max-sm:text-center">
              <GradeRing grade={grade.letter} color={grade.color} />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground mb-1">{grade.headline}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{grade.description}</p>
                <div className="flex flex-wrap gap-4 max-sm:justify-center">
                  <MiniStat
                    label="Viral Accuracy"
                    value={sp ? `${Math.round(sp.aiViralAccuracy * 100)}%` : "—"}
                    tip="How well the AI predicts which stories will go viral, based on actual YouTube performance"
                    icon={TrendingUp}
                    color={sp && sp.aiViralAccuracy >= 0.7 ? "text-success" : "text-orange"}
                  />
                  <MiniStat
                    label="Relevance Accuracy"
                    value={sp ? `${Math.round(sp.aiRelevanceAccuracy * 100)}%` : "—"}
                    tip="How well the AI predicts which stories are relevant to your audience"
                    icon={Target}
                    color={sp && sp.aiRelevanceAccuracy >= 0.7 ? "text-success" : "text-orange"}
                  />
                  <MiniStat
                    label="Content Indexed"
                    value={`${coveragePct}%`}
                    tip={`${totalEmbedded.toLocaleString()} of ${totalItems.toLocaleString()} items analyzed`}
                    icon={Layers}
                    color={coveragePct >= 90 ? "text-success" : coveragePct >= 50 ? "text-orange" : "text-muted-foreground"}
                  />
                  <MiniStat
                    label="Decisions Learned"
                    value={String(sp?.totalDecisions ?? 0)}
                    tip="Total likes, skips, and trashes the AI has learned from"
                    icon={ThumbsUp}
                    color="text-purple"
                  />
                </div>
              </div>
            </div>
            {coveragePct < 100 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Indexing progress</span>
                  <span className="text-xs font-medium text-foreground">{coveragePct}%</span>
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-purple transition-all duration-700" style={{ width: `${coveragePct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {totalItems - totalEmbedded} items still being analyzed — this happens automatically.
                </p>
              </div>
            )}
          </div>

          {/* ── SECTION: What AI Learned ── */}
          <LearnedInsights sp={sp} />

          {/* ── SECTION: Activity Feed ── */}
          <ActivityFeed
            data={data}
            feedFilter={feedFilter}
            setFeedFilter={setFeedFilter}
            pp={pp}
          />

          {/* ── SECTION: Technical Details (collapsed) ── */}
          <Collapsible open={techOpen} onOpenChange={setTechOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors group">
              <ChevronDown className={`w-4 h-4 transition-transform ${techOpen ? "" : "-rotate-90"}`} />
              <span className="font-medium">Technical Details</span>
              <span className="text-xs">— Pipeline, scoring formula, and system info</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TechnicalDetails data={data} confidence={confidence} />
            </CollapsibleContent>
          </Collapsible>

        </div>
      </div>
    </TooltipProvider>
  );
}

/* ═══════════════════════════════════════════════════════════
   Grade Ring
═══════════════════════════════════════════════════════════ */

function GradeRing({ grade, color }: { grade: string; color: string }) {
  return (
    <div className={`w-20 h-20 shrink-0 rounded-full border-4 ${color} flex items-center justify-center`}>
      <span className={`text-3xl font-bold ${color.replace("border-", "text-")}`}>{grade}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Mini Stat with tooltip
═══════════════════════════════════════════════════════════ */

function MiniStat({ label, value, tip, icon: Icon, color }: {
  label: string; value: string; tip: string; icon: typeof Zap; color: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-default">
          <Icon className={`w-4 h-4 ${color}`} />
          <div>
            <div className={`text-base font-semibold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

/* ═══════════════════════════════════════════════════════════
   Learned Insights
═══════════════════════════════════════════════════════════ */

function LearnedInsights({ sp }: { sp: VectorIntelligenceData["scoreProfile"] }) {
  if (!sp) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <SectionTitle icon={Brain} title="What the AI Has Learned" />
        <EmptyState
          icon={Brain}
          title="Not enough data yet"
          description="The AI needs at least 5 decisions (likes, skips, or trashes) and 3 stories with YouTube stats before it can start learning your preferences."
        />
      </div>
    );
  }

  const hasContentSignals = sp.contentTypeSignals && Object.keys(sp.contentTypeSignals).length > 0;
  const hasTagSignals = sp.tagSignals && Object.keys(sp.tagSignals).length > 0;
  const hasRegionSignals = sp.regionSignals && Object.keys(sp.regionSignals).length > 0;
  const hasAnySignals = hasContentSignals || hasTagSignals || hasRegionSignals;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <SectionTitle icon={Brain} title="What the AI Has Learned" />

      {!hasAnySignals ? (
        <p className="text-sm text-muted-foreground">
          The AI is still gathering data. Keep making decisions on stories and it will start showing your content preferences here.
        </p>
      ) : (
        <div className="space-y-5">
          {hasContentSignals && (
            <SignalChart
              title="Content Types You Prefer"
              subtitle="Based on your decisions and how they performed on YouTube"
              icon={BarChart3}
              signals={sp.contentTypeSignals!}
            />
          )}
          {hasTagSignals && (
            <SignalChart
              title="Tag Performance"
              subtitle="Tags that boost or hurt your story scores"
              icon={Tag}
              signals={sp.tagSignals!}
              limit={15}
              rtl
            />
          )}
          {hasRegionSignals && (
            <SignalChart
              title="Regional Audience Fit"
              subtitle="Where your content resonates most"
              icon={Globe}
              signals={sp.regionSignals!}
              rtl
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Signal Chart (horizontal bar)
═══════════════════════════════════════════════════════════ */

function SignalChart({ title, subtitle, icon: Icon, signals, limit, rtl }: {
  title: string; subtitle: string; icon: typeof Zap;
  signals: Record<string, number>; limit?: number; rtl?: boolean;
}) {
  const sorted = useMemo(() => {
    const entries = Object.entries(signals).sort((a, b) => b[1] - a[1]);
    return limit ? entries.slice(0, limit) : entries;
  }, [signals, limit]);

  const chartData = sorted.map(([name, value]) => ({ name, value: +value.toFixed(2) }));
  const totalSignals = Object.keys(signals).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{title}</span>
        {limit && totalSignals > limit && (
          <span className="text-xs text-muted-foreground">
            (top {limit} of {totalSignals})
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      <div className="h-[180px]" dir={rtl ? "rtl" : undefined}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [
                value > 0 ? `+${value} (boosts score)` : `${value} (lowers score)`,
                "Impact",
              ]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.value > 0 ? "hsl(var(--success))" : entry.value < 0 ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Activity Feed (merged competition + rescores + alerts)
═══════════════════════════════════════════════════════════ */

type FeedFilter = "all" | "competition" | "scores" | "alerts";

interface FeedItem {
  id: string;
  kind: "competition" | "score_change" | "alert";
  headline: string;
  description: string;
  storyId: string | null;
  timestamp: string;
  badge: { label: string; color: string };
  delta?: number;
  isUnread?: boolean;
}

function buildFeedItems(data: VectorIntelligenceData): FeedItem[] {
  const items: FeedItem[] = [];

  for (const s of data.topSimilarity) {
    items.push({
      id: `comp-${s.id}`,
      kind: "competition",
      headline: s.headline,
      description: `${s.competitionMatches} competitor${s.competitionMatches !== 1 ? "s" : ""} covered this topic${s.viralBoost > 0 ? ` — viral boost +${s.viralBoost.toFixed(1)}` : ""}`,
      storyId: s.id,
      timestamp: new Date().toISOString(),
      badge: { label: "Competition", color: "bg-orange/10 text-orange" },
    });
  }

  for (const s of data.recentRescores) {
    const before = s.latestEntry?.before?.compositeScore;
    const after = s.latestEntry?.after?.compositeScore;
    const delta = (before != null && after != null) ? after - before : null;
    const factors = s.latestEntry?.factors as Record<string, unknown> | undefined;
    const reasons: string[] = [];
    if (factors) {
      if (Number(factors.competitionMatches) > 0) reasons.push(`${factors.competitionMatches} competition matches`);
      if (Number(factors.provenViralBoost) !== 0) reasons.push(`viral ${Number(factors.provenViralBoost) > 0 ? "boost" : "penalty"}`);
      if (Number(factors.ownChannelBoost) !== 0) reasons.push("own channel signal");
    }
    items.push({
      id: `rescore-${s.id}`,
      kind: "score_change",
      headline: s.headline,
      description: delta != null
        ? `Score ${delta > 0 ? "went up" : "went down"} from ${before!.toFixed(1)} to ${after!.toFixed(1)}${reasons.length ? ` — ${reasons.join(", ")}` : ""}`
        : "Score was recalculated",
      storyId: s.id,
      timestamp: s.lastRescoredAt ?? new Date().toISOString(),
      badge: {
        label: delta != null && delta > 0 ? "Score Up" : delta != null && delta < 0 ? "Score Down" : "Re-scored",
        color: delta != null && delta > 0 ? "bg-success/10 text-success" : delta != null && delta < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      },
      delta: delta ?? undefined,
    });
  }

  for (const a of data.alerts.items) {
    const typeLabel =
      a.type === "score_change" ? "Score Alert" :
      a.type === "competitor_published" ? "Competitor Alert" :
      a.type === "trending_topic" ? "Trending" :
      a.type.replace(/_/g, " ");
    items.push({
      id: `alert-${a.id}`,
      kind: "alert",
      headline: a.title,
      description: typeLabel,
      storyId: a.storyId,
      timestamp: a.createdAt,
      badge: {
        label: typeLabel,
        color: a.type === "trending_topic" ? "bg-success/10 text-success" :
               a.type === "competitor_published" ? "bg-primary/10 text-primary" :
               "bg-purple/10 text-purple",
      },
      isUnread: !a.isRead,
    });
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items;
}

function ActivityFeed({ data, feedFilter, setFeedFilter, pp }: {
  data: VectorIntelligenceData;
  feedFilter: FeedFilter;
  setFeedFilter: (f: FeedFilter) => void;
  pp: (path: string) => string;
}) {
  const allItems = useMemo(() => buildFeedItems(data), [data]);

  const filtered = feedFilter === "all"
    ? allItems
    : feedFilter === "competition"
      ? allItems.filter((i) => i.kind === "competition")
      : feedFilter === "scores"
        ? allItems.filter((i) => i.kind === "score_change")
        : allItems.filter((i) => i.kind === "alert");

  const filterBtns: { key: FeedFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: allItems.length },
    { key: "competition", label: "Competition", count: allItems.filter((i) => i.kind === "competition").length },
    { key: "scores", label: "Score Changes", count: allItems.filter((i) => i.kind === "score_change").length },
    { key: "alerts", label: "Alerts", count: allItems.filter((i) => i.kind === "alert").length },
  ];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <SectionTitle icon={Activity} title="Recent Activity" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {filterBtns.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFeedFilter(btn.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                feedFilter === btn.key
                  ? "bg-foreground text-background"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {btn.label}
              <span className="ml-1.5 opacity-60">{btn.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No activity yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((item) => (
              <FeedRow key={item.id} item={item} pp={pp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedRow({ item, pp }: { item: FeedItem; pp: (path: string) => string }) {
  const inner = (
    <div className={`px-5 py-3.5 flex items-start gap-3 transition-colors ${item.storyId ? "hover:bg-muted/30 cursor-pointer" : ""} ${item.isUnread ? "bg-orange/[0.03]" : ""}`}>
      <div className="pt-0.5 shrink-0">
        {item.kind === "competition" && <Target className="w-4 h-4 text-orange" />}
        {item.kind === "score_change" && (
          item.delta != null && item.delta > 0
            ? <TrendingUp className="w-4 h-4 text-success" />
            : item.delta != null && item.delta < 0
              ? <TrendingUp className="w-4 h-4 text-destructive rotate-180" />
              : <Activity className="w-4 h-4 text-muted-foreground" />
        )}
        {item.kind === "alert" && (
          item.isUnread
            ? <Bell className="w-4 h-4 text-orange" />
            : <Bell className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.badge.color}`}>
            {item.badge.label}
          </span>
          <span className="text-xs text-muted-foreground">{fmtShortAgo(item.timestamp)}</span>
        </div>
        <div className="text-sm text-foreground font-medium truncate" dir="auto">{item.headline}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
      </div>
      {item.storyId && (
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      )}
    </div>
  );

  if (item.storyId) {
    return <Link to={pp(`/story/${item.storyId}`)} className="block no-underline">{inner}</Link>;
  }
  return <div>{inner}</div>;
}

/* ═══════════════════════════════════════════════════════════
   Technical Details (collapsible)
═══════════════════════════════════════════════════════════ */

function TechnicalDetails({ data, confidence }: { data: VectorIntelligenceData; confidence: number }) {
  const vEmb = data.embeddings.videos;
  const sEmb = data.embeddings.stories;
  const vPct = vEmb.total > 0 ? Math.round((vEmb.embedded / vEmb.total) * 100) : 0;
  const sPct = sEmb.total > 0 ? Math.round((sEmb.embedded / sEmb.total) * 100) : 0;
  const nextRescoreAt = data.lastStatsRefreshAt
    ? new Date(new Date(data.lastStatsRefreshAt).getTime() + data.rescoreIntervalHours * 3600000)
    : null;
  const nextRescoreIn = nextRescoreAt ? Math.max(0, nextRescoreAt.getTime() - Date.now()) : null;

  return (
    <div className="space-y-4 pb-2">
      {/* Pipeline */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground mb-3">Scoring Pipeline</div>
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          <TechStage num={1} title="Collect" desc="Fetches competition & video stats" status={data.lastStatsRefreshAt ? `Last: ${fmtShortAgo(data.lastStatsRefreshAt)}` : "Never run"} />
          <TechStage num={2} title="Embed" desc={`Videos ${vPct}% · Stories ${sPct}%`} status={`${vEmb.embedded + sEmb.embedded} vectors`} />
          <TechStage num={3} title="Learn" desc={`${data.scoreProfile?.totalDecisions ?? 0} decisions, ${data.scoreProfile?.totalOutcomes ?? 0} outcomes`} status={`${Math.round(confidence * 100)}% confidence`} />
          <TechStage num={4} title="Re-score" desc={`${data.rescoreStats.rescored}/${data.rescoreStats.total} stories`} status={nextRescoreIn != null ? `Next in ${fmtDuration(nextRescoreIn)}` : "—"} />
        </div>
      </div>

      {/* Formula */}
      {data.scoringFormula && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium text-foreground mb-3">Scoring Formula</div>
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Base Score (AI predictions)</div>
              <div className="space-y-1">
                {data.scoringFormula.base.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{r.label}</span>
                    <span className="font-mono text-purple">{Math.round(r.weight * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Learned Boost (confidence: {Math.round(confidence * 100)}%)
              </div>
              <div className="space-y-1">
                {data.scoringFormula.learned.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{r.label}</span>
                    <span className="font-mono text-purple">{Math.round(r.weight * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground font-mono">
            final = base_score + (learned_boost × confidence) · clamped 0–100
          </div>
        </div>
      )}

      {/* System */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium text-foreground mb-3">System</div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2 text-xs">
          <TechKV label="Model" value="text-embedding-3-small" />
          <TechKV label="Dimensions" value="1,536" />
          <TechKV label="Index" value="HNSW" />
          <TechKV label="Rescore Interval" value={`Every ${data.rescoreIntervalHours}h`} />
          <TechKV label="Last Cycle" value={data.lastStatsRefreshAt ? fmtShortAgo(data.lastStatsRefreshAt) : "Never"} />
          <TechKV label="Next Cycle" value={nextRescoreIn != null ? fmtDuration(nextRescoreIn) : "—"} />
        </div>
      </div>
    </div>
  );
}

function TechStage({ num, title, desc, status }: { num: number; title: string; desc: string; status: string }) {
  return (
    <div className="rounded border border-border p-3 text-center">
      <div className="w-6 h-6 rounded-full bg-purple/10 text-purple text-xs font-bold flex items-center justify-center mx-auto mb-1.5">{num}</div>
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
      <div className="text-[11px] font-medium text-purple mt-1">{status}</div>
    </div>
  );
}

function TechKV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground font-mono mt-0.5">{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Section Title
═══════════════════════════════════════════════════════════ */

function SectionTitle({ icon: Icon, title }: { icon: typeof Zap; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════ */

function getConfidenceLevel(sp: VectorIntelligenceData["scoreProfile"]): number {
  if (!sp) return 0;
  const total = (sp.totalOutcomes || 0) + (sp.totalDecisions || 0);
  if (total < 5) return 0;
  if (total < 15) return 0.3;
  if (total < 30) return 0.6;
  return 0.9;
}

function getGrade(
  sp: VectorIntelligenceData["scoreProfile"],
  coveragePct: number,
  confidence: number,
): { letter: string; color: string; headline: string; description: string } {
  if (!sp || confidence === 0) {
    return {
      letter: "—",
      color: "border-muted-foreground",
      headline: "Getting started",
      description: "The AI is collecting data. Start making decisions on stories (like, skip, or trash) and it will learn what content works best for your channel.",
    };
  }

  const viralAcc = sp.aiViralAccuracy;
  const relAcc = sp.aiRelevanceAccuracy;
  const avgAcc = (viralAcc + relAcc) / 2;
  const score = avgAcc * 0.5 + (coveragePct / 100) * 0.2 + confidence * 0.3;

  if (score >= 0.8) return {
    letter: "A",
    color: "border-success",
    headline: "The AI is performing great",
    description: `It's ${Math.round(avgAcc * 100)}% accurate at predicting what works for your channel, with strong confidence from ${sp.totalDecisions} decisions.`,
  };
  if (score >= 0.6) return {
    letter: "B",
    color: "border-success",
    headline: "The AI is getting smarter",
    description: `Accuracy is at ${Math.round(avgAcc * 100)}% and improving. Keep reviewing stories to help it learn your preferences faster.`,
  };
  if (score >= 0.4) return {
    letter: "C",
    color: "border-orange",
    headline: "The AI is still learning",
    description: `It has ${sp.totalDecisions} decisions to learn from, but needs more data. The more stories you review, the better it gets at finding what fits your channel.`,
  };
  return {
    letter: "D",
    color: "border-orange",
    headline: "The AI needs more input",
    description: "Accuracy is low because there isn't enough data yet. Try reviewing more stories — each decision helps the AI understand your content strategy.",
  };
}

function fmtShortAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
