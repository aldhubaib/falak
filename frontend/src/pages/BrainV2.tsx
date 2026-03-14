import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, Check, RefreshCw, Eye, ThumbsUp, MessageSquare, Trophy, ChevronDown, ArrowUpRight, Zap, Loader2 } from "lucide-react";
import { nowGMT3 } from "@/lib/utils";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { toast } from "sonner";

interface CompetitorEntry {
  channelId: string;
  name: string;
  avatarUrl: string | null;
}

interface BrainStory {
  id: string;
  title: string;
  date: string;
  status: "taken" | "taken_by_us" | "open";
  competitors: CompetitorEntry[];
  totalViews: string;
  daysSince?: number;
}

interface RankedOpportunity extends BrainStory {
  score?: number;
  reasons?: string[];
  riskFlags?: string[];
}

interface PublishedVideo {
  id: string;
  title: string;
  date: string;
  views: string;
  likes: string;
  comments: string;
  viewsRaw: number;
  result: "gap_win" | "late";
  type: "video" | "short";
  channelId: string;
  channelName: string;
  channelAvatarUrl: string | null;
}

interface CompetitorChannel {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  color: string;
  enabled: boolean;
  count?: number;
}

interface BrainV2Data {
  competitorStories: BrainStory[];
  untouchedStories: BrainStory[];
  publishedVideos: PublishedVideo[];
  competitorChannels: CompetitorChannel[];
  competitorActivity: (CompetitorChannel & { count: number })[];
  autoSearchQuery: string;
  stats: { gapWins: number; lateCount: number; winRate: number; totalCompetitorStories: number; untouchedCount: number };
  rankedOpportunities?: RankedOpportunity[];
  modelSignals?: { topicMemoryCount?: number };
  queryMeta?: { schemaVersion?: number; provider?: string; generatedAt?: string };
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[11px] text-dim hover:text-sensor font-mono flex items-center gap-1 transition-colors shrink-0"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      Copy
    </button>
  );
}

function daysOpen(dateStr: string): number {
  const now = nowGMT3();
  const d = new Date(dateStr);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function UrgencyBadge({ days }: { days: number }) {
  const color = days >= 7 ? "bg-destructive/15 text-destructive" : days >= 3 ? "bg-orange/15 text-orange" : "bg-success/15 text-success";
  const label = days >= 7 ? "Closing fast" : days >= 3 ? `${days}d open` : `${days}d open`;
  return (
    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${color} shrink-0`}>
      {label}
    </span>
  );
}

function ChannelAvatar({ url, name, size = "w-5 h-5" }: { url: string | null; name: string; size?: string }) {
  if (url) return <img src={url} alt={name} className={`${size} rounded-full object-cover border border-border`} />;
  return (
    <span className={`${size} rounded-full bg-elevated border border-border flex items-center justify-center text-[8px] font-bold text-dim uppercase`}>
      {name.slice(0, 2)}
    </span>
  );
}

export default function BrainV2() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [data, setData] = useState<BrainV2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [reExtracting, setReExtracting] = useState(false);
  const [takenOpen, setTakenOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/brain-v2?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch Brain v2 data");
      setData(await r.json());
    } catch {
      toast.error("Failed to load Brain v2 data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReExtract = async () => {
    if (!projectId || reExtracting) return;
    setReExtracting(true);
    try {
      const r = await fetch(`/api/brain/re-extract?projectId=${projectId}`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) { toast.success(d.message || "Gap detection refreshed"); await fetchData(); }
      else toast.error(d.error || "Re-extraction failed");
    } catch { toast.error("Re-extraction failed"); }
    finally { setReExtracting(false); }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
          <h1 className="text-sm font-semibold">Channel Brain v2</h1>
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
        <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
          <h1 className="text-sm font-semibold">Channel Brain v2</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-dim text-sm">No data available.</p>
        </div>
      </div>
    );
  }

  const {
    competitorStories,
    untouchedStories,
    publishedVideos,
    competitorChannels,
    competitorActivity,
    autoSearchQuery,
    stats,
    rankedOpportunities = [],
  } = data;

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
  const gapAvgViews = stats.gapWins > 0 ? Math.round(publishedVideos.filter((v) => v.result === "gap_win").reduce((a, v) => a + v.viewsRaw, 0) / stats.gapWins) : 0;
  const lateAvgViews = stats.lateCount > 0 ? Math.round(publishedVideos.filter((v) => v.result === "late").reduce((a, v) => a + v.viewsRaw, 0) / stats.lateCount) : 0;
  const advantage = lateAvgViews > 0 ? Math.round(((gapAvgViews - lateAvgViews) / lateAvgViews) * 100) : 0;
  const lastExtracted = competitorStories.length > 0 || untouchedStories.length > 0
    ? [...competitorStories, ...untouchedStories].map((s) => s.date).filter(Boolean).sort().at(-1) ?? "—"
    : "—";

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Channel Brain v2</h1>
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] text-dim font-mono hidden sm:block">
            Learning from your videos · ranked opportunities
          </span>
        </div>
        <button
          onClick={handleReExtract}
          disabled={reExtracting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50"
        >
          {reExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-orange" />}
          Refresh
        </button>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div className="flex gap-5 px-6 max-lg:px-4 py-6 max-lg:flex-col">
          <div className="flex-1 min-w-0 space-y-6">
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Competitor Story Database</div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-dim font-mono">Last extracted: {lastExtracted}</span>
                  <button onClick={handleReExtract} disabled={reExtracting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
                    {reExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Re-extract
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-success">Untouched — Your windows ({untouchedStories.length})</span>
                </div>
                <p className="text-[12px] text-dim mb-3">Stories found in competitor research but never produced. Act before someone else does.</p>
                {untouchedStories.length === 0 ? (
                  <p className="text-[12px] text-dim font-mono px-2">No untouched windows detected — all recent competitor topics have been covered or are older than 14 days.</p>
                ) : (
                  <div className="space-y-1.5">
                    {untouchedStories.map((story) => {
                      const days = story.daysSince ?? daysOpen(story.date);
                      return (
                        <div key={story.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-success/[0.04] border border-success/10 hover:bg-success/[0.07] transition-colors group">
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success shrink-0">OPEN</span>
                          <UrgencyBadge days={days} />
                          <span className="flex-1 text-[13px] text-right truncate font-medium">{story.title}</span>
                          <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                          <button onClick={() => { toast.success("Sent to AI Intelligence pipeline"); navigate(projectPath("/stories")); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue text-blue-foreground text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
                  <span className="text-[10px] text-dim font-mono uppercase tracking-wider">× Already covered by competitors ({competitorStories.length})</span>
                </button>
                {!takenOpen && <p className="text-[11px] text-dim ml-5.5 font-mono">{competitorStories.length} stories taken · you'd be late on all of these</p>}
                {takenOpen && (
                  <>
                    <p className="text-[12px] text-dim mb-3 ml-5.5">These exact stories are in competitor videos. If you make a video about them, you are late.</p>
                    <div className="space-y-1">
                      {competitorStories.map((story) => (
                        <div key={story.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">TAKEN</span>
                          <div className="flex items-center gap-1 shrink-0">{story.competitors.map((c, i) => <ChannelAvatar key={i} url={c.avatarUrl} name={c.name} />)}</div>
                          <span className="text-[11px] text-dim font-mono shrink-0">{story.competitors.length} competitor{story.competitors.length > 1 ? "s" : ""} · {story.totalViews} views</span>
                          <span className="flex-1 text-[13px] text-right truncate">{story.title}</span>
                          <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-4">Your Published Videos</div>
              {publishedVideos.length === 0 ? (
                <p className="text-[12px] text-dim font-mono px-2">No analysed videos from your channels yet. Run the pipeline on your channel videos.</p>
              ) : (
                <div className="space-y-1">
                  {publishedVideos.map((video) => (
                    <div key={video.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
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
                      <span className="flex-1 text-[13px] text-right truncate">{video.title}</span>
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

            <div className="text-[11px] text-dim font-mono text-center pb-4">Story database is per-workspace · Brain v2 learns from each new video</div>
          </div>

          <div className="w-[340px] max-lg:w-full space-y-5 shrink-0">
            {rankedOpportunities.length > 0 && (
              <div className="rounded-xl bg-background p-5">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Top Opportunities</div>
                <p className="text-[12px] text-dim mb-3">Ranked by score (winner similarity, freshness, low saturation).</p>
                <div className="space-y-2">
                  {rankedOpportunities.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
                      <span className="text-[9px] font-mono font-bold text-dim w-4 shrink-0">{i + 1}</span>
                      <span className="flex-1 text-[12px] truncate">{o.title}</span>
                      {o.score != null && <span className="text-[10px] font-mono text-sensor shrink-0">{o.score}</span>}
                      {o.reasons && o.reasons.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {o.reasons.slice(0, 2).map((r) => (
                            <span key={r} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success">{r}</span>
                          ))}
                        </div>
                      )}
                      {o.riskFlags?.includes("urgent") && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-orange/15 text-orange shrink-0">urgent</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-4">Gap Win Rate</div>
              <div className="flex rounded-xl overflow-hidden mb-4">
                <div className="flex-1 px-4 py-3 bg-surface text-center">
                  <div className="text-2xl font-semibold font-mono text-success">{stats.gapWins}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Gap Wins</div>
                </div>
                <div className="flex-1 px-4 py-3 bg-surface text-center border-x border-background">
                  <div className="text-2xl font-semibold font-mono text-destructive">{stats.lateCount}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Late</div>
                </div>
                <div className="flex-1 px-4 py-3 bg-surface text-center">
                  <div className="text-2xl font-semibold font-mono text-foreground">{stats.winRate}%</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Win Rate</div>
                </div>
              </div>
              <div className="space-y-1.5 text-[12px]">
                <div className="text-dim">Gap Win avg: <span className="text-success font-semibold">{fmt(gapAvgViews)} views</span></div>
                <div className="text-dim">Late avg: <span className="text-destructive font-semibold">{fmt(lateAvgViews)} views</span></div>
                <div className="text-dim">First-mover advantage: <span className="text-foreground font-semibold">{advantage}%</span> more views</div>
              </div>
            </div>

            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Competitor Activity</div>
              <p className="text-[12px] text-dim mb-3">Who's covering the most stories this period.</p>
              {competitorActivity.length === 0 ? <p className="text-[12px] text-dim font-mono">No competitor data yet.</p> : (
                <div className="space-y-2">
                  {competitorActivity.map((c) => (
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

            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Competitor Transcripts</div>
              <p className="text-[12px] text-dim mb-3">Channels feeding this workspace's story database.</p>
              {competitorChannels.length === 0 ? <p className="text-[12px] text-dim font-mono">No competitor channels added yet.</p> : (
                <div className="flex flex-wrap gap-2 mb-3">
                  {competitorChannels.map((ch) => (
                    <span key={ch.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface text-[11px] font-medium text-sensor">
                      <span className={`w-2 h-2 rounded-full ${ch.color}`} /> {ch.name} {ch.enabled && <Check className="w-3 h-3 text-dim" />}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-dim font-mono">{competitorStories.length} stories already covered · {untouchedStories.length} untouched windows found</div>
            </div>

            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Auto Search Query</div>
                <span className="w-2 h-2 rounded-full bg-success" />
              </div>
              <p className="text-[12px] text-dim mb-4">Sent to Perplexity on every Fetch. Built from your gap wins and open windows.</p>
              <div className="rounded-xl bg-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-success">Perplexity Sonar Prompt</span>
                  </div>
                  <CopyBtn text={autoSearchQuery} />
                </div>
                <pre className="text-[12px] text-sensor font-mono leading-relaxed whitespace-pre-wrap text-right">
                  {autoSearchQuery || "No query generated yet — add competitor channels and run the pipeline."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
