import { useState, useEffect, useRef } from "react";
import { Clock, Sparkles, Loader2, Film, Smartphone, ChevronDown } from "lucide-react";

export interface StoryDetailScriptSectionProps {
  scriptDuration: number;
  onScriptDurationChange: (minutes: number) => void;
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
  scriptDuration,
  onScriptDurationChange,
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
  const [durationInput, setDurationInput] = useState(() => String(scriptDuration));
  const [collapsed, setCollapsed] = useState(false);
  const userClearedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (userClearedRef.current && scriptDuration === 0) {
      setDurationInput("");
      userClearedRef.current = false;
    } else {
      setDurationInput(String(scriptDuration));
    }
  }, [scriptDuration]);

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
      {!showGenerateControls && videoFormat && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Format</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary">
            {videoFormat === "short" ? "Short" : "Long Video"}
          </span>
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
              <div className="flex items-center gap-1 px-2.5 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3 shrink-0" />
                {readOnly ? (
                  <span className="font-mono text-[11px]">{scriptDuration}</span>
                ) : (
                  <>
                    <input
                      type="number"
                      step="0.1"
                      value={durationInput}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDurationInput(val);
                        if (val === "" || val === "-") {
                          userClearedRef.current = true;
                          onScriptDurationChange(0);
                          return;
                        }
                        const raw = parseFloat(val);
                        if (!Number.isNaN(raw) && raw >= 0) {
                          userClearedRef.current = false;
                          onScriptDurationChange(raw);
                        }
                      }}
                      onBlur={() => {
                        if (durationInput === "") {
                          setDurationInput(String(scriptDuration));
                        }
                      }}
                      className="w-12 bg-transparent font-mono text-[11px] text-foreground focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="font-mono text-[10px]">min</span>
                  </>
                )}
              </div>

              {showGenerateControls && !readOnly && (
                <>
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
