import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Copy, Check, RefreshCw, Eye, ThumbsUp, MessageSquare, Trophy,
  ChevronDown, ChevronRight, ArrowUpRight, Zap, Loader2,
  Brain, MapPin, Film, Sparkles, Database, Filter, Send, ArrowDown,
} from "lucide-react";
import { nowGMT3 } from "@/lib/utils";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { toast } from "sonner";

/* ─── Types ─── */

interface CompetitorEntry { channelId: string; name: string; avatarUrl: string | null }

interface BrainStory {
  id: string; title: string; date: string;
  status: "taken" | "taken_by_us" | "open";
  competitors: CompetitorEntry[]; totalViews: string; daysSince?: number;
}

interface ScoreBreakdown { weight: number; viewPotential: number; freshness: number; saturation: number }

interface RankedOpportunity extends BrainStory {
  score?: number; reasons?: string[]; riskFlags?: string[]; scoreBreakdown?: ScoreBreakdown;
}

interface PublishedVideo {
  id: string; title: string; date: string; views: string; likes: string; comments: string;
  viewsRaw: number; result: "gap_win" | "late"; type: "video" | "short";
  channelId: string; channelName: string; channelAvatarUrl: string | null;
}

interface CompetitorChannel {
  id: string; name: string; handle: string; avatarUrl: string | null;
  color: string; enabled: boolean; count?: number;
}

interface PipelineStep {
  id: string; title: string; description: string;
  inputCount: number; inputLabel: string;
  outputCount: number; outputLabel: string;
  selected: string[]; details: any; active: boolean; threshold?: number;
}

interface QuerySection {
  id: string; label: string; text: string; color: string; active: boolean;
}

interface BrainV2Data {
  competitorStories: BrainStory[]; untouchedStories: BrainStory[];
  publishedVideos: PublishedVideo[]; competitorChannels: CompetitorChannel[];
  competitorActivity: (CompetitorChannel & { count: number })[];
  autoSearchQuery: string; competitorVideoCount?: number;
  stats: { gapWins: number; lateCount: number; winRate: number; totalCompetitorStories: number; untouchedCount: number };
  rankedOpportunities?: RankedOpportunity[];
  modelSignals?: {
    topicMemoryCount?: number; learnedTags?: string[]; regionHints?: string[];
    learnedFormat?: "shorts" | "long"; tier1Count?: number; tier2Count?: number;
    avoidCount?: number; decayHalfLife?: number;
  };
  queryMeta?: { schemaVersion?: number; provider?: string; generatedAt?: string };
  queryPipeline?: PipelineStep[];
  querySections?: QuerySection[];
  videoCounts?: {
    totalInDb: number; oursTotal: number; oursAnalyzed: number;
    competitorTotal: number; competitorAnalyzed: number;
  };
}

/* ─── Small components ─── */

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }}
      className="text-[11px] text-dim hover:text-sensor font-mono flex items-center gap-1 transition-colors shrink-0">
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy
    </button>
  );
}

function UrgencyBadge({ days }: { days: number }) {
  const color = days >= 7 ? "bg-destructive/15 text-destructive" : days >= 3 ? "bg-orange/15 text-orange" : "bg-success/15 text-success";
  const label = days >= 7 ? "Closing fast" : `${days}d open`;
  return <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${color} shrink-0`}>{label}</span>;
}

function ChannelAvatar({ url, name, size = "w-5 h-5" }: { url: string | null; name: string; size?: string }) {
  if (url) return <img src={url} alt={name} className={`${size} rounded-full object-cover border border-border`} />;
  return <span className={`${size} rounded-full bg-elevated border border-border flex items-center justify-center text-[8px] font-bold text-dim uppercase`}>{name.slice(0, 2)}</span>;
}

function daysOpen(dateStr: string): number {
  const now = nowGMT3();
  const d = new Date(dateStr);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

const STEP_ICONS: Record<string, typeof Brain> = {
  tags: Sparkles, regions: MapPin, format: Film, patterns: Brain,
  memory: Database, assembly: Send,
};

const STEP_COLORS: Record<string, string> = {
  tags: "blue", regions: "orange", format: "purple", patterns: "success",
  memory: "sensor", assembly: "blue",
};

const SECTION_COLOR_MAP: Record<string, string> = {
  blue: "border-blue/30 bg-blue/5 text-blue",
  purple: "border-purple/30 bg-purple/5 text-purple",
  green: "border-success/30 bg-success/5 text-success",
  orange: "border-orange/30 bg-orange/5 text-orange",
  cyan: "border-blue/30 bg-blue/5 text-blue",
  emerald: "border-success/30 bg-success/5 text-success",
  red: "border-destructive/30 bg-destructive/5 text-destructive",
  slate: "border-border bg-surface text-dim",
};

/* ─── Pipeline Step Card ─── */

function PipelineStepCard({ step, index, isLast }: { step: PipelineStep; index: number; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[step.id] || Sparkles;
  const color = STEP_COLORS[step.id] || "blue";

  return (
    <div className="relative">
      <button onClick={() => setExpanded(!expanded)}
        className={`w-full text-left rounded-xl border transition-all ${step.active ? `border-${color}/20 bg-${color}/[0.03] hover:bg-${color}/[0.06]` : "border-border/50 bg-surface/30 opacity-60"}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${step.active ? `bg-${color}/15 text-${color}` : "bg-surface text-dim"}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-dim">STEP {index + 1}</span>
              <span className="text-[12px] font-semibold">{step.title}</span>
              {!step.active && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-surface text-dim">INACTIVE</span>}
            </div>
            <p className="text-[11px] text-dim mt-0.5 truncate">{step.description}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[9px] font-mono text-dim uppercase">{step.inputLabel}</div>
              <div className="text-[13px] font-mono font-semibold">{step.inputCount}</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-dim" />
            <div className="text-right">
              <div className="text-[9px] font-mono text-dim uppercase">{step.outputLabel}</div>
              <div className={`text-[13px] font-mono font-semibold ${step.active ? `text-${color}` : ""}`}>{step.outputCount}</div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-dim transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
          </div>
        </div>
      </button>

      {expanded && step.active && (
        <div className="mt-1 px-4 pb-3 pt-2 space-y-2">
          <StepDetails step={step} />
        </div>
      )}

      {!isLast && (
        <div className="flex justify-center py-1">
          <ArrowDown className="w-3.5 h-3.5 text-dim/40" />
        </div>
      )}
    </div>
  );
}

function StepDetails({ step }: { step: PipelineStep }) {
  if (step.id === "tags" && Array.isArray(step.details)) {
    return (
      <div className="rounded-lg bg-surface/50 p-3">
        <div className="text-[9px] font-mono text-dim uppercase mb-2">Tag scores (views x consistency)</div>
        <div className="flex flex-wrap gap-1.5">
          {step.details.map((t: any) => {
            const isTop = step.selected.includes(t.tag);
            return (
              <span key={t.tag} className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-all ${isTop ? "border-blue/30 bg-blue/10 text-blue font-semibold" : "border-border bg-surface text-dim"}`}>
                {t.tag} <span className="opacity-60">({fmt(t.score)})</span>
              </span>
            );
          })}
        </div>
        {step.selected.length > 0 && (
          <div className="mt-2 text-[10px] text-dim font-mono">Top {step.selected.length} selected for query</div>
        )}
      </div>
    );
  }

  if (step.id === "regions" && Array.isArray(step.details)) {
    return (
      <div className="rounded-lg bg-surface/50 p-3">
        <div className="text-[9px] font-mono text-dim uppercase mb-2">Regions from above-median videos (threshold: {fmt(step.threshold || 0)} views)</div>
        {step.details.length === 0 ? (
          <p className="text-[10px] text-dim font-mono">No location data yet — run pipeline with latest prompt to extract locations.</p>
        ) : (
          <div className="space-y-1.5">
            {step.details.map((r: any) => (
              <div key={r.region} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${step.selected.includes(r.region) ? "bg-orange/10 border border-orange/20" : "bg-surface"}`}>
                <span className="text-[11px] font-mono">{r.region}</span>
                <span className="text-[10px] text-dim font-mono">{r.videoCount} video{r.videoCount > 1 ? "s" : ""} · {fmt(r.views)} views</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.id === "format" && step.details) {
    const d = step.details;
    const total = d.winsShort + d.winsLong;
    const shortPct = total > 0 ? Math.round((d.winsShort / total) * 100) : 0;
    const longPct = total > 0 ? 100 - shortPct : 0;
    return (
      <div className="rounded-lg bg-surface/50 p-3">
        <div className="text-[9px] font-mono text-dim uppercase mb-2">Win distribution</div>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-3 bg-elevated rounded-full overflow-hidden flex">
            {shortPct > 0 && <div className="h-full bg-purple rounded-l-full" style={{ width: `${shortPct}%` }} />}
            {longPct > 0 && <div className="h-full bg-blue rounded-r-full" style={{ width: `${longPct}%` }} />}
          </div>
        </div>
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-purple">Shorts: {d.winsShort} wins ({shortPct}%)</span>
          <span className="text-blue">Long: {d.winsLong} wins ({longPct}%)</span>
        </div>
        <div className="mt-1.5 text-[10px] text-dim font-mono">
          Decision: {d.winsShort > d.winsLong * 1.5 ? "Shorts preferred (shorts > 1.5x long)" : "Long-form preferred"}
        </div>
      </div>
    );
  }

  if (step.id === "patterns" && Array.isArray(step.details)) {
    return (
      <div className="rounded-lg bg-surface/50 p-3">
        <div className="text-[9px] font-mono text-dim uppercase mb-2">Top-performing video topics sent to Perplexity</div>
        <div className="space-y-1.5">
          {step.details.map((v: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border/50">
              <span className="text-[9px] font-mono text-dim shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] truncate">{v.title}</div>
                <div className="text-[10px] text-success font-mono truncate">{v.topic}</div>
              </div>
              <span className="text-[10px] font-mono text-dim shrink-0">{fmt(v.views)} views</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step.id === "memory" && step.details) {
    const { proven = [], demand = [], avoid = [] } = step.details;
    return (
      <div className="rounded-lg bg-surface/50 p-3 space-y-2">
        <div className="text-[9px] font-mono text-dim uppercase mb-1">Topic classification</div>
        {proven.length > 0 && (
          <div>
            <div className="text-[9px] font-mono text-success mb-1">Proven ({proven.length})</div>
            <div className="flex flex-wrap gap-1">{proven.map((t: string) => <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">{t}</span>)}</div>
          </div>
        )}
        {demand.length > 0 && (
          <div>
            <div className="text-[9px] font-mono text-orange mb-1">High Demand ({demand.length})</div>
            <div className="flex flex-wrap gap-1">{demand.map((t: string) => <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange/10 text-orange border border-orange/20">{t}</span>)}</div>
          </div>
        )}
        {avoid.length > 0 && (
          <div>
            <div className="text-[9px] font-mono text-destructive mb-1">Avoid ({avoid.length})</div>
            <div className="flex flex-wrap gap-1">{avoid.map((t: string) => <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">{t}</span>)}</div>
          </div>
        )}
        {proven.length === 0 && demand.length === 0 && avoid.length === 0 && (
          <p className="text-[10px] text-dim font-mono">No topics meet tier thresholds yet. More data needed.</p>
        )}
      </div>
    );
  }

  if (step.id === "assembly" && Array.isArray(step.details)) {
    return (
      <div className="rounded-lg bg-surface/50 p-3">
        <div className="text-[9px] font-mono text-dim uppercase mb-2">Query sections</div>
        <div className="space-y-1">
          {step.details.map((s: QuerySection) => (
            <div key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${s.active ? SECTION_COLOR_MAP[s.color] || "border-border bg-surface" : "border-border/30 bg-surface/30 opacity-40"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.active ? "bg-current" : "bg-dim"}`} />
              <span className="text-[10px] font-mono flex-1">{s.label}</span>
              <span className="text-[9px] font-mono opacity-60">{s.active ? `${s.text.length} chars` : "skipped"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/* ─── Main Component ─── */

export default function BrainV2() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [data, setData] = useState<BrainV2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reExtracting, setReExtracting] = useState(false);
  const [takenOpen, setTakenOpen] = useState(false);
  const [creatingStoryFor, setCreatingStoryFor] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [activeTab, setActiveTab] = useState<"pipeline" | "stories" | "videos">("pipeline");

  const handleBackfill = async () => {
    if (!projectId || backfilling) return;
    setBackfilling(true);
    try {
      const r = await fetch(`/api/brain-v2/backfill?projectId=${projectId}`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) { toast.success(d.message || "Backfill complete"); fetchData(); }
      else { toast.error(d.error || "Backfill failed"); }
    } catch { toast.error("Backfill failed"); }
    finally { setBackfilling(false); }
  };

  const handleOpenStory = async (headline: string) => {
    if (!projectId || creatingStoryFor) return;
    setCreatingStoryFor(headline);
    try {
      const r = await fetch("/api/stories", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ projectId, headline, stage: "suggestion", sourceName: "Brain v2" }),
      });
      const story = await r.json().catch(() => null);
      if (r.ok && story?.id) navigate(projectPath(`/story/${story.id}`));
      else toast.error("Could not open story");
    } catch { toast.error("Could not open story"); }
    finally { setCreatingStoryFor(null); }
  };

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setError(null); setLoading(true);
    try {
      const r = await fetch(`/api/brain-v2?projectId=${projectId}`, { credentials: "include" });
      const contentType = r.headers.get("content-type");
      const isJson = contentType?.includes("application/json");
      const body = isJson ? await r.json().catch(() => ({})) : {};
      if (!r.ok) {
        const msg = r.status === 401 ? "Please log in again."
          : [body.error, body.stage && `(stage: ${body.stage})`].filter(Boolean).join(' ') || `Request failed (${r.status})`;
        setError(msg); return;
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network or server error");
      toast.error("Failed to load Brain v2 data");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReExtract = async () => {
    if (!projectId || reExtracting) return;
    setReExtracting(true);
    try {
      const r = await fetch(`/api/brain/re-extract?projectId=${projectId}`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        toast.success(d.message || "Gap detection refreshed");
        const r2 = await fetch(`/api/brain-v2?projectId=${projectId}&_=${Date.now()}`, { credentials: "include" });
        const body = r2.headers.get("content-type")?.includes("application/json") ? await r2.json().catch(() => ({})) : {};
        if (r2.ok) setData(body);
      } else toast.error(d.error || "Re-extraction failed");
    } catch { toast.error("Re-extraction failed"); }
    finally { setReExtracting(false); }
  };

  if (loading) return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0"><h1 className="text-sm font-semibold">Channel Brain v2</h1></div>
      <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-dim" /></div>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0"><h1 className="text-sm font-semibold">Channel Brain v2</h1></div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-dim text-sm text-center">{error || "No data available."}</p>
        <p className="text-[12px] text-dim text-center max-w-md">If you just set up this project, add competitor and your channels, run the pipeline so videos are analysed, then open Brain v2 again.</p>
        <button onClick={() => fetchData()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-sensor hover:bg-elevated transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    </div>
  );

  const {
    competitorStories, untouchedStories, publishedVideos,
    competitorChannels, competitorActivity, autoSearchQuery,
    competitorVideoCount = 0, stats, rankedOpportunities = [],
    modelSignals, queryPipeline = [], querySections = [],
    videoCounts,
  } = data;

  const gapAvgViews = stats.gapWins > 0 ? Math.round(publishedVideos.filter(v => v.result === "gap_win").reduce((a, v) => a + v.viewsRaw, 0) / stats.gapWins) : 0;
  const lateAvgViews = stats.lateCount > 0 ? Math.round(publishedVideos.filter(v => v.result === "late").reduce((a, v) => a + v.viewsRaw, 0) / stats.lateCount) : 0;
  const advantage = lateAvgViews > 0 ? Math.round(((gapAvgViews - lateAvgViews) / lateAvgViews) * 100) : 0;
  const lastExtracted = competitorStories.length > 0 || untouchedStories.length > 0
    ? [...competitorStories, ...untouchedStories].map(s => s.date).filter(Boolean).sort().at(-1) ?? "—" : "—";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Channel Brain v2</h1>
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBackfill} disabled={backfilling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
            {backfilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {backfilling ? "Learning…" : "Re-learn"}
          </button>
          <button onClick={handleReExtract} disabled={reExtracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
            {reExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 px-6 max-lg:px-4 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        {(["pipeline", "stories", "videos"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b-2 transition-all ${activeTab === tab ? "border-blue text-foreground" : "border-transparent text-dim hover:text-foreground"}`}>
            {tab === "pipeline" ? "Learning Pipeline" : tab === "stories" ? `Stories (${untouchedStories.length + competitorStories.length})` : `Your Videos (${publishedVideos.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 relative overflow-auto">
        {/* ═══ PIPELINE TAB ═══ */}
        {activeTab === "pipeline" && (
          <div className="flex gap-5 px-6 max-lg:px-4 py-6 max-lg:flex-col">
            {/* Left: Pipeline + Query */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* Video funnel + Stats */}
              {videoCounts && (
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Data Funnel</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border">
                      <span className="text-[18px] font-mono font-semibold">{videoCounts.totalInDb}</span>
                      <span className="text-[10px] text-dim font-mono">total videos</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-dim/40 shrink-0" />
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue/5 border border-blue/20">
                      <span className="text-[18px] font-mono font-semibold text-blue">{videoCounts.oursTotal}</span>
                      <span className="text-[10px] text-dim font-mono">yours</span>
                    </div>
                    <span className="text-[10px] text-dim font-mono">+</span>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange/5 border border-orange/20">
                      <span className="text-[18px] font-mono font-semibold text-orange">{videoCounts.competitorTotal}</span>
                      <span className="text-[10px] text-dim font-mono">competitor</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-dim/40 shrink-0" />
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success/5 border border-success/20">
                      <span className="text-[18px] font-mono font-semibold text-success">{videoCounts.oursAnalyzed}</span>
                      <span className="text-[10px] text-dim font-mono">yours analyzed</span>
                    </div>
                    <span className="text-[10px] text-dim font-mono">+</span>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success/5 border border-success/20">
                      <span className="text-[18px] font-mono font-semibold text-success">{videoCounts.competitorAnalyzed}</span>
                      <span className="text-[10px] text-dim font-mono">competitor analyzed</span>
                    </div>
                  </div>
                  {videoCounts.oursTotal > 0 && videoCounts.oursAnalyzed < videoCounts.oursTotal && (
                    <p className="text-[10px] text-orange font-mono mt-2">
                      {videoCounts.oursTotal - videoCounts.oursAnalyzed} of your videos have no analysis — run the pipeline to include them in learning.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl bg-background p-4 text-center">
                  <div className="text-2xl font-semibold font-mono text-success">{stats.gapWins}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Gap Wins</div>
                </div>
                <div className="rounded-xl bg-background p-4 text-center">
                  <div className="text-2xl font-semibold font-mono text-destructive">{stats.lateCount}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Late</div>
                </div>
                <div className="rounded-xl bg-background p-4 text-center">
                  <div className="text-2xl font-semibold font-mono">{stats.winRate}%</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Win Rate</div>
                </div>
                <div className="rounded-xl bg-background p-4 text-center">
                  <div className="text-2xl font-semibold font-mono text-blue">{modelSignals?.topicMemoryCount ?? 0}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Topics</div>
                </div>
              </div>

              {/* Pipeline Steps */}
              <div className="rounded-xl bg-background p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-dim">Learning Pipeline</span>
                    <span className="w-2 h-2 rounded-full bg-purple animate-pulse" />
                  </div>
                  <span className="text-[10px] font-mono text-dim">{queryPipeline.filter(s => s.active).length}/{queryPipeline.length} steps active</span>
                </div>
                <div className="space-y-0">
                  {queryPipeline.map((step, i) => (
                    <PipelineStepCard key={step.id} step={step} index={i} isLast={i === queryPipeline.length - 1} />
                  ))}
                </div>
              </div>

              {/* Generated Query */}
              <div className="rounded-xl bg-background p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-success" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-dim">Generated Perplexity Query</span>
                    <span className="w-2 h-2 rounded-full bg-success" />
                  </div>
                  <CopyBtn text={autoSearchQuery} />
                </div>

                {/* Color-coded sections */}
                {querySections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {querySections.filter(s => s.active).map(s => (
                      <span key={s.id} className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${SECTION_COLOR_MAP[s.color] || "border-border bg-surface text-dim"}`}>
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="rounded-xl bg-surface p-4">
                  <pre className="text-[12px] text-sensor font-mono leading-relaxed whitespace-pre-wrap text-right">
                    {autoSearchQuery || "No query generated yet — add competitor channels and run the pipeline."}
                  </pre>
                </div>
              </div>
            </div>

            {/* Right sidebar: Opportunities + Competitors */}
            <div className="w-[340px] max-lg:w-full space-y-5 shrink-0">
              {rankedOpportunities.length > 0 && (
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Top Opportunities</div>
                  <p className="text-[12px] text-dim mb-3">Ranked by score (winner similarity, view potential, freshness, saturation).</p>
                  <div className="space-y-2">
                    {rankedOpportunities.map((o, i) => (
                      <div key={o.id} className="px-4 py-3 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold text-dim w-4 shrink-0">{i + 1}</span>
                          <span className="flex-1 text-[12px] truncate">{o.title}</span>
                          {o.score != null && <span className="text-[10px] font-mono text-sensor shrink-0">{o.score}</span>}
                          {o.riskFlags?.includes("urgent") && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-orange/15 text-orange shrink-0">urgent</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 ml-6">
                          {o.reasons?.map(r => <span key={r} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success">{r}</span>)}
                          {o.scoreBreakdown && (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-blue/10 text-blue cursor-help">breakdown</span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-[11px] font-mono space-y-1 p-3">
                                  <div className="flex justify-between gap-4"><span className="text-dim">Winner match</span><span className={o.scoreBreakdown.weight > 0 ? "text-success" : "text-dim"}>{o.scoreBreakdown.weight > 0 ? "+" : ""}{o.scoreBreakdown.weight}</span></div>
                                  <div className="flex justify-between gap-4"><span className="text-dim">View potential</span><span className={o.scoreBreakdown.viewPotential > 0 ? "text-success" : "text-dim"}>{o.scoreBreakdown.viewPotential > 0 ? "+" : ""}{o.scoreBreakdown.viewPotential}</span></div>
                                  <div className="flex justify-between gap-4"><span className="text-dim">Freshness</span><span className="text-success">+{o.scoreBreakdown.freshness}</span></div>
                                  <div className="flex justify-between gap-4"><span className="text-dim">Saturation</span><span className={o.scoreBreakdown.saturation < 0 ? "text-destructive" : "text-dim"}>{o.scoreBreakdown.saturation}</span></div>
                                  <div className="border-t border-border pt-1 flex justify-between gap-4 font-bold"><span>Total</span><span>{o.score}</span></div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Brain Learning summary */}
              <div className="rounded-xl bg-background p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Brain Summary</span>
                  <span className="w-2 h-2 rounded-full bg-purple animate-pulse" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-dim">Topics in memory</span>
                    <span className="text-[11px] font-mono font-semibold">{modelSignals?.topicMemoryCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-dim">Format preference</span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${modelSignals?.learnedFormat === "shorts" ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"}`}>
                      {modelSignals?.learnedFormat === "shorts" ? "Shorts" : "Long-form"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(modelSignals?.tier1Count ?? 0) > 0 && <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success">{modelSignals!.tier1Count} proven</span>}
                    {(modelSignals?.tier2Count ?? 0) > 0 && <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-orange/15 text-orange">{modelSignals!.tier2Count} demand</span>}
                    {(modelSignals?.avoidCount ?? 0) > 0 && <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">{modelSignals!.avoidCount} avoid</span>}
                  </div>
                  {modelSignals?.learnedTags && modelSignals.learnedTags.length > 0 && (
                    <div>
                      <div className="text-[10px] text-dim font-mono mb-1.5">Learned tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        {modelSignals.learnedTags.map(tag => <span key={tag} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface text-sensor">{tag}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-dim">Gap Win avg</span>
                    <span className="text-[11px] font-mono text-success font-semibold">{fmt(gapAvgViews)} views</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-dim">First-mover advantage</span>
                    <span className="text-[11px] font-mono font-semibold">{advantage}%</span>
                  </div>
                </div>
                <div className="text-[10px] text-dim font-mono mt-3">Decay: {modelSignals?.decayHalfLife ?? 30}d half-life · {competitorVideoCount} competitor videos scanned</div>
              </div>

              {/* Competitor Activity */}
              <div className="rounded-xl bg-background p-5">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Competitor Activity</div>
                {competitorActivity.length === 0 ? <p className="text-[12px] text-dim font-mono">No competitor data yet.</p> : (
                  <div className="space-y-2">
                    {competitorActivity.map(c => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${c.color} shrink-0`} />
                        <span className="text-[12px] text-sensor flex-1">{c.name}</span>
                        <div className="w-24 h-1.5 bg-elevated rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.color}`} style={{ width: `${Math.min(100, (c.count / (competitorActivity[0]?.count || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-foreground w-6 text-right">{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STORIES TAB ═══ */}
        {activeTab === "stories" && (
          <div className="px-6 max-lg:px-4 py-6 max-w-5xl space-y-6">
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Competitor Story Database</div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <span className="text-[10px] text-dim font-mono">Built from {competitorVideoCount} competitor videos</span>
                  <span className="text-[10px] text-dim font-mono">Last extracted: {lastExtracted}</span>
                  <button onClick={handleReExtract} disabled={reExtracting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
                    {reExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-extract
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-success">Untouched — Your windows ({untouchedStories.length})</span>
                </div>
                <p className="text-[12px] text-dim mb-3">Stories found in competitor research but never produced. Synced to AI Suggestion for triage.</p>
                {untouchedStories.length === 0 ? (
                  <p className="text-[12px] text-dim font-mono px-2">No untouched windows — all recent competitor topics covered or older than 14 days.</p>
                ) : (
                  <div className="space-y-1.5">
                    {untouchedStories.map(story => {
                      const days = story.daysSince ?? daysOpen(story.date);
                      const isCreating = creatingStoryFor === story.title;
                      return (
                        <div key={story.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-success/[0.04] border border-success/10 hover:bg-success/[0.07] transition-colors group">
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success shrink-0">OPEN</span>
                          <UrgencyBadge days={days} />
                          <button onClick={() => handleOpenStory(story.title)} disabled={isCreating}
                            className="link flex-1 flex items-center justify-end gap-1.5 text-[13px] font-medium text-right truncate disabled:opacity-50 min-w-0">
                            <span className="truncate">{story.title}</span>
                            {isCreating ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                          <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                          <button onClick={() => { toast.success("Sent to AI Intelligence pipeline"); navigate(projectPath("/stories")); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue text-blue-foreground text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Zap className="w-3 h-3" /> Produce
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <button onClick={() => setTakenOpen(!takenOpen)} className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity">
                  <ChevronDown className={`w-3.5 h-3.5 text-dim transition-transform ${takenOpen ? "rotate-0" : "-rotate-90"}`} />
                  <span className="text-[10px] text-dim font-mono uppercase tracking-wider">Already covered ({competitorStories.length})</span>
                </button>
                {!takenOpen && <p className="text-[11px] text-dim ml-5.5 font-mono">{competitorStories.length} stories taken</p>}
                {takenOpen && (
                  <>
                    <p className="text-[12px] text-dim mb-3 ml-5.5">These stories are in competitor videos. If you make a video about them, you are late.</p>
                    <div className="space-y-1">
                      {competitorStories.map(story => {
                        const isCreating = creatingStoryFor === story.title;
                        return (
                          <div key={story.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-elevated/60 transition-colors group">
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">TAKEN</span>
                            <div className="flex items-center gap-1 shrink-0">{story.competitors.map((c, i) => <ChannelAvatar key={i} url={c.avatarUrl} name={c.name} />)}</div>
                            <span className="text-[11px] text-dim font-mono shrink-0">{story.competitors.length} competitor{story.competitors.length > 1 ? "s" : ""} · {story.totalViews} views</span>
                            <button onClick={() => handleOpenStory(story.title)} disabled={isCreating}
                              className="link flex-1 flex items-center justify-end gap-1.5 text-[13px] text-right truncate disabled:opacity-50 min-w-0">
                              <span className="truncate">{story.title}</span>
                              {isCreating ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                            <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ VIDEOS TAB ═══ */}
        {activeTab === "videos" && (
          <div className="px-6 max-lg:px-4 py-6 max-w-5xl space-y-6">
            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-4">Your Published Videos</div>
              {publishedVideos.length === 0 ? (
                <p className="text-[12px] text-dim font-mono px-2">No analysed videos yet. Run the pipeline on your channel videos.</p>
              ) : (
                <div className="space-y-1">
                  {publishedVideos.map(video => (
                    <div key={video.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface hover:bg-elevated/60 transition-colors group">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={() => navigate(projectPath(`/channel/${video.channelId}`))} className="shrink-0 hover:opacity-80 transition-opacity">
                              <ChannelAvatar url={video.channelAvatarUrl} name={video.channelName} size="w-7 h-7" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>{video.channelName}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${video.type === "short" ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"}`}>
                        <VideoTypeIcon type={video.type} className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono"><Eye className="w-3 h-3" /> {video.views}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono"><ThumbsUp className="w-3 h-3" /> {video.likes}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono"><MessageSquare className="w-3 h-3" /> {video.comments}</div>
                      </div>
                      <button onClick={() => navigate(projectPath(`/video/${video.id}`))}
                        className="link flex-1 flex items-center justify-end gap-1.5 text-[13px] text-right truncate min-w-0">
                        <span className="truncate">{video.title}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                      <span className="text-[11px] text-dim font-mono shrink-0">{video.date}</span>
                      {video.result === "gap_win" ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success shrink-0"><Trophy className="w-3 h-3" /> Gap Win</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive shrink-0"><ArrowUpRight className="w-3 h-3" /> Late</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
