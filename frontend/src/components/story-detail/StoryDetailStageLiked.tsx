import { ReactNode } from "react";

export interface StoryDetailStageLikedProps {
  children: ReactNode;
  canApprove: boolean;
  onApprove: () => void;
  onPass: () => void;
}

export function StoryDetailStageLiked({
  children,
  canApprove,
  onApprove,
  onPass,
}: StoryDetailStageLikedProps) {
  return (
    <>
      {children}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canApprove}
          onClick={onApprove}
          className={`flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-full transition-opacity ${
            canApprove
              ? "bg-blue text-blue-foreground hover:opacity-90"
              : "bg-blue/30 text-blue-foreground/40 cursor-not-allowed"
          }`}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onPass}
          className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors"
        >
          Pass
        </button>
      </div>
    </>
  );
}
