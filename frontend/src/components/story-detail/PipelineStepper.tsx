import { Check, Loader2, AlertTriangle, Search, FileText, Pen, GitMerge, ShieldCheck, Sparkles } from "lucide-react";

const STAGES = [
  { key: "research", label: "Research", icon: Search },
  { key: "facts", label: "Fact Sheet", icon: FileText },
  { key: "writing", label: "Dual Writing", icon: Pen },
  { key: "merging", label: "Merge", icon: GitMerge },
  { key: "qa", label: "QA Check", icon: ShieldCheck },
  { key: "polishing", label: "Final Polish", icon: Sparkles },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const DONE_KEYS: Record<string, StageKey> = {
  research_done: "research",
  facts_done: "facts",
  writing_done: "writing",
  merge_done: "merging",
  qa_done: "qa",
  done: "polishing",
};

function stageIndex(stage: string | undefined): number {
  if (!stage) return -1;
  const mapped = DONE_KEYS[stage];
  if (mapped) {
    const idx = STAGES.findIndex((s) => s.key === mapped);
    return idx >= 0 ? idx + 1 : -1;
  }
  return STAGES.findIndex((s) => s.key === stage);
}

interface PipelineStepperProps {
  stage?: string;
  error?: string;
  qaResult?: { passed: boolean; issues: Array<{ type: string; severity: string; detail: string }> };
}

export function PipelineStepper({ stage, error, qaResult }: PipelineStepperProps) {
  if (!stage || stage === "queued") return null;

  const currentIdx = stageIndex(stage);
  const isDone = stage === "done";
  const isError = stage === "error";

  return (
    <div className="px-4 py-3 bg-card/50 border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const isComplete = isDone || i < currentIdx;
          const isActive = !isDone && !isError && i === currentIdx;
          const isPending = !isDone && !isError && i > currentIdx;

          return (
            <div key={s.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={`w-4 h-px mx-0.5 ${
                    isComplete ? "bg-green-500/60" : "bg-border"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isComplete
                    ? "text-green-500"
                    : isActive
                    ? "text-primary bg-primary/10"
                    : isPending
                    ? "text-muted-foreground/40"
                    : "text-muted-foreground"
                }`}
              >
                {isComplete ? (
                  <Check className="w-3 h-3" />
                ) : isActive ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {isError && error && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </div>
      )}

      {isDone && qaResult && !qaResult.passed && qaResult.issues?.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-500 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            QA found {qaResult.issues.length} issue(s):{" "}
            {qaResult.issues
              .map((i) => i.detail)
              .join("; ")
              .slice(0, 200)}
          </span>
        </div>
      )}
    </div>
  );
}
