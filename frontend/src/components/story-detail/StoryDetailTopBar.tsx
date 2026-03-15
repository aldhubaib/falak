import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, ChevronDown } from "lucide-react";

export interface StageOption {
  key: string;
  label: string;
}

export interface StoryDetailTopBarProps {
  title?: string;
  stageLabel: string;
  stages?: StageOption[];
  activeStage?: string;
  onStageChange?: (stage: string) => void;
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
  showLogo?: boolean;
}

export function StoryDetailTopBar({
  title,
  stageLabel,
  stages = [],
  activeStage,
  onStageChange,
  saving = false,
  onBack,
  prevNext,
  showLogo = true,
}: StoryDetailTopBarProps) {
  const [stageOpen, setStageOpen] = useState(false);
  const hasStageDropdown = stages.length > 0 && onStageChange && activeStage != null;

  return (
    <div className="h-12 flex items-center justify-between px-6 border-b border-pageBorder shrink-0 max-lg:px-4">
      <div className="flex items-center gap-3 min-w-0">
        {showLogo && (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm">F</span>
          </div>
        )}
        <button
          onClick={onBack}
          className="link flex items-center gap-2 text-[13px] shrink-0"
          type="button"
        >
          <ArrowLeft className="w-4 h-4" />
          AI Intelligence
        </button>
        {title != null && title !== "" && (
          <>
            <span className="text-[11px] text-dim font-mono shrink-0">/</span>
            <span className="text-[13px] font-medium truncate max-w-[280px]">{title}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-dim" />}
        {hasStageDropdown ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setStageOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] font-mono text-dim hover:text-foreground hover:border-sensor/40 transition-colors"
            >
              {stages.find((s) => s.key === activeStage)?.label ?? stageLabel}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${stageOpen ? "rotate-180" : ""}`} />
            </button>
            {stageOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setStageOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 min-w-[140px] rounded-lg bg-elevated border border-border shadow-lg z-20">
                  {stages.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        onStageChange(s.key);
                        setStageOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-colors ${
                        s.key === activeStage ? "bg-primary/15 text-primary" : "text-dim hover:text-foreground hover:bg-surface"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/15 text-primary">
            {stageLabel}
          </span>
        )}
        {prevNext && prevNext.total > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevNext.onPrev}
              disabled={!prevNext.hasPrev}
              className="p-1.5 rounded-md text-dim hover:text-foreground hover:bg-elevated disabled:opacity-40 disabled:pointer-events-none transition-colors"
              title="Previous story"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-dim min-w-[2.5rem] text-center">
              {prevNext.currentIndex} / {prevNext.total}
            </span>
            <button
              type="button"
              onClick={prevNext.onNext}
              disabled={!prevNext.hasNext}
              className="p-1.5 rounded-md text-dim hover:text-foreground hover:bg-elevated disabled:opacity-40 disabled:pointer-events-none transition-colors"
              title="Next story"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
