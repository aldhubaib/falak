import { useState } from "react";
import { Sparkles, RefreshCw, Loader2, Ban, ChevronUp, ExternalLink } from "lucide-react";
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
  /** Inline scores in header (e.g. "R 92 V 97 F 85 T 91") */
  scoresInline?: string;
  /** Relative date (e.g. "2 days ago") */
  relativeDate?: string;
  defaultOpen?: boolean;
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
  scoresInline,
  relativeDate,
  defaultOpen = true,
}: StoryDetailArticleProps) {
  const [open, setOpen] = useState(defaultOpen);
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-border shrink-0 hover:bg-elevated/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest shrink-0">
            Original Story
          </span>
          {scoresInline && (
            <span className="text-[11px] font-mono text-dim truncate">{scoresInline}</span>
          )}
          {relativeDate && (
            <span className="text-[11px] text-dim shrink-0">{relativeDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            data-button="cleanup-with-ai"
            aria-label="Clean up with AI"
            onClick={() => onCleanup()}
            disabled={actionsDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none"
          >
            {actionsDisabled ? <Loader2 className="w-3 h-3 shrink-0 animate-spin" /> : <Sparkles className="w-3 h-3 shrink-0" />}
            Clean up with AI
          </button>
          <button
            type="button"
            onClick={() => onRefetch()}
            disabled={!sourceUrl || actionsDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] font-medium text-dim hover:text-sensor transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            Re-fetch
          </button>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-dim hover:text-sensor transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              READ SOURCE
            </a>
          )}
          {showOmit && (
            <button
              type="button"
              onClick={() => onOmit()}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0"
              title="Omit"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
        <ChevronUp className={`w-4 h-4 text-dim shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>

      {open && (
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
      )}
    </div>
  );
}
