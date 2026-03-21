export interface StoryDetailStagePassedProps {
  onMoveBack: () => void;
}

export function StoryDetailStagePassed({ onMoveBack }: StoryDetailStagePassedProps) {
  return (
    <div className="rounded-lg bg-card p-5">
      <p className="text-[13px] text-muted-foreground mb-4">
        You skipped this story. It won't appear in your active pipeline.
      </p>
      <button
        type="button"
        onClick={onMoveBack}
        className="link px-4 py-2.5 text-[13px] font-medium rounded-full border border-border"
      >
        Move back to AI Suggestion
      </button>
    </div>
  );
}
