import { Ban } from "lucide-react";

export interface StoryDetailStageSuggestionProps {
  onSaveToLiked: () => void;
  onPass: () => void;
  onOmit?: () => void;
}

export function StoryDetailStageSuggestion({
  onSaveToLiked,
  onPass,
  onOmit,
}: StoryDetailStageSuggestionProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <button
        type="button"
        onClick={onSaveToLiked}
        className="flex-1 min-w-[120px] px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
      >
        Save to Liked
      </button>
      <button
        type="button"
        onClick={onPass}
        className="link flex-1 min-w-[100px] px-4 py-2.5 text-[13px] font-medium rounded-full border border-border"
      >
        Pass
      </button>
      {onOmit && (
        <button
          type="button"
          onClick={onOmit}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0"
          title="Omit"
        >
          <Ban className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
