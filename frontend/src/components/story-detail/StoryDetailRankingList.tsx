import { ArrowUpRight } from "lucide-react";

export interface RankingStory {
  id: string;
  headline: string;
  coverageStatus: string | null;
  compositeScore: number | null;
}

export interface StoryDetailRankingListProps {
  stories: RankingStory[];
  currentId: string | undefined;
  currentScore: number | null;
  onSelect: (id: string) => void;
}

export function StoryDetailRankingList({
  stories,
  currentId,
  currentScore,
  onSelect,
}: StoryDetailRankingListProps) {
  const currentIndex = currentId ? stories.findIndex((s) => s.id === currentId) : -1;
  return (
    <div className="rounded-xl bg-background p-5">
      <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
        Ranking
      </div>
      <div className="text-[13px] font-semibold mb-3">
        Ranked #{currentIndex >= 0 ? currentIndex + 1 : 0} of {stories.length} liked — Score{" "}
        {currentScore ?? 0}
      </div>
      <div className="space-y-1">
        {stories.map((s, i) => {
          const isCurrent = s.id === currentId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (!isCurrent) onSelect(s.id);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] transition-colors group ${
                isCurrent
                  ? "bg-rowHover text-foreground cursor-default"
                  : "text-dim hover:bg-rowHover cursor-pointer"
              }`}
            >
              <span className="font-mono w-5">#{i + 1}</span>
              {s.coverageStatus === "first" && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
                  1st
                </span>
              )}
              {s.coverageStatus === "late" && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">
                  Late
                </span>
              )}
              <span className="flex-1 truncate text-right transition-colors group-hover:text-foreground">
                {s.headline}
              </span>
              <span className="font-mono font-medium">{s.compositeScore ?? 0}</span>
              {!isCurrent && (
                <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
