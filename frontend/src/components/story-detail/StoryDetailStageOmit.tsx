export interface StoryDetailStageOmitProps {
  onMoveBack: () => void;
}

export function StoryDetailStageOmit({ onMoveBack }: StoryDetailStageOmitProps) {
  return (
    <div className="rounded-lg bg-background p-5">
      <p className="text-[13px] text-muted-foreground mb-4">
        Not enough data to produce this video. Omitted from pipeline.
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
