import { ArrowLeft, Loader2 } from "lucide-react";

export interface StoryDetailTopBarProps {
  title: string;
  stageLabel: string;
  saving?: boolean;
  onBack: () => void;
}

export function StoryDetailTopBar({
  title,
  stageLabel,
  saving = false,
  onBack,
}: StoryDetailTopBarProps) {
  return (
    <div className="h-12 flex items-center justify-between px-6 border-b border-pageBorder shrink-0 max-lg:px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="link flex items-center gap-2 text-[13px]"
          type="button"
        >
          <ArrowLeft className="w-4 h-4" />
          AI Intelligence
        </button>
        <span className="text-[11px] text-dim font-mono">/</span>
        <span className="text-[13px] font-medium truncate max-w-[400px]">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-dim" />}
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/15 text-primary">
          {stageLabel}
        </span>
      </div>
    </div>
  );
}
