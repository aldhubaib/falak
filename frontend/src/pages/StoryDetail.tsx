import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  scriptTextToEditorValue,
  editorValueToScriptText,
  extractScriptBlocks,
  buildScriptBlocksJSON,
} from "@/data/editorInitialValue";
import { useProjectPath } from "@/hooks/useProjectPath";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  Trophy, Eye, ThumbsUp, MessageSquare, Link2, ArrowLeft, Loader2,
  RefreshCw, ExternalLink, Pencil, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { Stage } from "./Stories";
import type { StoryBrief, ApiChannel, StoryWithLog } from "@/components/story-detail";
import {
  StoryDetailTopBar,
  StoryDetailArticle,
  StoryDetailScriptSection,
  StoryDetailStagePassed,
  StoryDetailStageOmit,
  StoryDetailStagePublish,
} from "@/components/story-detail";
import type { ScriptField } from "@/components/story-detail";

function parseStructuredScript(text: string) {
  const raw = (text || "").trim();
  const sectionNames = ["TITLE", "OPENING_HOOK", "BRANDED_HOOK_START", "SCRIPT", "BRANDED_HOOK_END", "HASHTAGS"];
  const sections: Record<string, string> = {};
  let currentKey: string | null = null;
  let currentLines: string[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/^##\s*(.+?)\s*$/i);
    if (match) {
      const key = match[1].toUpperCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
      if (sectionNames.includes(key)) {
        if (currentKey) sections[currentKey] = currentLines.join("\n").trim();
        currentKey = key;
        currentLines = [];
        continue;
      }
    }
    if (currentKey) currentLines.push(line);
  }
  if (currentKey) sections[currentKey] = currentLines.join("\n").trim();

  const hashtagRaw = sections.HASHTAGS || "";
  const hashtags = hashtagRaw
    .split(/[\s,،\n]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);

  return {
    title: sections.TITLE || "",
    hook: sections.OPENING_HOOK || "",
    hookStart: sections.BRANDED_HOOK_START || "",
    script: sections.SCRIPT || raw,
    hookEnd: sections.BRANDED_HOOK_END || "",
    hashtags,
  };
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "suggestion", label: "Suggestion" },
  { key: "liked", label: "Liked" },
  { key: "scripting", label: "Scripting" },
  { key: "filmed", label: "Filmed" },
  { key: "publish", label: "Publish" },
  { key: "done", label: "Done" },
  { key: "passed", label: "Passed" },
  { key: "omit", label: "Omitted" },
];

const STAGE_ORDER: Stage[] = ["suggestion", "liked", "scripting", "filmed", "publish", "done"];

/** Minimal mock so main content renders (design only). */
const MOCK_STORY: StoryWithLog = {
  id: "",
  headline: "",
  stage: "scripting",
  sourceUrl: null,
  sourceName: null,
  sourceDate: null,
  createdAt: "",
  relevanceScore: 0,
  viralScore: 0,
  firstMoverScore: 0,
  compositeScore: 0,
  coverageStatus: null,
  brief: null,
  log: [],
} as StoryWithLog;

export default function StoryDetail() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const currentUser = useCurrentUser();

  const collaborationWsUrl = useMemo(
    () =>
      (import.meta.env.VITE_WS_URL as string | undefined) ||
      `${typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"}://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:1234`,
    []
  );

  const [brief, setBrief] = useState<StoryBrief>({});
  const [story, setStory] = useState<StoryWithLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSavingState] = useState(false);
  const [ourChannels, setOurChannels] = useState<ApiChannel[]>([]);
  const scriptEditorRef = useRef<{ setContent: (v: any) => void } | null>(null);

  const scriptValue = useMemo(
    () => brief.scriptTiptap ?? scriptTextToEditorValue(brief.script ?? ""),
    [brief.scriptTiptap, brief.script]
  );

  // Refs for redirect (avoid effect re-running when navigate/projectPath identity changes)
  const navigateRef = useRef(navigate);
  const projectPathRef = useRef(projectPath);
  navigateRef.current = navigate;
  projectPathRef.current = projectPath;

  // Load "ours" channels for the channel selector modal
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/channels?projectId=${projectId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load channels"))))
      .then((data: { channels: ApiChannel[] }) => {
        if (cancelled) return;
        const ours = (data.channels || []).filter((c) => c.type === "ours");
        setOurChannels(ours);
      })
      .catch(() => {
        if (!cancelled) setOurChannels([]);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  // Load story (and brief) on mount so Yoopta content persists after refresh
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/stories/${id}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Story not found" : "Failed to load story");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStory(data as StoryWithLog);
        const b = data.brief && typeof data.brief === "object" ? data.brief as StoryBrief : {};
        setBrief(b);
      })
      .catch((err) => {
        if (!cancelled) {
          setStory(null);
          setBrief({});
          if (err.message === "Story not found") navigateRef.current(projectPathRef.current("/stories"), { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveScriptTimeoutRef.current) clearTimeout(saveScriptTimeoutRef.current);
    };
  }, []);

  // Debounced save of script (scriptTiptap + script text) so refresh keeps content
  const saveScriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveScript = useCallback(
    (storyId: string, newBrief: StoryBrief) => {
      if (saveScriptTimeoutRef.current) clearTimeout(saveScriptTimeoutRef.current);
      saveScriptTimeoutRef.current = setTimeout(() => {
        saveScriptTimeoutRef.current = null;
        setSavingState(true);
        fetch(`/api/stories/${storyId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: newBrief }),
        })
          .then((res) => {
            if (!res.ok) throw new Error("Failed to save");
            return res.json();
          })
          .then((updated) => {
            setStory((s) => (s && s.id === storyId ? (updated as StoryWithLog) : s));
            // Do not setBrief(updated): we already have the correct local state; updating would
            // change scriptValue → editor syncs → onChange → save again (loop).
          })
          .catch(() => {})
          .finally(() => setSavingState(false));
      }, 800);
    },
    []
  );

  // ── Article loading state ────────────────────────────────────────────────
  const activeStage: Stage = story?.stage ?? "scripting";
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [cleanupProgress, setCleanupProgress] = useState(0);
  const isWriterBoxRunning = false;

  const articleDisplayValue = (() => {
    const c = brief.articleContent;
    if (!c || c === "__SCRAPE_FAILED__" || c === "__YOUTUBE__") return "";
    return typeof c === "string" ? c : "";
  })();

  const fetchArticle = useCallback(async (force = false) => {
    if (!id) return;
    setArticleLoading(true);
    setArticleError(null);
    try {
      const res = await fetch(`/api/stories/${id}/fetch-article`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch article");
      const content = data.articleContent;
      if (content && content !== "__SCRAPE_FAILED__" && content !== "__YOUTUBE__") {
        setBrief((b) => ({ ...b, articleContent: content }));
      } else if (content === "__YOUTUBE__") {
        setBrief((b) => ({ ...b, articleContent: "__YOUTUBE__" }));
      } else {
        setArticleError("Source could not be scraped.");
      }
    } catch (e) {
      setArticleError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setArticleLoading(false);
    }
  }, [id]);

  const cleanupArticle = useCallback(async () => {
    if (!id || !articleDisplayValue.trim()) return;
    setCleanupProgress(10);
    try {
      const interval = setInterval(() => {
        setCleanupProgress((p) => Math.min(p + 15, 90));
      }, 400);
      const res = await fetch(`/api/stories/${id}/cleanup`, {
        method: "POST",
        credentials: "include",
      });
      clearInterval(interval);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Cleanup failed");
      }
      const updated = await res.json();
      const b = updated.brief && typeof updated.brief === "object" ? updated.brief as StoryBrief : brief;
      setBrief(b);
      setCleanupProgress(100);
      toast.success("Article cleaned up");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setTimeout(() => setCleanupProgress(0), 600);
    }
  }, [id, articleDisplayValue, brief]);

  useEffect(() => {
    if (!id || !story) return;
    const content = brief.articleContent;
    if (!content || content === "__SCRAPE_FAILED__") {
      if (story.sourceUrl) fetchArticle();
    }
  }, [id, story?.id]);
  const [scriptDurationMinutes, setScriptDurationMinutes] = useState(
    () => brief.scriptDuration || 3
  );

  useEffect(() => {
    if (brief.scriptDuration) setScriptDurationMinutes(brief.scriptDuration);
  }, [brief.scriptDuration]);
  const youtubeInput = "";
  const editingYoutubeUrl = false;
  const [generatingScript, setGeneratingScript] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [articleOpen, setArticleOpen] = useState(false);
  const [stageStories, setStageStories] = useState<{ id: string }[]>([]);

  // Load stories in current stage for prev/next navigation
  useEffect(() => {
    if (!projectId || !story) return;
    const stage = story.stage;
    let cancelled = false;
    fetch(`/api/stories?projectId=${projectId}&stage=${stage}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string }[]) => {
        if (cancelled) return;
        setStageStories((list || []).map((s) => ({ id: s.id })));
      })
      .catch(() => {
        if (!cancelled) setStageStories([]);
      });
    return () => { cancelled = true; };
  }, [projectId, story?.id, story?.stage]);

  // Original Story: expanded for Suggestion/Liked, collapsed for Scripting/Filmed/Publish/Done (on page load)
  useEffect(() => {
    if (story) {
      const shouldExpand = activeStage === "suggestion" || activeStage === "liked";
      setArticleOpen(shouldExpand);
    }
  }, [story?.id]);
  const stageIndex = id ? stageStories.findIndex((s) => s.id === id) : -1;
  const prevStory = stageIndex > 0 ? stageStories[stageIndex - 1] : null;
  const nextStory = stageIndex >= 0 && stageIndex < stageStories.length - 1 ? stageStories[stageIndex + 1] : null;
  const showStageNav = stageStories.length > 1 && stageIndex >= 0;
  const stageOrderIdx = STAGE_ORDER.indexOf(activeStage);
  const nextStageKey: Stage | null = stageOrderIdx >= 0 && stageOrderIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageOrderIdx + 1]! : null;
  const nextStageLabel = nextStageKey ? STAGES.find((s) => s.key === nextStageKey)?.label ?? null : null;
  const relativeDate = story?.sourceDate || story?.createdAt
    ? formatDistanceToNow(new Date((story?.sourceDate || story?.createdAt) ?? ""), { addSuffix: true })
    : null;
  const fmt = (n?: number) =>
    !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
  const [selectedChannel, setSelectedChannel] = useState("");

  const moveToStage = useCallback(
    async (toStage: Stage) => {
      if (!id) return;
      setSavingState(true);
      try {
        const res = await fetch(`/api/stories/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: toStage }),
        });
        if (!res.ok) throw new Error("Failed to update stage");
        const updated = await res.json();
        setStory(updated as StoryWithLog);
        const label = STAGES.find((s) => s.key === toStage)?.label ?? toStage;
        toast.success(`Moved to ${label}`);
      } catch {
        toast.error("Failed to change stage");
      } finally {
        setSavingState(false);
      }
    },
    [id]
  );

  const generateScript = useCallback(async () => {
    if (!id) { toast.error("No story ID"); return; }
    if (!selectedChannel) { toast.error("Select a channel first"); return; }
    if (generatingScript) return;
    setGeneratingScript(true);
    toast.info("Generating script…");
    try {
      const res = await fetch(`/api/stories/${id}/generate-script`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMinutes: scriptDurationMinutes,
          channelId: selectedChannel,
          articleText: brief.articleContent ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        toast.error(err.error || "Generation failed");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) { toast.error("No response stream"); return; }
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta?.text) fullText += parsed.delta.text;
            if (parsed.error) toast.error(parsed.error);
          } catch { /* skip non-JSON lines */ }
        }
      }
      const sections = parseStructuredScript(fullText);
      const tiptapValue = buildScriptBlocksJSON({
        title: sections.title,
        hook: sections.hook,
        hookStart: sections.hookStart || brief.hookStart || "",
        script: sections.script,
        hookEnd: sections.hookEnd || brief.hookEnd || "",
        hashtags: sections.hashtags,
      });
      if (scriptEditorRef.current) {
        scriptEditorRef.current.setContent(tiptapValue);
      }
      setBrief((b) => {
        const next: StoryBrief = {
          ...b,
          suggestedTitle: sections.title || b.suggestedTitle,
          openingHook: sections.hook || b.openingHook,
          hookStart: sections.hookStart,
          script: sections.script || b.script,
          hookEnd: sections.hookEnd,
          scriptTiptap: tiptapValue,
          scriptDuration: scriptDurationMinutes,
          scriptRaw: fullText.trim(),
          youtubeTags: sections.hashtags.length > 0 ? sections.hashtags : b.youtubeTags,
        };
        if (id) saveScript(id, next);
        return next;
      });
      toast.success("Script generated");
    } catch (err) {
      toast.error("Failed to generate script");
    } finally {
      setGeneratingScript(false);
    }
  }, [id, selectedChannel, scriptDurationMinutes, brief.articleContent, ourChannels, generatingScript, saveScript]);

  const SCRIPT_FIELDS: ScriptField[] = [
    { key: "suggestedTitle", label: "Suggested Title", placeholder: "عنوان الفيديو المقترح...", type: "input" },
    { key: "openingHook", label: "Opening Hook (first 10 sec)", placeholder: "الجملة الأولى التي تجذب المشاهد...", type: "input" },
    { key: "hookStart", label: "Branded Hook Start", placeholder: "e.g. أهلاً وسهلاً بكم في قناة...", type: "input" },
    { key: "script", label: "Script — with timestamps", placeholder: "00:00 مقدمة\n01:30 القصة تبدأ...", type: "textarea" },
    { key: "hookEnd", label: "Branded Hook End", placeholder: "e.g. لا تنسوا الاشتراك وتفعيل الجرس...", type: "input" },
  ];

  // Layout matches Lovabale (Test.tsx): flex min-h-screen, no outer card/padding
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <button onClick={() => navigate(projectPath("/stories"))} className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
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
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <button onClick={() => navigate(projectPath("/stories"))} className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
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
          stageLabel={STAGES.find((s) => s.key === activeStage)?.label ?? ""}
          activeStage={activeStage}
          stages={STAGES}
          nextStageKey={nextStageKey}
          nextStageLabel={nextStageLabel}
          saving={saving}
          onBack={() => navigate(projectPath("/stories"))}
          onMoveToNextStage={() => nextStageKey && moveToStage(nextStageKey)}
          onPass={() => moveToStage("passed")}
          onRestart={() => moveToStage("suggestion")}
          onOmit={() => moveToStage("omit")}
          onHistoryClick={() => setHistoryOpen(true)}
          prevNext={showStageNav ? {
            currentIndex: stageIndex + 1,
            total: stageStories.length,
            onPrev: () => prevStory && navigate(projectPath(`/story/${(prevStory as { id: string }).id}`)),
            onNext: () => nextStory && navigate(projectPath(`/story/${(nextStory as { id: string }).id}`)),
            hasPrev: !!prevStory,
            hasNext: !!nextStory,
          } : undefined}
        />

        {/* Edit History modal */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setHistoryOpen(false)}>
            <div
              className="w-full max-w-lg rounded-xl bg-background border border-border overflow-hidden shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                <span className="text-[13px] font-medium">Edit History</span>
                <button type="button" onClick={() => setHistoryOpen(false)} className="p-1.5 text-dim hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {Array.isArray(story.log) && story.log.length > 0 ? (
                  story.log.map((entry) => {
                    const actionLabel = entry.action === "stage_change" && entry.note
                      ? entry.note
                      : entry.action === "stage_change"
                        ? "Status changed"
                        : entry.action === "created"
                          ? "Created"
                          : entry.action === "script_edit"
                            ? "Edited script"
                            : entry.action
                    return (
                    <div key={entry.id} className="flex items-center justify-between px-5 py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-0.5 h-8 bg-blue/30 rounded-full shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sensor text-[11px]">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</span>
                          <span className="text-dim text-[11px]"> · {actionLabel}</span>
                          {entry.note && entry.action !== "stage_change" && <span className="font-mono text-[11px] text-dim ml-1">{entry.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sensor text-[12px] font-medium truncate max-w-[120px]">{entry.user?.name ?? "—"}</span>
                        {entry.user?.avatarUrl ? (
                          <img src={entry.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim">{entry.user?.name?.[0] ?? "?"}</div>
                        )}
                      </div>
                    </div>
                  )})
                ) : (
                  <div className="px-5 py-8 text-center text-dim text-[12px]">No edit history yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <div className="px-6 max-lg:px-4 max-sm:px-3 py-5 pb-16 space-y-5">
            <StoryDetailArticle
              storyId={id}
              sourceUrl={story.sourceUrl}
              articleContent={brief.articleContent}
              articleDisplayValue={articleDisplayValue}
              articleTitle={brief.articleTitle ?? story.headline ?? ""}
              cleanupProgress={cleanupProgress}
              articleLoading={articleLoading}
              articleError={articleError}
              actionsDisabled={isWriterBoxRunning}
              scores={{
                relevance: story.relevanceScore ?? 0,
                viral: story.viralScore ?? 0,
                firstMover: story.firstMoverScore ?? 0,
                total: story.compositeScore ?? 0,
              }}
              relativeDate={relativeDate}
              articleOpen={articleOpen}
              onArticleOpenChange={setArticleOpen}
              onCleanup={cleanupArticle}
              onRefetch={async () => fetchArticle(true)}
              onRetryFetch={async () => fetchArticle(true)}
              onArticleChange={(val) => {
                const newBrief = { ...brief, articleContent: val };
                setBrief(newBrief);
                if (id) saveScript(id, newBrief);
              }}
              onArticleTitleChange={(val) => setBrief((b) => ({ ...b, articleTitle: val }))}
              onArticleTitleBlur={(title) => {
                const newBrief = { ...brief, articleTitle: title };
                if (id) saveScript(id, newBrief);
              }}
            />

          {/* Stage-specific content */}
          <div className="space-y-5">

            {activeStage === "passed" && (
              <StoryDetailStagePassed onMoveBack={() => moveToStage("suggestion")} />
            )}

            {activeStage === "omit" && (
              <StoryDetailStageOmit onMoveBack={() => moveToStage("suggestion")} />
            )}

            {/* ── SCRIPTING / FILMED / DONE (Yoopta script editor) ───────── */}
            {(activeStage === "scripting" || activeStage === "filmed" || activeStage === "done") && (
              <>
                <StoryDetailScriptSection
                  key={id}
                  channels={ourChannels}
                  selectedChannelId={selectedChannel}
                  onChannelSelect={(channelId) => {
                    setSelectedChannel(channelId);
                    setBrief((b) => {
                      const next = { ...b, channelId };
                      if (id) saveScript(id, next);
                      return next;
                    });
                  }}
                  scriptDuration={scriptDurationMinutes}
                  onScriptDurationChange={(mins) => {
                    setScriptDurationMinutes(mins);
                    setBrief((b) => {
                      const next = { ...b, scriptDuration: mins };
                      if (id) saveScript(id, next);
                      return next;
                    });
                  }}
                  canGenerate={!!selectedChannel && scriptDurationMinutes > 0}
                  generating={generatingScript}
                  onGenerate={generateScript}
                  readOnly={activeStage !== "scripting" && activeStage !== "filmed"}
                  showGenerateControls={activeStage === "scripting"}
                  scriptValue={scriptValue}
                  saving={saving}
                  editorRef={scriptEditorRef}
                  videoFormat={brief.videoFormat || "long"}
                  onVideoFormatChange={(fmt) => {
                    const defaultDuration = fmt === "short" ? 1 : 3;
                    setScriptDurationMinutes(defaultDuration);
                    setBrief((b) => {
                      const next: StoryBrief = { ...b, videoFormat: fmt, scriptDuration: defaultDuration };
                      if (id) saveScript(id, next);
                      return next;
                    });
                  }}
                  onScriptChange={(value) => {
                    const blocks = extractScriptBlocks(value);
                    const scriptText = blocks.script || editorValueToScriptText(value);
                    setBrief((b) => {
                      const next: StoryBrief = {
                        ...b,
                        scriptTiptap: value,
                        script: scriptText,
                        suggestedTitle: blocks.title || b.suggestedTitle,
                        openingHook: blocks.hook || b.openingHook,
                        hookStart: blocks.hookStart !== "" ? blocks.hookStart : b.hookStart,
                        hookEnd: blocks.hookEnd !== "" ? blocks.hookEnd : b.hookEnd,
                        youtubeTags: blocks.hashtags.length > 0 ? blocks.hashtags : b.youtubeTags,
                      };
                      if (id) saveScript(id, next);
                      return next;
                    });
                  }}
                  storyId={id}
                  currentUser={currentUser}
                  collaborationWsUrl={collaborationWsUrl}
                />
              </>
            )}

            {/* ── PUBLISH (title, description, tags, thumbnail, visibility) ───────── */}
            {activeStage === "publish" && id && (
              <>
                <StoryDetailStagePublish
                  brief={brief}
                  storyId={id}
                  saving={saving}
                  onBriefChange={(updater) => {
                    setBrief((b) => {
                      const next = updater(b);
                      if (id) saveScript(id, next);
                      return next;
                    });
                  }}
                />
                <StoryDetailScriptSection
                  key={`script-${id}`}
                  channels={ourChannels}
                  selectedChannelId={selectedChannel}
                  onChannelSelect={() => {}}
                  scriptDuration={scriptDurationMinutes}
                  onScriptDurationChange={() => {}}
                  canGenerate={false}
                  generating={false}
                  onGenerate={async () => {}}
                  readOnly
                  showGenerateControls={false}
                  scriptValue={scriptValue}
                  saving={false}
                  editorRef={scriptEditorRef}
                  videoFormat={brief.videoFormat || "long"}
                  storyId={id}
                  currentUser={currentUser}
                  collaborationWsUrl={collaborationWsUrl}
                />
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

                {brief.youtubeUrl && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        YouTube Video URL
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
                              onClick={() => {}}
                              className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        {editingYoutubeUrl && (
                          <button
                            onClick={() => {}}
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
                        onChange={() => {}}
                        className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                      />
                    ) : (
                      <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] font-mono text-sensor truncate">
                        {brief.youtubeUrl}
                      </div>
                    )}
                  </div>
                )}

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
                            onClick={() => {}}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Short
                          </button>
                        )}
                        {canLong && (
                          <button
                            onClick={() => {}}
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
