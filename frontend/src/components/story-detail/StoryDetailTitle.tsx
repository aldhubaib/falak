import { ExternalLink } from "lucide-react";

export interface StoryDetailTitleProps {
  headline: string;
  sourceName: string | null;
  sourceDate: string | null;
  sourceUrl: string | null;
}

export function StoryDetailTitle({
  headline,
  sourceName,
  sourceDate,
  sourceUrl,
}: StoryDetailTitleProps) {
  const sourcePart = [sourceName, sourceDate?.split("T")[0]].filter(Boolean).join(" · ");
  return (
    <div>
      <h1 className="text-xl font-bold text-right leading-relaxed">{headline}</h1>
      <div className="text-[11px] text-dim font-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {sourcePart}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Read source
          </a>
        )}
      </div>
    </div>
  );
}
