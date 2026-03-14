import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { ArrowDown, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Stage = "suggestion" | "liked" | "approved" | "filmed" | "publish" | "done";

export interface ApiStory {
  id: string;
  headline: string;
  stage: Stage;
  coverageStatus: string | null;  // "first" | "late" | null
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
  createdAt: string;
  updatedAt: string;
}

const STAGES: { key: Stage; label: string; color: string; sub: string }[] = [
  { key: "suggestion", label: "AI Suggestion", color: "text-orange",     sub: "awaiting triage" },
  { key: "liked",      label: "Liked",          color: "text-blue",       sub: "saved for review" },
  { key: "approved",   label: "Approved",        color: "text-purple",     sub: "brief generation ready" },
  { key: "filmed",     label: "Filmed",          color: "text-success",    sub: "waiting for URL" },
  { key: "publish",    label: "Publish",         color: "text-primary",    sub: "final details needed" },
  { key: "done",       label: "Done",            color: "text-foreground", sub: "published all time" },
];

function MiniScores({ story }: { story: ApiStory }) {
  const items = [
    { val: story.relevanceScore ?? 0,   bar: "bg-purple" },
    { val: story.viralScore ?? 0,       bar: "bg-blue"   },
    { val: story.firstMoverScore ?? 0,  bar: "bg-success" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
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
  const { projectId } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();

  const [stories, setStories] = useState<ApiStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [activeStage, setActiveStage] = useState<Stage>("suggestion");

  const [summary, setSummary] = useState<{
    total: number;
    firstMovers: number;
    firstMoverPct: number;
  } | null>(null);

  const loadStories = useCallback(async () => {
    if (!projectId) return;
    try {
      const [storiesRes, summaryRes] = await Promise.all([
        fetch(`/api/stories?projectId=${projectId}`, { credentials: "include" }),
        fetch(`/api/stories/summary?projectId=${projectId}`, { credentials: "include" }),
      ]);
      if (storiesRes.ok) setStories(await storiesRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch {
      toast.error("Failed to load stories");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const handleFetch = async () => {
    setFetching(true);
    toast.success("Fetching new stories from Perplexity Sonar…");
    // Re-load after a short delay to pick up any newly created stories
    setTimeout(() => { loadStories(); setFetching(false); }, 2000);
  };

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

  const stageStories = stories.filter((s) => s.stage === activeStage);
  const firstMoverPct = summary?.firstMoverPct ?? 0;
  const firstMoverCount = summary?.firstMovers ?? 0;
  const totalStories = summary?.total ?? stories.length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">AI Intelligence</h1>
          <span className="text-[11px] text-dim font-mono">
            content pipeline — AI-powered story discovery
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50"
          >
            {fetching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            Fetch
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        {/* Stats row */}
        <div className="px-6 max-lg:px-4 mb-5 pt-5">
          <div className="flex rounded-xl overflow-hidden">
            {STAGES.map((s) => {
              const count = stories.filter((st) => st.stage === s.key).length;
              return (
                <div
                  key={s.key}
                  className="flex-1 px-5 py-4 bg-background border-r border-background last:border-r-0"
                >
                  <div className={`text-2xl font-semibold font-mono tracking-tight ${s.color}`}>
                    {count}
                  </div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">
                    {s.label}
                  </div>
                  <div className="mt-2 text-[11px] text-dim font-mono">{s.sub}</div>
                </div>
              );
            })}
            {/* First Mover aggregate */}
            <div className="px-5 py-4 bg-background min-w-[120px]">
              <div className="text-2xl font-semibold font-mono tracking-tight text-success">
                {firstMoverPct}%
              </div>
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">
                First Mover
              </div>
              <div className="mt-2 text-[11px] text-dim font-mono">
                {firstMoverCount} of {totalStories} stories · ↑ strong
              </div>
            </div>
          </div>
        </div>

        {/* Stage filter pills */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            {STAGES.map((s) => {
              const count = stories.filter((st) => st.stage === s.key).length;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveStage(s.key)}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                    activeStage === s.key
                      ? "bg-foreground/10 text-foreground border border-foreground/20"
                      : "text-dim border border-border hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  {s.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Story list */}
        <div className="px-6 max-lg:px-4 pb-8">
          <div
            className="rounded-xl border border-border overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-background shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">
                  {STAGES.find((s) => s.key === activeStage)?.label}
                </span>
                <span className="text-[12px] text-dim font-mono">({stageStories.length})</span>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-auto bg-background">
              {stageStories.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[12px] text-dim font-mono">
                  No stories in this stage
                </div>
              ) : (
                stageStories.map((story) => {
                  const isFirst = story.coverageStatus === "first";
                  const isLate = story.coverageStatus === "late";
                  const total = story.compositeScore ?? 0;
                  const sourceLabel = [story.sourceName, story.sourceDate?.split("T")[0]]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <button
                      key={story.id}
                      onClick={() => navigate(projectPath(`/story/${story.id}`))}
                      className="w-full px-4 py-3.5 border-t border-border text-right hover:bg-[#0d0d10] transition-colors group"
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 shrink-0">
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
                          <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <span className="text-[13px] font-medium leading-snug flex-1 ml-2">
                          {story.headline}
                        </span>
                      </div>
                      {sourceLabel && (
                        <div className="text-[10px] text-dim font-mono mb-2">{sourceLabel}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <MiniScores story={story} />
                        {total > 0 && (
                          <span className="text-[12px] font-mono font-bold">{total}</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
