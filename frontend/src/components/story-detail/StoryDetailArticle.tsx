import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Wand2, RefreshCw, ExternalLink } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
  scores?: { relevance: number; viral: number; firstMover: number; total: number };
  relativeDate?: string | null;
  articleOpen?: boolean;
  onArticleOpenChange?: (open: boolean) => void;
  onCleanup: () => Promise<void>;
  onRefetch: () => Promise<void>;
  onRetryFetch: () => Promise<void>;
  onArticleChange?: (value: string) => void;
  onArticleTitleChange?: (value: string) => void;
  onArticleTitleBlur?: (title: string) => void;
}

const SOURCE_BADGE_COLORS: Record<string, string> = {
  NewsAPI: "bg-emerald-500/15 text-foreground",
  GNews: "bg-teal-500/15 text-foreground",
  Guardian: "bg-blue-500/15 text-foreground",
  "The Guardian": "bg-blue-500/15 text-foreground",
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
  scores,
  relativeDate,
  articleOpen: controlledOpen,
  onArticleOpenChange,
  onCleanup,
  onRefetch,
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
    <div className="rounded-xl bg-background border border-border overflow-hidden">
      {/* Header — click toggles expanded */}
      <button
        type="button"
        onClick={() => setArticleOpen(!articleOpen)}
        className="w-full px-5 max-sm:px-3 py-3.5 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {articleOpen ? (
            <ChevronUp className="w-4 h-4 text-dim" />
          ) : (
            <ChevronDown className="w-4 h-4 text-dim" />
          )}
          <span className="text-[12px] text-dim font-medium">Original Story</span>
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
                  <span className="text-[10px] text-dim font-mono max-sm:hidden">{badge.outlet}</span>
                )}
              </div>
            );
          })()}
          {scores && (
            <>
            <div className="flex items-center gap-1.5 max-sm:gap-1">
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-default">
                    <span className="text-[10px] text-dim font-mono">R</span>
                    <span className="text-[10px] font-mono font-semibold text-purple">{scores.relevance}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Relevance</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-default">
                    <span className="text-[10px] text-dim font-mono">V</span>
                    <span className="text-[10px] font-mono font-semibold text-blue">{scores.viral}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Virality</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-default max-sm:hidden">
                    <span className="text-[10px] text-dim font-mono">F</span>
                    <span className="text-[10px] font-mono font-semibold text-success">{scores.firstMover}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>First Mover</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-default">
                    <span className="text-[10px] text-dim font-mono">T</span>
                    <span className="text-[10px] font-mono font-semibold text-foreground">{scores.total}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Total</TooltipContent>
              </Tooltip>
            </div>
              <span className="w-px h-3 bg-border max-sm:hidden" />
              {relativeDate != null && relativeDate !== "" && (
                <span className="text-[11px] text-dim font-mono max-sm:hidden">{relativeDate}</span>
              )}
            </>
          )}
        </div>
      </button>

      {articleOpen && (
        <>
          {/* Action bar */}
          <div className="px-4 py-2.5 border-t border-border flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCleanup()}
              disabled={actionsDisabled || isCleaning || !displayValue.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-[12px] font-medium text-dim hover:text-sensor transition-colors disabled:opacity-30 whitespace-nowrap"
            >
              <Wand2 className={`w-3 h-3 shrink-0 ${isCleaning ? "animate-spin" : ""}`} />
              {isCleaning ? "Cleaning…" : "Clean up with AI"}
            </button>
            <button
              type="button"
              onClick={() => onRefetch()}
              disabled={actionsDisabled || !sourceUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-[12px] font-medium text-dim hover:text-sensor transition-colors disabled:opacity-30 whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3 shrink-0" />
              Re-fetch
            </button>
          </div>

          {/* Title row */}
          <div className="px-5 pt-4" dir="rtl">
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-2 flex items-center justify-between" dir="rtl">
              <span>Title</span>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-blue hover:text-blue/80 transition-colors no-underline"
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
              className="w-full px-3 py-2.5 text-[14px] bg-transparent border-0 border-b border-border rounded-none text-foreground font-medium placeholder:text-dim/50 focus:outline-none focus:border-primary/40 text-right"
            />
          </div>

          {/* AI cleanup progress */}
          {isCleaning && (
            <div className="px-5 pt-3">
              <Progress value={cleanupProgress} className="h-1 bg-muted" />
              <div className="text-[10px] font-mono text-dim mt-1 text-center">
                {progressStatus}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-5 pt-4 pb-5">
            {isYouTube ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-3">المصدر مقطع فيديو على يوتيوب</p>
                <a href={sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                  مشاهدة الفيديو على يوتيوب
                </a>
              </div>
            ) : isScrapeFailed ? (
              <div className="text-center py-8 text-muted-foreground space-y-4">
                <p className="mb-1">Could not load article</p>
                <p className="text-[11px] text-dim">Source could not be scraped. Try re-fetching or open the link below.</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a href={sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link text-[12px]">
                    اقرأ المقال من المصدر الأصلي
                  </a>
                  {storyId && (
                    <button
                      type="button"
                      onClick={() => onRetryFetch()}
                      disabled={articleLoading}
                      className="px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-foreground hover:border-foreground/20 disabled:opacity-50"
                    >
                      {articleLoading ? "Fetching…" : "Retry"}
                    </button>
                  )}
                </div>
              </div>
            ) : articleError ? (
              <div className="text-center py-6">
                <p className="text-[12px] text-dim mb-3">{articleError}</p>
                <button
                  type="button"
                  onClick={() => onRetryFetch()}
                  disabled={articleLoading}
                  className="px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-foreground"
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
                <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-2 block text-right">Content ({displayValue.length.toLocaleString()})</label>
                <textarea
                  value={displayValue}
                  onChange={(e) => onArticleChange?.(e.target.value)}
                  disabled={actionsDisabled}
                  placeholder="اكتب المقال الكامل هنا..."
                  rows={12}
                  dir="rtl"
                  className="w-full text-[14px] bg-transparent border-0 rounded-none text-foreground placeholder:text-dim/50 focus:outline-none text-right leading-[1.9] resize-y disabled:opacity-50"
                />
              </>
            ) : !sourceUrl ? (
              <p className="text-[12px] text-dim text-right">No source URL for this story.</p>
            ) : (
              <p className="text-[12px] text-dim text-right">Loading article…</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
