import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Clock,
  EyeOff,
  SkipForward,
  CircleSlash,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export interface StageOption {
  key: string;
  label: string;
}

export interface StoryDetailTopBarProps {
  stageLabel: string;
  /** For dropdown display: approved/scripting show "Scripting" */
  activeStage: string;
  stages: StageOption[];
  /** Next stage key for "Move to [next]" (null if done) */
  nextStageKey: string | null;
  nextStageLabel: string | null;
  saving?: boolean;
  onBack: () => void;
  onMoveToNextStage: () => void;
  onPass?: () => void;
  onOmit: () => void;
  onHistoryClick: () => void;
  /** Compact prev/next */
  prevNext?: {
    currentIndex: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
  };
}

const STAGE_COLOR_CLASS: Record<string, string> = {
  suggestion: "text-orange",
  liked: "text-blue",
  scripting: "text-purple",
  filmed: "text-success",
  publish: "text-pink-400",
  done: "text-foreground",
  passed: "text-dim",
  omit: "text-dim",
};

function getStageColor(stage: string): string {
  return STAGE_COLOR_CLASS[stage] ?? "text-dim";
}

export function StoryDetailTopBar({
  stageLabel,
  activeStage,
  stages,
  nextStageKey,
  nextStageLabel,
  saving = false,
  onBack,
  onMoveToNextStage,
  onPass,
  onOmit,
  onHistoryClick,
  prevNext,
}: StoryDetailTopBarProps) {
  const [actionDropOpen, setActionDropOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"omit" | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setActionDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayLabel = stageLabel;
  const colorClass = getStageColor(activeStage);
  const nextStageIconColor =
    nextStageKey === "liked"
      ? "text-blue"
      : nextStageKey === "scripting"
        ? "text-purple"
        : nextStageKey === "filmed"
          ? "text-success"
          : nextStageKey === "publish"
            ? "text-pink-400"
            : "text-foreground";

  return (
    <>
      <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:px-3 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors"
          type="button"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="max-sm:hidden">AI Intelligence</span>
        </button>

        <div className="flex items-center gap-1.5 max-sm:gap-1 flex-wrap justify-end">
          {/* Clock — Edit History */}
          <button
            type="button"
            onClick={onHistoryClick}
            className="w-8 h-8 max-sm:w-7 max-sm:h-7 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors"
            aria-label="Edit history"
          >
            <Clock className="w-4 h-4 max-sm:w-3.5 max-sm:h-3.5" />
          </button>

          {/* Stage dropdown */}
          <div className="relative" ref={dropRef}>
            <button
              type="button"
              onClick={() => setActionDropOpen(!actionDropOpen)}
              className="inline-flex items-center gap-1 py-1 px-2.5 max-sm:px-2 rounded-full text-[11px] max-sm:text-[10px] font-medium border border-border text-dim hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <span className={`font-mono truncate ${colorClass}`}>{displayLabel}</span>
              <ChevronDown className={`w-3 h-3 text-dim/40 transition-transform shrink-0 ${actionDropOpen ? "rotate-180" : ""}`} />
            </button>
            {actionDropOpen && (
              <div className="absolute z-20 mt-2 right-0 w-48 rounded-xl bg-surface border border-border overflow-hidden shadow-lg">
                {nextStageKey && nextStageLabel && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActionDropOpen(false);
                        onMoveToNextStage();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-foreground hover:bg-elevated transition-colors"
                    >
                      <SkipForward className={`w-3.5 h-3.5 shrink-0 ${nextStageIconColor}`} />
                      <span className="font-medium">Move to {nextStageLabel}</span>
                    </button>
                    <div className="h-px bg-border" />
                  </>
                )}
                {onPass && activeStage === "suggestion" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActionDropOpen(false);
                        onPass();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-dim hover:text-foreground hover:bg-elevated transition-colors"
                    >
                      <CircleSlash className="w-3.5 h-3.5 shrink-0" />
                      Pass
                    </button>
                    <div className="h-px bg-border" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActionDropOpen(false);
                    setConfirmAction("omit");
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-dim hover:text-destructive hover:bg-elevated transition-colors"
                >
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                  Omit
                </button>
              </div>
            )}
          </div>

          {/* Prev / Next */}
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

          {saving && <Loader2 className="w-3 h-3 animate-spin text-dim shrink-0" />}
        </div>
      </div>

      {/* Omit confirmation */}
      <AlertDialog open={confirmAction === "omit"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Omit this story?</AlertDialogTitle>
            <AlertDialogDescription>
              This story will be skipped and won&apos;t appear in future suggestions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange text-orange-foreground hover:opacity-90"
              onClick={() => {
                onOmit();
                setConfirmAction(null);
              }}
            >
              Omit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
