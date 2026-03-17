import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  Subtitles,
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
}

export function StoryDetailStagePublish({
  brief,
  storyId,
  onBriefChange,
  saving = false,
}: StoryDetailStagePublishProps) {
  const [generatingDesc, setGeneratingDesc] = useState(false);

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

    </section>
  );
}
