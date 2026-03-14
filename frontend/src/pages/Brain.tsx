import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, Check, RefreshCw, Eye, ThumbsUp, MessageSquare, Trophy, ChevronDown, ArrowUpRight, Zap } from "lucide-react";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { toast } from "sonner";
import {
  competitorStories,
  untouchedStories,
  publishedVideos,
  competitorChannels,
  autoSearchQuery,
  getCompetitorActivity,
} from "@/data/brainMock";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }}
      className="text-[11px] text-dim hover:text-sensor font-mono flex items-center gap-1 transition-colors shrink-0"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      Copy
    </button>
  );
}

function daysOpen(dateStr: string): number {
  const now = new Date("2026-03-14"); // current date
  const d = new Date(dateStr);
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function UrgencyBadge({ days }: { days: number }) {
  const color = days >= 7 ? "bg-destructive/15 text-destructive" : days >= 3 ? "bg-orange/15 text-orange" : "bg-success/15 text-success";
  const label = days >= 7 ? "🔥 Closing fast" : days >= 3 ? `🔥 ${days}d open` : `${days}d open`;
  return (
    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${color} shrink-0`}>
      {label}
    </span>
  );
}

export default function Brain() {
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [takenOpen, setTakenOpen] = useState(false);

  const gapWins = publishedVideos.filter((v) => v.result === "gap_win").length;
  const lateCount = publishedVideos.filter((v) => v.result === "late").length;
  const winRate = publishedVideos.length ? Math.round((gapWins / publishedVideos.length) * 100) : 0;
  const gapAvgViews = gapWins ? Math.round(publishedVideos.filter((v) => v.result === "gap_win").reduce((a, v) => a + v.viewsRaw, 0) / gapWins) : 0;
  const lateAvgViews = lateCount ? Math.round(publishedVideos.filter((v) => v.result === "late").reduce((a, v) => a + v.viewsRaw, 0) / lateCount) : 0;
  const advantage = lateAvgViews ? Math.round(((gapAvgViews - lateAvgViews) / lateAvgViews) * 100) : 0;
  const competitorActivity = getCompetitorActivity();

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Channel Brain</h1>
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] text-dim font-mono">The race is about stories — who finds the untouched case first wins</span>
        </div>
        <button
          onClick={() => toast("API Keys settings coming soon…")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange" />
          API Keys
        </button>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div className="flex gap-5 px-6 max-lg:px-4 py-6 max-lg:flex-col">
          {/* Left — Main content */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Competitor Story Database */}
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Competitor Story Database</div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-dim font-mono">Last extracted: 2026-03-08</span>
                  <button
                    onClick={() => toast.success("Re-extracting competitor stories…")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-extract
                  </button>
                </div>
              </div>

              {/* ★ UNTOUCHED FIRST — high visual weight */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-success">
                    Untouched — Your windows ({untouchedStories.length})
                  </span>
                </div>
                <p className="text-[12px] text-dim mb-3">Stories found in competitor research but never produced. Act before someone else does.</p>
                <div className="space-y-1.5">
                  {untouchedStories.map((story) => {
                    const days = daysOpen(story.date);
                    return (
                      <div key={story.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-success/[0.04] border border-success/10 hover:bg-success/[0.07] transition-colors group">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success shrink-0">OPEN</span>
                        <UrgencyBadge days={days} />
                        <span className="flex-1 text-[13px] text-right truncate font-medium">{story.title}</span>
                        <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                        <button
                          onClick={() => {
                            toast.success("Sent to AI Intelligence pipeline");
                            navigate(projectPath("/stories"));
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue text-blue-foreground text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Zap className="w-3 h-3" />
                          Produce
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ★ TAKEN — collapsed by default */}
              <div>
                <button
                  onClick={() => setTakenOpen(!takenOpen)}
                  className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
                >
                  <ChevronDown className={`w-3.5 h-3.5 text-dim transition-transform ${takenOpen ? "rotate-0" : "-rotate-90"}`} />
                  <span className="text-[10px] text-dim font-mono uppercase tracking-wider">
                    × Already covered by competitors ({competitorStories.length})
                  </span>
                </button>
                {!takenOpen && (
                  <p className="text-[11px] text-dim ml-5.5 font-mono">{competitorStories.length} stories taken · you'd be late on all of these</p>
                )}
                {takenOpen && (
                  <>
                    <p className="text-[12px] text-dim mb-3 ml-5.5">These exact stories are in competitor videos. If you make a video about them, you are late.</p>
                    <div className="space-y-1">
                      {competitorStories.map((story) => (
                        <div key={story.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">TAKEN</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {story.competitors.map((c, i) => (
                              <img key={i} src={c.avatar} alt={c.name} className="w-5 h-5 rounded-full object-cover border border-border" />
                            ))}
                          </div>
                          <span className="text-[11px] text-dim font-mono shrink-0">
                            {story.competitors.length} competitor{story.competitors.length > 1 ? "s" : ""} {story.totalViews} views
                          </span>
                          <span className="flex-1 text-[13px] text-right truncate">{story.title}</span>
                          <span className="text-[11px] text-dim font-mono shrink-0">{story.date}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Your Published Videos */}
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Your Published Videos</div>
              </div>

              <div className="space-y-1">
                {publishedVideos.map((video) => (
                  <div key={video.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface hover:bg-elevated/60 transition-colors">
                    {/* Channel avatar — clickable */}
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => navigate(projectPath(`/channel/${video.channelId}`))}
                            className="shrink-0 hover:opacity-80 transition-opacity"
                          >
                            <img src={video.channelAvatar} alt={video.channelName} className="w-7 h-7 rounded-full object-cover border border-border" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>{video.channelName}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* Type badge — icon only (global default: Play = video, Zap = short) */}
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                      video.type === "short" ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"
                    }`}>
                      <VideoTypeIcon type={video.type} className="w-3.5 h-3.5" />
                    </span>
                    {/* Metrics */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono">
                        <Eye className="w-3 h-3" /> {video.views}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono">
                        <ThumbsUp className="w-3 h-3" /> {video.likes}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-dim font-mono">
                        <MessageSquare className="w-3 h-3" /> {video.comments}
                      </div>
                    </div>
                    {/* Title */}
                    <span className="flex-1 text-[13px] text-right truncate">{video.title}</span>
                    <span className="text-[11px] text-dim font-mono shrink-0">{video.date}</span>
                    {/* Result icon */}
                    {video.result === "gap_win" ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success shrink-0">
                        <Trophy className="w-3 h-3" /> Gap Win
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive shrink-0">
                        <ArrowUpRight className="w-3 h-3" /> Late
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer note */}
            <div className="text-[11px] text-dim font-mono text-center pb-4">
              Story database is per-workspace · checked on every Stories fetch
            </div>
          </div>

          {/* Right — Sidebar */}
          <div className="w-[340px] max-lg:w-full space-y-5 shrink-0">
            {/* Gap Win Rate */}
            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-4">Gap Win Rate</div>
              <div className="flex rounded-xl overflow-hidden mb-4">
                <div className="flex-1 px-4 py-3 bg-surface text-center">
                  <div className="text-2xl font-semibold font-mono text-success">{gapWins}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Gap Wins</div>
                </div>
                <div className="flex-1 px-4 py-3 bg-surface text-center border-x border-background">
                  <div className="text-2xl font-semibold font-mono text-destructive">{lateCount}</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Late</div>
                </div>
                <div className="flex-1 px-4 py-3 bg-surface text-center">
                  <div className="text-2xl font-semibold font-mono text-foreground">{winRate}%</div>
                  <div className="text-[9px] text-dim font-mono uppercase mt-1">Win Rate</div>
                </div>
              </div>
              <div className="space-y-1.5 text-[12px]">
                <div className="text-dim">Gap Win avg: <span className="text-success font-semibold">{fmt(gapAvgViews)} views</span></div>
                <div className="text-dim">Late avg: <span className="text-destructive font-semibold">{fmt(lateAvgViews)} views</span></div>
                <div className="text-dim">First-mover advantage: <span className="text-foreground font-semibold">{advantage}%</span> more views</div>
              </div>
            </div>

            {/* Competitor Activity */}
            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Competitor Activity</div>
              <p className="text-[12px] text-dim mb-3">Who's covering the most stories this period.</p>
              <div className="space-y-2">
                {competitorActivity.map((c) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${c.color} shrink-0`} />
                    <span className="text-[12px] text-sensor flex-1">{c.name}</span>
                    <div className="w-24 h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.color}`}
                        style={{ width: `${Math.min(100, (c.count / (competitorActivity[0]?.count || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-foreground w-6 text-right">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor Transcripts */}
            <div className="rounded-xl bg-background p-5">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Competitor Transcripts</div>
              <p className="text-[12px] text-dim mb-3">Channels feeding this workspace's story database.</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {competitorChannels.map((ch) => (
                  <span key={ch.handle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface text-[11px] font-medium text-sensor">
                    <span className={`w-2 h-2 rounded-full ${ch.color}`} />
                    {ch.name}
                    {ch.enabled && <Check className="w-3 h-3 text-dim" />}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-dim font-mono">
                {competitorStories.length} stories already covered · {untouchedStories.length} untouched windows found
              </div>
            </div>

            {/* Auto Search Query */}
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Auto Search Query</div>
                <span className="w-2 h-2 rounded-full bg-success" />
              </div>
              <p className="text-[12px] text-dim mb-4">Sent to Perplexity on every Fetch. Asks for stories NOT in the competitor database. Built from your gap wins.</p>
              <div className="rounded-xl bg-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-success">Perplexity Sonar Prompt</span>
                  </div>
                  <CopyBtn text={autoSearchQuery} />
                </div>
                <pre className="text-[12px] text-sensor font-mono leading-relaxed whitespace-pre-wrap text-right">{autoSearchQuery}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
