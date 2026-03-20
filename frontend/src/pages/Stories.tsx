import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { ArrowUpRight, Loader2, Upload } from "lucide-react";
import { PageError } from "@/components/PageError";

const STORIES_PAGE_SIZE = 50;
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Stage = "suggestion" | "liked" | "scripting" | "filmed" | "publish" | "done" | "passed" | "omit";

export interface ApiStory {
  id: string;
  headline: string;
  origin?: string;
  stage: Stage;
  coverageStatus: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  relevanceScore: number | null;
  viralScore: number | null;
  firstMoverScore: number | null;
  compositeScore: number | null;
  scriptLong: string | null;
  scriptShort: string | null;
  brief: Record<string, unknown> | null;
  queryVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

const SOURCE_COLORS: Record<string, string> = {
  NewsAPI: "text-emerald-400",
  GNews: "text-emerald-400",
  "The Guardian": "text-emerald-400",
  Guardian: "text-emerald-400",
  NYT: "text-emerald-400",
  Firecrawl: "text-dim",
  News: "text-emerald-400",
};

function getSourceBadge(sourceName: string | null): { label: string; color: string } | null {
  if (!sourceName) return null;
  const provider = sourceName.split("/")[0].trim();
  return { label: provider, color: SOURCE_COLORS[provider] || "text-dim" };
}

const STAGES: { key: Stage; label: string; color: string; pillClass: string; sub: string }[] = [
  { key: "suggestion", label: "AI Suggestion", color: "text-orange",     pillClass: "bg-orange/15 text-orange",     sub: "awaiting triage · multi-source news" },
  { key: "liked",      label: "Liked",          color: "text-blue",       pillClass: "bg-blue/15 text-blue",       sub: "saved for review" },
  { key: "scripting",  label: "Scripting",      color: "text-blue",       pillClass: "bg-blue/15 text-blue",       sub: "editing script" },
  { key: "filmed",     label: "Filmed",         color: "text-success",    pillClass: "bg-success/15 text-success", sub: "waiting for URL" },
  { key: "publish",    label: "Publish",        color: "text-primary",   pillClass: "bg-primary/15 text-primary", sub: "final details needed" },
  { key: "done",       label: "Done",           color: "text-foreground", pillClass: "bg-foreground/15 text-foreground", sub: "published all time" },
  { key: "passed",     label: "Passed",         color: "text-dim",        pillClass: "bg-elevated text-dim border border-border", sub: "passed on" },
  { key: "omit",       label: "Omitted",        color: "text-dim",        pillClass: "bg-elevated text-dim border border-border", sub: "insufficient data" },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 min ago" : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: diff > 365 * 24 * 60 * 60 * 1000 ? "numeric" : undefined });
}

function MiniScores({ story }: { story: ApiStory }) {
  const items = [
    { val: story.relevanceScore ?? 0, bar: "bg-purple",  label: "Relevance" },
    { val: story.viralScore ?? 0,     bar: "bg-blue",    label: "Demand" },
    { val: story.firstMoverScore ?? 0, bar: "bg-success", label: "First Mover" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-1" title={`${s.label}: ${s.val}/100`}>
          <div className="w-5 h-1 bg-elevated rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.val}%` }} />
          </div>
          <span className={`text-[10px] font-mono font-medium ${
            i === 0 ? "text-purple" : i === 1 ? "text-blue" : "text-success"
          }`}>{s.val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Stories() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();
  const [stories, setStories] = useState<ApiStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<Stage | "all">("suggestion");

  const [summary, setSummary] = useState<{
    total: number;
    firstMovers: number;
    firstMoverPct: number;
  } | null>(null);
  const [storiesDisplayLimit, setStoriesDisplayLimit] = useState(STORIES_PAGE_SIZE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const storyListScrollRef = useRef<HTMLDivElement>(null);

  const loadStories = useCallback(async () => {
    setLoadError(null);
    if (!channelId) return;
    try {
      const [storiesRes, summaryRes] = await Promise.all([
        fetch(`/api/stories?channelId=${channelId}&slim=true`, { credentials: "include" }),
        fetch(`/api/stories/summary?channelId=${channelId}`, { credentials: "include" }),
      ]);
      if (storiesRes.ok) setStories(await storiesRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load stories";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadStories();
    const interval = setInterval(loadStories, 30_000);
    return () => clearInterval(interval);
  }, [loadStories]);

  useEffect(() => {
    setStoriesDisplayLimit(STORIES_PAGE_SIZE);
  }, [activeStage]);

  const navigate = useNavigate();
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [nextRescore, setNextRescore] = useState<string | null>(null);
  

  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/vector-intelligence/status?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.lastStatsRefreshAt) return;
        const last = new Date(d.lastStatsRefreshAt).getTime();
        const interval = (d.rescoreIntervalHours ?? 24) * 3600000;
        const next = last + interval;
        const diff = next - Date.now();
        if (diff <= 0) { setNextRescore("soon"); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        setNextRescore(h > 0 ? `${h}h ${m}m` : `${m}m`);
      })
      .catch(() => {});
  }, [channelId]);

  const handleFetch = async () => {
    const msg = "Legacy story fetch has been removed. Use Source or Article Pipeline to ingest articles instead.";
    setFetchError(msg);
    toast.error(msg);
  };

  const handleReEvaluate = async () => {
    if (!channelId || reEvaluating) return;
    setReEvaluating(true);
    try {
      const res = await fetch(`/api/stories/re-evaluate?channelId=${encodeURIComponent(channelId)}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Re-evaluation failed");
      toast.success(`Re-evaluated ${data.evaluated ?? 0} stories — ${data.changed ?? 0} scores updated`);
      loadStories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-evaluation failed");
    } finally {
      setReEvaluating(false);
    }
  };

  

  if (loadError) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <h1 className="text-sm font-semibold">AI Intelligence</h1>
        </div>
        <div className="flex-1">
          <PageError
            title="Could not load stories"
            message={loadError}
            onRetry={() => { setLoadError(null); loadStories(); }}
            showHome
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <h1 className="text-sm font-semibold">AI Intelligence</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      </div>
    );
  }

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stories) {
      counts[s.stage] = (counts[s.stage] || 0) + 1;
    }
    return counts;
  }, [stories]);

  const stageStoriesSorted = useMemo(() => {
    const filtered = activeStage === "all" ? stories : stories.filter((s) => s.stage === activeStage);
    return [...filtered].sort((a, b) => {
      const scoreA = a.compositeScore ?? 0;
      const scoreB = b.compositeScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [stories, activeStage]);
  const stageStoriesVisible = stageStoriesSorted.slice(0, storiesDisplayLimit);
  const hasMoreStories = stageStoriesSorted.length > storiesDisplayLimit;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">AI Intelligence</h1>
        </div>
        <div className="flex items-center gap-3">
          {nextRescore && (
            <span className="text-[10px] text-dim font-mono">
              next auto re-score in {nextRescore}
            </span>
          )}
          <button
            onClick={handleReEvaluate}
            disabled={reEvaluating}
            title="Refresh competition stats, learn from decisions, and re-score all active stories"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple/30 text-[11px] font-medium text-purple hover:bg-purple/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {reEvaluating ? (
              <>
                <span className="w-3 h-3 border-2 border-purple/30 border-t-purple rounded-full animate-spin" />
                Re-evaluating…
              </>
            ) : (
              "Re-evaluate Scores"
            )}
          </button>
          <button
            onClick={() => navigate(channelPath("/publish"))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange text-orange-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Upload className="w-3 h-3" />
            Ready to Publish
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mx-6 max-lg:mx-4 mt-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-3">
          <span className="text-[12px] text-destructive flex-1 min-w-0 break-words" title={fetchError}>{fetchError}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fetchError).then(() => toast.success("Copied"));
              }}
              className="text-[11px] font-medium text-dim hover:text-foreground"
            >
              Copy
            </button>
            <button type="button" onClick={() => setFetchError(null)} className="text-[11px] font-medium text-dim hover:text-foreground">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-auto">
        {/* Stage filter pills */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveStage("all")}
              className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                activeStage === "all"
                  ? "bg-foreground/10 text-foreground border border-foreground/20"
                  : "text-dim border border-border hover:text-foreground hover:border-foreground/20"
              }`}
            >
              All ({stories.length})
            </button>
            {STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setActiveStage(s.key)}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                    activeStage === s.key
                      ? "bg-foreground/10 text-foreground border border-foreground/20"
                      : "text-dim border border-border hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  {s.label} ({stageCounts[s.key] || 0})
                </button>
              ))}
          </div>
        </div>

        {/* Story list */}
        <div className="px-6 max-lg:px-4 pb-8">
          <div
            className="rounded-xl border border-border overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-background shrink-0 flex items-center gap-2">
              <span className="text-[13px] font-semibold">
                {activeStage === "all" ? "All" : STAGES.find((s) => s.key === activeStage)?.label}
              </span>
              <span className="text-[12px] text-dim font-mono">({stageStoriesSorted.length})</span>
            </div>

            {/* Items */}
            <div
              ref={storyListScrollRef}
              className="flex-1 overflow-auto bg-background"
              onScroll={() => {
                const el = storyListScrollRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80 && hasMoreStories) {
                  setStoriesDisplayLimit((prev) => prev + STORIES_PAGE_SIZE);
                }
              }}
            >
              {stageStoriesSorted.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[12px] text-dim font-mono">
                  No stories in this stage
                </div>
              ) : (
                stageStoriesVisible.map((story) => {
                  const isFirst = story.coverageStatus === "first";
                  const isLate = story.coverageStatus === "late";
                  const total = story.compositeScore ?? 0;
                  const stageInfo = STAGES.find((s) => s.key === story.stage);
                  const relative = relativeTime(story.createdAt);
                  const sourceLabel = relative ?? "";

                  return (
                    <Link
                      key={story.id}
                      to={channelPath(`/story/${story.id}`)}
                      className="block w-full px-4 py-3.5 border-t border-border text-right hover:bg-[#0d0d10] transition-colors group no-underline"
                    >
                      <div className="flex items-start justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {stageInfo && (
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${stageInfo.pillClass}`}>
                              {stageInfo.label}
                            </span>
                          )}
                          {isFirst && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                              1st
                            </span>
                          )}
                          {isLate && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange">
                              Late
                            </span>
                          )}
                          {story.origin === "manual" && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange border border-orange/20">
                              Manual
                            </span>
                          )}
                        </div>
                        <span className="link text-[13px] font-medium leading-snug flex-1 min-w-0 flex items-center justify-end gap-1.5">
                          <span className="truncate">{story.headline}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2 text-[10px] font-mono mb-2">
                        {(() => {
                          const badge = getSourceBadge(story.sourceName);
                          if (badge) return <span className={`${badge.color}`}>{badge.label}</span>;
                          return null;
                        })()}
                        {story.sourceName && story.sourceName.includes("/") && (
                          <span className="text-dim">{story.sourceName.split("/").slice(1).join("/").trim()}</span>
                        )}
                        {sourceLabel && <span className="text-dim">{sourceLabel}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <MiniScores story={story} />
                        <span className={`text-[12px] font-mono font-bold shrink-0 ml-auto ${story.compositeScore == null ? "text-dim" : ""}`}>
                          {story.compositeScore != null
                            ? `${Number(story.compositeScore).toFixed(1)}/10`
                            : "—/10"}
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
              {hasMoreStories && (
                <div className="flex items-center justify-center py-3 border-t border-border">
                  <span className="text-[11px] text-dim font-mono">Scroll down to load more</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
}
