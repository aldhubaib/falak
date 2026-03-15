export interface StoryDetailStageSuggestionProps {
  onSaveToLiked: () => void;
  onPass: () => void;
}

export function StoryDetailStageSuggestion({
  onSaveToLiked,
  onPass,
}: StoryDetailStageSuggestionProps) {
  return (
    <div className="flex gap-2 flex-wrap">
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
    </div>
  );
}
