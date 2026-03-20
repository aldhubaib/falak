import { Component, useState, type ReactNode } from "react";
import {
  Loader2,
  Search,
  BarChart3,
  FileText,
  Inbox,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
} from "lucide-react";

import { PageError } from "@/components/PageError";
import { DeleteChannelModal } from "@/components/DeleteChannelModal";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { VideoTable } from "@/components/VideoTable";
import { VideoRightPanel } from "@/components/VideoRightPanel";
import { ChannelRightPanel } from "@/components/ChannelRightPanel";
import { ScoreBar } from "@/components/story-detail/ScoreBar";
import { CopyBtn } from "@/components/story-detail/CopyBtn";
import { StoryDetailStageOmit } from "@/components/story-detail/StoryDetailStageOmit";
import { StoryDetailStagePassed } from "@/components/story-detail/StoryDetailStagePassed";
import { StoryDetailChannelSelector } from "@/components/story-detail/StoryDetailChannelSelector";
import { StoryDetailTopBar } from "@/components/story-detail/StoryDetailTopBar";
import { EmptyState } from "@/components/ui/empty-state";

import type { Video, PipelineStep, Channel } from "@/data/mock";

// ---------------------------------------------------------------------------
// Error boundary for components that may crash in isolation
// ---------------------------------------------------------------------------
class IsolationBoundary extends Component<
  { name: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error)
      return (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-[11px] text-destructive font-mono">
          Could not render "{this.props.name}" in isolation — {this.state.error}
        </div>
      );
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Label shown above each rendered item
// ---------------------------------------------------------------------------
function DLSLabel({ name, files }: { name: string; files: string }) {
  return (
    <div className="text-xs font-mono text-dim border-b border-border pb-1 mb-3 mt-10 first:mt-0">
      {name} — <span className="text-muted-foreground">{files}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const NOOP = () => {};

const MOCK_VIDEOS: Video[] = [
  {
    id: "v1",
    channelId: "c1",
    title: "How We Built a Million-Subscriber Channel in 90 Days",
    type: "video",
    views: "1.2M",
    likes: "45K",
    comments: "3.2K",
    date: "2025-12-01",
    duration: "14:32",
    status: "done",
    viewsRaw: 1200000,
    likesRaw: 45000,
    commentsRaw: 3200,
    thumbnail: "",
    pipeline: [
      { name: "Transcription", status: "done", time: "2s" },
      { name: "Translation", status: "done", time: "4s" },
      { name: "Sentiment", status: "done", time: "1s" },
      { name: "Topics", status: "done", time: "3s" },
      { name: "Comments", status: "done", time: "2s" },
      { name: "Viral Score", status: "done", time: "1s" },
    ],
  },
  {
    id: "v2",
    channelId: "c1",
    title: "Why This Thumbnail Got 10x More Clicks",
    type: "short",
    views: "340K",
    likes: "12K",
    comments: "890",
    date: "2025-11-28",
    duration: "0:58",
    status: "analyzing",
    viewsRaw: 340000,
    likesRaw: 12000,
    commentsRaw: 890,
    thumbnail: "",
    pipeline: [
      { name: "Transcription", status: "done", time: "1s" },
      { name: "Translation", status: "running" },
      { name: "Sentiment", status: "waiting" },
      { name: "Topics", status: "waiting" },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
  {
    id: "v3",
    channelId: "c1",
    title: "The Algorithm Change Nobody Noticed",
    type: "video",
    views: "89K",
    likes: "2.1K",
    comments: "156",
    date: "2025-11-15",
    duration: "22:10",
    status: "failed",
    viewsRaw: 89000,
    likesRaw: 2100,
    commentsRaw: 156,
    thumbnail: "",
    pipeline: [
      { name: "Transcription", status: "done", time: "3s" },
      { name: "Translation", status: "failed" },
      { name: "Sentiment", status: "waiting" },
      { name: "Topics", status: "waiting" },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
  {
    id: "v4",
    channelId: "c1",
    title: "Creator Economy Update — March 2025",
    type: "video",
    views: "0",
    likes: "0",
    comments: "0",
    date: "2025-11-10",
    duration: "8:44",
    status: "pending",
    viewsRaw: 0,
    likesRaw: 0,
    commentsRaw: 0,
    thumbnail: "",
    pipeline: [
      { name: "Transcription", status: "waiting" },
      { name: "Translation", status: "waiting" },
      { name: "Sentiment", status: "waiting" },
      { name: "Topics", status: "waiting" },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
];

const MOCK_PIPELINE: PipelineStep[] = MOCK_VIDEOS[0].pipeline;

const MOCK_CHANNEL: Channel = {
  id: "c1",
  name: "MrBeast",
  handle: "@MrBeast",
  avatar: "MB",
  avatarImg: "",
  type: "ours",
  subscribers: "245M",
  views: "47B",
  videos: "842",
  subscribersRaw: 245000000,
  viewsRaw: 47000000000,
  videosRaw: 842,
  lastSynced: "2025-12-01",
  active: true,
  joinedDate: "2012-02-20",
  country: "US",
  avgViews: "56M",
  engRate: "4.2%",
  topCategory: "Entertainment",
  growthSubs: "+2.1%",
  growthViews: "+8.3%",
};

const MOCK_STAGES = [
  { key: "suggestion", label: "AI Suggestion" },
  { key: "approved", label: "Approved" },
  { key: "scripting", label: "Scripting" },
  { key: "filming", label: "Filming" },
  { key: "published", label: "Published" },
];

const MOCK_API_CHANNELS = [
  { id: "c1", nameAr: null, nameEn: "MrBeast", handle: "@MrBeast", avatarUrl: null, type: "ours" },
  { id: "c2", nameAr: "تقنية", nameEn: "Tech Arabia", handle: "@techarabia", avatarUrl: null, type: "competition" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DesignSystem() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [channelPanelOpen, setChannelPanelOpen] = useState(true);
  const [videoPanelOpen, setVideoPanelOpen] = useState(true);
  const [channelSelectorOpen, setChannelSelectorOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-12">
          <span className="text-sm font-semibold tracking-tight">Falak DLS</span>
          <span className="font-mono text-[10px] text-dim">/design-system</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-2">
        {/* ============================================================
            NAMED COMPONENTS
            ============================================================ */}

        {/* --- VideoTypeIcon --- */}
        <DLSLabel name="VideoTypeIcon" files="VideoDetail.tsx, ChannelDetail.tsx" />
        <IsolationBoundary name="VideoTypeIcon">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm"><VideoTypeIcon type="video" /> Video</span>
            <span className="flex items-center gap-1.5 text-sm"><VideoTypeIcon type="short" /> Short</span>
          </div>
        </IsolationBoundary>

        {/* --- ScoreBar --- */}
        <DLSLabel name="ScoreBar" files="StoryDetail.tsx" />
        <IsolationBoundary name="ScoreBar">
          <div className="flex rounded-xl border border-border overflow-hidden">
            <ScoreBar label="Relevance" value={72} />
            <ScoreBar label="Virality" value={85} />
            <ScoreBar label="First Mover" value={41} />
          </div>
        </IsolationBoundary>

        {/* --- CopyBtn --- */}
        <DLSLabel name="CopyBtn" files="StoryDetail.tsx" />
        <IsolationBoundary name="CopyBtn">
          <div className="flex items-center gap-3">
            <CopyBtn text="Sample text to copy" />
          </div>
        </IsolationBoundary>

        {/* --- PageError --- */}
        <DLSLabel name="PageError" files="Stories.tsx, App.tsx (ErrorBoundary)" />
        <IsolationBoundary name="PageError">
          <div className="rounded-xl border border-border overflow-hidden">
            <PageError
              title="Something went wrong"
              message="Failed to load channel data. The server returned a 502 error."
              onRetry={NOOP}
              showHome
            />
          </div>
        </IsolationBoundary>

        {/* --- EmptyState --- */}
        <DLSLabel name="EmptyState" files="AlbumDetail, Competitions, Gallery, Monitor, ProfileHome, PublishQueue, Settings, Source, StoryDetail, VectorIntelligence, VideoDetail" />
        <IsolationBoundary name="EmptyState">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border">
              <EmptyState icon={Inbox} title="No videos yet" description="Add a channel to start analyzing" />
            </div>
            <div className="rounded-xl border border-border">
              <EmptyState icon={Search} title="No results" description="Try a different search term" />
            </div>
            <div className="rounded-xl border border-border">
              <EmptyState icon={FileText} title="No articles" />
            </div>
          </div>
        </IsolationBoundary>

        {/* --- DeleteChannelModal --- */}
        <DLSLabel name="DeleteChannelModal" files="Competitions.tsx" />
        <IsolationBoundary name="DeleteChannelModal">
          <div>
            <button
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium"
            >
              Open DeleteChannelModal
            </button>
            <DeleteChannelModal
              open={deleteOpen}
              channelName="MrBeast"
              onClose={() => setDeleteOpen(false)}
              onDelete={() => setDeleteOpen(false)}
            />
          </div>
        </IsolationBoundary>

        {/* --- VideoTable --- */}
        <DLSLabel name="VideoTable" files="ChannelDetail.tsx" />
        <IsolationBoundary name="VideoTable">
          <div className="rounded-xl border border-border overflow-hidden">
            <VideoTable videos={MOCK_VIDEOS} />
          </div>
        </IsolationBoundary>

        {/* --- VideoRightPanel --- */}
        <DLSLabel name="VideoRightPanel" files="VideoDetail.tsx" />
        <IsolationBoundary name="VideoRightPanel">
          <div className="relative h-[360px] rounded-xl border border-border overflow-hidden">
            <VideoRightPanel
              video={MOCK_VIDEOS[0]}
              visible={videoPanelOpen}
              onClose={() => setVideoPanelOpen(false)}
              pipeline={MOCK_PIPELINE}
            />
            {!videoPanelOpen && (
              <button onClick={() => setVideoPanelOpen(true)} className="absolute inset-0 flex items-center justify-center text-xs text-dim">
                Click to reopen panel
              </button>
            )}
          </div>
        </IsolationBoundary>

        {/* --- ChannelRightPanel --- */}
        <DLSLabel name="ChannelRightPanel" files="ChannelDetail.tsx" />
        <IsolationBoundary name="ChannelRightPanel">
          <div className="relative h-[480px] rounded-xl border border-border overflow-hidden">
            <ChannelRightPanel
              channel={MOCK_CHANNEL}
              visible={channelPanelOpen}
              onClose={() => setChannelPanelOpen(false)}
              videoCount={720}
              shortCount={122}
            />
            {!channelPanelOpen && (
              <button onClick={() => setChannelPanelOpen(true)} className="absolute inset-0 flex items-center justify-center text-xs text-dim">
                Click to reopen panel
              </button>
            )}
          </div>
        </IsolationBoundary>

        {/* --- StoryDetailTopBar --- */}
        <DLSLabel name="StoryDetailTopBar" files="StoryDetail.tsx" />
        <IsolationBoundary name="StoryDetailTopBar">
          <div className="rounded-xl border border-border overflow-hidden">
            <StoryDetailTopBar
              stageLabel="Scripting"
              activeStage="scripting"
              stages={MOCK_STAGES}
              nextStageKey="filming"
              nextStageLabel="Filming"
              onBack={NOOP}
              onMoveToNextStage={NOOP}
              onPass={NOOP}
              onRestart={NOOP}
              onOmit={NOOP}
              onHistoryClick={NOOP}
              onScoreHistoryClick={NOOP}
              prevNext={{ currentIndex: 2, total: 8, onPrev: NOOP, onNext: NOOP }}
            />
          </div>
        </IsolationBoundary>

        {/* --- StoryDetailStageOmit --- */}
        <DLSLabel name="StoryDetailStageOmit" files="StoryDetail.tsx" />
        <IsolationBoundary name="StoryDetailStageOmit">
          <StoryDetailStageOmit onMoveBack={NOOP} />
        </IsolationBoundary>

        {/* --- StoryDetailStagePassed --- */}
        <DLSLabel name="StoryDetailStagePassed" files="StoryDetail.tsx" />
        <IsolationBoundary name="StoryDetailStagePassed">
          <StoryDetailStagePassed onMoveBack={NOOP} />
        </IsolationBoundary>

        {/* --- StoryDetailChannelSelector --- */}
        <DLSLabel name="StoryDetailChannelSelector" files="StoryDetail.tsx" />
        <IsolationBoundary name="StoryDetailChannelSelector">
          <StoryDetailChannelSelector
            channels={MOCK_API_CHANNELS}
            selectedId="c1"
            open={channelSelectorOpen}
            onToggleOpen={() => setChannelSelectorOpen((v) => !v)}
            onSelect={() => setChannelSelectorOpen(false)}
          />
        </IsolationBoundary>

        {/* ============================================================
            INLINE PATTERNS (repeated across pages, not components)
            ============================================================ */}

        {/* --- Status badges --- */}
        <DLSLabel name="Status badge (bg-*/15)" files="Pipeline, Monitor, Analytics, ArticlePipeline, PublishQueue, Stories, Source, VideoDetail, StoryDetail, VectorIntelligence" />
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-success/15 text-success border-success/20">Active</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue/15 text-blue border-blue/20">Analyzing</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-orange/15 text-orange border-orange/20">Queued</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-purple/15 text-purple border-purple/20">Enriched</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive border-destructive/20">Failed</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-dim/15 text-dim border-dim/20">Pending</span>
        </div>

        {/* --- Status badges (bg-*/10 variant) --- */}
        <DLSLabel name="Status badge (bg-*/10)" files="Admin, AlbumDetail, ArticleDetail, ArticlePipeline, ChannelDetail, Competitions, Gallery, ProfileHome, PublishQueue, Settings" />
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-success/10 text-success border-transparent">Connected</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive border-transparent">Error</span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border-transparent">Featured</span>
        </div>

        {/* --- Small mono status pill --- */}
        <DLSLabel name="Mono status pill (text-[10px])" files="StoryDetail.tsx" />
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange/15 text-orange border border-orange/20">scripting</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue border border-blue/20">approved</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20">published</span>
        </div>

        {/* --- Stage pill (Stories) --- */}
        <DLSLabel name="Stage pill (text-[9px] font-mono)" files="Stories.tsx" />
        <div className="flex flex-wrap gap-2">
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-foreground">SCRIPTING</span>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-blue/15 text-foreground">APPROVED</span>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-foreground">PUBLISHED</span>
        </div>

        {/* --- Circular icon badge --- */}
        <DLSLabel name="Circular icon badge" files="ArticlePipeline, Pipeline, Analytics" />
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-success/15 text-success">1</div>
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-blue/15 text-blue">2</div>
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-orange/15 text-orange">3</div>
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-purple/15 text-purple">4</div>
        </div>

        {/* --- Filter pill buttons --- */}
        <DLSLabel name="Filter pill (active / inactive)" files="Stories, ArticlePipeline, Monitor, Pipeline, PublishQueue, Gallery, VectorIntelligence" />
        <div className="flex flex-wrap gap-2">
          <button className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-foreground/10 text-foreground border border-foreground/20">All</button>
          <button className="px-4 py-1.5 rounded-full text-[12px] font-medium text-dim border border-border hover:text-foreground hover:border-foreground/20 transition-colors">Active</button>
          <button className="px-4 py-1.5 rounded-full text-[12px] font-medium text-dim border border-border hover:text-foreground hover:border-foreground/20 transition-colors">Archived</button>
        </div>

        {/* --- Action pill buttons --- */}
        <DLSLabel name="Action pill button" files="ArticlePipeline, Monitor, Pipeline, PublishQueue, VectorIntelligence" />
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-foreground/10 text-foreground border border-foreground/20">
            <Play className="w-3 h-3" /> Analyze
          </button>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
            <Search className="w-3 h-3" /> Filter
          </button>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium">
            <XCircle className="w-3 h-3" /> Remove
          </button>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" /> Published
          </button>
        </div>

        {/* --- Stat display (large) --- */}
        <DLSLabel name="Stat number (text-2xl font-mono)" files="Analytics, Gallery, Pipeline, PublishQueue, Monitor" />
        <div className="flex gap-6">
          <div>
            <div className="text-2xl font-semibold font-mono tracking-tight">1,247</div>
            <div className="text-xs text-muted-foreground">Total videos</div>
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tracking-tight text-success">+12%</div>
            <div className="text-xs text-muted-foreground">Growth</div>
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tracking-tight text-orange">38</div>
            <div className="text-xs text-muted-foreground">Queued</div>
          </div>
        </div>

        {/* --- Stat display (medium) --- */}
        <DLSLabel name="Stat number (text-xl font-mono)" files="ArticlePipeline, Monitor, Pipeline, ProfileHome, StoryDetail" />
        <div className="flex gap-6">
          <div>
            <div className="text-xl font-semibold font-mono tracking-tight">342</div>
            <div className="text-xs text-muted-foreground">Analyzed</div>
          </div>
          <div>
            <div className="text-xl font-semibold font-mono tracking-tight text-blue">89</div>
            <div className="text-xs text-muted-foreground">In progress</div>
          </div>
        </div>

        {/* --- Stat row layout --- */}
        <DLSLabel name="Stat row (flex justify-between)" files="Monitor, Pipeline" />
        <div className="rounded-xl border border-border bg-card p-4 space-y-0">
          {[
            { label: "Channels tracked", value: "24" },
            { label: "Videos analyzed", value: "1,842" },
            { label: "Failed jobs", value: "3" },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-sm font-semibold font-mono">{s.value}</span>
            </div>
          ))}
        </div>

        {/* --- Page header bar --- */}
        <DLSLabel name="Page header bar (h-12 border-b)" files="Admin, Analytics, ChannelDetail, Monitor, PublishQueue, Settings, Stories, VideoDetail, StoryDetail" />
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
            <h1 className="text-sm font-semibold">Pipeline Monitor</h1>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium">
                <Search className="w-3 h-3" /> Search
              </button>
            </div>
          </div>
          <div className="h-24 bg-background" />
        </div>

        {/* --- Loading spinner (full-page) --- */}
        <DLSLabel name="Full-page loading spinner" files="AlbumDetail, ArticlePipeline, ChannelDetail, Gallery, Monitor, Pipeline, ProfileHome, ProfilePicker, VideoDetail" />
        <div className="flex gap-8">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-[10px] text-dim font-mono">w-6 h-6</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="text-[10px] text-dim font-mono">w-8 h-8</span>
          </div>
        </div>

        {/* --- Inline loading spinner --- */}
        <DLSLabel name="Inline loading spinner" files="ArticlePipeline, ProfileHome, PublishQueue, Settings, Source, Stories" />
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
          <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</span>
        </div>

        {/* --- Pulse dot (running indicator) --- */}
        <DLSLabel name="Pulse dot (animate-pulse)" files="ArticlePipeline, Pipeline" />
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-success"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" /> Active</span>
          <span className="flex items-center gap-1.5 text-xs text-blue"><span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse shrink-0" /> Running</span>
          <span className="flex items-center gap-1.5 text-xs text-orange"><span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse shrink-0" /> Queued</span>
        </div>

        {/* --- Pipeline step icons --- */}
        <DLSLabel name="Pipeline step status icons" files="Pipeline, VideoDetail, VideoTable" />
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs"><CheckCircle2 className="w-4 h-4 text-success" /> Done</span>
          <span className="flex items-center gap-1.5 text-xs"><XCircle className="w-4 h-4 text-destructive" /> Failed</span>
          <span className="flex items-center gap-1.5 text-xs"><Clock className="w-4 h-4 text-dim" /> Pending</span>
          <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-4 h-4 text-blue animate-spin" /> Analyzing</span>
        </div>

        {/* --- Error alert box --- */}
        <DLSLabel name="Error alert box" files="Stories, ArticleDetail" />
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-3">
            <span className="text-[11px] text-destructive flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Failed to fetch story data. Retrying…
            </span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-[11px] font-mono">
            Error: ETIMEDOUT — connection to upstream timed out after 30s
          </div>
        </div>

        {/* ============================================================
            COMPONENTS THAT CANNOT RENDER IN ISOLATION
            ============================================================ */}

        <DLSLabel name="AppLayout" files="App.tsx (layout wrapper)" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires router Outlet, useParams, useNavigate, auth fetch
        </div>

        <DLSLabel name="ChannelLayout" files="App.tsx (layout wrapper)" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useParams, useNavigate, profile fetch
        </div>

        <DLSLabel name="AppSidebar" files="AppLayout.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useLocation, useNavigate, useCurrentUser, profile fetch
        </div>

        <DLSLabel name="UploadIndicator" files="App.tsx (global)" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useUploadTasks() and storyQueue
        </div>

        <DLSLabel name="GalleryUploadIndicator" files="App.tsx (global)" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires galleryQueue via useSyncExternalStore
        </div>

        <DLSLabel name="ScriptEditorTiptap" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — Tiptap editor with optional Hocuspocus collab websocket
        </div>

        <DLSLabel name="StoryDetailScriptSection" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — embeds ScriptEditorTiptap + script generation logic
        </div>

        <DLSLabel name="StoryDetailStagePublish" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — calls story API endpoints for publish workflow
        </div>

        <DLSLabel name="StoryDetailArticle" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires 13+ props including callbacks for cleanup/refetch/retry
        </div>

        <DLSLabel name="TranscriptSection" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — calls /api/stories/:id/transcribe
        </div>

        <DLSLabel name="VideoUpload" files="StoryDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useStoryUpload hook and signed URL endpoint
        </div>

        <DLSLabel name="UploadZone" files="Gallery.tsx, AlbumDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useMediaUpload hook
        </div>

        <DLSLabel name="MediaGrid" files="AlbumDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires RowsPhotoAlbum from react-photo-album
        </div>

        <DLSLabel name="MediaViewer" files="Gallery.tsx, AlbumDetail.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — full-screen dialog requiring items array with R2 URLs
        </div>

        <DLSLabel name="AlbumCard" files="Gallery.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — requires useParams and Link (router context)
        </div>

        <DLSLabel name="ScriptBlock (Tiptap extension)" files="ScriptEditorTiptap.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — Tiptap Node extension, renders inside editor only
        </div>

        <DLSLabel name="SlashCommand (Tiptap extension)" files="ScriptEditorTiptap.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — Tiptap extension with Tippy popup
        </div>

        <DLSLabel name="MentionSuggestion (Tiptap extension)" files="ScriptEditorTiptap.tsx" />
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-dim font-mono">
          Cannot render in isolation — Tiptap suggestion config with Tippy popup
        </div>

        {/* Spacer */}
        <div className="h-24" />
      </div>
    </div>
  );
}
