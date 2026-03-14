import { AlertCircle, Home, RefreshCw } from "lucide-react";

interface PageErrorProps {
  title?: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  showHome?: boolean;
  /** If set, shown as secondary button instead of "Go to home" */
  homeLabel?: string;
  homeHref?: string;
}

/**
 * Full-page error state: show message on screen with optional retry and go-home.
 */
export function PageError({
  title = "Something went wrong",
  message,
  detail,
  onRetry,
  showHome = true,
  homeLabel = "Go to home",
  homeHref = "/",
}: PageErrorProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-border bg-background p-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-dim mb-4">{message}</p>
        {detail && (
          <pre className="text-left text-[11px] font-mono text-dim bg-surface rounded-lg p-3 mb-4 overflow-auto max-h-32">
            {detail}
          </pre>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground/10 text-foreground text-sm font-medium hover:bg-foreground/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
          {showHome && (
            <a
              href={homeHref}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-dim text-sm font-medium hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              {homeLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
