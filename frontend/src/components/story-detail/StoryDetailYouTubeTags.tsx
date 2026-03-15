import { Copy, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface StoryDetailYouTubeTagsProps {
  tags: string[] | undefined;
  suggesting: boolean;
  onSuggest: () => Promise<void>;
}

export function StoryDetailYouTubeTags({
  tags,
  suggesting,
  onSuggest,
}: StoryDetailYouTubeTagsProps) {
  const hasTags = tags && tags.length > 0;
  return (
    <div className="rounded-xl bg-background border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border flex-wrap">
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
          YOUTUBE TAGS
        </span>
        <button
          type="button"
          onClick={() => onSuggest()}
          disabled={suggesting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:opacity-50"
          title="Generate at least 5 suggested tags from headline and script"
        >
          {suggesting ? (
            <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 shrink-0" />
          )}
          Suggest tags
        </button>
      </div>
      {hasTags ? (
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {tags!.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full bg-elevated text-[12px] text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const str = tags!.join(", ");
              navigator.clipboard
                .writeText(str)
                .then(() => toast.success("Tags copied"))
                .catch(() => toast.error("Copy failed"));
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy as comma-separated
          </button>
        </div>
      ) : (
        <div className="px-5 py-4">
          <p className="text-[12px] text-dim text-center mb-0">
            Get AI-suggested tags (min 5) for YouTube. Use after you have a headline or script.
          </p>
        </div>
      )}
    </div>
  );
}
