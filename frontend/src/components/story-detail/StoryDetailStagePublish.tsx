import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Globe,
  Lock,
  EyeOff,
  X,
  ImagePlus,
} from "lucide-react";
import { toast } from "sonner";
import type { StoryBrief } from "./types";
import { CopyBtn } from "./CopyBtn";

export interface StoryDetailStagePublishProps {
  brief: StoryBrief;
  storyId: string;
  onBriefChange: (updater: (prev: StoryBrief) => StoryBrief) => void;
  saving?: boolean;
}

const VISIBILITY_OPTIONS: {
  value: "public" | "unlisted" | "private";
  label: string;
  icon: typeof Globe;
  desc: string;
}[] = [
  { value: "public", label: "Public", icon: Globe, desc: "Everyone can see" },
  { value: "unlisted", label: "Unlisted", icon: EyeOff, desc: "Only people with link" },
  { value: "private", label: "Private", icon: Lock, desc: "Only you" },
];

export function StoryDetailStagePublish({
  brief,
  storyId,
  onBriefChange,
  saving = false,
}: StoryDetailStagePublishProps) {
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const isShort = brief.videoFormat === "short";
  const title = brief.suggestedTitle || "";
  const description = brief.youtubeDescription || "";
  const tags = brief.youtubeTags || [];
  const visibility = brief.visibility || "public";

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

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    if (tags.join(",").length + t.length + 1 > 500) {
      toast.error("Tags limit reached (500 characters)");
      return;
    }
    onBriefChange((b) => ({ ...b, youtubeTags: [...(b.youtubeTags || []), t] }));
  };

  const removeTag = (tag: string) => {
    onBriefChange((b) => ({
      ...b,
      youtubeTags: (b.youtubeTags || []).filter((t) => t !== tag),
    }));
  };

  const tagCharsUsed = tags.join(",").length;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
          Publish Details
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue">
          {isShort ? "Short" : "Long Video"}
        </span>
        {saving && (
          <span className="flex items-center gap-1 text-[11px] text-dim">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* ── Title ── */}
      <div className="rounded-xl bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-dim font-medium">Title</label>
          <CopyBtn text={title} />
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) =>
            onBriefChange((b) => ({ ...b, suggestedTitle: e.target.value }))
          }
          placeholder="Video title…"
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors"
        />
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

      {/* ── Tags ── */}
      <div className="rounded-xl bg-background border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-dim font-medium">Tags</label>
          <span className="text-[10px] text-dim font-mono">{tagCharsUsed}/500</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface border border-border text-[11px] text-foreground font-mono"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-dim hover:text-foreground transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
                setTagInput("");
              }
            }}
            placeholder="Add tag, press Enter…"
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 transition-colors"
          />
        </div>
      </div>

      {/* ── Thumbnail (Long video only) ── */}
      {!isShort && (
        <div className="rounded-xl bg-background border border-border p-4">
          <label className="text-[12px] text-dim font-medium mb-2 block">Thumbnail</label>
          <div className="flex items-center justify-center border-2 border-dashed border-border rounded-lg py-8 text-dim hover:border-blue/30 transition-colors cursor-pointer">
            <div className="text-center">
              <ImagePlus className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <span className="text-[12px]">Upload thumbnail</span>
              <span className="block text-[10px] mt-0.5 opacity-60">
                Recommended: 1280x720
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Visibility ── */}
      <div className="rounded-xl bg-background border border-border p-4">
        <label className="text-[12px] text-dim font-medium mb-2 block">Visibility</label>
        <div className="flex gap-2">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onBriefChange((b) => ({ ...b, visibility: opt.value }))
              }
              className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                visibility === opt.value
                  ? "bg-blue/10 border-blue/30 text-blue"
                  : "bg-surface border-border text-dim hover:text-foreground hover:bg-elevated"
              }`}
            >
              <opt.icon className="w-4 h-4" />
              <span className="text-[11px] font-medium">{opt.label}</span>
              <span className="text-[9px] opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary (what will be published) ── */}
      <div className="rounded-xl bg-surface border border-border p-4">
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
          Ready to Copy
        </div>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-dim">Title</span>
            <span className={title ? "text-success" : "text-orange"}>
              {title ? "Ready" : "Missing"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dim">Description</span>
            <span className={description ? "text-success" : "text-orange"}>
              {description ? "Ready" : "Not generated"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dim">Tags</span>
            <span className={tags.length > 0 ? "text-success" : "text-orange"}>
              {tags.length > 0 ? `${tags.length} tags` : "None"}
            </span>
          </div>
          {!isShort && (
            <div className="flex items-center justify-between">
              <span className="text-dim">Thumbnail</span>
              <span className="text-orange">Upload needed</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-dim">Visibility</span>
            <span className="text-success capitalize">{visibility}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
