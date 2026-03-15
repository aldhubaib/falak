/**
 * AI Writer Box — status word shimmer + cursor, 4 states only.
 * Shimmer is only on the status word, never on the article/script text.
 */
import { useState, useRef, useEffect } from "react";

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

/** Place cursor and text in container so cursor stays in DOM; RTL = cursor left of text, LTR = cursor right. */
function placeCursor(
  container: HTMLDivElement,
  textNode: Text,
  cursor: HTMLSpanElement,
  dir: "ltr" | "rtl"
): void {
  container.innerHTML = "";
  if (dir === "rtl") {
    cursor.style.marginRight = "1px";
    cursor.style.marginLeft = "0";
    container.appendChild(cursor);
    container.appendChild(textNode);
  } else {
    cursor.style.marginLeft = "1px";
    cursor.style.marginRight = "0";
    container.appendChild(textNode);
    container.appendChild(cursor);
  }
}

const STATUS_LABELS: Record<WriterState, string> = {
  idle: "Ready",
  thinking: "Thinking",
  writing: "Writing",
  done: "Done",
};

const CURSOR_STATE_CLASSES = ["ai-cursor--idle", "ai-cursor--thinking", "ai-cursor--writing"] as const;

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

  const outputContainerRef = useRef<HTMLDivElement>(null);
  const textNodeRef = useRef<Text | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const lastDirRef = useRef<"ltr" | "rtl" | null>(null);

  useEffect(() => {
    if (mode !== "output" || !outputContainerRef.current) return;
    const container = outputContainerRef.current;
    if (!textNodeRef.current) {
      textNodeRef.current = document.createTextNode("");
    }
    if (!cursorRef.current) {
      const cursor = document.createElement("span");
      cursor.className = "ai-cursor ai-cursor--idle";
      cursorRef.current = cursor;
    }
    const textNode = textNodeRef.current;
    const cursor = cursorRef.current;
    textNode.nodeValue = value;
    const currentDir = dir;
    if (lastDirRef.current !== currentDir) {
      placeCursor(container, textNode, cursor, currentDir);
      lastDirRef.current = currentDir;
    }
    cursor.style.display = status === "done" ? "none" : "inline-block";
    CURSOR_STATE_CLASSES.forEach((c) => cursor.classList.remove(c));
    if (status !== "done") {
      if (status === "thinking") cursor.classList.add("ai-cursor--thinking");
      else if (status === "writing") cursor.classList.add("ai-cursor--writing");
      else cursor.classList.add("ai-cursor--idle");
    }
  }, [mode, value, dir, status]);

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
            ref={outputContainerRef}
            dir={dir}
            className="text-foreground select-text"
            style={{ textAlign: dir === "rtl" ? "right" : "left" }}
          />
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
