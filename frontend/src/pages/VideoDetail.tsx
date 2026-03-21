import { useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { parseDuration, fmtDate, fmtDateTime } from "@/lib/utils";
import type { Video } from "@/data/mock";
import { VideoRightPanel } from "@/components/VideoRightPanel";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { ArrowLeft, Info, SmilePlus, HelpCircle, Meh, CheckCircle2, XCircle, RotateCw, Clock, Loader2, Calendar, FileText, Hash, Tag, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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
      ? fmtDateTime(pi.finishedAt || pi.startedAt)
      : undefined;
    return { name, status, time: time || undefined, retries: isCurrent ? pi.retries : undefined, error: isCurrent ? (pi.error || undefined) : undefined };
  });
}

interface TranscriptSegment { time?: string; offset?: number; text: string; }
interface CommentRow { author: string; text: string; date: string; likes: number; sentiment: string; }
interface AnalysisData {
  transcript: TranscriptSegment[];
  topics: string[];
  keywords: string[];
  sentiment: { positive: number; negative: number; neutral: number };
  viral: { score: number; hookLabel: string; hookStrong: boolean; trending: boolean };
  comments: CommentRow[];
}

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


export default function VideoDetail() {
  const { id } = useParams();
  
  const channelPath = useChannelPath();
  const [video, setVideo] = useState<Video | null>(null);
  const [channel, setChannel] = useState<{ id: string; name: string; handle: string; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [panelVisible, setPanelVisible] = useState(false);
  const closePanel = useCallback(() => setPanelVisible(false), []);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setVideo(null);
    setChannel(null);
    fetch(`/api/videos/${id}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 404) { if (!cancelled) setNotFound(true); return null; }
        if (!r.ok) throw new Error("Failed to load video");
        return r.json();
      })
      .then((data: Record<string, unknown>) => {
        if (cancelled || !data || typeof data.id !== "string") return;
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
          date: data.publishedAt ? fmtDate(data.publishedAt as string) : "",
          duration: parseDuration((data.duration as string) || ""),
          status,
          viewsRaw,
          likesRaw,
          commentsRaw,
          thumbnail: (data.thumbnailUrl as string) || undefined,
          youtubeId: (data.youtubeId as string) || undefined,
          pipeline: buildPipeline(pi),
        });

        // Parse transcript segments from Video.transcription (JSON array of {offset,text} or {time,text})
        let transcript: TranscriptSegment[] = [];
        if (typeof data.transcription === "string" && data.transcription) {
          try {
            const parsed = JSON.parse(data.transcription);
            if (Array.isArray(parsed)) {
              transcript = parsed.map((s: Record<string, unknown>) => ({
                time: s.time ? String(s.time) : (typeof s.offset === "number" ? formatOffset(s.offset) : undefined),
                text: String(s.text || ""),
              }));
            }
          } catch (_) {
            transcript = [{ text: data.transcription as string }];
          }
        }

        // Parse analysisResult for topics, keywords, sentiment, viral
        const ar = (data.analysisResult as Record<string, unknown> | null) ?? null;
        const partA = (ar?.partA as Record<string, unknown> | null) ?? null;
        const partB = (ar?.partB as Record<string, unknown> | null) ?? null;

        const topics: string[] = Array.isArray(partA?.tags) ? (partA!.tags as unknown[]).map(String) : [];
        const keywords: string[] = Array.isArray(partA?.keywords) ? (partA!.keywords as unknown[]).map(String) : [];

        // Parse comments from DB (already fetched via include in backend)
        const rawComments = Array.isArray(data.comments) ? (data.comments as Record<string, unknown>[]) : [];
        const commentRows: CommentRow[] = rawComments.map((c) => ({
          author: String(c.authorName || ""),
          text: String(c.text || ""),
          date: c.publishedAt ? fmtDate(c.publishedAt as string) : "",
          likes: Number(c.likeCount) || 0,
          sentiment: String(c.sentiment || "neutral"),
        }));

        // Calculate sentiment percentages from actual classified comment sentiments
        const classifiedComments = commentRows.filter(c => c.sentiment && c.sentiment !== "null");
        let positive = 0, negative = 0, neutral = 0;
        if (classifiedComments.length > 0) {
          const posCount = classifiedComments.filter(c => c.sentiment === "positive" || c.sentiment === "question").length;
          const negCount = classifiedComments.filter(c => c.sentiment === "negative").length;
          positive = Math.round((posCount / classifiedComments.length) * 100);
          negative = Math.round((negCount / classifiedComments.length) * 100);
          neutral = Math.max(0, 100 - positive - negative);
        }

        // Viral score (0–10) derived from real signals
        // Signal 1 (40%): positive comment ratio
        const s1 = classifiedComments.length > 0
          ? classifiedComments.filter(c => c.sentiment === "positive" || c.sentiment === "question").length / classifiedComments.length
          : 0.5;
        // Signal 2 (40%): like-to-view ratio
        const likeRatio = viewsRaw > 0 ? (likesRaw / viewsRaw) * 100 : 0;
        const s2 = likeRatio > 5 ? 1.0 : likeRatio > 2 ? 0.7 : likeRatio > 0.5 ? 0.4 : 0.15;
        // Signal 3 (20%): comment-to-view ratio (engagement depth)
        const commentRatio = viewsRaw > 0 ? (commentsRaw / viewsRaw) * 100 : 0;
        const s3 = commentRatio > 1 ? 1.0 : commentRatio > 0.3 ? 0.6 : 0.2;
        const viralScore = Math.round(((s1 * 0.4) + (s2 * 0.4) + (s3 * 0.2)) * 10 * 10) / 10;

        // Hook strength from AI's overall sentiment verdict
        const aiSentiment = String(partA?.sentiment ?? "neutral").toLowerCase();
        const hookStrong = aiSentiment === "positive";
        const hookLabel = hookStrong ? "Strong" : aiSentiment === "negative" ? "Weak" : "Moderate";

        // Trending: published within 14 days AND above-average like ratio
        const publishedDate = data.publishedAt ? new Date(data.publishedAt as string) : null;
        const daysSince = publishedDate ? (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24) : 999;
        const trending = daysSince <= 14 && likeRatio > 2;

        setAnalysis({
          transcript,
          topics,
          keywords,
          sentiment: { positive, negative, neutral },
          viral: { score: viralScore, hookLabel, hookStrong, trending },
          comments: commentRows,
        });
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-[13px] text-foreground">Loading video…</p>
      </div>
    );
  }

  if (notFound || !video || !channel) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-card p-6">
        <p className="text-foreground text-[14px] mb-2">This page has been deleted.</p>
        <Link to={channelPath("")} className="text-muted-foreground hover:text-foreground underline text-[13px]">
          Return to home
        </Link>
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
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <Link
          to={channelPath(`/channel/${channel.id}`)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground bg-transparent border-none font-sans hover:text-foreground transition-colors no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline" dir="rtl">{channel.name}</span>
          <span className="sm:hidden">Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelVisible(!panelVisible)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div>
          {/* Hero */}
          <div className="px-6 py-6 max-lg:px-4">
            <div className="rounded-lg overflow-hidden border border-border flex max-md:flex-col bg-card">
              {/* Thumbnail left */}
              <div className={`relative shrink-0 p-3 ${video.type === "short" ? "w-[200px] max-md:w-full" : "w-[380px] max-md:w-full"}`}>
                {(() => {
                  const ytId = video.youtubeId ?? (video.thumbnail && /\/vi\/([^/]+)\//.exec(video.thumbnail)?.[1]);
                  const imgEl = (
                    <img
                      src={video.thumbnail}
                      alt=""
                      className={`w-full object-cover rounded-lg ${video.type === "short" ? "aspect-[9/16]" : "aspect-video"}`}
                    />
                  );
                  return ytId ? (
                    <a
                      href={`https://www.youtube.com/watch?v=${ytId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                    <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">Status</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex ${
                        video.status === "done" ? "text-success" :
                        video.status === "failed" ? "text-destructive" :
                        video.status === "analyzing" ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {video.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                         video.status === "failed" ? <XCircle className="w-3.5 h-3.5" /> :
                         video.status === "analyzing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         <Clock className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-[12px] text-muted-foreground font-medium">
                        {video.status === "done" ? "Complete" : video.status === "failed" ? "Failed" : video.status === "analyzing" ? "Analyzing" : "Pending"}
                      </span>
                    </div>
                  </div>
                  <span className="w-px h-8 bg-border" />
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">Type</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${video.type === "short" ? "bg-purple/15 text-purple" : "bg-primary/15 text-primary"}`}>
                        <VideoTypeIcon type={video.type} className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                  <span className="w-px h-8 bg-border" />
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">Published</div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[12px] text-muted-foreground font-medium">{video.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 max-lg:px-4">
            <div className="grid grid-cols-5 max-lg:grid-cols-2 rounded-lg overflow-hidden border border-border">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-5 py-4 bg-card border-r border-b border-border last:border-r-0 ${
                    i === stats.length - 1 ? "max-lg:col-span-2 max-lg:border-r-0" : ""
                  }`}
                >
                  <div className="text-lg font-semibold font-mono tracking-tight mb-0.5">
                    {s.label === "Type" ? (
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${video.type === "short" ? "bg-purple/15 text-purple" : "bg-primary/15 text-primary"}`}>
                        <VideoTypeIcon type={video.type} className="w-4 h-4" />
                      </span>
                    ) : (
                      s.val
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
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
                      ? "bg-card text-foreground border-border"
                      : "bg-transparent text-muted-foreground border-border/50 hover:text-muted-foreground hover:border-border"
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
                <div className="rounded-lg overflow-hidden border border-border">
                  <div className="bg-card px-4 py-3">
                    <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-3">Transcript</div>
                    {(!analysis || analysis.transcript.length === 0) ? (
                      <EmptyState icon={FileText} title="No transcript available yet" />
                    ) : (
                      <div className="space-y-5">
                        {analysis.transcript.map((seg, i) => (
                          <div key={i} className="flex gap-4">
                            {seg.time && <span className="text-foreground text-[13px] font-mono shrink-0 pt-0.5">{seg.time}</span>}
                            <p className="text-sm leading-relaxed text-muted-foreground" dir="rtl" style={{ textAlign: "right" }}>{seg.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <SectionDivider label="Topics" />
                <div className="rounded-lg overflow-hidden border border-border">
                  <div className="bg-card px-4 py-3 flex flex-wrap gap-1.5">
                    {analysis && analysis.topics.length > 0
                      ? analysis.topics.map((t) => (
                          <span key={t} className="py-1 px-2.5 rounded-full bg-primary/10 border border-primary/15 text-primary text-xs font-mono">{t}</span>
                        ))
                      : <EmptyState icon={Hash} title="No topics yet" />
                    }
                  </div>
                </div>

                <SectionDivider label="Keywords" />
                <div className="rounded-lg overflow-hidden border border-border">
                  <div className="bg-card px-4 py-3 flex flex-wrap gap-1.5">
                    {analysis && analysis.keywords.length > 0
                      ? analysis.keywords.map((k) => (
                          <span key={k} className="py-1 px-2.5 rounded-full bg-card border border-border text-muted-foreground text-xs font-mono">{k}</span>
                        ))
                      : <EmptyState icon={Tag} title="No keywords yet" />
                    }
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Sentiment" && (
              <div>
                {/* Sentiment bars in table */}
                <div className="rounded-lg overflow-hidden border border-border mb-7">
                  {[
                    { label: "Positive", val: analysis?.sentiment.positive ?? 0, cls: "bg-success" },
                    { label: "Negative", val: analysis?.sentiment.negative ?? 0, cls: "bg-destructive" },
                    { label: "Neutral", val: analysis?.sentiment.neutral ?? 0, cls: "bg-dim" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border last:border-b-0 hover:bg-card transition-colors">
                      <span className="text-xs text-muted-foreground w-[72px]">{s.label}</span>
                      <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.cls}`} style={{ width: `${s.val}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-9 text-right">{s.val}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Viral" && (
              <div>
                <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3">
                  {/* Viral Score */}
                  <div className="rounded-lg border border-border bg-card px-5 py-4">
                    <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-2">Viral Score</div>
                    <div className="flex items-end gap-2">
                      <span className={`text-3xl font-semibold font-mono tracking-tight ${(analysis?.viral.score ?? 0) >= 6 ? "text-success" : (analysis?.viral.score ?? 0) >= 4 ? "text-muted-foreground" : "text-muted-foreground"}`}>
                        {analysis?.viral.score ?? "—"}
                      </span>
                      <span className="text-[12px] text-muted-foreground mb-1">/ 10</span>
                    </div>
                    <div className="mt-3 h-1.5 bg-card rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${(analysis?.viral.score ?? 0) >= 6 ? "bg-success" : (analysis?.viral.score ?? 0) >= 4 ? "bg-sensor" : "bg-dim/40"}`}
                        style={{ width: `${((analysis?.viral.score ?? 0) as number) * 10}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">Based on like ratio, comment ratio, and audience sentiment</p>
                  </div>

                  {/* Hook Strength */}
                  <div className="rounded-lg border border-border bg-card px-5 py-4">
                    <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-2">Hook Strength</div>
                    <div className={`text-3xl font-semibold font-mono tracking-tight ${analysis?.viral.hookStrong ? "text-success" : analysis?.viral.hookLabel === "Weak" ? "text-destructive" : "text-muted-foreground"}`}>
                      {analysis?.viral.hookLabel ?? "—"}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">Derived from AI sentiment analysis of the video content</p>
                  </div>

                  {/* Trending */}
                  <div className="rounded-lg border border-border bg-card px-5 py-4">
                    <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-2">Trending</div>
                    <div className={`text-3xl font-semibold font-mono tracking-tight ${analysis?.viral.trending ? "text-success" : "text-muted-foreground"}`}>
                      {analysis?.viral.trending ? "Yes" : "No"}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">Published within 14 days with above-average engagement</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Comments" && (
              <div className="rounded-lg overflow-hidden border border-border">
                {(!analysis || analysis.comments.length === 0) ? (
                  <EmptyState icon={MessageSquare} title="No comments yet" />
                ) : (
                  analysis.comments.map((c, i) => (
                    <div key={i} className="bg-card px-4 py-3 border-b border-border last:border-b-0 hover:bg-card transition-colors">
                      <div className="flex items-center mb-1.5">
                        <span className="text-[13px] font-medium">{c.author}</span>
                        <span className="text-[11px] text-muted-foreground font-mono ml-auto">{c.date}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground leading-relaxed mb-1.5" dir="rtl" style={{ textAlign: "right" }}>
                        {c.text}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground font-mono">♥ {c.likes}</span>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                c.sentiment === "positive" ? "text-success" :
                                c.sentiment === "question" ? "text-primary" :
                                "text-muted-foreground"
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
                  ))
                )}
              </div>
            )}


            {activeTab === "Pipeline" && (
              <div>
                <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-3">Pipeline</div>
                <div className="rounded-lg overflow-hidden border border-border">
                  {video.pipeline.map((step) => (
                    <div key={step.name} className="flex items-center justify-between bg-card px-4 py-3 border-b border-border last:border-b-0 hover:bg-card transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${
                          step.status === "done" ? "bg-success" :
                          step.status === "failed" ? "bg-destructive" :
                          step.status === "running" ? "bg-primary animate-pulse" : "bg-dim/30"
                        }`} />
                        <span className={`text-[13px] ${step.status === "failed" ? "text-destructive" : "text-foreground"}`}>{step.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {step.retries != null && step.retries > 1 && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                                  <RotateCw className="w-3 h-3" />
                                  {step.retries}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left">Attempted {step.retries} times</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <span className={`text-[12px] font-mono ${step.status === "failed" ? "text-destructive/60" : "text-muted-foreground"}`}>
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
                <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest mb-3">Analysis History</div>
                <div className="rounded-lg overflow-hidden border border-border">
                  {[
                    { time: "Mar 8, 14:22", name: "Full Analysis", status: "success" as const, badge: "Completed" },
                    { time: "Mar 7, 09:15", name: "Comment Refresh", status: "failed" as const, badge: "Failed", error: "API rate limit exceeded. Retry after 60 minutes." },
                  ].map((item, i) => (
                    <div key={i} className="bg-card px-4 py-3 border-b border-border last:border-b-0 hover:bg-card transition-colors">
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
                      <div className="text-[10px] text-muted-foreground font-mono">{item.time}</div>
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
      <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-mono whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
