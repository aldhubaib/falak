export interface StoryDetailTitleProps {
  headline: string;
  sourceName: string | null;
  sourceDate: string | null;
}

export function StoryDetailTitle({
  headline,
  sourceName,
  sourceDate,
}: StoryDetailTitleProps) {
  const sourcePart = [sourceName, sourceDate?.split("T")[0]].filter(Boolean).join(" · ");
  return (
    <div>
      <h1 className="text-xl font-bold text-right leading-relaxed">{headline}</h1>
      <div className="text-[11px] text-dim font-mono mt-2">{sourcePart}</div>
    </div>
  );
}
