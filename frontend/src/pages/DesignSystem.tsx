import { Component, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useParams } from "react-router-dom";
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
import { ScriptEditorTiptap } from "@/components/ScriptEditorTiptap";
import { StoryDetailScriptSection } from "@/components/story-detail/StoryDetailScriptSection";
import { StoryDetailStagePublish } from "@/components/story-detail/StoryDetailStagePublish";
import { StoryDetailArticle } from "@/components/story-detail/StoryDetailArticle";
import { TranscriptSection } from "@/components/story-detail/TranscriptSection";
import { VideoUpload } from "@/components/story-detail/VideoUpload";
import { UploadZone } from "@/components/gallery/UploadZone";
import { MediaGrid } from "@/components/gallery/MediaGrid";
import { MediaViewer } from "@/components/gallery/MediaViewer";
import { AlbumCard } from "@/components/gallery/AlbumCard";
import { AppSidebar } from "@/components/AppSidebar";
import { UploadIndicator } from "@/components/UploadIndicator";
import { GalleryUploadIndicator } from "@/components/GalleryUploadIndicator";

import type { Video, PipelineStep, Channel } from "@/data/mock";
import type { StoryBrief } from "@/components/story-detail/types";
import type { GalleryMedia, GalleryAlbum } from "@/lib/gallery-api";

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
          Could not render &ldquo;{this.props.name}&rdquo; &mdash; {this.state.error}
        </div>
      );
    return this.props.children;
  }
}

function copyCid(cid: string) {
  navigator.clipboard.writeText(`data-cid="${cid}"`);
}

function CidBlock({ cid, name, source, children }: { cid: string; name: string; source: string; children: ReactNode }) {
  return (
    <div id={`cid-${cid}`} data-cid={cid} className="mb-8">
      <p className="text-xs font-mono text-muted-foreground mb-2">
        {name} &mdash; {source}
        <span
          className="ml-2 text-border select-all cursor-pointer hover:text-muted-foreground transition-colors"
          title="Copy data-cid"
          onClick={() => copyCid(cid)}
        >
          #{cid}
        </span>
      </p>
      <IsolationBoundary name={name}>{children}</IsolationBoundary>
    </div>
  );
}

function SectionHeader({ id, label }: { id: string; label: string }) {
  return (
    <div id={id} className="scroll-mt-20 pt-8">
      <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border pb-2 mb-6">{label}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
const NOOP = () => {};
const NOOP_ASYNC = async () => {};

const MOCK_VIDEOS: Video[] = [
  { id: "v1", channelId: "c1", title: "How We Built a Million-Subscriber Channel in 90 Days", type: "video", views: "1.2M", likes: "45K", comments: "3.2K", date: "2025-12-01", duration: "14:32", status: "done", viewsRaw: 1200000, likesRaw: 45000, commentsRaw: 3200, thumbnail: "", pipeline: [{ name: "Transcription", status: "done", time: "2s" }, { name: "Translation", status: "done", time: "4s" }, { name: "Sentiment", status: "done", time: "1s" }, { name: "Topics", status: "done", time: "3s" }, { name: "Comments", status: "done", time: "2s" }, { name: "Viral Score", status: "done", time: "1s" }] },
  { id: "v2", channelId: "c1", title: "Why This Thumbnail Got 10x More Clicks", type: "short", views: "340K", likes: "12K", comments: "890", date: "2025-11-28", duration: "0:58", status: "analyzing", viewsRaw: 340000, likesRaw: 12000, commentsRaw: 890, thumbnail: "", pipeline: [{ name: "Transcription", status: "done", time: "1s" }, { name: "Translation", status: "running" }, { name: "Sentiment", status: "waiting" }, { name: "Topics", status: "waiting" }, { name: "Comments", status: "waiting" }, { name: "Viral Score", status: "waiting" }] },
  { id: "v3", channelId: "c1", title: "The Algorithm Change Nobody Noticed", type: "video", views: "89K", likes: "2.1K", comments: "156", date: "2025-11-15", duration: "22:10", status: "failed", viewsRaw: 89000, likesRaw: 2100, commentsRaw: 156, thumbnail: "", pipeline: [{ name: "Transcription", status: "done", time: "3s" }, { name: "Translation", status: "failed" }, { name: "Sentiment", status: "waiting" }, { name: "Topics", status: "waiting" }, { name: "Comments", status: "waiting" }, { name: "Viral Score", status: "waiting" }] },
  { id: "v4", channelId: "c1", title: "Creator Economy Update \u2014 March 2025", type: "video", views: "0", likes: "0", comments: "0", date: "2025-11-10", duration: "8:44", status: "pending", viewsRaw: 0, likesRaw: 0, commentsRaw: 0, thumbnail: "", pipeline: [{ name: "Transcription", status: "waiting" }, { name: "Translation", status: "waiting" }, { name: "Sentiment", status: "waiting" }, { name: "Topics", status: "waiting" }, { name: "Comments", status: "waiting" }, { name: "Viral Score", status: "waiting" }] },
];
const MOCK_PIPELINE: PipelineStep[] = MOCK_VIDEOS[0].pipeline;
const MOCK_CHANNEL: Channel = { id: "c1", name: "MrBeast", handle: "@MrBeast", avatar: "MB", avatarImg: "", type: "ours", subscribers: "245M", views: "47B", videos: "842", subscribersRaw: 245000000, viewsRaw: 47000000000, videosRaw: 842, lastSynced: "2025-12-01", active: true, joinedDate: "2012-02-20", country: "US", avgViews: "56M", engRate: "4.2%", topCategory: "Entertainment", growthSubs: "+2.1%", growthViews: "+8.3%" };
const MOCK_STAGES = [{ key: "suggestion", label: "AI Suggestion" }, { key: "approved", label: "Approved" }, { key: "scripting", label: "Scripting" }, { key: "filming", label: "Filming" }, { key: "published", label: "Published" }];
const MOCK_API_CHANNELS = [{ id: "c1", nameAr: null, nameEn: "MrBeast", handle: "@MrBeast", avatarUrl: null, type: "ours" }, { id: "c2", nameAr: "\u062A\u0642\u0646\u064A\u0629", nameEn: "Tech Arabia", handle: "@techarabia", avatarUrl: null, type: "competition" }];
const MOCK_BRIEF: StoryBrief = { suggestedTitle: "How AI is Changing Content Creation", summary: "An exploration of how generative AI tools are reshaping the YouTube creator economy.", articleTitle: "The Rise of AI-Powered Content", articleContent: "Artificial intelligence is transforming the way creators produce, edit, and distribute content across platforms...", script: "Welcome back to the channel. Today we're diving into something that's been reshaping our entire industry...", scriptDuration: 8, videoFormat: "long", channelId: "c1", transcript: "So the first thing I want to talk about is how AI tools have completely changed the editing workflow. We used to spend hours on color grading alone, but now with these new models, you can get 90% of the way there in seconds.", transcriptSegments: [{ start: 0, end: 12, text: "So the first thing I want to talk about is how AI tools have completely changed the editing workflow." }, { start: 12, end: 24, text: "We used to spend hours on color grading alone, but now with these new models, you can get 90% of the way there in seconds." }], youtubeDescription: "In this video we explore how AI is changing the content creation landscape...", youtubeTags: ["AI", "content creation", "YouTube"] };
const MOCK_GALLERY_MEDIA: GalleryMedia[] = [
  { id: "m1", channelId: "c1", albumId: null, type: "IMAGE", fileName: "thumbnail-v1.jpg", fileSize: "245000", mimeType: "image/jpeg", width: 1280, height: 720, duration: null, r2Key: "m1.jpg", r2Url: "https://picsum.photos/seed/dls1/640/360", thumbnailR2Key: null, thumbnailR2Url: "https://picsum.photos/seed/dls1/640/360", metadata: null, uploadedById: "u1", createdAt: "2025-12-01", updatedAt: "2025-12-01" },
  { id: "m2", channelId: "c1", albumId: null, type: "IMAGE", fileName: "behind-scenes.png", fileSize: "380000", mimeType: "image/png", width: 800, height: 600, duration: null, r2Key: "m2.png", r2Url: "https://picsum.photos/seed/dls2/800/600", thumbnailR2Key: null, thumbnailR2Url: "https://picsum.photos/seed/dls2/800/600", metadata: null, uploadedById: "u1", createdAt: "2025-11-28", updatedAt: "2025-11-28" },
  { id: "m3", channelId: "c1", albumId: null, type: "IMAGE", fileName: "studio-setup.jpg", fileSize: "520000", mimeType: "image/jpeg", width: 1920, height: 1080, duration: null, r2Key: "m3.jpg", r2Url: "https://picsum.photos/seed/dls3/960/540", thumbnailR2Key: null, thumbnailR2Url: "https://picsum.photos/seed/dls3/960/540", metadata: null, uploadedById: "u1", createdAt: "2025-11-25", updatedAt: "2025-11-25" },
  { id: "m4", channelId: "c1", albumId: null, type: "VIDEO", fileName: "broll-city.mp4", fileSize: "12000000", mimeType: "video/mp4", width: 1920, height: 1080, duration: 34, r2Key: "m4.mp4", r2Url: "https://picsum.photos/seed/dls4/960/540", thumbnailR2Key: null, thumbnailR2Url: "https://picsum.photos/seed/dls4/960/540", metadata: null, uploadedById: "u1", createdAt: "2025-11-20", updatedAt: "2025-11-20" },
];
const MOCK_ALBUM: GalleryAlbum = { id: "a1", channelId: "c1", name: "Episode 42 \u2014 B-Roll", description: "Behind the scenes footage", coverMediaId: "m1", createdById: "u1", createdAt: "2025-12-01", updatedAt: "2025-12-01", coverMedia: { id: "m1", r2Url: "https://picsum.photos/seed/dls1/640/360", thumbnailR2Url: "https://picsum.photos/seed/dls1/640/360", type: "IMAGE" }, _count: { media: 24 } };

// ---------------------------------------------------------------------------
const TAB1_SECTIONS = [
  { id: "feedback", label: "Feedback" },
  { id: "navigation", label: "Navigation" },
  { id: "data-display", label: "Data Display" },
  { id: "indicators", label: "Indicators & Status" },
  { id: "actions", label: "Actions" },
  { id: "story-workflow", label: "Story Workflow" },
  { id: "media", label: "Media" },
  { id: "layout", label: "Layout" },
] as const;

const TAB2_SECTIONS = [
  { id: "colors", label: "Color Tokens" },
  { id: "radius", label: "Radius Scale" },
  { id: "typography", label: "Typography Scale" },
] as const;

const COLOR_GROUPS = [
  { label: "Surfaces", tokens: [
    { id: "--background", hsl: "hsl(240,4%,6%)" }, { id: "--card", hsl: "hsl(240,4%,6%)" },
  ]},
  { label: "Text", tokens: [
    { id: "--foreground", hsl: "hsl(0,0%,93%)" }, { id: "--muted-foreground", hsl: "hsl(0,0%,45%)" },
  ]},
  { label: "Status", tokens: [
    { id: "--primary", hsl: "hsl(217,72%,56%)" }, { id: "--destructive", hsl: "hsl(0,72%,51%)" },
    { id: "--success", hsl: "hsl(142,50%,45%)" }, { id: "--blue", hsl: "hsl(217,72%,56%)" },
    { id: "--purple", hsl: "hsl(258,60%,59%)" }, { id: "--orange", hsl: "hsl(25,90%,55%)" },
  ]},
  { label: "Border", tokens: [
    { id: "--border", hsl: "hsl(228,8%,9%)" }, { id: "--ring", hsl: "hsl(217,72%,56%)" },
  ]},
];
const RADIUS_TOKENS = [
  { id: "--radius-lg", rem: "0.5rem", px: "8px", tw: "rounded-lg" },
  { id: "--radius-full", rem: "9999px", px: "pill", tw: "rounded-full" },
];
const TYPO_TOKENS = [
  { id: "--text-2xs", rem: "0.5625rem", px: "9px" },
  { id: "--text-xs", rem: "0.625rem", px: "10px" },
  { id: "--text-sm", rem: "0.6875rem", px: "11px" },
  { id: "--text-base", rem: "0.75rem", px: "12px" },
  { id: "--text-md", rem: "0.8125rem", px: "13px" },
  { id: "--text-lg", rem: "0.875rem", px: "14px" },
  { id: "--text-xl", rem: "0.9375rem", px: "15px" },
  { id: "--text-2xl", rem: "1.125rem", px: "18px" },
  { id: "--text-3xl", rem: "1.375rem", px: "22px" },
];

// ---------------------------------------------------------------------------
function useActiveSection(sectionIds: readonly { id: string }[]) {
  const [active, setActive] = useState(sectionIds[0]?.id ?? "");
  useEffect(() => {
    const els = sectionIds.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setActive(e.target.id); break; }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);
  return active;
}

// ---------------------------------------------------------------------------
export default function DesignSystem() {
  const { channelId } = useParams();
  const [tab, setTab] = useState<"components" | "foundation">("components");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [channelPanelOpen, setChannelPanelOpen] = useState(true);
  const [videoPanelOpen, setVideoPanelOpen] = useState(true);
  const [channelSelectorOpen, setChannelSelectorOpen] = useState(false);
  const [brief, setBrief] = useState<StoryBrief>(MOCK_BRIEF);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const editorRef = useRef<{ setContent: (v: any) => void } | null>(null);

  const sections = tab === "components" ? TAB1_SECTIONS : TAB2_SECTIONS;
  const activeSection = useActiveSection(sections);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-[1120px] mx-auto px-6 flex items-center justify-between h-12">
          <span className="text-sm font-semibold tracking-tight">Falak DLS</span>
          <span className="font-mono text-[10px] text-muted-foreground">/design-system</span>
        </div>
        <div className="max-w-[1120px] mx-auto px-6 flex gap-0">
          {(["components", "foundation"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "components" ? "Live Components" : "Foundation"}
            </button>
          ))}
        </div>
      </div>

      {/* 2-column layout */}
      <div className="max-w-[1120px] mx-auto flex">
        {/* Left sidebar nav */}
        <nav className="w-48 shrink-0 sticky top-[88px] self-start h-[calc(100vh-88px)] overflow-y-auto py-6 pr-4 hidden lg:block">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`block py-1.5 text-xs font-mono transition-colors ${activeSection === s.id ? "text-foreground" : "text-muted-foreground hover:text-muted-foreground"}`}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Right content */}
        <div className="flex-1 min-w-0 px-6 py-6 pb-24">

          {/* ================================================================
              TAB 1: LIVE COMPONENTS
              ================================================================ */}
          {tab === "components" && (
            <>
              {/* ── SECTION 1: Feedback ── */}
              <SectionHeader id="feedback" label="Feedback" />

              <CidBlock cid="page-error" name="PageError" source="Stories.tsx, App.tsx">
                <div className="rounded-lg border border-border overflow-hidden">
                  <PageError title="Something went wrong" message="Failed to load channel data. Check your connection and try again." detail="Error: ECONNREFUSED 127.0.0.1:5432" showHome={false} />
                </div>
              </CidBlock>

              <CidBlock cid="empty-state" name="EmptyState" source="12 pages">
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border"><EmptyState icon={Inbox} title="No videos yet" description="Add a channel to start analyzing" /></div>
                  <div className="rounded-lg border border-border"><EmptyState icon={Search} title="No results" description="Try a different search term" /></div>
                  <div className="rounded-lg border border-border"><EmptyState icon={FileText} title="No articles" /></div>
                </div>
              </CidBlock>

              <CidBlock cid="error-alert-box" name="Error alert box" source="Stories, ArticleDetail">
                <div className="space-y-3">
                  <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-destructive flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Failed to fetch story data. Retrying&hellip;</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-[11px] font-mono">Error: ETIMEDOUT &mdash; connection to upstream timed out after 30s</div>
                </div>
              </CidBlock>

              <CidBlock cid="loading-spinner-full" name="Full-page loading spinner" source="9 pages">
                <div className="flex gap-8">
                  <div className="flex flex-col items-center gap-2"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /><span className="text-[10px] text-muted-foreground font-mono">w-6 h-6</span></div>
                  <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /><span className="text-[10px] text-muted-foreground font-mono">w-8 h-8</span></div>
                </div>
              </CidBlock>

              <CidBlock cid="loading-spinner-inline" name="Inline loading spinner" source="6 pages">
                <div className="flex items-center gap-6">
                  <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-3 h-3 animate-spin" /> Loading&hellip;</span>
                  <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving&hellip;</span>
                </div>
              </CidBlock>

              <CidBlock cid="pulse-dot" name="Pulse dot" source="ArticlePipeline, Pipeline">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs text-success"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" /> Active</span>
                  <span className="flex items-center gap-1.5 text-xs text-blue"><span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse shrink-0" /> Running</span>
                  <span className="flex items-center gap-1.5 text-xs text-orange"><span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse shrink-0" /> Queued</span>
                </div>
              </CidBlock>

              {/* ── SECTION 2: Navigation ── */}
              <SectionHeader id="navigation" label="Navigation" />

              <CidBlock cid="story-detail-top-bar" name="StoryDetailTopBar" source="StoryDetail.tsx">
                <div className="rounded-lg border border-border overflow-hidden">
                  <StoryDetailTopBar stageLabel="Scripting" activeStage="scripting" stages={MOCK_STAGES} nextStageKey="filming" nextStageLabel="Filming" onBack={NOOP} onMoveToNextStage={NOOP} onPass={NOOP} onRestart={NOOP} onOmit={NOOP} onHistoryClick={NOOP} onScoreHistoryClick={NOOP} prevNext={{ currentIndex: 2, total: 8, onPrev: NOOP, onNext: NOOP }} />
                </div>
              </CidBlock>

              <CidBlock cid="page-header-bar" name="Page header bar" source="9 pages">
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
                    <h1 className="text-sm font-semibold">Pipeline Monitor</h1>
                    <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground font-medium"><Search className="w-3 h-3" /> Search</button>
                  </div>
                  <div className="h-24 bg-background" />
                </div>
              </CidBlock>

              {/* ── SECTION 3: Data Display ── */}
              <SectionHeader id="data-display" label="Data Display" />

              <CidBlock cid="video-table" name="VideoTable" source="ChannelDetail.tsx">
                <div className="rounded-lg border border-border overflow-hidden"><VideoTable videos={MOCK_VIDEOS} /></div>
              </CidBlock>

              <CidBlock cid="video-right-panel" name="VideoRightPanel" source="VideoDetail.tsx">
                <div className="relative h-[360px] rounded-lg border border-border overflow-hidden">
                  <VideoRightPanel video={MOCK_VIDEOS[0]} visible={videoPanelOpen} onClose={() => setVideoPanelOpen(false)} pipeline={MOCK_PIPELINE} />
                  {!videoPanelOpen && <button onClick={() => setVideoPanelOpen(true)} className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Click to reopen panel</button>}
                </div>
              </CidBlock>

              <CidBlock cid="channel-right-panel" name="ChannelRightPanel" source="ChannelDetail.tsx">
                <div className="relative h-[480px] rounded-lg border border-border overflow-hidden">
                  <ChannelRightPanel channel={MOCK_CHANNEL} visible={channelPanelOpen} onClose={() => setChannelPanelOpen(false)} videoCount={720} shortCount={122} />
                  {!channelPanelOpen && <button onClick={() => setChannelPanelOpen(true)} className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Click to reopen panel</button>}
                </div>
              </CidBlock>

              <CidBlock cid="score-bar" name="ScoreBar" source="StoryDetail.tsx">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <ScoreBar label="Relevance" value={72} />
                  <ScoreBar label="Virality" value={85} />
                  <ScoreBar label="First Mover" value={41} />
                </div>
              </CidBlock>

              <CidBlock cid="stat-number-large" name="Stat number (text-2xl)" source="Analytics, Gallery, Pipeline, PublishQueue, Monitor">
                <div className="flex gap-6">
                  <div><div className="text-2xl font-semibold font-mono tracking-tight">1,247</div><div className="text-xs text-muted-foreground">Total videos</div></div>
                  <div><div className="text-2xl font-semibold font-mono tracking-tight text-success">+12%</div><div className="text-xs text-muted-foreground">Growth</div></div>
                  <div><div className="text-2xl font-semibold font-mono tracking-tight text-orange">38</div><div className="text-xs text-muted-foreground">Queued</div></div>
                </div>
              </CidBlock>

              <CidBlock cid="stat-number-medium" name="Stat number (text-xl)" source="ArticlePipeline, Monitor, Pipeline, ProfileHome, StoryDetail">
                <div className="flex gap-6">
                  <div><div className="text-xl font-semibold font-mono tracking-tight">342</div><div className="text-xs text-muted-foreground">Analyzed</div></div>
                  <div><div className="text-xl font-semibold font-mono tracking-tight text-blue">89</div><div className="text-xs text-muted-foreground">In progress</div></div>
                </div>
              </CidBlock>

              <CidBlock cid="stat-row" name="Stat row" source="Monitor, Pipeline">
                <div className="rounded-lg border border-border bg-card p-4 space-y-0">
                  {[{ label: "Channels tracked", value: "24" }, { label: "Videos analyzed", value: "1,842" }, { label: "Failed jobs", value: "3" }].map((s) => (
                    <div key={s.label} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className="text-sm font-semibold font-mono">{s.value}</span>
                    </div>
                  ))}
                </div>
              </CidBlock>

              {/* ── SECTION 4: Indicators & Status ── */}
              <SectionHeader id="indicators" label="Indicators & Status" />

              <CidBlock cid="status-badge-15" name="Status badge (bg-color/15)" source="10 pages">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-success/15 text-success border-success/20">Active</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue/15 text-blue border-blue/20">Analyzing</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-orange/15 text-orange border-orange/20">Queued</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-purple/15 text-purple border-purple/20">Enriched</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive border-destructive/20">Failed</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-dim/15 text-muted-foreground border-dim/20">Pending</span>
                </div>
              </CidBlock>

              <CidBlock cid="status-badge-10" name="Status badge (bg-color/10)" source="10 pages">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-success/10 text-success border-transparent">Connected</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive border-transparent">Error</span>
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border-transparent">Featured</span>
                </div>
              </CidBlock>

              <CidBlock cid="mono-status-pill" name="Mono status pill" source="StoryDetail.tsx">
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange/15 text-orange border border-orange/20">scripting</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue border border-blue/20">approved</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20">published</span>
                </div>
              </CidBlock>

              <CidBlock cid="stage-pill" name="Stage pill" source="Stories.tsx">
                <div className="flex flex-wrap gap-2">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-foreground">SCRIPTING</span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-blue/15 text-foreground">APPROVED</span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-foreground">PUBLISHED</span>
                </div>
              </CidBlock>

              <CidBlock cid="pipeline-step-icons" name="Pipeline step status icons" source="Pipeline, VideoDetail, VideoTable">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs"><CheckCircle2 className="w-4 h-4 text-success" /> Done</span>
                  <span className="flex items-center gap-1.5 text-xs"><XCircle className="w-4 h-4 text-destructive" /> Failed</span>
                  <span className="flex items-center gap-1.5 text-xs"><Clock className="w-4 h-4 text-muted-foreground" /> Pending</span>
                  <span className="flex items-center gap-1.5 text-xs"><Loader2 className="w-4 h-4 text-blue animate-spin" /> Analyzing</span>
                </div>
              </CidBlock>

              {/* ── SECTION 5: Actions ── */}
              <SectionHeader id="actions" label="Actions" />

              <CidBlock cid="copy-btn" name="CopyBtn" source="StoryDetail.tsx">
                <CopyBtn text="Sample text to copy" />
              </CidBlock>

              <CidBlock cid="delete-channel-modal" name="DeleteChannelModal" source="Competitions.tsx">
                <div>
                  <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium">Open DeleteChannelModal</button>
                  <DeleteChannelModal open={deleteOpen} channelName="MrBeast" onClose={() => setDeleteOpen(false)} onDelete={() => setDeleteOpen(false)} />
                </div>
              </CidBlock>

              <CidBlock cid="video-type-icon" name="VideoTypeIcon" source="VideoDetail.tsx, ChannelDetail.tsx">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-sm"><VideoTypeIcon type="video" /> Video</span>
                  <span className="flex items-center gap-1.5 text-sm"><VideoTypeIcon type="short" /> Short</span>
                </div>
              </CidBlock>

              <CidBlock cid="action-pill-button" name="Action pill button" source="5 pages">
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-foreground/10 text-foreground border border-foreground/20"><Play className="w-3 h-3" /> Analyze</button>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors"><Search className="w-3 h-3" /> Filter</button>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium"><XCircle className="w-3 h-3" /> Remove</button>
                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-[11px] font-medium"><CheckCircle2 className="w-3 h-3" /> Published</button>
                </div>
              </CidBlock>

              <CidBlock cid="filter-pill" name="Filter pill" source="7 pages">
                <div className="flex flex-wrap gap-2">
                  <button className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-foreground/10 text-foreground border border-foreground/20">All</button>
                  <button className="px-4 py-1.5 rounded-full text-[12px] font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/20 transition-colors">Active</button>
                  <button className="px-4 py-1.5 rounded-full text-[12px] font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/20 transition-colors">Archived</button>
                </div>
              </CidBlock>

              {/* ── SECTION 6: Story Workflow ── */}
              <SectionHeader id="story-workflow" label="Story Workflow" />

              <CidBlock cid="story-channel-selector" name="StoryDetailChannelSelector" source="StoryDetail.tsx">
                <StoryDetailChannelSelector channels={MOCK_API_CHANNELS} selectedId="c1" open={channelSelectorOpen} onToggleOpen={() => setChannelSelectorOpen((v) => !v)} onSelect={() => setChannelSelectorOpen(false)} />
              </CidBlock>

              <CidBlock cid="story-stage-omit" name="StoryDetailStageOmit" source="StoryDetail.tsx">
                <StoryDetailStageOmit onMoveBack={NOOP} />
              </CidBlock>

              <CidBlock cid="story-stage-passed" name="StoryDetailStagePassed" source="StoryDetail.tsx">
                <StoryDetailStagePassed onMoveBack={NOOP} />
              </CidBlock>

              <CidBlock cid="story-stage-publish" name="StoryDetailStagePublish" source="StoryDetail.tsx">
                <StoryDetailStagePublish brief={brief} storyId="dls-mock-story" onBriefChange={setBrief} />
              </CidBlock>

              <CidBlock cid="story-article" name="StoryDetailArticle" source="StoryDetail.tsx">
                <StoryDetailArticle storyId="dls-mock-story" sourceUrl="https://example.com/article" sourceName="NewsAPI/TechCrunch" articleContent={MOCK_BRIEF.articleContent} articleDisplayValue={MOCK_BRIEF.articleContent || ""} articleTitle={MOCK_BRIEF.articleTitle} articleLoading={false} articleError={null} actionsDisabled={false} scores={{ relevance: 72, viral: 85, firstMover: 41, total: 66 }} relativeDate="2 hours ago" articleOpen={true} onArticleOpenChange={NOOP} onCleanup={NOOP_ASYNC} onRefetch={NOOP_ASYNC} onRetryFetch={NOOP_ASYNC} onArticleChange={NOOP} onArticleTitleChange={NOOP} onArticleTitleBlur={NOOP} />
              </CidBlock>

              <CidBlock cid="transcript-section" name="TranscriptSection" source="StoryDetail.tsx">
                <TranscriptSection storyId="dls-mock-story" brief={brief} onBriefChange={setBrief} />
              </CidBlock>

              <CidBlock cid="story-script-section" name="StoryDetailScriptSection" source="StoryDetail.tsx">
                <StoryDetailScriptSection channels={MOCK_API_CHANNELS} selectedChannelId="c1" onChannelSelect={NOOP} scriptDuration={8} onScriptDurationChange={NOOP} canGenerate={true} generating={false} onGenerate={NOOP_ASYNC} readOnly={false} showGenerateControls={true} videoFormat="long" onVideoFormatChange={NOOP} />
              </CidBlock>

              <CidBlock cid="script-editor-tiptap" name="ScriptEditorTiptap" source="StoryDetail.tsx">
                <div className="rounded-lg border border-border overflow-hidden max-h-[300px] overflow-y-auto">
                  <ScriptEditorTiptap readOnly={false} editorRef={editorRef} />
                </div>
              </CidBlock>

              {/* ── SECTION 7: Media ── */}
              <SectionHeader id="media" label="Media" />

              <CidBlock cid="media-grid" name="MediaGrid" source="AlbumDetail.tsx">
                <div className="rounded-lg border border-border overflow-hidden p-2">
                  <MediaGrid items={MOCK_GALLERY_MEDIA} selectedIds={[]} selectionMode={false} onToggleSelect={NOOP} onOpen={(i) => { setViewerIndex(i); setViewerOpen(true); }} />
                </div>
              </CidBlock>

              <CidBlock cid="media-viewer" name="MediaViewer" source="Gallery.tsx, AlbumDetail.tsx">
                <div>
                  <button onClick={() => setViewerOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground font-medium">Open MediaViewer</button>
                  <MediaViewer open={viewerOpen} items={MOCK_GALLERY_MEDIA} index={viewerIndex} onOpenChange={setViewerOpen} onIndexChange={setViewerIndex} onDownload={NOOP} />
                </div>
              </CidBlock>

              <CidBlock cid="album-card" name="AlbumCard" source="Gallery.tsx">
                <div className="w-56"><AlbumCard album={MOCK_ALBUM} /></div>
              </CidBlock>

              <CidBlock cid="upload-zone" name="UploadZone" source="Gallery.tsx, AlbumDetail.tsx">
                <UploadZone channelId={channelId || "dls"} />
              </CidBlock>

              <CidBlock cid="video-upload" name="VideoUpload" source="StoryDetail.tsx">
                <VideoUpload storyId={undefined} readOnly={false} headline="Upload video" />
              </CidBlock>

              <CidBlock cid="upload-indicator" name="UploadIndicator" source="App.tsx (renders null when idle)">
                <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground font-mono">
                  <UploadIndicator />
                  <span className="text-muted-foreground">Renders in bottom-right when uploads are active. Currently idle.</span>
                </div>
              </CidBlock>

              <CidBlock cid="gallery-upload-indicator" name="GalleryUploadIndicator" source="App.tsx (renders null when idle)">
                <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground font-mono">
                  <GalleryUploadIndicator />
                  <span className="text-muted-foreground">Renders in bottom-left when gallery uploads are active. Currently idle.</span>
                </div>
              </CidBlock>

              {/* ── SECTION 8: Layout ── */}
              <SectionHeader id="layout" label="Layout" />

              <CidBlock cid="app-sidebar" name="AppSidebar" source="AppLayout.tsx">
                <div className="rounded-lg border border-border overflow-hidden h-[400px] w-56">
                  <AppSidebar channelId={channelId || "dls"} collapsed={false} />
                </div>
              </CidBlock>
            </>
          )}

          {/* ================================================================
              TAB 2: FOUNDATION
              ================================================================ */}
          {tab === "foundation" && (
            <>
              <SectionHeader id="colors" label="Color Tokens" />
              <div id="cid-color-tokens" data-cid="color-tokens" className="mb-8">
                {COLOR_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-6 mb-3 first:mt-0">{group.label}</div>
                    <div className="grid grid-cols-4 gap-3">
                      {group.tokens.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 cursor-pointer group" onClick={() => copyCid(t.id)}>
                          <div className="w-10 h-10 rounded-lg border border-border shrink-0" style={{ background: t.hsl }} />
                          <div>
                            <div className="font-mono text-[11px] text-foreground group-hover:text-primary transition-colors">{t.id}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{t.hsl}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <SectionHeader id="radius" label="Radius Scale" />
              <div id="cid-radius-scale" data-cid="radius-scale" className="mb-8">
                <div className="flex items-end gap-4">
                  {RADIUS_TOKENS.map((r) => (
                    <div key={r.id} className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => copyCid(r.id)}>
                      <div className="w-12 h-12 bg-primary" style={{ borderRadius: r.rem }} />
                      <span className="font-mono text-[10px] text-foreground">{r.id}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">{r.px} &middot; {r.tw}</span>
                    </div>
                  ))}
                </div>
              </div>

              <SectionHeader id="typography" label="Typography Scale" />
              <div id="cid-typography-scale" data-cid="typography-scale" className="mb-8">
                <div className="space-y-3">
                  {TYPO_TOKENS.map((t) => (
                    <div key={t.id} className="flex items-baseline gap-4 cursor-pointer group" onClick={() => copyCid(t.id)}>
                      <span className="w-28 shrink-0 font-mono text-[10px] text-muted-foreground">{t.id} &middot; {t.px}</span>
                      <span style={{ fontSize: t.rem }} className="group-hover:text-primary transition-colors">The quick brown fox jumps over the lazy dog</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
