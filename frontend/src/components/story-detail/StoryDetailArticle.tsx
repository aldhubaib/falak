import { Sparkles, RefreshCw, Loader2, Ban } from "lucide-react";
import { AIWriterBox, type WriterState } from "@/components/AIWriterBox";

export interface StoryDetailArticleProps {
  storyId: string | undefined;
  sourceUrl: string | null;
  articleContent: string | undefined;
  articleDisplayValue: string;
  cleanupStatus: WriterState;
  articleLoading: boolean;
  articleError: string | null;
  showOmit: boolean;
  actionsDisabled: boolean;
  onCleanup: () => Promise<void>;
  onRefetch: () => Promise<void>;
  onOmit: () => Promise<void>;
  onRetryFetch: () => Promise<void>;
}

export function StoryDetailArticle({
  storyId,
  sourceUrl,
  articleContent,
  articleDisplayValue,
  cleanupStatus,
  articleLoading,
  articleError,
  showOmit,
  actionsDisabled,
  onCleanup,
  onRefetch,
  onOmit,
  onRetryFetch,
}: StoryDetailArticleProps) {
  const isYouTube = articleContent === "__YOUTUBE__";
  const isScrapeFailed =
    !articleLoading && (!articleContent || articleContent === "__SCRAPE_FAILED__");
  const hasValidContent =
    cleanupStatus !== "idle" ||
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

  return (
    <div className="rounded-xl bg-background border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-button="cleanup-with-ai"
            aria-label="Clean up with AI — remove website junk from article and format as clean Arabic markdown"
            onClick={() => onCleanup()}
            disabled={actionsDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:cursor-not-allowed"
            title="Remove website junk from article and format as clean Arabic markdown"
          >
            {actionsDisabled ? (
              <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 shrink-0" />
            )}
            <span className={actionsDisabled ? "text-shimmer inline-block" : ""}>
              Clean up with AI
            </span>
          </button>
          <button
            type="button"
            onClick={() => onRefetch()}
            disabled={!sourceUrl || actionsDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            title="Re-fetch article from source (use if something went wrong)"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            Re-fetch article
          </button>
        </div>
        {showOmit && (
          <button
            type="button"
            onClick={() => onOmit()}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0"
            title="Omit (insufficient data to produce)"
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-5 py-6">
        {isYouTube ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-3">المصدر مقطع فيديو على يوتيوب</p>
            <a
              href={sourceUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline"
            >
              مشاهدة الفيديو على يوتيوب
            </a>
          </div>
        ) : isScrapeFailed ? (
          <div className="text-center py-8 text-muted-foreground space-y-4">
            <p className="mb-1">تعذّر تحميل نص المقال من هذا المصدر</p>
            <p className="text-[11px] text-dim">
              Source could not be scraped. Try re-fetching or open the link below.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={sourceUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="link text-[12px]"
              >
                اقرأ المقال من المصدر الأصلي
              </a>
              {storyId && (
                <button
                  type="button"
                  onClick={() => onRetryFetch()}
                  disabled={articleLoading}
                  className="px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-foreground hover:border-foreground/20 disabled:opacity-50"
                >
                  {articleLoading ? "Fetching…" : "Re-fetch article"}
                </button>
              )}
            </div>
          </div>
        ) : hasValidContent ? (
          <AIWriterBox
            mode="output"
            label="Original Story"
            status={articleDisplayValue && cleanupStatus === "idle" ? "done" : cleanupStatus}
            value={displayValue}
          />
        ) : articleLoading ? (
          <p className="text-[12px] text-dim text-right">Loading article…</p>
        ) : articleError ? (
          <p className="text-[12px] text-dim text-right">
            {articleError}. Use “Read source” below to open the original article.
          </p>
        ) : !sourceUrl ? (
          <p className="text-[12px] text-dim text-right">
            No source URL for this story. The original story can be shown when a source link is
            available.
          </p>
        ) : (
          <p className="text-[12px] text-dim text-right">Loading article…</p>
        )}
      </div>
    </div>
  );
}
