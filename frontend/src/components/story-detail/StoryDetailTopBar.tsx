import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface StoryDetailTopBarProps {
  stageLabel: string;
  saving?: boolean;
  onBack: () => void;
  /** Compact prev/next in header: currentIndex (1-based), total, onPrev, onNext */
  prevNext?: {
    currentIndex: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

export function StoryDetailTopBar({
  stageLabel,
  saving = false,
  onBack,
  prevNext,
}: StoryDetailTopBarProps) {
  return (
    <div className="flex items-center justify-between px-6 max-sm:px-3 border-b border-pageBorder shrink-0 max-lg:px-4 py-2.5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors"
        type="button"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span className="max-sm:hidden">AI Intelligence</span>
      </button>
      <div className="flex items-center gap-1.5 max-sm:gap-1 flex-wrap justify-end">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-dim" />}
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/15 text-primary">
          {stageLabel}
        </span>
        {prevNext && prevNext.total > 0 && (
          <div className="flex items-center gap-0.5 ml-1 max-sm:ml-0">
            <button
              type="button"
              onClick={prevNext.onPrev}
              disabled={!prevNext.hasPrev}
              className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono text-dim px-0.5">
              {prevNext.currentIndex}/{prevNext.total}
            </span>
            <button
              type="button"
              onClick={prevNext.onNext}
              disabled={!prevNext.hasNext}
              className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors disabled:opacity-20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
