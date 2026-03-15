import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import {
  Copy, Check, ExternalLink, Trophy, Eye, ThumbsUp, MessageSquare,
  Link2, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Sparkles, Pencil,
  RefreshCw, Loader2, Ban,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import type { ApiStory, Stage } from "./Stories";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiChannel {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  handle: string;
  avatarUrl: string | null;
  type: string;
}

interface StoryWithLog extends ApiStory {
  log: {
    id: string;
    action: string;
    note: string | null;
    createdAt: string;
    user: { name: string | null; avatarUrl: string | null } | null;
  }[];
}

// Brief JSON shape stored in DB
interface StoryBrief {
  suggestedTitle?: string;
  summary?: string;
  articleContent?: string; // full article text fetched from sourceUrl
  openingHook?: string;
  hookStart?: string;
  hookEnd?: string;
  script?: string;
  scriptFormat?: "short" | "long";
  channelId?: string;
  youtubeUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  gapWin?: boolean;
  producedFormats?: ("short" | "long")[];
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "suggestion", label: "AI Suggestion" },
  { key: "liked",      label: "Liked" },
  { key: "approved",   label: "Approved" },
  { key: "filmed",     label: "Filmed" },
  { key: "publish",    label: "Publish" },
  { key: "done",       label: "Done" },
  { key: "passed",     label: "Passed" },
  { key: "omit",       label: "Omitted" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    label === "Relevance" ? "bg-purple" : label === "Virality" ? "bg-blue" : "bg-success";
  return (
    <div className="flex-1 px-5 py-4 bg-background border-r border-background last:border-r-0">
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight mt-1">{value}</div>
      <div className="h-1 bg-elevated rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function chName(ch: ApiChannel) {
  return ch.nameAr || ch.nameEn || ch.handle;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StoryDetail() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const projectPath = useProjectPath();

  // ── Server state ──────────────────────────────────────────────────────────
  const [story, setStory] = useState<StoryWithLog | null>(null);
  const [ourChannels, setOurChannels] = useState<ApiChannel[]>([]);
  const [likedStories, setLikedStories] = useState<ApiStory[]>([]);
  const [stageStories, setStageStories] = useState<ApiStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [fetchingArticle, setFetchingArticle] = useState(false);
  const [cleanupSuccess, setCleanupSuccess] = useState(false);
  const [typingTarget, setTypingTarget] = useState<string | null>(null);
  const [typedLength, setTypedLength] = useState(0);

  // ── UI state (synced with brief JSON) ────────────────────────────────────
  const [brief, setBrief] = useState<StoryBrief>({});
  const [youtubeInput, setYoutubeInput] = useState("");
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingYoutubeUrl, setEditingYoutubeUrl] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  // ── Fetch story + channels + liked peers ─────────────────────────────────
  const loadStory = useCallback(async () => {
    if (!id || !projectId) return;
    try {
      const [storyRes, channelsRes, likedRes] = await Promise.all([
        fetch(`/api/stories/${id}`, { credentials: "include" }),
        fetch(`/api/channels?projectId=${projectId}&type=ours`, { credentials: "include" }),
        fetch(`/api/stories?projectId=${projectId}&stage=liked`, { credentials: "include" }),
      ]);

      if (storyRes.ok) {
        const s: StoryWithLog = await storyRes.json();
        setStory(s);
        const b: StoryBrief = (s.brief as StoryBrief) || {};
        setBrief(b);
        setArticleError(null);
        setArticleLoading(false);
        if (b.youtubeUrl) setYoutubeInput(b.youtubeUrl);
        // Fetch all stories for prev/next navigation (one list order: score desc, then date desc)
        const listRes = await fetch(`/api/stories?projectId=${projectId}`, { credentials: "include" });
        if (listRes.ok) {
          const list: ApiStory[] = await listRes.json();
          const sorted = [...list].sort((a, b) => {
            const scoreA = a.compositeScore ?? 0;
            const scoreB = b.compositeScore ?? 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          setStageStories(sorted);
        } else {
          setStageStories([]);
        }
      }
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        const list: ApiChannel[] = Array.isArray(data) ? data : (data.channels ?? []);
        setOurChannels(list.filter((c: ApiChannel) => c.type === "ours"));
      }
      if (likedRes.ok) {
        setLikedStories(await likedRes.json());
      }
    } catch {
      toast.error("Failed to load story");
    } finally {
      setLoading(false);
    }
  }, [id, projectId]);

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  // ── Fetch full article from sourceUrl when we have URL but no articleContent ─
  useEffect(() => {
    if (!id || !story?.sourceUrl || articleLoading) return;
    if (brief.articleContent && brief.articleContent !== '__SCRAPE_FAILED__' && brief.articleContent !== '__YOUTUBE__') return;
    setArticleError(null);
    setArticleLoading(true);
    fetch(`/api/stories/${id}/fetch-article`, { method: "POST", credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.articleContent) {
          setBrief((b) => ({ ...b, articleContent: data.articleContent }));
        } else {
          setArticleError(data.error || "Could not load article");
        }
      })
      .catch(() => setArticleError("Could not load article"))
      .finally(() => setArticleLoading(false));
  }, [id, story?.sourceUrl, brief.articleContent, articleLoading]);

  // ── Typing effect after cleanup ───────────────────────────────────────────
  useEffect(() => {
    if (typingTarget == null) return;
    const charsPerTick = 3;
    const intervalMs = 12;
    const len = typingTarget.length;
    const t = setInterval(() => {
      setTypedLength((n) => {
        const next = Math.min(n + charsPerTick, len);
        if (next >= len) {
          clearInterval(t);
          setTypingTarget(null);
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [typingTarget]);

  // ── Persist helpers ───────────────────────────────────────────────────────

  /** PATCH story with arbitrary fields, returns updated story */
  const patchStory = useCallback(
    async (fields: Record<string, unknown>): Promise<StoryWithLog | null> => {
      if (!id) return null;
      setSaving(true);
      try {
        const r = await fetch(`/api/stories/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!r.ok) throw new Error(await r.text());
        const updated: StoryWithLog = await r.json();
        setStory(updated);
        return updated;
      } catch {
        toast.error("Failed to save");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  /** Persist brief JSON to DB */
  const saveBrief = useCallback(
    async (newBrief: StoryBrief) => {
      setBrief(newBrief);
      await patchStory({ brief: newBrief });
    },
    [patchStory]
  );

  /** Move to a new stage — persists and updates local state */
  const moveStage = useCallback(
    async (to: Stage) => {
      const updated = await patchStory({ stage: to });
      if (updated) {
        toast.success(`Moved to ${STAGES.find((s) => s.key === to)?.label}`);
        // Refresh full list so prev/next order is up to date
        if (projectId) {
          const listRes = await fetch(`/api/stories?projectId=${projectId}`, { credentials: "include" });
          if (listRes.ok) {
            const list: ApiStory[] = await listRes.json();
            const sorted = [...list].sort((a, b) => {
              const scoreA = a.compositeScore ?? 0;
              const scoreB = b.compositeScore ?? 0;
              if (scoreB !== scoreA) return scoreB - scoreA;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            setStageStories(sorted);
          }
        }
      }
    },
    [patchStory, projectId]
  );

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <button
            onClick={() => navigate(projectPath("/stories"))}
            className="link flex items-center gap-2 text-[13px]"
          >
            <ArrowLeft className="w-4 h-4" />
            AI Intelligence
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <button
            onClick={() => navigate(projectPath("/stories"))}
            className="link flex items-center gap-2 text-[13px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Stories
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] text-dim font-mono">Story not found</span>
        </div>
      </div>
    );
  }

  const activeStage = story.stage;
  const isFirst = story.coverageStatus === "first";
  const isLate = story.coverageStatus === "late";
  const scriptFormat = brief.scriptFormat ?? "short";
  const selectedChannel = brief.channelId ?? "";
  const assignedChannel = ourChannels.find((c) => c.id === selectedChannel) ?? null;
  const scriptSaved = !!(brief.script !== undefined && brief.script !== null);

  // Sorted liked peers by composite score desc
  const likedSorted = [...likedStories].sort(
    (a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
  );

  // Prev/next in current stage
  const stageIndex = id ? stageStories.findIndex((s) => s.id === id) : -1;
  const prevStory = stageIndex > 0 ? stageStories[stageIndex - 1] : null;
  const nextStory = stageIndex >= 0 && stageIndex < stageStories.length - 1 ? stageStories[stageIndex + 1] : null;
  const showStageNav = stageStories.length > 1 && stageIndex >= 0;

  const fmt = (n?: number) =>
    !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

  // ── Script fields ─────────────────────────────────────────────────────────

  const SCRIPT_FIELDS: {
    key: keyof StoryBrief;
    label: string;
    placeholder: string;
    type: "input" | "textarea";
  }[] = [
    {
      key: "suggestedTitle",
      label: "Suggested Title",
      placeholder: scriptFormat === "short" ? "عنوان الشورت المقترح..." : "عنوان الفيديو المقترح...",
      type: "input",
    },
    {
      key: "openingHook",
      label: "Opening Hook (first 10 sec)",
      placeholder: "الجملة الأولى التي تجذب المشاهد...",
      type: "input",
    },
    {
      key: "hookStart",
      label: "Branded Hook Start",
      placeholder: "e.g. أهلاً وسهلاً بكم في قناة...",
      type: "input",
    },
    {
      key: "script",
      label: "Script — with timestamps",
      placeholder: scriptFormat === "short" ? "00:00 هوك\n00:15 المحتوى..." : "00:00 مقدمة\n01:30 القصة تبدأ...",
      type: "textarea",
    },
    {
      key: "hookEnd",
      label: "Branded Hook End",
      placeholder: "e.g. لا تنسوا الاشتراك وتفعيل الجرس...",
      type: "input",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(projectPath("/stories"))}
            className="link flex items-center gap-2 text-[13px]"
          >
            <ArrowLeft className="w-4 h-4" />
            AI Intelligence
          </button>
          <span className="text-[11px] text-dim font-mono">/</span>
          <span className="text-[13px] font-medium truncate max-w-[400px]">{story.headline}</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-dim" />}
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/15 text-primary">
            {STAGES.find((s) => s.key === activeStage)?.label}
          </span>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div className="max-w-[900px] mx-auto px-6 max-lg:px-4 py-6">
          <div className="rounded-xl bg-background border border-border overflow-hidden">
            {/* Top of box: Clean up with AI + Re-fetch article (left) + Omit (right) */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!id || cleaningUp) return;
                    setCleanupSuccess(false);
                    setCleaningUp(true);
                    try {
                      const r = await fetch(`/api/stories/${id}/cleanup`, { method: "POST", credentials: "include" });
                      const data = await r.json().catch(() => ({}));
                      if (r.ok && data.id) {
                        setStory((s) => (s ? { ...s, headline: data.headline, brief: data.brief ?? s.brief } : s));
                        setBrief((data.brief && typeof data.brief === "object") ? data.brief : {});
                        setCleanupSuccess(true);
                        toast.success("Article cleaned");
                        setTimeout(() => setCleanupSuccess(false), 2500);
                        const content = (data.brief && typeof data.brief === "object" && typeof data.brief.articleContent === "string") ? data.brief.articleContent : "";
                        if (content) {
                          setTypingTarget(content);
                          setTypedLength(0);
                        }
                      } else {
                        toast.error(data.error || "Cleanup failed");
                      }
                    } catch {
                      toast.error("Cleanup failed");
                    } finally {
                      setCleaningUp(false);
                    }
                  }}
                  disabled={cleaningUp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:cursor-not-allowed"
                  title="Remove website junk from article and format as clean Arabic markdown"
                >
                  {cleaningUp ? (
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 shrink-0" />
                  )}
                  <span className={cleaningUp ? "text-shimmer inline-block" : ""}>Clean up with AI</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!id || !story?.sourceUrl || fetchingArticle) return;
                    setArticleError(null);
                    setFetchingArticle(true);
                    try {
                      const r = await fetch(`/api/stories/${id}/fetch-article`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ force: true }),
                      });
                      const data = await r.json().catch(() => ({}));
                      if (r.ok && data.articleContent !== undefined) {
                        setBrief((b) => ({ ...b, articleContent: data.articleContent }));
                        setStory((s) => (s && s.brief ? { ...s, brief: { ...s.brief, articleContent: data.articleContent } } : s));
                        toast.success(data.articleContent === "__SCRAPE_FAILED__" ? "Source could not be scraped" : "Article re-fetched");
                      } else {
                        toast.error(data.error || "Could not fetch article");
                      }
                    } catch {
                      toast.error("Could not fetch article");
                    } finally {
                      setFetchingArticle(false);
                    }
                  }}
                  disabled={!story?.sourceUrl || fetchingArticle}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  title="Re-fetch article from source (use if something went wrong)"
                >
                  {fetchingArticle ? (
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 shrink-0" />
                  )}
                  Re-fetch article
                </button>
              </div>
              {activeStage === "suggestion" && (
                <button
                  type="button"
                  onClick={async () => {
                    const updated = await patchStory({ stage: "omit" });
                    if (updated) {
                      setStory(updated);
                      toast.success("Omitted — insufficient data");
                    } else {
                      toast.error("Failed to omit story");
                    }
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0"
                  title="Omit (insufficient data to produce)"
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* In-box: cleanup done */}
            {cleanupSuccess && !cleaningUp && (
              <div className="flex items-center justify-center gap-2 px-5 py-3 bg-success/10 border-b border-success/20">
                <Check className="w-4 h-4 text-success" />
                <span className="text-[12px] font-medium text-success">Article cleaned. Full article updated.</span>
              </div>
            )}

            <div className={`px-5 py-6 space-y-6 ${cleaningUp ? "opacity-60 pointer-events-none" : ""}`}>
          {/* Prev/next in current stage */}
          {showStageNav && (
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => prevStory && navigate(projectPath(`/story/${prevStory.id}`))}
                disabled={!prevStory}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-[13px] font-medium text-dim hover:text-sensor hover:border-sensor/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                title={prevStory ? `Previous: ${prevStory.headline.slice(0, 40)}…` : "No previous"}
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-[11px] font-mono text-dim">
                {stageIndex + 1} / {stageStories.length}
              </span>
              <button
                type="button"
                onClick={() => nextStory && navigate(projectPath(`/story/${nextStory.id}`))}
                disabled={!nextStory}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-[13px] font-medium text-dim hover:text-sensor hover:border-sensor/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                title={nextStory ? `Next: ${nextStory.headline.slice(0, 40)}…` : "No next"}
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-right leading-relaxed">{story.headline}</h1>
            <div className="text-[11px] text-dim font-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {[story.sourceName, story.sourceDate?.split("T")[0]].filter(Boolean).join(" · ")}
              {story.sourceUrl && (
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Read source
                </a>
              )}
            </div>
          </div>

          {/* Full article from source (read-only) — fetched from sourceUrl when available */}
          <div className="rounded-xl bg-background p-5">
            <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
              Full article
            </div>
            {story?.brief?.articleContent === '__YOUTUBE__' ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-3">المصدر مقطع فيديو على يوتيوب</p>
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  مشاهدة الفيديو على يوتيوب
                </a>
              </div>
            ) : !articleLoading && (!brief.articleContent || brief.articleContent === '__SCRAPE_FAILED__') ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-3">تعذّر تحميل نص المقال من هذا المصدر</p>
                <a
                  href={story?.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  اقرأ المقال من المصدر الأصلي
                </a>
              </div>
            ) : brief.articleContent?.trim() ? (
              <div className="max-h-[60vh] overflow-y-auto px-4 select-text" dir="rtl">
                {typingTarget != null ? (
                  <>
                    <ReactMarkdown className="prose prose-invert max-w-none text-right text-[13px] leading-relaxed text-foreground">
                      {typingTarget.slice(0, typedLength)}
                    </ReactMarkdown>
                    {typedLength < typingTarget.length && (
                      <span className="inline-block w-0.5 h-4 align-middle bg-sensor animate-pulse ml-0.5" aria-hidden />
                    )}
                  </>
                ) : (
                  <ReactMarkdown className="prose prose-invert max-w-none text-right text-[13px] leading-relaxed text-foreground">
                    {brief.articleContent}
                  </ReactMarkdown>
                )}
              </div>
            ) : articleLoading ? (
              <p className="text-[12px] text-dim text-right">Loading article…</p>
            ) : articleError ? (
              <p className="text-[12px] text-dim text-right">
                {articleError}. Use “Read source” below to open the original article.
              </p>
            ) : !story?.sourceUrl ? (
              <p className="text-[12px] text-dim text-right">
                No source URL for this story. The full article can be shown when a source link is available.
              </p>
            ) : (
              <p className="text-[12px] text-dim text-right">Loading article…</p>
            )}
          </div>

          {/* Scores row */}
          <div className="flex rounded-xl overflow-hidden">
            <ScoreBar label="Relevance"   value={story.relevanceScore ?? 0} />
            <ScoreBar label="Virality"    value={story.viralScore ?? 0} />
            <ScoreBar label="First Mover" value={story.firstMoverScore ?? 0} />
            <div className="px-5 py-4 bg-background min-w-[120px]">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Total</div>
              <div className="text-2xl font-semibold font-mono tracking-tight mt-1">
                {story.compositeScore ?? 0}
              </div>
            </div>
          </div>

          {/* AI Analysis (from brief) */}
          {brief.suggestedTitle && (
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
                  AI Analysis
                </div>
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
              </div>
              <p className="text-[13px] text-sensor leading-relaxed text-right">
                {brief.suggestedTitle}
              </p>
            </div>
          )}

          {/* Stage-specific content */}
          <div className="space-y-5">

            {/* ── SUGGESTION ────────────────────────────────────────────── */}
            {activeStage === "suggestion" && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => moveStage("liked")}
                  className="flex-1 min-w-[120px] px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                >
                  Save to Liked
                </button>
                <button
                  onClick={async () => {
                    const updated = await patchStory({ stage: "passed" });
                    if (updated) {
                      toast.success("Passed");
                      navigate(projectPath("/stories"));
                    } else {
                      toast.error("Failed to pass story");
                    }
                  }}
                  className="link flex-1 min-w-[100px] px-4 py-2.5 text-[13px] font-medium rounded-full border border-border"
                >
                  Pass
                </button>
              </div>
            )}

            {/* ── PASSED ──────────────────────────────────────────────────── */}
            {activeStage === "passed" && (
              <div className="rounded-xl bg-background p-5">
                <p className="text-[13px] text-dim mb-4">You passed on this story. It won’t appear in your active pipeline.</p>
                <button
                  onClick={() => moveStage("suggestion")}
                  className="link px-4 py-2.5 text-[13px] font-medium rounded-full border border-border"
                >
                  Move back to AI Suggestion
                </button>
              </div>
            )}

            {/* ── OMIT (insufficient data) ───────────────────────────────────── */}
            {activeStage === "omit" && (
              <div className="rounded-xl bg-background p-5">
                <p className="text-[13px] text-dim mb-4">Not enough data to produce this video. Omitted from pipeline.</p>
                <button
                  onClick={() => moveStage("suggestion")}
                  className="link px-4 py-2.5 text-[13px] font-medium rounded-full border border-border"
                >
                  Move back to AI Suggestion
                </button>
              </div>
            )}

            {/* ── LIKED ─────────────────────────────────────────────────── */}
            {activeStage === "liked" && (
              <>
                {/* Ranking among liked peers */}
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
                    Ranking
                  </div>
                  <div className="text-[13px] font-semibold mb-3">
                    Ranked #{likedSorted.findIndex((s) => s.id === id) + 1} of{" "}
                    {likedSorted.length} liked — Score {story.compositeScore ?? 0}
                  </div>
                  <div className="space-y-1">
                    {likedSorted.map((s, i) => {
                      const isCurrent = s.id === id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (!isCurrent) navigate(projectPath(`/story/${s.id}`));
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] transition-colors group ${
                            isCurrent
                              ? "bg-[#0d0d10] text-foreground cursor-default"
                              : "text-dim hover:bg-[#0d0d10] cursor-pointer"
                          }`}
                        >
                          <span className="font-mono w-5">#{i + 1}</span>
                          {s.coverageStatus === "first" && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
                              1st
                            </span>
                          )}
                          {s.coverageStatus === "late" && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">
                              Late
                            </span>
                          )}
                          <span className="flex-1 truncate text-right transition-colors group-hover:text-foreground">
                            {s.headline}
                          </span>
                          <span className="font-mono font-medium">{s.compositeScore ?? 0}</span>
                          {!isCurrent && (
                            <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Channel selector */}
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
                    Assign to Channel
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setChannelDropOpen(!channelDropOpen)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-surface border border-border rounded-full text-[13px] font-medium focus:outline-none focus:border-primary/40"
                    >
                      {assignedChannel ? (
                        <>
                          {assignedChannel.avatarUrl ? (
                            <img
                              src={assignedChannel.avatarUrl}
                              alt={chName(assignedChannel)}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-elevated shrink-0 flex items-center justify-center text-[9px] font-mono text-dim uppercase">
                              {chName(assignedChannel).slice(0, 2)}
                            </div>
                          )}
                          <span className="flex-1 text-right">{chName(assignedChannel)}</span>
                        </>
                      ) : (
                        <span className="flex-1 text-right text-dim">
                          Select one of your channels…
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-dim shrink-0 transition-transform ${channelDropOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {channelDropOpen && (
                      <div className="absolute z-10 mt-1.5 w-full rounded-xl bg-elevated border border-border overflow-hidden shadow-lg">
                        {ourChannels.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              saveBrief({ ...brief, channelId: c.id });
                              setChannelDropOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-surface ${
                              selectedChannel === c.id ? "bg-blue/10" : ""
                            }`}
                          >
                            {c.avatarUrl ? (
                              <img
                                src={c.avatarUrl}
                                alt={chName(c)}
                                className="w-6 h-6 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-elevated shrink-0 flex items-center justify-center text-[9px] font-mono text-dim uppercase">
                                {chName(c).slice(0, 2)}
                              </div>
                            )}
                            <span className="flex-1 text-right font-medium">{chName(c)}</span>
                            {selectedChannel === c.id && (
                              <Check className="w-3.5 h-3.5 text-blue shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Script box */}
                <ScriptBox
                  brief={brief}
                  scriptSaved={scriptSaved}
                  scriptOpen={scriptOpen}
                  setScriptOpen={setScriptOpen}
                  editingField={editingField}
                  setEditingField={setEditingField}
                  onSave={async (newBrief) => {
                    await saveBrief({ ...newBrief, script: newBrief.script ?? "" });
                    toast.success("Script saved");
                  }}
                  onFieldDone={(key) => { setEditingField(null); saveBrief({ ...brief }); }}
                  onBriefChange={(key, val) => setBrief((b) => ({ ...b, [key]: val }))}
                  scriptFields={SCRIPT_FIELDS}
                />

                {/* Approve / Pass */}
                {(() => {
                  const hasContent = !!(
                    brief.script?.trim() || brief.suggestedTitle?.trim() || brief.openingHook?.trim()
                  );
                  const canApprove = !!selectedChannel && hasContent;
                  return (
                    <div className="flex gap-2">
                      <button
                        disabled={!canApprove}
                        onClick={async () => {
                          await patchStory({ stage: "approved", brief });
                          toast.success("Moved to Approved");
                        }}
                        className={`flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-full transition-opacity ${
                          canApprove
                            ? "bg-blue text-blue-foreground hover:opacity-90"
                            : "bg-blue/30 text-blue-foreground/40 cursor-not-allowed"
                        }`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moveStage("suggestion")}
                        className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors"
                      >
                        Pass
                      </button>
                    </div>
                  );
                })()}
              </>
            )}

            {/* ── APPROVED / FILMED / PUBLISH ───────────────────────────── */}
            {(activeStage === "approved" || activeStage === "filmed" || activeStage === "publish") && (
              <>
                {/* Assigned channel */}
                {assignedChannel && (
                  <div className="rounded-xl bg-background p-5 flex items-center gap-3">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
                      Channel
                    </div>
                    <button
                      onClick={() => navigate(projectPath(`/channel/${assignedChannel.id}`))}
                      className="group relative flex items-center gap-2"
                    >
                      {assignedChannel.avatarUrl ? (
                        <img
                          src={assignedChannel.avatarUrl}
                          alt={chName(assignedChannel)}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                          {chName(assignedChannel).slice(0, 2)}
                        </div>
                      )}
                      <span className="absolute left-10 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-elevated text-[12px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {chName(assignedChannel)}
                      </span>
                    </button>
                  </div>
                )}

                {/* Script box — saved state */}
                <ScriptBoxSaved
                  brief={brief}
                  scriptOpen={scriptOpen}
                  setScriptOpen={setScriptOpen}
                  editingField={editingField}
                  setEditingField={setEditingField}
                  onFieldDone={(key) => {
                    setEditingField(null);
                    saveBrief({ ...brief });
                    toast.success("Field updated");
                  }}
                  onBriefChange={(key, val) => setBrief((b) => ({ ...b, [key]: val }))}
                  scriptFields={SCRIPT_FIELDS}
                />

                {activeStage === "approved" && (
                  <button
                    onClick={() => moveStage("filmed")}
                    className="w-full px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                  >
                    + Mark as Filmed
                  </button>
                )}

                {activeStage === "filmed" && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">
                      {scriptFormat === "short" ? "Add YouTube Short URL" : "Add YouTube Video URL"}
                    </div>
                    <p className="text-[12px] text-dim leading-relaxed mb-4">
                      Paste the published{" "}
                      {scriptFormat === "short" ? "short" : "video"} URL to record performance and
                      check Brain coverage.
                    </p>
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                        <input
                          type="url"
                          value={youtubeInput}
                          onChange={(e) => setYoutubeInput(e.target.value)}
                          placeholder={
                            scriptFormat === "short"
                              ? "https://youtube.com/shorts/..."
                              : "https://youtube.com/watch?v=..."
                          }
                          className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-surface border border-border rounded-full text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!youtubeInput.trim()) {
                            toast.error("Please paste a YouTube URL");
                            return;
                          }
                          const produced = brief.producedFormats ?? [];
                          const newFmt: "short" | "long" = scriptFormat === "short" ? "short" : "long";
                          const newProduced = produced.includes(newFmt)
                            ? produced
                            : [...produced, newFmt];
                          await patchStory({
                            stage: "done",
                            brief: {
                              ...brief,
                              youtubeUrl: youtubeInput.trim(),
                              producedFormats: newProduced,
                            },
                          });
                          setYoutubeInput("");
                          toast.success("Moved to Done");
                        }}
                        className="px-5 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}

                {activeStage === "publish" && (
                  <div className="rounded-xl bg-background p-5">
                    <p className="text-[12px] text-dim font-mono mb-4">
                      Final details to confirm before marking done.
                    </p>
                    <button
                      onClick={() => moveStage("done")}
                      className="w-full px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                    >
                      Mark as Done
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── DONE ──────────────────────────────────────────────────── */}
            {activeStage === "done" && (
              <>
                {brief.gapWin && (
                  <div className="rounded-xl bg-success/10 border border-success/20 px-5 py-4 flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-success shrink-0" />
                    <div>
                      <div className="text-[14px] font-semibold text-success">Gap Win</div>
                      <div className="text-[12px] text-success/80">
                        You were first and the audience responded!
                      </div>
                    </div>
                  </div>
                )}

                {/* Produced formats */}
                {brief.producedFormats && brief.producedFormats.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
                      Produced
                    </span>
                    {brief.producedFormats.map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue"
                      >
                        {f === "short" ? "Short" : "Long Video"}
                      </span>
                    ))}
                  </div>
                )}

                {/* Video performance */}
                <div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
                    Video Performance
                  </div>
                  <div className="flex rounded-xl overflow-hidden">
                    {[
                      { icon: Eye,            val: brief.views,    label: "Views" },
                      { icon: ThumbsUp,       val: brief.likes,    label: "Likes" },
                      { icon: MessageSquare,  val: brief.comments, label: "Comments" },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="flex-1 px-4 py-3 bg-background border-r border-background last:border-r-0"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <m.icon className="w-3.5 h-3.5 text-dim" />
                          <span className="text-[10px] text-dim font-mono uppercase">
                            {m.label}
                          </span>
                        </div>
                        <div className="text-xl font-semibold font-mono tracking-tight">
                          {fmt(m.val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Original scores */}
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
                  Original Scores
                </div>
                <div className="flex rounded-xl overflow-hidden">
                  <ScoreBar label="Relevance"   value={story.relevanceScore ?? 0} />
                  <ScoreBar label="Virality"    value={story.viralScore ?? 0} />
                  <ScoreBar label="First Mover" value={story.firstMoverScore ?? 0} />
                </div>

                {/* YouTube URL */}
                {brief.youtubeUrl && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        {scriptFormat === "short" ? "YouTube Short URL" : "YouTube Video URL"}
                      </label>
                      <div className="flex items-center gap-2">
                        {!editingYoutubeUrl && (
                          <>
                            <a
                              href={brief.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-blue hover:opacity-80 transition-opacity"
                            >
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                            <button
                              onClick={() => {
                                setYoutubeInput(brief.youtubeUrl ?? "");
                                setEditingYoutubeUrl(true);
                              }}
                              className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        {editingYoutubeUrl && (
                          <button
                            onClick={async () => {
                              if (!youtubeInput.trim()) {
                                toast.error("URL cannot be empty");
                                return;
                              }
                              await saveBrief({ ...brief, youtubeUrl: youtubeInput.trim() });
                              setEditingYoutubeUrl(false);
                              toast.success("URL updated");
                            }}
                            className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                    {editingYoutubeUrl ? (
                      <input
                        type="url"
                        value={youtubeInput}
                        onChange={(e) => setYoutubeInput(e.target.value)}
                        className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                      />
                    ) : (
                      <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] font-mono text-sensor truncate">
                        {brief.youtubeUrl}
                      </div>
                    )}
                  </div>
                )}

                {/* Produce Another Format */}
                {(() => {
                  const produced = brief.producedFormats ?? [];
                  const canShort = !produced.includes("short");
                  const canLong = !produced.includes("long");
                  if (!canShort && !canLong) return null;
                  return (
                    <div className="rounded-xl bg-background p-5 space-y-3">
                      <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        Produce Another Format
                      </div>
                      <p className="text-[12px] text-dim leading-relaxed">
                        This story performed well. Produce it in another format to maximize reach.
                      </p>
                      <div className="flex gap-2">
                        {canShort && (
                          <button
                            onClick={async () => {
                              await patchStory({
                                stage: "approved",
                                brief: { ...brief, scriptFormat: "short" },
                              });
                              toast.success("Restarted pipeline for Short format");
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Short
                          </button>
                        )}
                        {canLong && (
                          <button
                            onClick={async () => {
                              await patchStory({
                                stage: "approved",
                                brief: { ...brief, scriptFormat: "long" },
                              });
                              toast.success("Restarted pipeline for Long Video format");
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Long Video
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Script box (editable — unsaved) ─────────────────────────────────────────

function ScriptBox({
  brief,
  scriptSaved,
  scriptOpen,
  setScriptOpen,
  editingField,
  setEditingField,
  onSave,
  onFieldDone,
  onBriefChange,
  scriptFields,
}: {
  brief: StoryBrief;
  scriptSaved: boolean;
  scriptOpen: boolean;
  setScriptOpen: (v: boolean) => void;
  editingField: string | null;
  setEditingField: (v: string | null) => void;
  onSave: (b: StoryBrief) => Promise<void>;
  onFieldDone: (key: string) => void;
  onBriefChange: (key: keyof StoryBrief, val: string) => void;
  scriptFields: { key: keyof StoryBrief; label: string; placeholder: string; type: "input" | "textarea" }[];
}) {
  return (
    <div className="rounded-xl bg-background overflow-hidden">
      <button
        onClick={() => setScriptOpen(!scriptOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
          {scriptSaved && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toast("AI script generation coming soon…");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-blue bg-blue/10 rounded-full hover:bg-blue/20 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate with AI
          </button>
          <ChevronDown
            className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {scriptOpen && (
        <div className="px-5 pb-5 space-y-4">
          {/* Format toggle */}
          <div className="flex items-center gap-1 p-1 bg-surface rounded-full w-fit">
            {(["short", "long"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => onBriefChange("scriptFormat", fmt)}
                className={`px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors ${
                  (brief.scriptFormat ?? "short") === fmt
                    ? "bg-foreground/10 text-foreground"
                    : "text-dim hover:text-sensor"
                }`}
              >
                {fmt === "short" ? "Short (1–2 min)" : "Video (20–40 min)"}
              </button>
            ))}
          </div>

          {scriptFields.map((field) => {
            const val = (brief[field.key] as string) ?? "";
            const isEditing = !scriptSaved || editingField === field.key;
            return (
              <div key={String(field.key)}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-dim font-mono uppercase tracking-wider">
                    {field.label}
                  </label>
                  {scriptSaved && editingField !== field.key && val && (
                    <button
                      onClick={() => setEditingField(String(field.key))}
                      className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                  {scriptSaved && editingField === field.key && (
                    <button
                      onClick={() => onFieldDone(String(field.key))}
                      className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                    >
                      Done
                    </button>
                  )}
                </div>
                {isEditing ? (
                  field.type === "textarea" ? (
                    <textarea
                      value={val}
                      onChange={(e) => onBriefChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={(brief.scriptFormat ?? "short") === "short" ? 3 : 5}
                      className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => onBriefChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 text-right"
                    />
                  )
                ) : (
                  <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] text-right min-h-[38px]">
                    {field.type === "textarea" ? (
                      <pre className="whitespace-pre-wrap font-mono text-[13px]">
                        {val || <span className="text-dim">—</span>}
                      </pre>
                    ) : (
                      val || <span className="text-dim">—</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!scriptSaved && (
            <button
              onClick={() => onSave(brief)}
              className="w-full py-2.5 text-[13px] font-semibold rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Script box (read-only with edit per field) ───────────────────────────────

function ScriptBoxSaved({
  brief,
  scriptOpen,
  setScriptOpen,
  editingField,
  setEditingField,
  onFieldDone,
  onBriefChange,
  scriptFields,
}: {
  brief: StoryBrief;
  scriptOpen: boolean;
  setScriptOpen: (v: boolean) => void;
  editingField: string | null;
  setEditingField: (v: string | null) => void;
  onFieldDone: (key: string) => void;
  onBriefChange: (key: keyof StoryBrief, val: string) => void;
  scriptFields: { key: keyof StoryBrief; label: string; placeholder: string; type: "input" | "textarea" }[];
}) {
  const scriptFormat = brief.scriptFormat ?? "short";
  return (
    <div className="rounded-xl bg-background overflow-hidden">
      <button
        onClick={() => setScriptOpen(!scriptOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue/15 text-blue">
            {scriptFormat === "short" ? "Short" : "Video"}
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">
            Saved
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`}
        />
      </button>
      {scriptOpen && (
        <div className="px-5 pb-5 space-y-4">
          {scriptFields.map((field) => {
            const val = (brief[field.key] as string) ?? "";
            const isEditing = editingField === field.key;
            return (
              <div key={String(field.key)}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-dim font-mono uppercase tracking-wider">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    {val && !isEditing && <CopyBtn text={val} />}
                    {!isEditing && val && (
                      <button
                        onClick={() => setEditingField(String(field.key))}
                        className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    {isEditing && (
                      <button
                        onClick={() => onFieldDone(String(field.key))}
                        className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  field.type === "textarea" ? (
                    <textarea
                      value={val}
                      onChange={(e) => onBriefChange(field.key, e.target.value)}
                      rows={scriptFormat === "short" ? 3 : 5}
                      className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => onBriefChange(field.key, e.target.value)}
                      className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 text-right"
                    />
                  )
                ) : (
                  <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] text-right min-h-[38px]">
                    {field.type === "textarea" ? (
                      <pre className="whitespace-pre-wrap font-mono text-[13px]">
                        {val || <span className="text-dim">—</span>}
                      </pre>
                    ) : (
                      val || <span className="text-dim">—</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
