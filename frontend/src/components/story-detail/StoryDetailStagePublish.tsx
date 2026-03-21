import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  Subtitles,
  Link as LinkIcon,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import type { StoryBrief } from "./types";
import { CopyBtn } from "./CopyBtn";
import { extractScriptBlocks, editorValueToScriptText } from "@/data/editorInitialValue";
import { scriptToSRT } from "@/data/subtitles";

export interface StoryDetailStagePublishProps {
  brief: StoryBrief;
  storyId: string;
  onBriefChange: (updater: (prev: StoryBrief) => StoryBrief) => void;
  saving?: boolean;
}

function validateYoutubeUrl(url: string): { valid: boolean; videoId?: string; error?: string } {
  if (!url) return { valid: false };
  try {
    const u = new URL(url);
    if (!["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"].includes(u.hostname)) {
      return { valid: false, error: "Not a YouTube URL" };
    }
    let videoId: string | null = null;
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("/")[0] || null;
    } else if (u.pathname.startsWith("/watch")) {
      videoId = u.searchParams.get("v");
    } else if (u.pathname.startsWith("/shorts/")) {
      videoId = u.pathname.split("/")[2] || null;
    } else if (u.pathname.startsWith("/live/")) {
      videoId = u.pathname.split("/")[2] || null;
    }
    if (!videoId) {
      return { valid: false, error: "Not a YouTube video URL (use /watch, /shorts, or youtu.be)" };
    }
    return { valid: true, videoId };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

export function StoryDetailStagePublish({
  brief,
  storyId,
  onBriefChange,
  saving = false,
}: StoryDetailStagePublishProps) {
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [fetchingSubs, setFetchingSubs] = useState(false);
  const [urlInput, setUrlInput] = useState(brief.youtubeUrl || "");
  const [urlEditing, setUrlEditing] = useState(!brief.youtubeUrl);

  const description = brief.youtubeDescription || "";

  const scriptText = useMemo(() => {
    const blocks = extractScriptBlocks(brief.scriptTiptap);
    if (blocks.script) return blocks.script;
    const allText = editorValueToScriptText(brief.scriptTiptap);
    if (allText && /^\d{1,2}:\d{2}/m.test(allText)) return allText;
    if (brief.script) return brief.script;
    if (brief.scriptRaw) {
      const match = brief.scriptRaw.match(/## SCRIPT\s*\n([\s\S]*?)(?=\n## |$)/i);
      if (match) return match[1].trim();
      return brief.scriptRaw;
    }
    return "";
  }, [brief.scriptTiptap, brief.script, brief.scriptRaw]);

  const scriptSrt = useMemo(() => scriptToSRT(scriptText), [scriptText]);
  const srtContent = brief.subtitlesSRT || scriptSrt;

  const fetchSubtitles = async () => {
    if (fetchingSubs) return;
    setFetchingSubs(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/fetch-subtitles`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch subtitles" }));
        toast.error(err.error || "Failed to fetch subtitles");
        return;
      }
      const data = await res.json();
      onBriefChange((b) => ({ ...b, subtitlesSRT: data.srt }));
      toast.success("Subtitles fetched from YouTube");
    } catch {
      toast.error("Failed to fetch subtitles");
    } finally {
      setFetchingSubs(false);
    }
  };

  const downloadSRT = () => {
    if (!srtContent) {
      toast.error("No timestamped script found to generate subtitles");
      return;
    }
    const bom = "\uFEFF";
    const blob = new Blob([bom + srtContent], { type: "text/srt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(brief.suggestedTitle || "subtitles").replace(/[^\w\s\u0600-\u06FF-]/g, "").trim()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateDescription = async () => {
    if (generatingDesc) return;
    setGeneratingDesc(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/generate-description`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        toast.error(err.error || "Failed to generate description");
        return;
      }
      const data = await res.json();
      onBriefChange((b) => ({ ...b, youtubeDescription: data.description }));
      toast.success("Description generated");
    } catch {
      toast.error("Failed to generate description");
    } finally {
      setGeneratingDesc(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
          Publish Details
        </span>
        {saving && (
          <span className="flex items-center gap-1 text-[11px] text-dim">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* ── Description ── */}
      <div className="rounded-lg bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-dim font-medium">Description</label>
          <div className="flex items-center gap-2">
            {description && <CopyBtn text={description} />}
            <button
              type="button"
              onClick={generateDescription}
              disabled={generatingDesc}
              className="flex items-center gap-1 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors disabled:opacity-50"
            >
              {generatingDesc ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {description ? "Regenerate" : "Generate with AI"}
            </button>
          </div>
        </div>
        <textarea
          value={description}
          onChange={(e) =>
            onBriefChange((b) => ({ ...b, youtubeDescription: e.target.value }))
          }
          placeholder="YouTube description… Click 'Generate with AI' to auto-create from your script."
          rows={6}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors resize-y leading-relaxed"
        />
      </div>

      {/* ── Subtitles (SRT) ── */}
      <div className="rounded-lg bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Subtitles className="w-3.5 h-3.5 text-dim" />
            <label className="text-[12px] text-dim font-medium">Subtitles</label>
            {brief.subtitlesSRT && (
              <span className="text-[10px] font-mono text-success/70 bg-success/10 px-1.5 py-0.5 rounded">YouTube</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSubtitles}
              disabled={fetchingSubs}
              className="flex items-center gap-1.5 text-[11px] text-foreground/70 hover:text-foreground font-medium transition-colors disabled:opacity-50"
            >
              {fetchingSubs ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Youtube className="w-3 h-3" />
              )}
              {fetchingSubs ? "Fetching…" : brief.subtitlesSRT ? "Refetch" : "Fetch from YouTube"}
            </button>
            <button
              type="button"
              onClick={downloadSRT}
              disabled={!srtContent}
              className="flex items-center gap-1.5 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3" />
              Download .srt
            </button>
          </div>
        </div>
        {srtContent ? (
          <pre className="bg-card border border-border rounded-lg px-3 py-2 text-[11px] text-foreground/80 font-mono leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap">
            {srtContent}
          </pre>
        ) : (
          <p className="text-[12px] text-dim py-3 text-center">
            No subtitles yet. Click &quot;Fetch from YouTube&quot; or generate a timestamped script.
          </p>
        )}
      </div>

      {/* ── YouTube Video URL ── */}
      <div className="rounded-lg bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-dim" />
            <label className="text-[12px] text-dim font-medium">YouTube Video URL</label>
          </div>
          <div className="flex items-center gap-2">
            {brief.youtubeUrl && (
              <a
                href={brief.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="url"
              dir="ltr"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={!urlEditing}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const trimmed = urlInput.trim();
                  if (!trimmed) {
                    onBriefChange((b) => ({ ...b, youtubeUrl: "" }));
                    setUrlEditing(false);
                    return;
                  }
                  const result = validateYoutubeUrl(trimmed);
                  if (result.valid) {
                    onBriefChange((b) => ({ ...b, youtubeUrl: trimmed }));
                    toast.success("YouTube URL saved");
                    setUrlEditing(false);
                  } else {
                    toast.error(result.error || "Invalid URL");
                  }
                }
              }}
              placeholder="Paste YouTube video URL…"
              className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors ${!urlEditing ? "opacity-70 cursor-default" : ""}`}
            />
            {urlInput && (() => {
              const result = validateYoutubeUrl(urlInput.trim());
              if (result.valid) {
                return <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />;
              }
              if (result.error) {
                return <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange" />;
              }
              return null;
            })()}
          </div>
          {urlEditing ? (
            <button
              type="button"
              onClick={() => {
                const trimmed = urlInput.trim();
                if (!trimmed) {
                  onBriefChange((b) => ({ ...b, youtubeUrl: "" }));
                  setUrlEditing(false);
                  return;
                }
                const result = validateYoutubeUrl(trimmed);
                if (result.valid) {
                  onBriefChange((b) => ({ ...b, youtubeUrl: trimmed }));
                  toast.success("YouTube URL saved");
                  setUrlEditing(false);
                } else {
                  toast.error(result.error || "Invalid URL");
                }
              }}
              className="shrink-0 px-4 py-2 rounded-lg bg-blue text-white text-[12px] font-medium hover:bg-blue/90 transition-colors"
            >
              Save
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setUrlEditing(true)}
              className="shrink-0 px-4 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground hover:bg-elevated transition-colors"
            >
              Edit
            </button>
          )}
        </div>
        {urlEditing && urlInput && !validateYoutubeUrl(urlInput.trim()).valid && validateYoutubeUrl(urlInput.trim()).error && (
          <p className="text-[11px] text-orange mt-1.5">
            {validateYoutubeUrl(urlInput.trim()).error}
          </p>
        )}
      </div>

    </section>
  );
}
