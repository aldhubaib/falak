import { Ban } from "lucide-react";

export interface StoryDetailStageSuggestionProps {
  onSaveToLiked?: () => void;
  onPass?: () => void;
  onOmit?: () => void;
}

export function StoryDetailStageSuggestion({
  onOmit,
}: StoryDetailStageSuggestionProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
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
