import { FileText, Wand2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface StoryDetailArticleProps {
  storyId: string | undefined;
  sourceUrl: string | null;
  articleContent: string | undefined;
  articleDisplayValue: string;
  /** 0-100 during cleanup for progress bar */
  cleanupProgress?: number;
  articleLoading: boolean;
  articleError: string | null;
  actionsDisabled: boolean;
  onCleanup: () => Promise<void>;
  onRefetch: () => Promise<void>;
  onRetryFetch: () => Promise<void>;
  /** When user edits article text in textarea */
  onArticleChange?: (value: string) => void;
}

export function StoryDetailArticle({
  storyId,
  sourceUrl,
  articleContent,
  articleDisplayValue,
  cleanupProgress = 0,
  articleLoading,
  articleError,
  actionsDisabled,
  onCleanup,
  onRefetch,
  onRetryFetch,
  onArticleChange,
}: StoryDetailArticleProps) {
  const isCleaning = actionsDisabled && cleanupProgress > 0;
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-dim" />
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Article</span>
        </div>
        <button
          type="button"
          onClick={() => onCleanup()}
          disabled={actionsDisabled || !displayValue.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Wand2 className={`w-3 h-3 ${actionsDisabled ? "animate-spin" : ""}`} />
          {actionsDisabled ? "Cleaning…" : "AI Clean Up"}
        </button>
      </div>

      {isCleaning && (
        <div className="px-5 pt-3">
          <Progress value={cleanupProgress} className="h-1.5 bg-muted" />
          <div className="text-[10px] font-mono text-dim mt-1.5 text-center">
            {progressStatus}
          </div>
        </div>
      )}

      <div className="p-5">
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
          <textarea
            value={displayValue}
            onChange={(e) => onArticleChange?.(e.target.value)}
            disabled={actionsDisabled}
            placeholder="اكتب المقال الكامل هنا..."
            rows={10}
            dir="rtl"
            className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim/50 focus:outline-none focus:border-primary/40 text-right leading-relaxed resize-y disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          />
        ) : articleLoading ? (
          <p className="text-[12px] text-dim text-right">Loading article…</p>
        ) : articleError ? (
          <p className="text-[12px] text-dim text-right">
            {articleError}. Use re-fetch or open the source link.
          </p>
        ) : !sourceUrl ? (
          <p className="text-[12px] text-dim text-right">
            No source URL for this story.
          </p>
        ) : (
          <p className="text-[12px] text-dim text-right">Loading article…</p>
        )}
      </div>
    </div>
  );
}
