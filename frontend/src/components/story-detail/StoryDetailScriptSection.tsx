import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, Film, Smartphone, ChevronDown, Zap, BookOpen } from "lucide-react";

export type ScriptLength = "short" | "long";

export interface StoryDetailScriptSectionProps {
  scriptLength: ScriptLength;
  onScriptLengthChange: (length: ScriptLength) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
  readOnly: boolean;
  showGenerateControls?: boolean;
  scriptValue?: string;
  onScriptChange?: (value: string) => void;
  saving?: boolean;
  scriptRef?: React.MutableRefObject<{ setContent: (v: string) => void } | null>;
  videoFormat?: "short" | "long";
  onVideoFormatChange?: (format: "short" | "long") => void;
  channelAvatarUrl?: string | null;
  channelName?: string;
}

export function StoryDetailScriptSection({
  scriptLength,
  onScriptLengthChange,
  canGenerate,
  generating,
  onGenerate,
  readOnly,
  showGenerateControls = true,
  scriptValue,
  onScriptChange,
  saving = false,
  scriptRef,
  videoFormat,
  onVideoFormatChange,
  channelAvatarUrl,
  channelName,
}: StoryDetailScriptSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(200, el.scrollHeight)}px`;
  };

  useEffect(() => {
    if (scriptRef) {
      scriptRef.current = {
        setContent: (v: string) => {
          if (textareaRef.current) textareaRef.current.value = v;
          onScriptChange?.(v);
          requestAnimationFrame(autoResize);
        },
      };
    }
  }, [scriptRef, onScriptChange]);

  const value = scriptValue ?? "";

  useEffect(() => {
    if (!collapsed) requestAnimationFrame(autoResize);
  }, [value, collapsed]);

  return (
    <section>
      {showGenerateControls && onVideoFormatChange && (
        <div className="mb-3">
          <div className="mb-1.5 text-[12px] text-muted-foreground font-medium">Format</div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onVideoFormatChange("long")}
              className={`flex items-center gap-2 px-4 py-2 text-[12px] font-medium transition-colors ${
                videoFormat === "long"
                  ? "bg-primary/15 text-primary"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Long Video
            </button>
            <button
              type="button"
              onClick={() => onVideoFormatChange("short")}
              className={`flex items-center gap-2 px-4 py-2 text-[12px] font-medium transition-colors border-l border-border ${
                videoFormat === "short"
                  ? "bg-primary/15 text-primary"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Short
            </button>
          </div>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground font-medium">Script</span>
          {saving && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-normal">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-card border border-border overflow-visible">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full px-4 max-sm:px-3 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2 hover:bg-card/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 flex-1" onClick={(e) => e.stopPropagation()}>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${collapsed ? "-rotate-90" : ""}`}
              onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
              style={{ cursor: "pointer" }}
            />
            <div className="inline-flex items-center bg-card rounded-full border border-border">
              {!readOnly && showGenerateControls ? (
                <>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onScriptLengthChange("short"); }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors rounded-l-full ${
                        scriptLength === "short"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      Short
                    </button>
                    <span className="w-px h-4 bg-border" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onScriptLengthChange("long"); }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        scriptLength === "long"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BookOpen className="w-3 h-3" />
                      Detailed
                    </button>
                  </div>
                  <span className="w-px h-4 bg-border" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canGenerate && !generating) onGenerate();
                    }}
                    disabled={!canGenerate}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap rounded-r-full ${
                      canGenerate ? "text-foreground hover:bg-card" : "text-muted-foreground/30 cursor-not-allowed"
                    }`}
                  >
                    {generating ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Generate
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground font-medium">
                  {scriptLength === "short" ? <Zap className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
                  {scriptLength === "short" ? "Short" : "Detailed"}
                </span>
              )}
            </div>
          </div>

          {channelAvatarUrl ? (
            <img
              src={channelAvatarUrl}
              alt={channelName || ""}
              className="w-6 h-6 rounded-full object-cover shrink-0 border border-border"
            />
          ) : channelName ? (
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
              {channelName.charAt(0).toUpperCase()}
            </div>
          ) : null}
        </button>

        {!collapsed && (
          <div className="px-5 max-sm:px-3 py-4 overflow-visible bg-card">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                onScriptChange?.(e.target.value);
                autoResize();
              }}
              readOnly={readOnly}
              dir="auto"
              placeholder="Write your script here…"
              className="w-full min-h-[200px] bg-transparent text-foreground text-[0.95rem] leading-[1.7] resize-none focus:outline-none placeholder:text-muted-foreground/50 overflow-hidden"
            />
          </div>
        )}
      </div>
    </section>
  );
}
