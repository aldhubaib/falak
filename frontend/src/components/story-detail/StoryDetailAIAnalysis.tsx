export interface StoryDetailAIAnalysisProps {
  text: string;
  isFirst?: boolean;
  isLate?: boolean;
}

export function StoryDetailAIAnalysis({ text, isFirst, isLate }: StoryDetailAIAnalysisProps) {
  return (
    <div className="rounded-xl bg-background p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
          AI Analysis
        </div>
        {isFirst && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">
            1st
          </span>
        )}
        {isLate && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange">
            Late
          </span>
        )}
      </div>
      <p className="text-[13px] text-sensor leading-relaxed text-right">{text}</p>
    </div>
  );
}
