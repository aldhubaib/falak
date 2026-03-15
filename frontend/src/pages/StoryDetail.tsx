import { useState, useEffect, useCallback } from "react";
import { AIWriterBox, type WriterState } from "@/components/AIWriterBox";
import { ScriptEditor } from "@/components/ScriptEditor";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import {
  Trophy, Eye, ThumbsUp, MessageSquare, Link2, ArrowLeft, Loader2,
  RefreshCw, ExternalLink, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiStory, Stage } from "./Stories";
import type { StoryBrief, ApiChannel, StoryWithLog } from "@/components/story-detail";
import {
  StoryDetailTopBar,
  StoryDetailPrevNext,
  StoryDetailTitle,
  StoryDetailScores,
  StoryDetailAIAnalysis,
  StoryDetailArticle,
  StoryDetailYouTubeTags,
  StoryDetailRankingList,
  StoryDetailChannelSelector,
  StoryDetailScriptBox,
  StoryDetailScriptBoxSaved,
  StoryDetailStageSuggestion,
  StoryDetailStageLiked,
  StoryDetailStageApprovedFilmedPublish,
  StoryDetailStageDone,
  StoryDetailStagePassed,
  StoryDetailStageOmit,
  ScoreBar,
  CopyBtn,
  channelName,
} from "@/components/story-detail";
import type { ScriptField } from "@/components/story-detail";

const STAGES: { key: Stage; label: string }[] = [
  { key: "suggestion", label: "AI Suggestion" },
  { key: "liked", label: "Liked" },
  { key: "approved", label: "Approved" },
  { key: "scripting", label: "Scripting" },
  { key: "filmed", label: "Filmed" },
  { key: "publish", label: "Publish" },
  { key: "done", label: "Done" },
  { key: "passed", label: "Passed" },
  { key: "omit", label: "Omitted" },
];

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
  const [cleanupStatus, setCleanupStatus] = useState<WriterState>("idle");
  const [articleDisplayValue, setArticleDisplayValue] = useState("");
  const [scriptStatus, setScriptStatus] = useState<WriterState>("idle");
  const [scriptText, setScriptText] = useState("");

  // ── UI state (synced with brief JSON) ────────────────────────────────────
  const [brief, setBrief] = useState<StoryBrief>({});
  const [youtubeInput, setYoutubeInput] = useState("");
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingYoutubeUrl, setEditingYoutubeUrl] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [scriptViewMode, setScriptViewMode] = useState<"structured" | "full">("structured");
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; avatarUrl: string } | null>(null);

  const isWriterBoxRunning = cleaningUp || fetchingArticle || generatingScript;

  // Fetch current user when showing ScriptEditor (scripting or filmed)
  useEffect(() => {
    if (story && (story.stage === "scripting" || story.stage === "filmed") && !currentUser) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((u) => {
          if (u?.id) setCurrentUser({ id: u.id, name: u.name ?? "Unknown", avatarUrl: u.avatarUrl ?? "" });
        })
        .catch(() => {});
    }
  }, [story?.stage, currentUser]);

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

  // ── Sync article display for AI Writer Box (when not typing from cleanup) ─
  useEffect(() => {
    const raw = brief.articleContent;
    if (
      (cleanupStatus === "idle" || cleanupStatus === "done") &&
      typeof raw === "string" &&
      raw !== "__SCRAPE_FAILED__" &&
      raw !== "__YOUTUBE__"
    ) {
      setArticleDisplayValue(raw);
    }
  }, [brief.articleContent, cleanupStatus]);

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

  const handleCleanup = useCallback(async () => {
    if (!id || isWriterBoxRunning) return;
    setCleaningUp(true);
    setCleanupStatus("thinking");
    const CHAR_DELAY = 18;
    let charQueue: string[] = [];
    let isTyping = false;
    const appendChunk = (chunk: string) => {
      charQueue.push(...chunk.split(""));
      if (!isTyping) drainQueue();
    };
    const drainQueue = () => {
      if (charQueue.length === 0) {
        isTyping = false;
        return;
      }
      isTyping = true;
      const char = charQueue.shift()!;
      setArticleDisplayValue((prev) => prev + char);
      setTimeout(drainQueue, CHAR_DELAY);
    };
    const onStreamComplete = () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (charQueue.length === 0 && !isTyping) resolve();
          else setTimeout(check, 20);
        };
        check();
      });
    try {
      const r = await fetch(`/api/stories/${id}/cleanup`, { method: "POST", credentials: "include" });
      const data = await r.json().catch(() => ({}));
      const newBrief = data.brief && typeof data.brief === "object" ? data.brief : null;
      const cleanedContent = newBrief && typeof newBrief.articleContent === "string" ? newBrief.articleContent : "";
      if (r.ok && cleanedContent) {
        setStory((s) => (s ? { ...s, headline: data.headline ?? s.headline, brief: newBrief ?? s.brief } : s));
        setBrief(newBrief as StoryBrief);
        toast.success("Article cleaned");
        setCleanupStatus("writing");
        setArticleDisplayValue("");
        appendChunk(cleanedContent);
        await onStreamComplete();
        setCleanupStatus("done");
      } else {
        setCleanupStatus("idle");
        toast.error(data.error || "Cleanup failed");
      }
    } catch {
      setCleanupStatus("idle");
      toast.error("Cleanup failed");
    } finally {
      setCleaningUp(false);
    }
  }, [id, isWriterBoxRunning]);

  const handleRefetch = useCallback(async () => {
    if (!id || !story?.sourceUrl || isWriterBoxRunning) return;
    setArticleError(null);
    setFetchingArticle(true);
    setCleanupStatus("thinking");
    const CHAR_DELAY = 18;
    let charQueue: string[] = [];
    let isTyping = false;
    const appendChunk = (chunk: string) => {
      charQueue.push(...chunk.split(""));
      if (!isTyping) drainQueue();
    };
    const drainQueue = () => {
      if (charQueue.length === 0) {
        isTyping = false;
        return;
      }
      isTyping = true;
      const char = charQueue.shift()!;
      setArticleDisplayValue((prev) => prev + char);
      setTimeout(drainQueue, CHAR_DELAY);
    };
    const onStreamComplete = () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (charQueue.length === 0 && !isTyping) resolve();
          else setTimeout(check, 20);
        };
        check();
      });
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
        if (data.articleContent !== "__SCRAPE_FAILED__" && data.articleContent !== "__YOUTUBE__" && String(data.articleContent).trim()) {
          setCleanupStatus("writing");
          setArticleDisplayValue("");
          appendChunk(String(data.articleContent));
          await onStreamComplete();
          setCleanupStatus("done");
          toast.success("Article re-fetched");
        } else {
          setCleanupStatus("idle");
          toast.info(data.articleContent === "__SCRAPE_FAILED__" ? "Source could not be scraped" : "Article re-fetched");
        }
      } else {
        setCleanupStatus("idle");
        toast.error(data.error || "Could not fetch article");
      }
    } catch {
      setCleanupStatus("idle");
      toast.error("Could not fetch article");
    } finally {
      setFetchingArticle(false);
    }
  }, [id, story?.sourceUrl, isWriterBoxRunning]);

  const handleOmit = useCallback(async () => {
    const updated = await patchStory({ stage: "omit" });
    if (updated) {
      setStory(updated);
      toast.success("Omitted — insufficient data");
    } else {
      toast.error("Failed to omit story");
    }
  }, [patchStory]);

  const handleRetryFetch = useCallback(async () => {
    if (!id || articleLoading) return;
    setArticleError(null);
    setArticleLoading(true);
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
        setStory((s) => (s?.brief ? { ...s, brief: { ...s.brief, articleContent: data.articleContent } } : s));
        if (data.articleContent !== "__SCRAPE_FAILED__") {
          toast.success("Article re-fetched");
        } else {
          toast.info("Source could not be scraped");
        }
      } else {
        toast.error(data.error || "Could not fetch article");
      }
    } catch {
      toast.error("Could not fetch article");
    } finally {
      setArticleLoading(false);
    }
  }, [id, articleLoading]);

  // Derived values (safe when story is null — only used when !loading && story)
  const scriptFormat = brief.scriptFormat ?? "short";
  const activeStage = story?.stage ?? "suggestion";
  const isFirst = story?.coverageStatus === "first";
  const isLate = story?.coverageStatus === "late";
  const selectedChannel = brief.channelId ?? "";
  const assignedChannel = ourChannels.find((c) => c.id === selectedChannel) ?? null;
  const scriptSaved = !!(brief.script !== undefined && brief.script !== null);
  const likedSorted = [...likedStories].sort(
    (a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
  );
  const stageIndex = id ? stageStories.findIndex((s) => s.id === id) : -1;
  const prevStory = stageIndex > 0 ? stageStories[stageIndex - 1] : null;
  const nextStory = stageIndex >= 0 && stageIndex < stageStories.length - 1 ? stageStories[stageIndex + 1] : null;
  const showStageNav = stageStories.length > 1 && stageIndex >= 0;
  const fmt = (n?: number) =>
    !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

  const SCRIPT_FIELDS: ScriptField[] = [
    { key: "suggestedTitle", label: "Suggested Title", placeholder: scriptFormat === "short" ? "عنوان الشورت المقترح..." : "عنوان الفيديو المقترح...", type: "input" },
    { key: "openingHook", label: "Opening Hook (first 10 sec)", placeholder: "الجملة الأولى التي تجذب المشاهد...", type: "input" },
    { key: "hookStart", label: "Branded Hook Start", placeholder: "e.g. أهلاً وسهلاً بكم في قناة...", type: "input" },
    { key: "script", label: "Script — with timestamps", placeholder: scriptFormat === "short" ? "00:00 هوك\n00:15 المحتوى..." : "00:00 مقدمة\n01:30 القصة تبدأ...", type: "textarea" },
    { key: "hookEnd", label: "Branded Hook End", placeholder: "e.g. لا تنسوا الاشتراك وتفعيل الجرس...", type: "input" },
  ];

  // Single return with conditional UI — no early returns, so hook count is always the same (avoids React #310)
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-pageBorder shrink-0">
          <button onClick={() => navigate(projectPath("/stories"))} className="link flex items-center gap-2 text-[13px]">
            <ArrowLeft className="w-4 h-4" /> AI Intelligence
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
        <div className="h-12 flex items-center px-6 border-b border-pageBorder shrink-0">
          <button onClick={() => navigate(projectPath("/stories"))} className="link flex items-center gap-2 text-[13px]">
            <ArrowLeft className="w-4 h-4" /> Back to Stories
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] text-dim font-mono">Story not found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StoryDetailTopBar
        title={story.headline}
        stageLabel={STAGES.find((s) => s.key === activeStage)?.label ?? ""}
        saving={saving}
        onBack={() => navigate(projectPath("/stories"))}
      />

      <div className="flex-1 relative overflow-auto">
        <div className="max-w-[900px] mx-auto px-6 max-lg:px-4 py-6 space-y-6">
          {showStageNav && (
            <StoryDetailPrevNext
              prevStory={prevStory}
              nextStory={nextStory}
              currentIndex={stageIndex}
              total={stageStories.length}
              onPrev={() => prevStory && navigate(projectPath(`/story/${prevStory.id}`))}
              onNext={() => nextStory && navigate(projectPath(`/story/${nextStory.id}`))}
            />
          )}

          <StoryDetailTitle
            headline={story.headline}
            sourceName={story.sourceName}
            sourceDate={story.sourceDate}
            sourceUrl={story.sourceUrl}
          />

          <StoryDetailArticle
            storyId={id}
            sourceUrl={story.sourceUrl}
            articleContent={brief.articleContent}
            articleDisplayValue={articleDisplayValue}
            cleanupStatus={cleanupStatus}
            articleLoading={articleLoading}
            articleError={articleError}
            showOmit={activeStage === "suggestion"}
            actionsDisabled={isWriterBoxRunning}
            onCleanup={handleCleanup}
            onRefetch={handleRefetch}
            onOmit={handleOmit}
            onRetryFetch={handleRetryFetch}
          />

          <StoryDetailScores
            relevance={story.relevanceScore ?? 0}
            viral={story.viralScore ?? 0}
            firstMover={story.firstMoverScore ?? 0}
            total={story.compositeScore ?? 0}
          />

          {brief.suggestedTitle && (
            <StoryDetailAIAnalysis
              text={brief.suggestedTitle}
              isFirst={isFirst}
              isLate={isLate}
            />
          )}

          <StoryDetailYouTubeTags
            tags={brief.youtubeTags}
            suggesting={suggestingTags}
            onSuggest={async () => {
              if (!id || suggestingTags) return;
              setSuggestingTags(true);
              try {
                const r = await fetch(`/api/stories/${id}/suggest-tags`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                });
                const data = await r.json().catch(() => ({}));
                if (r.ok && data.brief) {
                  setBrief(data.brief);
                  setStory((s) => (s?.brief ? { ...s, brief: data.brief } : s));
                  const count = Array.isArray(data.tags) ? data.tags.length : (data.brief.youtubeTags?.length ?? 0);
                  toast.success(`Suggested ${count} tags. Copy below for YouTube.`);
                } else {
                  toast.error(data.error || "Could not suggest tags");
                }
              } catch {
                toast.error("Could not suggest tags");
              } finally {
                setSuggestingTags(false);
              }
            }}
          />

          {/* Stage-specific content */}
          <div className="space-y-5">

            {activeStage === "suggestion" && (
              <StoryDetailStageSuggestion
                onSaveToLiked={() => moveStage("liked")}
                onPass={async () => {
                  const updated = await patchStory({ stage: "passed" });
                  if (updated) {
                    toast.success("Passed");
                    navigate(projectPath("/stories"));
                  } else {
                    toast.error("Failed to pass story");
                  }
                }}
              />
            )}

            {activeStage === "passed" && (
              <StoryDetailStagePassed onMoveBack={() => moveStage("suggestion")} />
            )}

            {activeStage === "omit" && (
              <StoryDetailStageOmit onMoveBack={() => moveStage("suggestion")} />
            )}

            {activeStage === "liked" && (
              <StoryDetailStageLiked
                canApprove={
                  !!selectedChannel &&
                  !!(brief.script?.trim() || brief.suggestedTitle?.trim() || brief.openingHook?.trim())
                }
                onApprove={async () => {
                  await patchStory({ stage: "approved", brief });
                  toast.success("Moved to Approved");
                }}
                onPass={() => moveStage("suggestion")}
              >
                <StoryDetailRankingList
                  stories={likedSorted.map((s) => ({
                    id: s.id,
                    headline: s.headline,
                    coverageStatus: s.coverageStatus ?? null,
                    compositeScore: s.compositeScore ?? null,
                  }))}
                  currentId={id}
                  currentScore={story.compositeScore ?? null}
                  onSelect={(storyId) => navigate(projectPath(`/story/${storyId}`))}
                />
                <StoryDetailChannelSelector
                  channels={ourChannels}
                  selectedId={brief.channelId ?? ""}
                  open={channelDropOpen}
                  onToggleOpen={() => setChannelDropOpen(!channelDropOpen)}
                  onSelect={(channelId) => {
                    saveBrief({ ...brief, channelId });
                    setChannelDropOpen(false);
                  }}
                />
                <StoryDetailScriptBox
                  brief={brief}
                  scriptSaved={scriptSaved}
                  scriptOpen={scriptOpen}
                  setScriptOpen={setScriptOpen}
                  editingField={editingField}
                  setEditingField={setEditingField}
                  scriptFields={SCRIPT_FIELDS}
                  scriptFormat={(brief.scriptFormat ?? "short") as "short" | "long"}
                  onScriptFormatChange={(fmt) => setBrief((b) => ({ ...b, scriptFormat: fmt }))}
                  onSave={async (newBrief) => {
                    await saveBrief({ ...newBrief, script: newBrief.script ?? "" });
                    toast.success("Script saved");
                  }}
                  onFieldDone={(key) => { setEditingField(null); saveBrief({ ...brief }); }}
                  onBriefChange={(key, val) => setBrief((b) => ({ ...b, [key]: val }))}
                  canGenerate={
                    !!assignedChannel &&
                    !!(
                      articleDisplayValue?.trim() ||
                      (brief.articleContent?.trim() &&
                        brief.articleContent !== "__SCRAPE_FAILED__" &&
                        brief.articleContent !== "__YOUTUBE__")
                    )
                  }
                  generating={generatingScript}
                  onGenerateScript={async () => {
                    if (!id || !assignedChannel || generatingScript) return;
                    const articleText =
                      articleDisplayValue?.trim() ||
                      (brief.articleContent?.trim() &&
                      brief.articleContent !== "__SCRAPE_FAILED__" &&
                      brief.articleContent !== "__YOUTUBE__"
                        ? brief.articleContent
                        : "");
                    if (!articleText) {
                      toast.error("No article content. Fetch and clean the article first.");
                      return;
                    }
                    setGeneratingScript(true);
                    try {
                      const r = await fetch(`/api/stories/${id}/generate-script`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          format: brief.scriptFormat ?? "short",
                          articleText,
                          channelId: brief.channelId,
                        }),
                      });
                      if (!r.ok) {
                        const data = await r.json().catch(() => ({}));
                        toast.error(data.error || `Generate script failed (${r.status})`);
                        return;
                      }
                      const reader = r.body?.getReader();
                      if (reader) {
                        const decoder = new TextDecoder();
                        let buffer = "";
                        while (true) {
                          const { done, value } = await reader.read();
                          if (done) break;
                          buffer += decoder.decode(value, { stream: true });
                        }
                        const lines = buffer.split("\n");
                        for (const line of lines) {
                          if (line.startsWith("data: ") && line.includes("error")) {
                            try {
                              const obj = JSON.parse(line.slice(6).trim());
                              if (obj?.error) {
                                toast.error(obj.error);
                                return;
                              }
                            } catch {
                              // ignore
                            }
                          }
                        }
                      }
                      await loadStory();
                      toast.success("Script generated");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Generate script failed");
                    } finally {
                      setGeneratingScript(false);
                    }
                  }}
                  scriptViewMode={scriptViewMode}
                  onScriptViewModeChange={setScriptViewMode}
                />
              </StoryDetailStageLiked>
            )}


            {/* ── APPROVED / SCRIPTING / FILMED / PUBLISH ───────────────────────────── */}
            {(activeStage === "approved" || activeStage === "scripting" || activeStage === "filmed" || activeStage === "publish") && (
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
                          alt={channelName(assignedChannel)}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                          {channelName(assignedChannel).slice(0, 2)}
                        </div>
                      )}
                      <span className="absolute left-10 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-elevated text-[12px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {channelName(assignedChannel)}
                      </span>
                    </button>
                  </div>
                )}

                {/* Script: BlockNote editor when scripting/filmed, else saved fields */}
                {(activeStage === "scripting" || activeStage === "filmed") && currentUser ? (
                  <div className="rounded-xl bg-background p-5">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">
                      Script
                    </div>
                    <ScriptEditor
                      storyId={id!}
                      currentUser={currentUser}
                      initialScript={brief.script ?? ""}
                      format={scriptFormat}
                      log={story.log}
                      readOnly={activeStage !== "scripting"}
                      onAutosave={async (scriptText) => {
                        await saveBrief({ ...brief, script: scriptText });
                        try {
                          await fetch(`/api/stories/${id}/log`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "script_edit", note: "Edited script" }),
                          });
                          await loadStory();
                        } catch {
                          toast.error("Failed to log edit");
                        }
                      }}
                    />
                  </div>
                ) : (
                  <StoryDetailScriptBoxSaved
                    brief={brief}
                    scriptOpen={scriptOpen}
                    setScriptOpen={setScriptOpen}
                    editingField={editingField}
                    setEditingField={setEditingField}
                    scriptFields={SCRIPT_FIELDS}
                    scriptFormat={(brief.scriptFormat ?? "short") as "short" | "long"}
                    onFieldDone={(key) => {
                      setEditingField(null);
                      saveBrief({ ...brief });
                      toast.success("Field updated");
                    }}
                    onBriefChange={(key, val) => setBrief((b) => ({ ...b, [key]: val }))}
                    scriptViewMode={scriptViewMode}
                    onScriptViewModeChange={setScriptViewMode}
                  />
                )}

                {(activeStage === "approved" || activeStage === "scripting") && (
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
  );
}
