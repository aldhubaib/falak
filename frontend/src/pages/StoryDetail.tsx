import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  Trophy, Eye, ThumbsUp, MessageSquare, Link2, ArrowLeft, Loader2,
  RefreshCw, ExternalLink, Pencil, X, Copy, Check, History,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { Stage } from "./Stories";
import type { StoryBrief, StoryWithLog } from "@/components/story-detail";
import {
  StoryDetailTopBar,
  StoryDetailResearch,
  StoryDetailScriptSection,
  StoryDetailStagePassed,
  StoryDetailStageOmit,
  StoryDetailStagePublish,
  VideoUpload,
  TranscriptSection,
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
  { key: "skip", label: "Skipped" },
  { key: "trash", label: "Trashed" },
  { key: "filtered", label: "Filtered" },
];

const STAGE_ORDER: Stage[] = ["suggestion", "liked", "scripting", "filmed", "publish", "done"];
const NAV_STAGE_ORDER: Stage[] = ["suggestion", "liked", "scripting", "filmed", "publish", "done", "skip", "trash", "filtered"];

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

// ── Auto-processing pipeline steps ──────────────────────────────────
type PipelineStep = "idle" | "transcribing" | "generating" | "done" | "error";

const PIPELINE_STEPS: { key: PipelineStep; label: string; briefKey?: keyof StoryBrief }[] = [
  { key: "transcribing", label: "Transcribing", briefKey: "transcript" },
  { key: "generating",   label: "Title" ,       briefKey: "suggestedTitle" },
  { key: "generating",   label: "Description",  briefKey: "youtubeDescription" },
  { key: "generating",   label: "Tags",         briefKey: "youtubeTags" },
];

// ── Manual Story Workflow ──────────────────────────────────────────
function ManualStoryWorkflow({
  story,
  brief,
  storyId,
  saving,
  onBriefChange,
  onStageChange,
  hideUploadSection = false,
}: {
  story: StoryWithLog;
  brief: StoryBrief;
  storyId: string;
  saving: boolean;
  onBriefChange: (updater: (prev: StoryBrief) => StoryBrief) => void;
  onStageChange: (stage: Stage) => void;
  hideUploadSection?: boolean;
}) {
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [srtCopied, setSrtCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [youtubeInput, setYoutubeInput] = useState(brief.youtubeUrl || "");

  // Derive pipeline step from brief fields (background processing updates these)
  const pipelineStep: PipelineStep = (() => {
    if (brief.processingStatus === "error") return "error";
    if (brief.processingStatus === "done") return "done";
    if (brief.processingStatus === "processing") {
      return brief.processingStep === "generating" ? "generating" : "transcribing";
    }
    return "idle";
  })();
  const pipelineError = brief.processingError || null;

  const triggerBackgroundProcess = useCallback(async () => {
    try {
      await fetch(`/api/stories/${storyId}/process`, { method: "POST", credentials: "include" });
      onBriefChange((b) => ({ ...b, processingStatus: "processing", processingStep: "transcribing", processingError: null }));
    } catch {
      toast.error("Failed to start processing");
    }
  }, [storyId, onBriefChange]);

  const generateTitle = async () => {
    setGeneratingTitle(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/generate-title`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error || "Generate title failed");
        return;
      }
      const data = await res.json();
      onBriefChange((b) => ({ ...b, suggestedTitle: data.title }));
      toast.success("Title generated");
    } catch {
      toast.error("Generate title failed");
    } finally {
      setGeneratingTitle(false);
    }
  };

  const generateDescription = async () => {
    setGeneratingDesc(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/generate-description`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error || "Generate description failed");
        return;
      }
      const data = await res.json();
      onBriefChange((b) => ({ ...b, youtubeDescription: data.description }));
      toast.success("Description generated");
    } catch {
      toast.error("Generate description failed");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const generateTags = async () => {
    setGeneratingTags(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/suggest-tags`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error || "Generate tags failed");
        return;
      }
      const data = await res.json();
      const tags = data.tags || data.brief?.youtubeTags || [];
      onBriefChange((b) => ({ ...b, youtubeTags: tags }));
      toast.success("Tags generated");
    } catch {
      toast.error("Generate tags failed");
    } finally {
      setGeneratingTags(false);
    }
  };

  const saveYoutubeUrl = async () => {
    const url = youtubeInput.trim();
    if (!url) return;
    onBriefChange((b) => ({ ...b, youtubeUrl: url }));
    toast.success("YouTube URL saved");

    setClassifying(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/classify-video`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        onBriefChange((b) => ({ ...b, youtubeUrl: url, videoFormat: data.videoFormat }));
        toast.success(`Classified as ${data.videoFormat === "short" ? "Short" : "Video"}`);
      }
    } catch {
      // Classification is best-effort
    } finally {
      setClassifying(false);
    }
  };

  const downloadSRT = () => {
    if (!brief.subtitlesSRT) return;
    const blob = new Blob([brief.subtitlesSRT], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(brief.suggestedTitle || "subtitles").replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, "_")}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const isDone = story.stage === "done";
  const isPipelineActive = pipelineStep !== "idle" && pipelineStep !== "done" && pipelineStep !== "error";

  return (
    <div className="space-y-5">
      {!hideUploadSection && (
        <>
          {/* Manual badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange/15 text-orange border border-orange/20">
              Manual Video
            </span>
            {brief.videoFormat && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {brief.videoFormat === "short" ? "Short" : "Long Video"}
              </span>
            )}
          </div>

          {/* Auto-processing progress banner */}
          {isPipelineActive && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-[13px] font-semibold text-primary">Processing video in background…</span>
              </div>
              <div className="flex items-center gap-1">
                {PIPELINE_STEPS.map((step, i) => {
                  const isComplete = step.briefKey ? !!brief[step.briefKey] : false;
                  const isActive = !isComplete && (
                    (step.key === "transcribing" && pipelineStep === "transcribing") ||
                    (step.key === "generating" && pipelineStep === "generating")
                  );
                  return (
                    <div key={`${step.label}-${i}`} className="flex items-center gap-1 flex-1">
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : isComplete
                            ? "bg-success/15 text-success"
                            : "bg-card text-muted-foreground"
                      }`}>
                        {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        {isComplete && <span className="text-success">✓</span>}
                        <span className="truncate">{step.label}</span>
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className={`h-px flex-1 min-w-2 ${isComplete ? "bg-success/30" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pipelineStep === "done" && (
            <div className="rounded-lg bg-success/5 border border-success/20 px-4 py-3 flex items-center gap-2">
              <span className="text-success text-[14px]">✓</span>
              <span className="text-[13px] font-medium text-success">All metadata generated automatically</span>
            </div>
          )}

          {pipelineStep === "error" && (
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-destructive text-[14px]">✕</span>
                <span className="text-[13px] font-medium text-destructive">Auto-processing failed</span>
              </div>
              {pipelineError && <p className="text-[11px] text-destructive/80 ml-5">{pipelineError}</p>}
              <button
                type="button"
                onClick={triggerBackgroundProcess}
                className="ml-5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Step 1: Upload Video */}
          <VideoUpload
            storyId={storyId}
            videoR2Key={brief.videoR2Key}
            videoFileName={brief.videoFileName}
            videoFileSize={brief.videoFileSize}
            videoThumbnailR2Url={brief.videoThumbnailR2Url}
            videoFormat={(brief.videoFormat as "short" | "long") || "long"}
            headline={brief.suggestedTitle ?? story.headline ?? ""}
            readOnly={isDone}
            required
            onVideoFormatChange={isDone ? undefined : (fmt) => {
              onBriefChange((b) => ({ ...b, videoFormat: fmt }));
            }}
            onUploadComplete={(data) => {
              onBriefChange((b) => ({
                ...b,
                videoR2Key: data.videoR2Key,
                videoR2Url: data.videoR2Url,
                videoFileName: data.videoFileName,
                videoFileSize: data.videoFileSize,
              }));
              triggerBackgroundProcess();
            }}
          />
        </>
      )}

      {/* Step 2: Transcribe */}
      <TranscriptSection
        storyId={storyId}
        brief={brief}
        onBriefChange={onBriefChange}
      />

      {/* Step 3: Title */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <span className="text-[12px] text-muted-foreground font-medium">Title</span>
          <div className="flex items-center gap-2">
            {brief.suggestedTitle && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(brief.suggestedTitle!);
                  setCopiedField("title");
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-muted-foreground font-medium transition-colors"
              >
                {copiedField === "title" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copiedField === "title" ? "Copied" : "Copy"}
              </button>
            )}
            <button
              type="button"
              onClick={generateTitle}
              disabled={generatingTitle || isPipelineActive || !brief.transcript}
              className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingTitle ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {generatingTitle ? "Generating…" : "AI Generate"}
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <input
            type="text"
            value={brief.suggestedTitle || ""}
            onChange={(e) => onBriefChange((b) => ({ ...b, suggestedTitle: e.target.value }))}
            placeholder="Video title…"
            className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            dir="auto"
          />
        </div>
      </div>

      {/* Step 4: Description */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <span className="text-[12px] text-muted-foreground font-medium">Description</span>
          <div className="flex items-center gap-2">
            {brief.youtubeDescription && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(brief.youtubeDescription!);
                  setCopiedField("desc");
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-muted-foreground font-medium transition-colors"
              >
                {copiedField === "desc" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copiedField === "desc" ? "Copied" : "Copy"}
              </button>
            )}
            <button
              type="button"
              onClick={generateDescription}
              disabled={generatingDesc || isPipelineActive || !brief.transcript}
              className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {generatingDesc ? "Generating…" : "AI Generate"}
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <textarea
            value={brief.youtubeDescription || ""}
            onChange={(e) => onBriefChange((b) => ({ ...b, youtubeDescription: e.target.value }))}
            placeholder="YouTube description…"
            rows={5}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none leading-relaxed"
            dir="auto"
          />
        </div>
      </div>

      {/* Step 5: Tags */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <span className="text-[12px] text-muted-foreground font-medium">Tags</span>
          <div className="flex items-center gap-2">
            {(brief.youtubeTags || []).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText((brief.youtubeTags || []).join(", "));
                  setCopiedField("tags");
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-muted-foreground font-medium transition-colors"
              >
                {copiedField === "tags" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copiedField === "tags" ? "Copied" : "Copy"}
              </button>
            )}
            <button
              type="button"
              onClick={generateTags}
              disabled={generatingTags || isPipelineActive || !brief.transcript}
              className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {generatingTags ? "Generating…" : "AI Generate"}
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
            {(brief.youtubeTags || []).map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-full bg-card border border-border text-muted-foreground"
              >
                #{tag}
                {!isDone && (
                  <button
                    type="button"
                    onClick={() =>
                      onBriefChange((b) => ({
                        ...b,
                        youtubeTags: (b.youtubeTags || []).filter((_, j) => j !== i),
                      }))
                    }
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!isDone && (
              <input
                type="text"
                placeholder="Add tag…"
                className="text-[11px] bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-w-[80px] flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.replace(/^#/, "").trim();
                    if (val) {
                      onBriefChange((b) => ({
                        ...b,
                        youtubeTags: [...(b.youtubeTags || []), val],
                      }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* SRT Download */}
      {brief.subtitlesSRT && (
        <div className="rounded-lg bg-card border border-border overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground font-medium">Subtitles (SRT)</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(brief.subtitlesSRT!).then(() => {
                    setSrtCopied(true);
                    setTimeout(() => setSrtCopied(false), 2000);
                  });
                }}
                className="text-[11px] text-muted-foreground hover:text-muted-foreground font-medium transition-colors"
              >
                {srtCopied ? "Copied!" : "Copy SRT"}
              </button>
              <button
                type="button"
                onClick={downloadSRT}
                className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Download .srt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YouTube URL */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <span className="text-[12px] text-muted-foreground font-medium">YouTube URL</span>
          {brief.youtubeUrl && (
            <a
              href={brief.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </a>
          )}
        </div>
        <div className="px-4 py-3 flex items-center gap-2">
          <input
            type="url"
            value={youtubeInput}
            onChange={(e) => setYoutubeInput(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 bg-transparent text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={saveYoutubeUrl}
            disabled={!youtubeInput.trim() || classifying}
            className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {classifying ? "Classifying…" : "Save"}
          </button>
        </div>
      </div>

      {/* Mark Done */}
      {story.stage !== "done" && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => onStageChange("done")}
            disabled={saving || isPipelineActive}
            className="w-full py-3 rounded-lg text-[14px] font-semibold bg-success text-success-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Mark as Done
          </button>
        </div>
      )}
    </div>
  );
}

export default function StoryDetail() {
  const { id, channelId } = useParams<{ id: string; channelId: string }>();
  const navigate = useNavigate();
  const channelPath = useChannelPath();

  const [brief, setBrief] = useState<StoryBrief>({});
  const [story, setStory] = useState<StoryWithLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSavingState] = useState(false);
  const scriptEditorRef = useRef<{ setContent: (v: string) => void } | null>(null);
  const [channelInfo, setChannelInfo] = useState<{ avatarUrl: string | null; name: string } | null>(null);

  const scriptValue = brief.script ?? "";

  // Refs for redirect (avoid effect re-running when navigate/channelPath identity changes)
  const navigateRef = useRef(navigate);
  const channelPathRef = useRef(channelPath);
  navigateRef.current = navigate;
  channelPathRef.current = channelPath;

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    fetch(`/api/channels/${channelId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setChannelInfo({
          avatarUrl: data.avatarUrl ?? null,
          name: data.nameEn || data.nameAr || data.handle || "",
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channelId]);

  // Load story (and brief) on mount so Yoopta content persists after refresh
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const MAX_RETRIES = 3;
    const fetchStory = async (attempt = 0): Promise<void> => {
      try {
        const res = await fetch(`/api/stories/${id}`, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 404) throw new Error("Story not found");
          throw new Error(`Server error (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setStory(data as StoryWithLog);
        const b = data.brief && typeof data.brief === "object" ? data.brief as StoryBrief : {};
        setBrief(b);
      } catch (err: any) {
        if (cancelled) return;
        if (err.message === "Story not found") {
          setStory(null);
          setBrief({});
          navigateRef.current(channelPathRef.current("/stories"), { replace: true });
          return;
        }
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          if (!cancelled) return fetchStory(attempt + 1);
          return;
        }
        setStory(null);
        setBrief({});
        toast.error("Failed to load story. Please refresh the page.");
      }
    };

    fetchStory().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveScriptTimeoutRef.current) clearTimeout(saveScriptTimeoutRef.current);
    };
  }, []);

  // Debounced save of script so refresh keeps content
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

  // ── Poll for background AI processing updates ──────────────────────────
  useEffect(() => {
    if (!id || brief.processingStatus !== "processing") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/stories/${id}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const serverBrief = data.brief && typeof data.brief === "object" ? data.brief as StoryBrief : {};
        setBrief((prev) => {
          const merged = { ...prev };
          if (serverBrief.transcript && !prev.transcript) merged.transcript = serverBrief.transcript;
          if (serverBrief.transcriptSegments && !prev.transcriptSegments) merged.transcriptSegments = serverBrief.transcriptSegments;
          if (serverBrief.subtitlesSRT && !prev.subtitlesSRT) merged.subtitlesSRT = serverBrief.subtitlesSRT;
          if (serverBrief.script && !prev.script) merged.script = serverBrief.script;
          if (serverBrief.suggestedTitle && !prev.suggestedTitle) merged.suggestedTitle = serverBrief.suggestedTitle;
          if (serverBrief.youtubeDescription && !prev.youtubeDescription) merged.youtubeDescription = serverBrief.youtubeDescription;
          if (serverBrief.youtubeTags?.length && !prev.youtubeTags?.length) merged.youtubeTags = serverBrief.youtubeTags;
          merged.processingStatus = serverBrief.processingStatus;
          merged.processingStep = serverBrief.processingStep;
          merged.processingError = serverBrief.processingError;
          return merged;
        });
        if (data.headline) setStory((s) => s && s.id === id ? { ...s, headline: data.headline } : s);
        if (serverBrief.processingStatus === "done") {
          toast.success("Video processed — all metadata generated");
        }
      } catch { /* silent */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, brief.processingStatus]);

  const activeStage: Stage = story?.stage ?? "scripting";
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
  const [researchOpen, setResearchOpen] = useState(true);
  const [stageStories, setStageStories] = useState<{ id: string; stage: string; createdAt: string }[]>([]);

  // Load all stories for prev/next navigation, grouped by stage then newest-first within each stage
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    fetch(`/api/stories?channelId=${channelId}&slim=true`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; stage: string; createdAt: string }[]) => {
        if (cancelled) return;
        const sorted = (list || []).slice().sort((a, b) => {
          const ai = NAV_STAGE_ORDER.indexOf(a.stage as Stage);
          const bi = NAV_STAGE_ORDER.indexOf(b.stage as Stage);
          const stageA = ai === -1 ? NAV_STAGE_ORDER.length : ai;
          const stageB = bi === -1 ? NAV_STAGE_ORDER.length : bi;
          if (stageA !== stageB) return stageA - stageB;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setStageStories(sorted);
      })
      .catch(() => {
        if (!cancelled) setStageStories([]);
      });
    return () => { cancelled = true; };
  }, [channelId]);

  useEffect(() => {
    if (story) {
      setResearchOpen(true);
    }
  }, [story?.id]);
  const stageIndex = id ? stageStories.findIndex((s) => s.id === id) : -1;
  const prevStory = stageIndex > 0 ? stageStories[stageIndex - 1] : null;
  const nextStory = stageIndex >= 0 && stageIndex < stageStories.length - 1 ? stageStories[stageIndex + 1] : null;
  const showStageNav = stageStories.length > 1 && stageIndex >= 0;
  const sameStageStories = stageStories.filter((s) => s.stage === activeStage);
  const withinStageIndex = id ? sameStageStories.findIndex((s) => s.id === id) : -1;
  const stageOrderIdx = STAGE_ORDER.indexOf(activeStage);
  const nextStageKey: Stage | null = stageOrderIdx >= 0 && stageOrderIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageOrderIdx + 1]! : null;
  const nextStageLabel = nextStageKey ? STAGES.find((s) => s.key === nextStageKey)?.label ?? null : null;
  const relativeDate = story?.sourceDate || story?.createdAt
    ? formatDistanceToNow(new Date((story?.sourceDate || story?.createdAt) ?? ""), { addSuffix: true })
    : null;
  const fmt = (n?: number) =>
    !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);

  const moveToStage = useCallback(
    async (toStage: Stage) => {
      if (!id) return;
      if (activeStage === "filmed" && toStage === "publish" && !brief.videoR2Key) {
        toast.error("Upload a video before moving to Publish");
        return;
      }
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
    [id, activeStage, brief.videoR2Key]
  );

  const generateScript = useCallback(async () => {
    if (!id || !channelId) { toast.error("No story ID"); return; }
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
          channelId,
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
      const generatedScript = sections.script || fullText.trim();
      if (scriptEditorRef.current) {
        scriptEditorRef.current.setContent(generatedScript);
      }
      setBrief((b) => {
        const next: StoryBrief = {
          ...b,
          suggestedTitle: sections.title || b.suggestedTitle,
          openingHook: sections.hook || b.openingHook,
          hookStart: sections.hookStart,
          script: generatedScript,
          hookEnd: sections.hookEnd,
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
  }, [id, channelId, scriptDurationMinutes, generatingScript, saveScript]);

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
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <Link to={channelPath("/stories")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground bg-transparent border-none font-sans hover:text-foreground transition-colors no-underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (!story) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <Link to={channelPath("/stories")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground bg-transparent border-none font-sans hover:text-foreground transition-colors no-underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] text-muted-foreground font-mono">Story not found</span>
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
          compositeScore={story.compositeScore}
          onBack={() => navigate(channelPath("/stories"))}
          onMoveToNextStage={() => nextStageKey && moveToStage(nextStageKey)}
          onPass={() => moveToStage("skip")}
          onRestart={() => moveToStage("suggestion")}
          onOmit={() => moveToStage("trash")}
          onHistoryClick={() => setHistoryOpen(true)}
          prevNext={showStageNav ? {
            currentIndex: withinStageIndex >= 0 ? withinStageIndex + 1 : stageIndex + 1,
            total: sameStageStories.length > 0 ? sameStageStories.length : stageStories.length,
            onPrev: () => prevStory && navigate(channelPath(`/story/${(prevStory as { id: string }).id}`)),
            onNext: () => nextStory && navigate(channelPath(`/story/${(nextStory as { id: string }).id}`)),
            hasPrev: !!prevStory,
            hasNext: !!nextStory,
          } : undefined}
        />

        {/* Edit History modal */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setHistoryOpen(false)}>
            <div
              className="w-full max-w-lg rounded-lg bg-card border border-border overflow-hidden shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                <span className="text-[13px] font-medium">Edit History</span>
                <button type="button" onClick={() => setHistoryOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {story.linkedArticleId && (
                <Link
                  to={channelPath(`/article/${story.linkedArticleId}`)}
                  className="flex items-center gap-2.5 px-5 py-3 border-b border-border text-[12px] font-medium text-primary hover:bg-primary/5 transition-colors no-underline"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  View Article Pipeline Log
                </Link>
              )}
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
                        <div className="w-0.5 h-8 bg-primary/30 rounded-full shrink-0" />
                        <div className="min-w-0">
                          <span className="text-muted-foreground text-[11px]">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</span>
                          <span className="text-muted-foreground text-[11px]"> · {actionLabel}</span>
                          {entry.note && entry.action !== "stage_change" && <span className="font-mono text-[11px] text-muted-foreground ml-1">{entry.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground text-[12px] font-medium truncate max-w-[120px]">{entry.user?.name ?? "—"}</span>
                        {entry.user?.avatarUrl ? (
                          <img src={entry.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-[10px] font-mono text-muted-foreground">{entry.user?.name?.[0] ?? "?"}</div>
                        )}
                      </div>
                    </div>
                  )})
                ) : (
                  <EmptyState icon={History} title="No edit history yet" />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <div className="max-w-[1000px] mx-auto px-16 max-lg:px-10 max-sm:px-4 py-5 pb-16 space-y-5">
            {/* ── MANUAL STORY LAYOUT ─────────────────────────────────── */}
            {story.origin === "manual" ? (
              <ManualStoryWorkflow
                story={story}
                brief={brief}
                storyId={id!}
                saving={saving}
                onBriefChange={(updater) => {
                  setBrief((b) => {
                    const next = updater(b);
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
                onStageChange={(stage) => moveToStage(stage)}
              />
            ) : (
            <>
            {(activeStage === "filmed" || activeStage === "publish" || activeStage === "done") && (
              <VideoUpload
                storyId={id}
                videoR2Key={brief.videoR2Key}
                videoFileName={brief.videoFileName}
                videoFileSize={brief.videoFileSize}
                videoThumbnailR2Url={brief.videoThumbnailR2Url}
                videoFormat={(brief.videoFormat as "short" | "long") || "long"}
                headline={brief.articleTitle ?? story.headline ?? ""}
                readOnly={activeStage === "done"}
                required={activeStage === "filmed"}
                onVideoFormatChange={activeStage !== "done" ? (fmt) => {
                  setBrief((b) => {
                    const next = { ...b, videoFormat: fmt };
                    if (id) saveScript(id, next);
                    return next;
                  });
                } : undefined}
                onUploadComplete={(data) => {
                  setBrief((b) => {
                    const next = {
                      ...b,
                      videoR2Key: data.videoR2Key,
                      videoR2Url: data.videoR2Url,
                      videoFileName: data.videoFileName,
                      videoFileSize: data.videoFileSize,
                      processingStatus: "processing",
                      processingStep: "transcribing",
                      processingError: null,
                    };
                    if (id) saveScript(id, next);
                    return next;
                  });
                  if (id) {
                    fetch(`/api/stories/${id}/process`, { method: "POST", credentials: "include" }).catch(() => {});
                  }
                }}
              />
            )}

            {/* Auto-processing progress for filmed stage */}
            {activeStage === "filmed" && brief.videoR2Key && brief.processingStatus === "processing" && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-[13px] font-semibold text-primary">Processing video…</span>
                </div>
                <div className="flex items-center gap-1">
                  {PIPELINE_STEPS.map((step, i) => {
                    const isComplete = step.briefKey ? !!brief[step.briefKey] : false;
                    const isActive = !isComplete && (
                      (step.key === "transcribing" && brief.processingStep === "transcribing") ||
                      (step.key === "generating" && brief.processingStep === "generating")
                    );
                    return (
                      <div key={`${step.label}-${i}`} className="flex items-center gap-1 flex-1">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                          isActive ? "bg-primary/15 text-primary" : isComplete ? "bg-success/15 text-success" : "bg-card text-muted-foreground"
                        }`}>
                          {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          {isComplete && <span className="text-success">✓</span>}
                          <span className="truncate">{step.label}</span>
                        </div>
                        {i < PIPELINE_STEPS.length - 1 && (
                          <div className={`h-px flex-1 min-w-2 ${isComplete ? "bg-success/30" : "bg-border"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeStage === "filmed" && brief.videoR2Key && brief.processingStatus === "done" && (
              <div className="rounded-lg bg-success/5 border border-success/20 px-4 py-3 flex items-center gap-2">
                <span className="text-success text-[14px]">✓</span>
                <span className="text-[13px] font-medium text-success">Video processed — metadata ready for publish</span>
              </div>
            )}

            {activeStage === "filmed" && brief.processingStatus === "error" && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-destructive text-[14px]">✕</span>
                  <span className="text-[13px] font-medium text-destructive">Processing failed</span>
                </div>
                {brief.processingError && <p className="text-[11px] text-destructive/80 ml-5">{brief.processingError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    if (!id) return;
                    setBrief((b) => ({ ...b, processingStatus: "processing", processingStep: "transcribing", processingError: null }));
                    fetch(`/api/stories/${id}/process`, { method: "POST", credentials: "include" }).catch(() => {});
                  }}
                  className="ml-5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            )}


            {activeStage === "scripting" && (
              <StoryDetailScriptSection
                key={id}
                scriptDuration={scriptDurationMinutes}
                onScriptDurationChange={(mins) => {
                  setScriptDurationMinutes(mins);
                  setBrief((b) => {
                    const next = { ...b, scriptDuration: mins };
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
                canGenerate={scriptDurationMinutes > 0}
                generating={generatingScript}
                onGenerate={generateScript}
                readOnly={false}
                showGenerateControls
                scriptValue={scriptValue}
                saving={saving}
                scriptRef={scriptEditorRef}
                videoFormat={brief.videoFormat || "long"}
                channelAvatarUrl={channelInfo?.avatarUrl}
                channelName={channelInfo?.name}
                onScriptChange={(value) => {
                  setBrief((b) => {
                    const next: StoryBrief = { ...b, script: value };
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
              />
            )}

            <StoryDetailResearch
              research={brief.research}
              researchOpen={researchOpen}
              onResearchOpenChange={setResearchOpen}
              storyId={id}
              sourceUrl={story?.sourceUrl}
              onDataRefresh={async () => {
                const res = await fetch(`/api/stories/${id}`, { credentials: "include" });
                if (res.ok) {
                  const data = await res.json();
                  setStory(data as StoryWithLog);
                  const b = data.brief && typeof data.brief === "object" ? data.brief as StoryBrief : {};
                  setBrief(b);
                }
              }}
            />


          {/* Stage-specific content */}
          <div className="space-y-5">

            {activeStage === "skip" && (
              <StoryDetailStagePassed onMoveBack={() => moveToStage("suggestion")} />
            )}

            {activeStage === "trash" && (
              <StoryDetailStageOmit onMoveBack={() => moveToStage("suggestion")} />
            )}

            {/* ── SCRIPTING / FILMED / DONE (Yoopta script editor) ───────── */}
            {(activeStage === "filmed" || activeStage === "done") && (
              <StoryDetailScriptSection
                key={id}
                scriptDuration={scriptDurationMinutes}
                onScriptDurationChange={(mins) => {
                  setScriptDurationMinutes(mins);
                  setBrief((b) => {
                    const next = { ...b, scriptDuration: mins };
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
                canGenerate={scriptDurationMinutes > 0}
                generating={generatingScript}
                onGenerate={generateScript}
                readOnly={activeStage !== "filmed"}
                showGenerateControls={false}
                scriptValue={scriptValue}
                saving={saving}
                scriptRef={scriptEditorRef}
                videoFormat={brief.videoFormat || "long"}
                channelAvatarUrl={channelInfo?.avatarUrl}
                channelName={channelInfo?.name}
                onScriptChange={(value) => {
                  setBrief((b) => {
                    const next: StoryBrief = { ...b, script: value };
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
              />
            )}

            {/* ── PUBLISH (transcript, title, description, tags, srt, youtube url, mark done) ───────── */}
            {activeStage === "publish" && id && (
              <ManualStoryWorkflow
                story={story}
                brief={brief}
                storyId={id}
                saving={saving}
                hideUploadSection
                onBriefChange={(updater) => {
                  setBrief((b) => {
                    const next = updater(b);
                    if (id) saveScript(id, next);
                    return next;
                  });
                }}
                onStageChange={(stage) => moveToStage(stage)}
              />
            )}

            {/* ── DONE ──────────────────────────────────────────────────── */}
            {activeStage === "done" && (
              <>
                {brief.gapWin && (
                  <div className="rounded-lg bg-success/10 border border-success/20 px-5 py-4 flex items-center gap-3">
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
                    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                      Produced
                    </span>
                    {brief.producedFormats.map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary"
                      >
                        {f === "short" ? "Short" : "Long Video"}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">
                    Video Performance
                  </div>
                  <div className="flex rounded-lg overflow-hidden">
                    {[
                      { icon: Eye,            val: brief.views,    label: "Views" },
                      { icon: ThumbsUp,       val: brief.likes,    label: "Likes" },
                      { icon: MessageSquare,  val: brief.comments, label: "Comments" },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="flex-1 px-4 py-3 bg-card border-r border-background last:border-r-0"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">
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
                  <div className="rounded-lg bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                        YouTube Video URL
                      </label>
                      <div className="flex items-center gap-2">
                        {!editingYoutubeUrl && (
                          <>
                            <a
                              href={brief.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80 transition-opacity"
                            >
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                            <button
                              onClick={() => {}}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-muted-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        {editingYoutubeUrl && (
                          <button
                            onClick={() => {}}
                            className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
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
                        className="w-full px-4 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                      />
                    ) : (
                      <div className="rounded-lg bg-card px-4 py-2.5 text-[13px] font-mono text-muted-foreground truncate">
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
                    <div className="rounded-lg bg-card p-5 space-y-3">
                      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                        Produce Another Format
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        This story performed well. Produce it in another format to maximize reach.
                      </p>
                      <div className="flex gap-2">
                        {canShort && (
                          <button
                            onClick={() => {}}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Short
                          </button>
                        )}
                        {canLong && (
                          <button
                            onClick={() => {}}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity"
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
            </>
            )}
        </div>
      </div>
    </div>
  );
}

