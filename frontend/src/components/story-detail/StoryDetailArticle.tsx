import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface StoryDetailArticleProps {
  storyId: string | undefined;
  sourceUrl: string | null;
  sourceName: string | null;
  articleContent: string | undefined;
  articleDisplayValue: string;
  articleTitle?: string;
  cleanupProgress?: number;
  articleLoading: boolean;
  articleError: string | null;
  actionsDisabled: boolean;
  compositeScore?: number | null;
  relativeDate?: string | null;
  articleOpen?: boolean;
  onArticleOpenChange?: (open: boolean) => void;
  onRetryFetch: () => Promise<void>;
  onArticleChange?: (value: string) => void;
  onArticleTitleChange?: (value: string) => void;
  onArticleTitleBlur?: (title: string) => void;
}

const SOURCE_BADGE_COLORS: Record<string, string> = {
  NewsAPI: "bg-emerald-500/15 text-foreground",
  GNews: "bg-teal-500/15 text-foreground",
  Guardian: "bg-primary-500/15 text-foreground",
  "The Guardian": "bg-primary-500/15 text-foreground",
  NYT: "bg-orange-500/15 text-foreground",
  Firecrawl: "bg-zinc-500/15 text-foreground",
};

function parseSourceBadge(sourceName: string | null): { provider: string; outlet: string | null; colorClass: string } | null {
  if (!sourceName) return null;
  const parts = sourceName.split("/");
  const provider = parts[0].trim();
  const outlet = parts.length > 1 ? parts.slice(1).join("/").trim() : null;
  return { provider, outlet, colorClass: SOURCE_BADGE_COLORS[provider] || "bg-zinc-500/15 text-foreground" };
}

export function StoryDetailArticle({
  storyId,
  sourceUrl,
  sourceName,
  articleContent,
  articleDisplayValue,
  articleTitle = "",
  cleanupProgress = 0,
  articleLoading,
  articleError,
  actionsDisabled,
  compositeScore,
  relativeDate,
  articleOpen: controlledOpen,
  onArticleOpenChange,
  onRetryFetch,
  onArticleChange,
  onArticleTitleChange,
  onArticleTitleBlur,
}: StoryDetailArticleProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const articleOpen = controlledOpen ?? internalOpen;
  const setArticleOpen = onArticleOpenChange ?? setInternalOpen;

  const isCleaning = cleanupProgress > 0;
  const isYouTube = articleContent === "__YOUTUBE__";
  const isScrapeFailed =
    !articleLoading && (!articleContent || articleContent === "__SCRAPE_FAILED__");
  const hasValidContent =
    !!articleDisplayValue ||
    (!!articleContent?.trim() &&
      articleContent !== "__SCRAPE_FAILED__" &&
      articleContent !== "__YOUTUBE__");
  const displayValue =
    articleDisplayValue ||
    (articleContent?.trim() &&
    articleContent !== "__SCRAPE_FAILED__" &&
    articleContent !== "__YOUTUBE__"
      ? articleContent
      : "");

  const progressStatus =
    cleanupProgress < 30
      ? "Analyzing text…"
      : cleanupProgress < 70
        ? "Cleaning up…"
        : cleanupProgress < 100
          ? "Finalizing…"
          : "Done!";

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      {/* Header — click toggles expanded */}
      <button
        type="button"
        onClick={() => setArticleOpen(!articleOpen)}
        className="w-full px-5 max-sm:px-3 py-3.5 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {articleOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-[12px] text-muted-foreground font-medium">Original Story</span>
        </div>
        <div className="flex items-center gap-2.5 max-sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const badge = parseSourceBadge(sourceName);
            if (!badge) return null;
            return (
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${badge.colorClass}`}>
                  {badge.provider}
                </span>
                {badge.outlet && (
                  <span className="text-[10px] text-muted-foreground font-mono max-sm:hidden">{badge.outlet}</span>
                )}
              </div>
            );
          })()}
          {compositeScore != null && (
            <span className="text-[12px] font-mono font-bold shrink-0">
              {Number(compositeScore).toFixed(1)}/10
            </span>
          )}
          {relativeDate != null && relativeDate !== "" && (
            <span className="text-[11px] text-muted-foreground font-mono max-sm:hidden">{relativeDate}</span>
          )}
        </div>
      </button>

      {articleOpen && (
        <>
          {/* Title row */}
          <div className="px-5 pt-4" dir="rtl">
            <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-2 flex items-center justify-between" dir="rtl">
              <span>Title</span>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-primary hover:text-primary/80 transition-colors no-underline"
                  dir="ltr"
                >
                  <ExternalLink className="w-3 h-3" />
                  {(() => {
                    const badge = parseSourceBadge(sourceName);
                    if (badge?.outlet) return `${badge.outlet}`;
                    try { return new URL(sourceUrl).hostname.replace("www.", ""); } catch { return "Read source"; }
                  })()}
                </a>
              )}
            </label>
            <input
              type="text"
              value={articleTitle}
              onChange={(e) => onArticleTitleChange?.(e.target.value)}
              onBlur={() => onArticleTitleBlur?.(articleTitle)}
              disabled={actionsDisabled}
              dir="rtl"
              placeholder="عنوان المقال..."
              className="w-full px-3 py-2.5 text-[14px] bg-transparent border-0 border-b border-border rounded-none text-foreground font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 text-right"
            />
          </div>

          {/* AI cleanup progress */}
          {isCleaning && (
            <div className="px-5 pt-3">
              <Progress value={cleanupProgress} className="h-1 bg-card" />
              <div className="text-[10px] font-mono text-muted-foreground mt-1 text-center">
                {progressStatus}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-5 pt-4 pb-5">
            {isYouTube ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-3">المصدر مقطع فيديو على يوتيوب</p>
                <a href={sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline">
                  مشاهدة الفيديو على يوتيوب
                </a>
              </div>
            ) : isScrapeFailed ? (
              <div className="text-center py-8 text-muted-foreground space-y-4">
                <p className="mb-1">Could not load article</p>
                <p className="text-[11px] text-muted-foreground">Source could not be scraped. Try re-fetching or open the link below.</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a href={sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link text-[12px]">
                    اقرأ المقال من المصدر الأصلي
                  </a>
                  {storyId && (
                    <button
                      type="button"
                      onClick={() => onRetryFetch()}
                      disabled={articleLoading}
                      className="px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-50"
                    >
                      {articleLoading ? "Fetching…" : "Retry"}
                    </button>
                  )}
                </div>
              </div>
            ) : articleError ? (
              <div className="text-center py-6">
                <p className="text-[12px] text-muted-foreground mb-3">{articleError}</p>
                <button
                  type="button"
                  onClick={() => onRetryFetch()}
                  disabled={articleLoading}
                  className="px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Retry
                </button>
              </div>
            ) : articleLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : hasValidContent ? (
              <>
                <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-2 block text-right">Content ({displayValue.length.toLocaleString()})</label>
                <textarea
                  value={displayValue}
                  onChange={(e) => onArticleChange?.(e.target.value)}
                  disabled={actionsDisabled}
                  placeholder="اكتب المقال الكامل هنا..."
                  rows={12}
                  dir="rtl"
                  className="w-full text-[14px] bg-transparent border-0 rounded-none text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-right leading-[1.9] resize-y disabled:opacity-50"
                />
              </>
            ) : !sourceUrl ? (
              <p className="text-[12px] text-muted-foreground text-right">No source URL for this story.</p>
            ) : (
              <p className="text-[12px] text-muted-foreground text-right">Loading article…</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
