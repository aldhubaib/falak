import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  RotateCw, Loader2, Zap, TrendingUp, Bell, Search, Activity,
  Target, Brain, Database, BarChart3, Shield, ArrowRight,
  CheckCircle2, Clock, RefreshCw, Circle, Settings,
  ChevronRight, Layers, Cpu, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

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
}

/* ─── Main Component ─── */

export default function VectorIntelligence() {
  const { channelId } = useParams();
  const pp = useChannelPath();
  const [data, setData] = useState<VectorIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [countdown, setCountdown] = useState(60);

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
    setCountdown(60);
    const tick = setInterval(() => {
      setCountdown((p) => { if (p <= 1) { fetchData(); return 60; } return p - 1; });
    }, 1000);
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
        toast.success(`Re-evaluated ${d.evaluated} stories, ${d.changed} scores changed`);
        fetchData();
      })
      .catch(() => toast.error("Re-evaluation failed"))
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
        <div className="rounded-lg border border-border bg-background p-8 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-purple/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-purple" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground mb-2">Vector Intelligence Not Configured</h2>
          <p className="text-[12px] text-dim mb-1">Semantic similarity, competition matching, and self-learning scores require an OpenAI embedding API key.</p>
          <p className="text-[11px] text-dim font-mono mb-4">text-embedding-3-small · 1536 dimensions · pgvector HNSW</p>
          <Link to={pp("/settings")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple text-white text-[12px] font-semibold hover:bg-purple/90 transition-colors no-underline">
            <Settings className="w-3.5 h-3.5" />
            Configure in Settings
          </Link>
        </div>
      </div>
    );
  }

  const vEmb = data.embeddings.videos;
  const sEmb = data.embeddings.stories;
  const vPct = vEmb.total > 0 ? Math.round((vEmb.embedded / vEmb.total) * 100) : 0;
  const sPct = sEmb.total > 0 ? Math.round((sEmb.embedded / sEmb.total) * 100) : 0;
  const totalEmbedded = vEmb.embedded + sEmb.embedded;
  const totalItems = vEmb.total + sEmb.total;
  const sp = data.scoreProfile;
  const confidence = getConfidenceLevel(sp);
  const nextRescoreAt = data.lastStatsRefreshAt
    ? new Date(new Date(data.lastStatsRefreshAt).getTime() + data.rescoreIntervalHours * 3600000)
    : null;
  const nextRescoreIn = nextRescoreAt ? Math.max(0, nextRescoreAt.getTime() - Date.now()) : null;

  return (
    <>
      {/* Actions bar */}
      <div className="h-10 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <span className="text-[10px] text-dim font-mono">text-embedding-3-small · 1536d · pgvector HNSW</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-success/15 text-success">
            <Circle className="w-2 h-2 fill-current" />
            Active · {countdown}s
          </span>
          <button onClick={handleReEvaluate} disabled={reEvaluating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple/30 bg-purple/10 text-purple text-[11px] font-semibold hover:bg-purple/20 transition-colors disabled:opacity-50">
            {reEvaluating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
            {reEvaluating ? "Re-evaluating…" : "Re-evaluate All Stories"}
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        {/* ═══════════════════════════════════════════════════
            SECTION 1: PIPELINE FLOW VISUALIZATION
        ═══════════════════════════════════════════════════ */}
        <div className="px-6 max-lg:px-4 pt-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-dim" />
            <span className="text-[13px] font-semibold text-foreground">Rescore Pipeline</span>
            <span className="text-[11px] text-dim font-mono">— 4-stage cycle running every {data.rescoreIntervalHours}h</span>
          </div>

          <div className="grid grid-cols-4 gap-0 items-stretch max-lg:grid-cols-2 max-lg:gap-3">
            {/* Stage 1: Data Collection */}
            <PipelineStage
              number={1}
              title="Data Collection"
              subtitle="Refresh competition & own stats from YouTube"
              icon={RefreshCw}
              color="text-blue"
              bgColor="bg-blue"
              items={[
                { label: "Competition Channels", value: "Auto-refreshed" },
                { label: "Own Video Stats", value: "Auto-fetched" },
                { label: "Last Refresh", value: data.lastStatsRefreshAt ? fmtShortAgo(data.lastStatsRefreshAt) : "Never" },
              ]}
              isFirst
            />

            {/* Stage 2: Embedding */}
            <PipelineStage
              number={2}
              title="Embedding"
              subtitle="Generate & store vector embeddings"
              icon={Database}
              color="text-purple"
              bgColor="bg-purple"
              items={[
                { label: "Videos Embedded", value: `${vEmb.embedded}/${vEmb.total} (${vPct}%)` },
                { label: "Stories Embedded", value: `${sEmb.embedded}/${sEmb.total} (${sPct}%)` },
                { label: "Total Vectors", value: `${totalEmbedded}/${totalItems}` },
              ]}
            />

            {/* Stage 3: Self-Learning */}
            <PipelineStage
              number={3}
              title="Self-Learning"
              subtitle="Learn from decisions & YouTube outcomes"
              icon={Brain}
              color="text-success"
              bgColor="bg-success"
              items={[
                { label: "Decisions Learned", value: String(sp?.totalDecisions ?? 0) },
                { label: "Outcomes Tracked", value: String(sp?.totalOutcomes ?? 0) },
                { label: "Confidence", value: `${Math.round(confidence * 100)}%` },
              ]}
            />

            {/* Stage 4: Re-scoring */}
            <PipelineStage
              number={4}
              title="Re-scoring"
              subtitle="Re-evaluate all active story scores"
              icon={BarChart3}
              color="text-orange"
              bgColor="bg-orange"
              items={[
                { label: "Stories Re-scored", value: `${data.rescoreStats.rescored}/${data.rescoreStats.total}` },
                { label: "Alerts Generated", value: `${data.alerts.unreadCount} unread` },
                { label: "Next Run", value: nextRescoreIn != null ? fmtDuration(nextRescoreIn) : "—" },
              ]}
              isLast
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 2: EMBEDDING COVERAGE
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Database} title="Embedding Coverage" subtitle="Vector storage status for competition videos and stories" />
        <div className="px-6 max-lg:px-4 mb-6">
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <CoverageCard
              title="Competition Videos"
              icon={Target}
              color="text-blue"
              bgColor="bg-blue"
              embedded={vEmb.embedded}
              total={vEmb.total}
              pct={vPct}
            />
            <CoverageCard
              title="Stories"
              icon={BookOpen}
              color="text-purple"
              bgColor="bg-purple"
              embedded={sEmb.embedded}
              total={sEmb.total}
              pct={sPct}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 3: AI ACCURACY & SELF-LEARNING
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Brain} title="Self-Learning Profile" subtitle="AI accuracy calibration and learned content signals" />
        <div className="px-6 max-lg:px-4 mb-6 space-y-3">
          {sp ? (
            <>
              {/* Accuracy & Stats row */}
              <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
                <AccuracyGauge label="AI Viral Accuracy" value={sp.aiViralAccuracy} description="How well AI predicts viral potential vs actual YouTube performance" />
                <AccuracyGauge label="AI Relevance Accuracy" value={sp.aiRelevanceAccuracy} description="How well AI predicts content relevance to your audience" />
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Confidence Level</div>
                  <div className={`text-2xl font-mono font-semibold ${confidence >= 0.6 ? "text-success" : confidence >= 0.3 ? "text-orange" : "text-dim"}`}>
                    {Math.round(confidence * 100)}%
                  </div>
                  <div className="text-[10px] text-dim font-mono mt-1">
                    {confidence >= 0.9 ? "High — learned signals heavily weighted" :
                     confidence >= 0.6 ? "Medium — moderate adjustment" :
                     confidence >= 0.3 ? "Low — conservative adjustments" :
                     "Bootstrapping — more data needed"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Decisions</div>
                  <div className="text-2xl font-mono font-semibold text-foreground">{sp.totalDecisions}</div>
                  <div className="text-[10px] text-dim font-mono mt-1">liked / passed / omit</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Outcomes</div>
                  <div className="text-2xl font-mono font-semibold text-foreground">{sp.totalOutcomes}</div>
                  <div className="text-[10px] text-dim font-mono mt-1">stories with YouTube stats</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Last Learned</div>
                  <div className="text-lg font-mono font-semibold text-foreground">
                    {sp.lastLearnedAt ? fmtShortAgo(sp.lastLearnedAt) : "Never"}
                  </div>
                  <div className="text-[10px] text-dim font-mono mt-1">learning rate: 0.1</div>
                </div>
              </div>

              {/* Content Type Signals */}
              {sp.contentTypeSignals && Object.keys(sp.contentTypeSignals).length > 0 && (
                <SignalCard
                  title="Content Type Signals"
                  subtitle="Learned preference for each content type based on decisions and YouTube performance"
                  signals={sp.contentTypeSignals}
                />
              )}

              {/* Tag Signals */}
              {sp.tagSignals && Object.keys(sp.tagSignals).length > 0 && (
                <SignalCard
                  title="Tag Signals"
                  subtitle="Learned tag performance weights — positive tags boost scores, negative tags penalize"
                  signals={sp.tagSignals}
                  rtl
                  limit={30}
                />
              )}

              {/* Region Signals */}
              {sp.regionSignals && Object.keys(sp.regionSignals).length > 0 && (
                <SignalCard
                  title="Region Signals"
                  subtitle="Geographic region performance based on historical audience engagement"
                  signals={sp.regionSignals}
                  rtl
                />
              )}
            </>
          ) : (
            <EmptyState icon={Brain} title="No learning profile yet" description="Needs at least 5 decisions and 3 outcomes with YouTube stats to start learning." />
          )}
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 4: COMPETITION INTELLIGENCE
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Target} title="Competition Intelligence" subtitle="Stories matched against competitor videos via semantic similarity" />
        <div className="px-6 max-lg:px-4 mb-6">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 bg-background border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-orange" />
                <span className="text-[12px] font-semibold">Top Competition Matches</span>
                <span className="text-[11px] text-dim font-mono">({data.topSimilarity.length} stories with competition overlap)</span>
              </div>
            </div>
            <div className="bg-background">
              {data.topSimilarity.length === 0 ? (
                <EmptyState icon={Target} title="No competition matches found yet" description="Embeddings will be compared during next rescore cycle." />
              ) : (
                <div className="divide-y divide-border">
                  {data.topSimilarity.map((s, i) => (
                    <Link key={s.id} to={pp(`/story/${s.id}`)}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-card/50 transition-colors no-underline group">
                      <span className="w-6 h-6 rounded-full bg-orange/10 flex items-center justify-center text-[10px] font-bold text-orange shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-foreground font-medium truncate mb-0.5" dir="auto">{s.headline}</div>
                        <div className="flex items-center gap-4 text-[10px] font-mono">
                          <span className="text-purple">
                            <Search className="w-2.5 h-2.5 inline mr-0.5" />{s.competitionMatches} matches
                          </span>
                          <span className={s.viralBoost > 5 ? "text-success" : s.viralBoost > 0 ? "text-foreground" : "text-dim"}>
                            <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />viral {s.viralBoost > 0 ? "+" : ""}{s.viralBoost?.toFixed?.(1) ?? 0}
                          </span>
                          <span className="text-dim">
                            freshness {(s.freshness * 100)?.toFixed?.(0) ?? "—"}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] font-mono font-semibold text-foreground">{s.compositeScore?.toFixed?.(1) ?? "—"}</div>
                        <div className="text-[9px] text-dim font-mono uppercase">score</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 5: RECENT RE-SCORES + ALERTS (side by side)
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Activity} title="Score Changes & Alerts" subtitle="Recent re-scoring activity and intelligence notifications" />
        <div className="px-6 max-lg:px-4 mb-6">
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">

            {/* Recent Re-scores */}
            <div className="rounded-lg border border-border overflow-hidden flex flex-col" style={{ maxHeight: 540 }}>
              <div className="px-4 py-3 bg-background shrink-0 border-b border-border">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-success" />
                  <span className="text-[12px] font-semibold">Recent Score Changes</span>
                  <span className="text-[11px] text-dim font-mono">({data.recentRescores.length})</span>
                </div>
                <div className="text-[10px] text-dim font-mono mt-0.5">Stories whose composite score changed during re-evaluation</div>
              </div>
              <div className="flex-1 overflow-y-auto bg-background">
                {data.recentRescores.length === 0 ? (
                  <EmptyState icon={Activity} title="No re-scores yet" />
                ) : (
                  data.recentRescores.map((s) => {
                    const before = s.latestEntry?.before?.compositeScore;
                    const after = s.latestEntry?.after?.compositeScore;
                    const delta = (before != null && after != null) ? after - before : null;
                    const factors = s.latestEntry?.factors as Record<string, unknown> | undefined;
                    return (
                      <Link key={s.id} to={pp(`/story/${s.id}`)}
                        className="block px-4 py-3 border-t border-border hover:bg-card/50 transition-colors no-underline">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[12px] text-foreground font-medium truncate flex-1 mr-3" dir="auto">{s.headline}</div>
                          {delta != null && (
                            <span className={`text-[12px] font-mono font-semibold shrink-0 ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-dim"}`}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                          {delta != null && (
                            <span className="text-dim">
                              {before?.toFixed(1)} → {after?.toFixed(1)}
                            </span>
                          )}
                          {factors && (
                            <>
                              {Number(factors.competitionMatches) > 0 && (
                                <span className="text-purple">{String(factors.competitionMatches)} comp</span>
                              )}
                              {Number(factors.provenViralBoost) !== 0 && (
                                <span className={Number(factors.provenViralBoost) > 0 ? "text-success" : "text-destructive"}>
                                  viral {Number(factors.provenViralBoost) > 0 ? "+" : ""}{String(factors.provenViralBoost)}
                                </span>
                              )}
                              {Number(factors.ownChannelBoost) !== 0 && (
                                <span className="text-blue">own {Number(factors.ownChannelBoost) > 0 ? "+" : ""}{String(factors.ownChannelBoost)}</span>
                              )}
                            </>
                          )}
                          {s.lastRescoredAt && (
                            <span className="text-dim ml-auto">{fmtShortAgo(s.lastRescoredAt)}</span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            {/* Alerts */}
            <div className="rounded-lg border border-border overflow-hidden flex flex-col" style={{ maxHeight: 540 }}>
              <div className="px-4 py-3 bg-background shrink-0 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-orange" />
                  <span className="text-[12px] font-semibold">Intelligence Alerts</span>
                  {data.alerts.unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-orange/15 text-orange text-[10px] font-mono font-semibold">
                      {data.alerts.unreadCount} new
                    </span>
                  )}
                  <span className="text-[11px] text-dim font-mono">({data.alerts.items.length} total)</span>
                </div>
                <div className="text-[10px] text-dim font-mono mt-0.5">Significant score changes, competitor coverage, and trending topics</div>
              </div>
              <div className="flex-1 overflow-y-auto bg-background">
                {data.alerts.items.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-[11px] text-dim font-mono">No alerts — all quiet</div>
                ) : (
                  data.alerts.items.map((a) => (
                    <div key={a.id} className={`px-4 py-3 border-t border-border ${a.isRead ? "" : "bg-orange/[0.03]"}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {!a.isRead && <span className="w-1.5 h-1.5 rounded-full bg-orange shrink-0" />}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold ${
                          a.type === "score_change" ? "bg-purple/10 text-purple" :
                          a.type === "competitor_published" ? "bg-blue/10 text-blue" :
                          a.type === "trending_topic" ? "bg-success/10 text-success" :
                          "bg-dim/10 text-dim"
                        }`}>
                          {a.type === "score_change" ? "Score Change" :
                           a.type === "competitor_published" ? "Competitor Published" :
                           a.type === "trending_topic" ? "Trending Topic" :
                           a.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-dim font-mono ml-auto">{fmtShortAgo(a.createdAt)}</span>
                      </div>
                      <div className="text-[11px] text-foreground/80" dir="auto">{a.title}</div>
                      {a.storyId && (
                        <Link to={pp(`/story/${a.storyId}`)} className="text-[10px] text-purple font-mono mt-1 inline-flex items-center gap-0.5 hover:underline no-underline">
                          View story <ChevronRight className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 6: SCORING FORMULA BREAKDOWN
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Cpu} title="Scoring Formula" subtitle="How the composite score is computed during re-evaluation" />
        <div className="px-6 max-lg:px-4 mb-6">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
              {/* Base Score */}
              <div>
                <div className="text-[11px] font-mono font-semibold text-foreground mb-2">Base Score (AI predictions)</div>
                <div className="space-y-1.5">
                  <FormulaRow label="Relevance" weight="25%" description="AI-predicted audience relevance" />
                  <FormulaRow label="Viral (corrected)" weight="25%" description="Viral potential × AI accuracy multiplier" />
                  <FormulaRow label="First Mover" weight="15%" description="Adjusted for competitor coverage + time decay" />
                  <FormulaRow label="Freshness" weight="10%" description="Exponential decay (half-life: 7 days)" />
                </div>
              </div>
              {/* Learned Boost */}
              <div>
                <div className="text-[11px] font-mono font-semibold text-foreground mb-2">Learned Boost (× confidence {Math.round(confidence * 100)}%)</div>
                <div className="space-y-1.5">
                  <FormulaRow label="Proven Viral" weight="10%" description="Competition video performance ratio" />
                  <FormulaRow label="Own Channel" weight="5%" description="Similar own stories performance" />
                  <FormulaRow label="Tag Signals" weight="5%" description="Learned tag preference weights" />
                  <FormulaRow label="Content Type" weight="3%" description="Learned content type bias" />
                  <FormulaRow label="Region" weight="2%" description="Learned regional performance" />
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] text-dim font-mono">
                final = base_score + (learned_boost × confidence) · clamped to 0–100 · rounded to 0.1
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 7: SYSTEM STATUS
        ═══════════════════════════════════════════════════ */}
        <SectionHeader icon={Shield} title="System Status" subtitle="Worker health and operational details" />
        <div className="px-6 max-lg:px-4 pb-8">
          <div className="flex rounded-lg overflow-hidden border border-border">
            <StatusBox label="Embedding Model" value="text-embedding-3-small" />
            <StatusBox label="Dimensions" value="1536" />
            <StatusBox label="Index Type" value="HNSW" />
            <StatusBox label="Rescore Interval" value={`${data.rescoreIntervalHours}h`} />
            <StatusBox label="Last Cycle" value={data.lastStatsRefreshAt ? fmtShortAgo(data.lastStatsRefreshAt) : "Never"} />
            <StatusBox label="Next Cycle" value={nextRescoreIn != null ? fmtDuration(nextRescoreIn) : "—"} />
            <StatusBox label="Active Stages" value="5" sub="suggestion · liked · scripting · filmed · publish" last />
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════ */

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Zap; title: string; subtitle: string }) {
  return (
    <div className="px-6 max-lg:px-4 mb-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-dim" />
      <span className="text-[13px] font-semibold text-foreground">{title}</span>
      <span className="text-[11px] text-dim font-mono">— {subtitle}</span>
    </div>
  );
}

function PipelineStage({
  number, title, subtitle, icon: Icon, color, bgColor, items, isFirst, isLast,
}: {
  number: number; title: string; subtitle: string;
  icon: typeof Zap; color: string; bgColor: string;
  items: { label: string; value: string }[];
  isFirst?: boolean; isLast?: boolean;
}) {
  return (
    <div className="flex items-stretch">
      <div className={`flex-1 rounded-lg border border-border bg-background p-4 relative ${!isFirst ? "max-lg:ml-0 ml-0" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-6 h-6 rounded-full ${bgColor}/15 flex items-center justify-center text-[10px] font-bold ${color}`}>
            {number}
          </span>
          <div>
            <div className="text-[12px] font-semibold text-foreground">{title}</div>
            <div className="text-[10px] text-dim font-mono">{subtitle}</div>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-[10px] text-dim font-mono">{item.label}</span>
              <span className={`text-[11px] font-mono font-semibold ${color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      {!isLast && (
        <div className="flex items-center px-1 max-lg:hidden">
          <ArrowRight className="w-4 h-4 text-dim/30" />
        </div>
      )}
    </div>
  );
}

function CoverageCard({
  title, icon: Icon, color, bgColor, embedded, total, pct,
}: {
  title: string; icon: typeof Zap; color: string; bgColor: string;
  embedded: number; total: number; pct: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-[12px] font-semibold text-foreground">{title}</span>
        </div>
        <span className={`text-[20px] font-mono font-semibold ${color}`}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-border rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full ${bgColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-dim">
        <span>{embedded.toLocaleString()} embedded</span>
        <span>{(total - embedded).toLocaleString()} remaining</span>
        <span>{total.toLocaleString()} total</span>
      </div>
    </div>
  );
}

function AccuracyGauge({ label, value, description }: { label: string; value: number; description: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-success" : pct >= 50 ? "text-orange" : "text-destructive";
  const bgColor = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-orange" : "bg-destructive";
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-mono font-semibold ${color}`}>{pct}%</div>
      <div className="w-full h-1.5 bg-border rounded-full mt-2 overflow-hidden">
        <div className={`h-full rounded-full ${bgColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-dim font-mono mt-2 leading-relaxed">{description}</div>
    </div>
  );
}

function SignalCard({
  title, subtitle, signals, rtl, limit,
}: {
  title: string; subtitle: string; signals: Record<string, number>; rtl?: boolean; limit?: number;
}) {
  const sorted = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  const displayed = limit ? sorted.slice(0, limit) : sorted;
  const maxAbs = Math.max(...sorted.map(([, v]) => Math.abs(v)), 0.01);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-mono font-semibold text-foreground">{title}</div>
        <span className="text-[10px] text-dim font-mono">{sorted.length} signals{limit && sorted.length > limit ? ` (showing ${limit})` : ""}</span>
      </div>
      <div className="text-[10px] text-dim font-mono mb-3">{subtitle}</div>
      <div className="flex flex-wrap gap-1.5" dir={rtl ? "rtl" : undefined}>
        {displayed.map(([key, val]) => {
          const intensity = Math.abs(val) / maxAbs;
          return (
            <span key={key} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono ${
              val > 0 ? "bg-success/10 text-success" : val < 0 ? "bg-destructive/10 text-destructive" : "bg-dim/10 text-dim"
            }`} style={{ opacity: 0.5 + intensity * 0.5 }}>
              {key}
              <span className="font-semibold">{val > 0 ? "+" : ""}{val.toFixed(2)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FormulaRow({ label, weight, description }: { label: string; weight: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-[11px] font-mono font-semibold text-purple text-right">{weight}</span>
      <span className="w-28 text-[11px] font-mono text-foreground">{label}</span>
      <span className="text-[10px] text-dim font-mono">{description}</span>
    </div>
  );
}

function StatusBox({ label, value, sub, last }: { label: string; value: string; sub?: string; last?: boolean }) {
  return (
    <div className={`flex-1 px-3 py-3 bg-background ${!last ? "border-r border-border" : ""}`}>
      <div className="text-[13px] font-semibold font-mono tracking-tight text-foreground">{value}</div>
      <div className="text-[9px] text-dim font-mono uppercase tracking-wider mt-0.5">{label}</div>
      {sub && <div className="text-[9px] text-dim font-mono mt-0.5 leading-relaxed">{sub}</div>}
    </div>
  );
}

/* ─── Helpers ─── */

function getConfidenceLevel(sp: VectorIntelligenceData["scoreProfile"]): number {
  if (!sp) return 0;
  const total = (sp.totalOutcomes || 0) + (sp.totalDecisions || 0);
  if (total < 5) return 0;
  if (total < 15) return 0.3;
  if (total < 30) return 0.6;
  return 0.9;
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
