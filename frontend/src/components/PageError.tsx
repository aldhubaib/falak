import { useState } from "react";
import { AlertCircle, Copy, Home, RefreshCw, ChevronDown, ChevronUp, Bug } from "lucide-react";
import { toast } from "sonner";

interface PageErrorProps {
  title?: string;
  message: string;
  detail?: string;
  componentStack?: string;
  onRetry?: () => void;
  showHome?: boolean;
  homeLabel?: string;
  homeHref?: string;
}

const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|credential|auth)[\s=:]+\S+/gi,
  /(?:postgresql|mysql|redis|mongodb):\/\/\S+/gi,
  /(?:sk|pk|key|secret)[_-][a-zA-Z0-9]{16,}/g,
  /Bearer\s+\S+/gi,
  /\/Users\/[^/\s]+/g,
  /\/home\/[^/\s]+/g,
  /[A-Za-z]:\\Users\\[^\\]+/g,
];

function sanitize(text: string): string {
  let safe = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    safe = safe.replace(pattern, "[redacted]");
  }
  return safe;
}

function getErrorFingerprint(message: string): string {
  const cleaned = message.replace(/[^a-zA-Z]/g, "").toLowerCase().slice(0, 32);
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = ((hash << 5) - hash + cleaned.charCodeAt(i)) | 0;
  }
  return `ERR-${(hash >>> 0).toString(36).toUpperCase().padStart(6, "0")}`;
}

function parseReactMinifiedError(message: string): string | null {
  const match = message.match(/Minified React error #(\d+)/);
  if (!match) return null;
  const code = match[1];
  const descriptions: Record<string, string> = {
    "185": "Maximum update depth exceeded — a component is calling setState in a loop.",
    "301": "Cannot update during an existing state transition (e.g. within render).",
    "423": "Invalid hook call — hooks can only be called inside function components.",
    "418": "Hydration mismatch — server HTML didn't match client render.",
    "425": "Text content mismatch during hydration.",
    "321": "Objects are not valid as a React child.",
  };
  return descriptions[code!] ?? `React internal error #${code}. Check https://reactjs.org/docs/error-decoder.html?invariant=${code}`;
}

function buildDebugReport(
  title: string,
  message: string,
  detail?: string,
  componentStack?: string
): string {
  const lines: string[] = [
    `Error: ${title}`,
    `Message: ${sanitize(message)}`,
    `Code: ${getErrorFingerprint(message)}`,
    `URL: ${window.location.pathname}${window.location.search}`,
    `Time: ${new Date().toISOString()}`,
    `Agent: ${navigator.userAgent.replace(/\s+/g, " ").slice(0, 120)}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
  ];

  const friendly = parseReactMinifiedError(message);
  if (friendly) lines.push(`Decoded: ${friendly}`);

  if (componentStack?.trim()) {
    const safeStack = sanitize(componentStack.trim());
    const components = safeStack
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("at "))
      .slice(0, 8);
    if (components.length > 0) {
      lines.push("", "Component trace:", ...components);
    }
  }

  if (detail?.trim()) {
    const safeDetail = sanitize(detail.trim());
    const frames = safeDetail
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 6);
    lines.push("", "Stack (top frames):", ...frames);
  }

  return lines.join("\n");
}

export function PageError({
  title = "Something went wrong",
  message,
  detail,
  componentStack,
  onRetry,
  showHome = true,
  homeLabel = "Go to home",
  homeHref = "/",
}: PageErrorProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fingerprint = getErrorFingerprint(message);
  const friendlyMessage = parseReactMinifiedError(message);
  const safeMessage = sanitize(friendlyMessage ?? message);
  const debugReport = buildDebugReport(title, message, detail, componentStack);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(debugReport);
      setCopied(true);
      toast.success("Debug report copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-lg border border-border bg-background p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-dim mt-1 select-text">{safeMessage}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-card text-[11px] font-mono text-dim">
          <Bug className="w-3.5 h-3.5 shrink-0" />
          <span className="select-all">{fingerprint}</span>
          <span className="text-border">|</span>
          <span>{window.location.pathname}</span>
          <span className="text-border">|</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[11px] text-dim hover:text-foreground transition-colors mb-3"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide" : "Show"} debug details
        </button>

        {expanded && (
          <pre className="text-left text-[10px] font-mono text-dim bg-card rounded-lg p-3 mb-4 overflow-auto max-h-48 select-text whitespace-pre-wrap break-words">
            {debugReport}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-dim text-sm font-medium hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied" : "Copy report"}
          </button>
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
