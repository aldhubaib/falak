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
} from "lucide-react";
import { toast } from "sonner";
import type { StoryBrief } from "./types";
import { CopyBtn } from "./CopyBtn";
import { extractScriptBlocks } from "@/data/editorInitialValue";
import { scriptToSRT } from "@/data/subtitles";

export interface StoryDetailStagePublishProps {
  brief: StoryBrief;
  storyId: string;
  onBriefChange: (updater: (prev: StoryBrief) => StoryBrief) => void;
  saving?: boolean;
  channelHandle?: string;
}

function validateYoutubeUrl(url: string, channelHandle?: string): { valid: boolean; error?: string } {
  if (!url) return { valid: false };
  try {
    const u = new URL(url);
    if (!["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"].includes(u.hostname)) {
      return { valid: false, error: "Not a YouTube URL" };
    }
    if (channelHandle) {
      const handle = channelHandle.replace(/^@/, "").toLowerCase();
      const urlLower = url.toLowerCase();
      if (!urlLower.includes(`/@${handle}/`) && !urlLower.includes(`/@${handle}?`) && !urlLower.includes(`/@${handle}\n`) && !urlLower.includes(`/channel/`)) {
        return { valid: false, error: `URL must be from @${channelHandle.replace(/^@/, "")}` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

export function StoryDetailStagePublish({
  brief,
  storyId,
  onBriefChange,
  saving = false,
  channelHandle,
}: StoryDetailStagePublishProps) {
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [urlInput, setUrlInput] = useState(brief.youtubeUrl || "");

  const description = brief.youtubeDescription || "";

  const scriptText = useMemo(() => {
    const blocks = extractScriptBlocks(brief.scriptTiptap);
    return blocks.script || brief.script || "";
  }, [brief.scriptTiptap, brief.script]);

  const srtContent = useMemo(() => scriptToSRT(scriptText), [scriptText]);

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
      <div className="rounded-xl bg-background border border-border p-4">
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
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors resize-y leading-relaxed"
        />
      </div>

      {/* ── Subtitles (SRT) ── */}
      <div className="rounded-xl bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Subtitles className="w-3.5 h-3.5 text-dim" />
            <label className="text-[12px] text-dim font-medium">Subtitles</label>
          </div>
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
        {srtContent ? (
          <pre className="bg-surface border border-border rounded-lg px-3 py-2 text-[11px] text-foreground/80 font-mono leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap">
            {srtContent}
          </pre>
        ) : (
          <p className="text-[12px] text-dim py-3 text-center">
            No timestamped script available. Generate a script first.
          </p>
        )}
      </div>

      {/* ── YouTube Video URL ── */}
      <div className="rounded-xl bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-dim" />
            <label className="text-[12px] text-dim font-medium">YouTube Video URL</label>
            {channelHandle && (
              <span className="text-[10px] text-dim font-mono">
                @{channelHandle.replace(/^@/, "")} only
              </span>
            )}
          </div>
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
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="url"
              dir="ltr"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onBlur={() => {
                const trimmed = urlInput.trim();
                if (!trimmed) {
                  onBriefChange((b) => ({ ...b, youtubeUrl: "" }));
                  return;
                }
                const result = validateYoutubeUrl(trimmed, channelHandle);
                if (result.valid) {
                  onBriefChange((b) => ({ ...b, youtubeUrl: trimmed }));
                  toast.success("YouTube URL saved");
                } else {
                  toast.error(result.error || "Invalid URL");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder={channelHandle ? `Paste YouTube URL from @${channelHandle.replace(/^@/, "")}…` : "Paste YouTube video URL…"}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors"
            />
            {urlInput && (() => {
              const result = validateYoutubeUrl(urlInput.trim(), channelHandle);
              if (result.valid) {
                return <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />;
              }
              if (result.error) {
                return <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange" />;
              }
              return null;
            })()}
          </div>
        </div>
        {urlInput && !validateYoutubeUrl(urlInput.trim(), channelHandle).valid && validateYoutubeUrl(urlInput.trim(), channelHandle).error && (
          <p className="text-[11px] text-orange mt-1.5">
            {validateYoutubeUrl(urlInput.trim(), channelHandle).error}
          </p>
        )}
      </div>

    </section>
  );
}
