import { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { videoAnalysis } from "@/data/mock";
import type { Video } from "@/data/mock";
import { VideoRightPanel } from "@/components/VideoRightPanel";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { ArrowLeft, Info, SmilePlus, HelpCircle, Meh, CheckCircle2, XCircle, RotateCw, Clock, Loader2, Calendar } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const tabList = ["Overview", "Sentiment", "Viral", "Comments", "Pipeline", "History"];

const STAGE_ORDER = ["import", "transcribe", "comments", "analyzing", "done", "failed"] as const;
const STAGE_LABELS: Record<string, string> = {
  import: "Import",
  transcribe: "Transcription",
  comments: "Comments",
  analyzing: "AI Analysis",
  done: "Done",
  failed: "Failed",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function buildPipeline(pi: { stage: string; status: string; error?: string | null; retries?: number; startedAt?: string | null; finishedAt?: string | null } | null): { name: string; status: "done" | "failed" | "running" | "waiting"; time?: string; retries?: number; error?: string }[] {
  if (!pi) return STAGE_ORDER.filter((s) => s !== "failed").map((name) => ({ name: STAGE_LABELS[name] || name, status: "waiting" as const }));
  const currentIdx = STAGE_ORDER.indexOf(pi.stage as typeof STAGE_ORDER[number]);
  const statusMap = (s: string) => (s === "running" ? "running" : s === "failed" ? "failed" : s === "done" ? "done" : "waiting");
  return STAGE_ORDER.filter((s) => s !== "failed").map((stageKey, i) => {
    const name = STAGE_LABELS[stageKey] || stageKey;
    const isCurrent = pi.stage === stageKey;
    const status = isCurrent ? statusMap(pi.status) : i < currentIdx ? "done" : "waiting";
    const time = isCurrent && (pi.finishedAt || pi.startedAt)
      ? new Date((pi.finishedAt || pi.startedAt)!).toLocaleString()
      : undefined;
    return { name, status, time: time || undefined, retries: isCurrent ? pi.retries : undefined, error: isCurrent ? (pi.error || undefined) : undefined };
  });
}

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [video, setVideo] = useState<Video | null>(null);
  const [channel, setChannel] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [panelVisible, setPanelVisible] = useState(false);
  const closePanel = useCallback(() => setPanelVisible(false), []);
  const a = videoAnalysis;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setVideo(null);
    setChannel(null);
    fetch(`/api/videos/${id}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error("Failed to load video");
        return r.json();
      })
      .then((data: Record<string, unknown>) => {
        if (!data || typeof data.id !== "string") return;
        const ch = data.channel as { id: string; handle: string; nameAr?: string; nameEn?: string; avatarUrl?: string | null } | undefined;
        const pi = data.pipelineItem as { stage: string; status: string; error?: string | null; retries?: number; startedAt?: string | null; finishedAt?: string | null } | null;
        const viewsRaw = Number(data.viewCount) || 0;
        const likesRaw = Number(data.likeCount) || 0;
        const commentsRaw = Number(data.commentCount) || 0;
        const status = (pi?.status === "running" ? "analyzing" : pi?.status === "done" ? "done" : pi?.status === "failed" ? "failed" : "pending") as Video["status"];
        setChannel(ch ? {
          id: ch.id,
          name: (ch.nameEn || ch.nameAr || ch.handle) || "",
          handle: ch.handle,
          avatarUrl: ch.avatarUrl ?? null,
        } : null);
        setVideo({
          id: data.id as string,
          channelId: (data.channelId as string) || (ch?.id ?? ""),
          title: (data.titleEn || data.titleAr || "") as string,
          type: (data.videoType === "short" ? "short" : "video") as "video" | "short",
          views: formatCount(viewsRaw),
          likes: formatCount(likesRaw),
          comments: formatCount(commentsRaw),
          date: data.publishedAt ? new Date(data.publishedAt as string).toLocaleDateString() : "",
          duration: (data.duration as string) || "",
          status,
          viewsRaw,
          likesRaw,
          commentsRaw,
          thumbnail: (data.thumbnailUrl as string) || undefined,
          youtubeId: (data.youtubeId as string) || undefined,
          pipeline: buildPipeline(pi),
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-sensor border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[13px] text-foreground">Loading video…</p>
      </div>
    );
  }

  if (notFound || !video || !channel) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-surface p-6">
        <p className="text-foreground text-[14px] mb-2">This page has been deleted.</p>
        <button onClick={() => navigate(projectPath(""))} className="text-sensor hover:text-foreground underline text-[13px]">
          Return to home
        </button>
      </div>
    );
  }

  const stats: { val?: string; label: string }[] = [
    { val: video.views, label: "Views" },
    { val: video.likes, label: "Likes" },
    { val: video.comments, label: "Comments" },
    { val: video.duration, label: "Duration" },
    { label: "Type" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <button
          onClick={() => navigate(projectPath(`/channel/${channel.id}`))}
          className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline" dir="rtl">{channel.name}</span>
          <span className="sm:hidden">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelVisible(!panelVisible)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div>
          {/* Hero */}
          <div className="px-6 py-6 max-lg:px-4">
            <div className="rounded-xl overflow-hidden border border-border flex max-md:flex-col bg-background">
              {/* Thumbnail left */}
              <div className="relative w-[380px] max-md:w-full shrink-0 p-3">
                {(() => {
                  const ytId = video.youtubeId ?? (video.thumbnail && /\/vi\/([^/]+)\//.exec(video.thumbnail)?.[1]);
                  const imgEl = (
                    <img
                      src={video.thumbnail}
                      alt=""
                      className="w-full aspect-video object-cover rounded-xl"
                    />
                  );
                  return ytId ? (
                    <a
                      href={`https://www.youtube.com/watch?v=${ytId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {imgEl}
                    </a>
                  ) : (
                    imgEl
                  );
                })()}
              </div>
              {/* Info right */}
              <div className="flex-1 flex flex-col gap-4 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
                <h1 className="text-base font-semibold tracking-tight max-lg:text-sm" dir="rtl" style={{ textAlign: "right" }}>
                  {video.title}
                </h1>

                {/* Metadata grid */}
                <div className="flex items-center gap-0 mt-auto ml-auto">
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex ${
                        video.status === "done" ? "text-success" :
                        video.status === "failed" ? "text-destructive" :
                        video.status === "analyzing" ? "text-blue" : "text-dim"
                      }`}>
                        {video.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                         video.status === "failed" ? <XCircle className="w-3.5 h-3.5" /> :
                         video.status === "analyzing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         <Clock className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-[12px] text-sensor font-medium">
                        {video.status === "done" ? "Complete" : video.status === "failed" ? "Failed" : video.status === "analyzing" ? "Analyzing" : "Pending"}
                      </span>
                    </div>
                  </div>
                  <span className="w-px h-8 bg-border" />
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Type</div>
                    <div className="flex items-center gap-1.5">
                      <VideoTypeIcon type={video.type} className="w-3.5 h-3.5 text-dim" />
                    </div>
                  </div>
                  <span className="w-px h-8 bg-border" />
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Published</div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-dim" />
                      <span className="text-[12px] text-sensor font-medium">{video.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 max-lg:px-4">
            <div className="grid grid-cols-5 max-lg:grid-cols-2 rounded-xl overflow-hidden border border-border">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-5 py-4 bg-background border-r border-b border-border last:border-r-0 ${
                    i === stats.length - 1 ? "max-lg:col-span-2 max-lg:border-r-0" : ""
                  }`}
                >
                  <div className="text-lg font-semibold font-mono tracking-tight mb-0.5">
                    {s.label === "Type" ? (
                      <VideoTypeIcon type={video.type} className="w-5 h-5 text-foreground" />
                    ) : (
                      s.val
                    )}
                  </div>
                  <div className="text-[11px] text-dim">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Content section */}
          <div className="px-6 py-5 pb-16 max-lg:px-4 max-lg:pb-20">
            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-6">
              {tabList.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors whitespace-nowrap border ${
                    activeTab === tab
                      ? "bg-surface text-foreground border-border"
                      : "bg-transparent text-dim border-border/50 hover:text-sensor hover:border-border"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "Overview" && (
              <div>
                {/* Transcript */}
                <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                  <div className="bg-background px-4 py-3">
                    <div className="text-[11px] text-dim font-mono uppercase tracking-widest mb-3">Transcript</div>
                    <div className="space-y-5">
                      {a.transcript.map((seg, i) => (
                        <div key={i} className="flex gap-4">
                          <span className="text-foreground text-[13px] font-mono shrink-0 pt-0.5">{seg.time}</span>
                          <p className="text-sm leading-relaxed text-sensor" dir="rtl" style={{ textAlign: "right" }}>{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <SectionDivider label="Topics" />
                <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                  <div className="bg-background px-4 py-3 flex flex-wrap gap-1.5">
                    {a.topics.map((t) => (
                      <span key={t} className="py-1 px-2.5 rounded-full bg-primary/10 border border-primary/15 text-primary text-xs font-mono">{t}</span>
                    ))}
                  </div>
                </div>

                <SectionDivider label="Keywords" />
                <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                  <div className="bg-background px-4 py-3 flex flex-wrap gap-1.5">
                    {a.keywords.map((k) => (
                      <span key={k} className="py-1 px-2.5 rounded-full bg-elevated border border-border text-sensor text-xs font-mono">{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Sentiment" && (
              <div>
                {/* Sentiment bars in table */}
                <div className="rounded-xl overflow-hidden border border-border mb-7" style={{ borderRadius: '12px' }}>
                  {[
                    { label: "Positive", val: a.sentiment.positive, cls: "bg-success" },
                    { label: "Negative", val: a.sentiment.negative, cls: "bg-destructive" },
                    { label: "Neutral", val: a.sentiment.neutral, cls: "bg-dim" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 bg-background px-4 py-3 border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors">
                      <span className="text-xs text-sensor w-[72px]">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.cls}`} style={{ width: `${s.val}%` }} />
                      </div>
                      <span className="text-xs text-dim font-mono w-9 text-right">{s.val}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Viral" && (
              <div>
                {/* Viral stats in table grid */}
                <div className="rounded-xl overflow-hidden border border-border mb-7" style={{ borderRadius: '12px' }}>
                  <div className="grid grid-cols-3 max-lg:grid-cols-2">
                    {[
                      { val: a.viral.score, label: "Viral Score", highlight: true },
                      { val: a.viral.hookStrength, label: "Hook Strength" },
                      { val: a.viral.shareability, label: "Shareability" },
                      { val: a.viral.avgWatchPct, label: "Avg Watch %" },
                      { val: a.viral.retentionDrop, label: "Retention Drop" },
                      { val: a.viral.trending ? "Yes" : "No", label: "Trending", highlight: a.viral.trending },
                    ].map((v) => (
                      <div
                        key={v.label}
                        className="bg-background px-4 py-3 border-r border-b border-border last:border-r-0 hover:bg-[#0d0d10] transition-colors"
                      >
                        <div className={`text-lg font-semibold font-mono tracking-tight ${v.highlight ? "text-success" : ""}`}>
                          {v.val}
                        </div>
                        <div className="text-[11px] text-dim mt-0.5">{v.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Comments" && (
              <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                {a.comments.map((c, i) => (
                  <div key={i} className="bg-background px-4 py-3 border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors">
                    <div className="flex items-center mb-1.5">
                      <span className="text-[13px] font-medium">{c.author}</span>
                      <span className="text-[11px] text-dim font-mono ml-auto">{c.date}</span>
                    </div>
                    <p className="text-[13px] text-sensor leading-relaxed mb-1.5" dir="rtl" style={{ textAlign: "right" }}>
                      {c.text}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-dim font-mono">♥ {c.likes}</span>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                              c.sentiment === "positive" ? "text-success" :
                              c.sentiment === "question" ? "text-blue" :
                              "text-dim"
                            }`}>
                              {c.sentiment === "positive" ? <SmilePlus className="w-3.5 h-3.5" /> :
                               c.sentiment === "question" ? <HelpCircle className="w-3.5 h-3.5" /> :
                               <Meh className="w-3.5 h-3.5" />}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <span className="capitalize">{c.sentiment}</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))}
              </div>
            )}


            {activeTab === "Pipeline" && (
              <div>
                <div className="text-[11px] text-dim font-mono uppercase tracking-widest mb-3">Pipeline</div>
                <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                  {video.pipeline.map((step) => (
                    <div key={step.name} className="flex items-center justify-between bg-background px-4 py-3 border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${
                          step.status === "done" ? "bg-success" :
                          step.status === "failed" ? "bg-destructive" :
                          step.status === "running" ? "bg-blue animate-pulse" : "bg-dim/30"
                        }`} />
                        <span className={`text-[13px] ${step.status === "failed" ? "text-destructive" : "text-foreground"}`}>{step.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {step.retries != null && step.retries > 1 && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-dim">
                                  <RotateCw className="w-3 h-3" />
                                  {step.retries}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left">Attempted {step.retries} times</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <span className={`text-[12px] font-mono ${step.status === "failed" ? "text-destructive/60" : "text-dim"}`}>
                          {step.time || (step.status === "waiting" ? "—" : "...")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "History" && (
              <div>
                <div className="text-[11px] text-dim font-mono uppercase tracking-widest mb-3">Analysis History</div>
                <div className="rounded-xl overflow-hidden border border-border" style={{ borderRadius: '12px' }}>
                  {[
                    { time: "Mar 8, 14:22", name: "Full Analysis", status: "success" as const, badge: "Completed" },
                    { time: "Mar 7, 09:15", name: "Comment Refresh", status: "failed" as const, badge: "Failed", error: "API rate limit exceeded. Retry after 60 minutes." },
                  ].map((item, i) => (
                    <div key={i} className="bg-background px-4 py-3 border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium">{item.name}</span>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`inline-flex items-center justify-center ${
                                item.status === "success" ? "text-success" : "text-destructive"
                              }`}>
                                {item.status === "success" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">{item.badge}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="text-[10px] text-dim font-mono">{item.time}</div>
                      {item.error && (
                        <div className="mt-2 text-xs text-destructive/60 font-mono leading-relaxed">{item.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Popover panel */}
        <VideoRightPanel video={video} visible={panelVisible} onClose={closePanel} pipeline={video.pipeline} />
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-6 first:mt-0">
      <span className="text-[10px] text-dim tracking-widest uppercase font-mono whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
