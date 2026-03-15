/**
 * AI Writer Box — status word shimmer + cursor, 4 states only.
 * Shimmer is only on the status word, never on the article/script text.
 */
import { useState } from "react";

export type WriterState = "idle" | "thinking" | "writing" | "done";

export interface AIWriterBoxProps {
  label: string;
  mode: "input" | "output";
  status: WriterState;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  onAction?: (text: string) => void;
  actionLabel?: string;
}

function detectDir(text: string): "ltr" | "rtl" {
  const RTL = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  for (const ch of text.trim().slice(0, 30)) {
    if (RTL.test(ch)) return "rtl";
  }
  return "ltr";
}

const STATUS_LABELS: Record<WriterState, string> = {
  idle: "Ready",
  thinking: "Thinking",
  writing: "Writing",
  done: "Done",
};

export function AIWriterBox({
  label,
  mode,
  status,
  value = "",
  defaultValue = "",
  onChange,
  onAction,
  actionLabel = "Run",
}: AIWriterBoxProps) {
  const [text, setText] = useState(defaultValue);
  const dir = detectDir(mode === "output" ? value : text);
  const isActive = status === "thinking" || status === "writing";
  const shimmerClass = `ai-status-word--shimmer${dir === "rtl" ? "-rtl" : ""}`;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        isActive ? "border-blue" : "border-border"
      } bg-background`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-[11px] font-medium uppercase tracking-wide text-dim">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`w-[5px] h-[5px] rounded-full shrink-0 ${
              status === "thinking"
                ? "bg-blue animate-pulse-dot"
                : status === "writing"
                  ? "bg-foreground"
                  : "bg-muted"
            }`}
          />
          <span
            className={`ai-status-word text-[11px] ${isActive ? shimmerClass : ""}`}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 min-h-[80px] text-sm leading-relaxed">
        {mode === "input" ? (
          <textarea
            dir={dir}
            className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-foreground placeholder:text-dim"
            style={{ textAlign: dir === "rtl" ? "right" : "left" }}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onChange?.(e.target.value);
            }}
            rows={3}
          />
        ) : (
          <div
            dir={dir}
            className="text-foreground select-text"
            style={{ textAlign: dir === "rtl" ? "right" : "left" }}
          >
            {dir === "rtl" && status !== "done" && (
              <span
                className={`ai-cursor mr-[1px] ${
                  status === "thinking"
                    ? "ai-cursor--thinking"
                    : status === "writing"
                      ? "ai-cursor--writing"
                      : "ai-cursor--idle"
                }`}
              />
            )}
            {value}
            {dir === "ltr" && status !== "done" && (
              <span
                className={`ai-cursor ml-[1px] ${
                  status === "thinking"
                    ? "ai-cursor--thinking"
                    : status === "writing"
                      ? "ai-cursor--writing"
                      : "ai-cursor--idle"
                }`}
              />
            )}
          </div>
        )}
      </div>

      {mode === "input" && onAction && (
        <div className="flex justify-end px-3 py-2 border-t border-border">
          <button
            type="button"
            onClick={() => onAction(text)}
            disabled={status === "thinking" || status === "writing"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[12px] font-medium text-dim hover:text-sensor transition-colors disabled:opacity-50"
          >
            ✦ {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
