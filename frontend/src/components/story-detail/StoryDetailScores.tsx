import { ScoreBar } from "./ScoreBar";

export interface StoryDetailScoresProps {
  relevance: number;
  viral: number;
  firstMover: number;
  total: number;
}

export function StoryDetailScores({
  relevance,
  viral,
  firstMover,
  total,
}: StoryDetailScoresProps) {
  return (
    <div className="flex rounded-xl overflow-hidden">
      <ScoreBar label="Relevance" value={relevance} />
      <ScoreBar label="Virality" value={viral} />
      <ScoreBar label="First Mover" value={firstMover} />
      <div className="px-5 py-4 bg-background min-w-[120px]">
        <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Total</div>
        <div className="text-2xl font-semibold font-mono tracking-tight mt-1">{total}</div>
      </div>
    </div>
  );
}
