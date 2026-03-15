import { ArrowLeft, ArrowRight } from "lucide-react";

export interface StorySummary {
  id: string;
  headline: string;
}

export interface StoryDetailPrevNextProps {
  prevStory: StorySummary | null;
  nextStory: StorySummary | null;
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function StoryDetailPrevNext({
  prevStory,
  nextStory,
  currentIndex,
  total,
  onPrev,
  onNext,
}: StoryDetailPrevNextProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={!prevStory}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-[13px] font-medium text-dim hover:text-sensor hover:border-sensor/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        title={prevStory ? `Previous: ${prevStory.headline.slice(0, 40)}…` : "No previous"}
      >
        <ArrowLeft className="w-4 h-4" />
        Previous
      </button>
      <span className="text-[11px] font-mono text-dim">
        {currentIndex + 1} / {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!nextStory}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-[13px] font-medium text-dim hover:text-sensor hover:border-sensor/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        title={nextStory ? `Next: ${nextStory.headline.slice(0, 40)}…` : "No next"}
      >
        Next
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
