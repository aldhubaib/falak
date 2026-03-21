import { useState, useEffect, useRef } from "react";
import { User, ChevronDown, Clock, Sparkles, Check, Loader2, Film, Smartphone } from "lucide-react";
import type { ApiChannel } from "./types";
import { channelName } from "./StoryDetailChannelSelector";

export interface StoryDetailScriptSectionProps {
  channels: ApiChannel[];
  selectedChannelId: string;
  onChannelSelect: (id: string) => void;
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
}

export function StoryDetailScriptSection({
  channels,
  selectedChannelId,
  onChannelSelect,
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
}: StoryDetailScriptSectionProps) {
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [durationInput, setDurationInput] = useState(() => String(scriptDuration));
  const userClearedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedCh = channels.find((c) => c.id === selectedChannelId);

  useEffect(() => {
    if (userClearedRef.current && scriptDuration === 0) {
      setDurationInput("");
      userClearedRef.current = false;
    } else {
      setDurationInput(String(scriptDuration));
    }
  }, [scriptDuration]);

  useEffect(() => {
    if (scriptRef) {
      scriptRef.current = {
        setContent: (v: string) => {
          if (textareaRef.current) textareaRef.current.value = v;
          onScriptChange?.(v);
        },
      };
    }
  }, [scriptRef, onScriptChange]);

  const value = scriptValue ?? "";

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
        <div className="px-4 max-sm:px-3 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="inline-flex items-center bg-card rounded-full border border-border flex-wrap">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => !readOnly && setChannelDropOpen(!channelDropOpen)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 hover:bg-card transition-colors rounded-l-full"
                >
                  {selectedCh ? (
                    selectedCh.avatarUrl ? (
                      <img
                        src={selectedCh.avatarUrl}
                        alt={channelName(selectedCh)}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center text-[10px] font-mono text-muted-foreground uppercase">
                        {channelName(selectedCh).slice(0, 2)}
                      </div>
                    )
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center">
                      <User className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  {!readOnly && <ChevronDown className={`w-2.5 h-2.5 text-muted-foreground transition-transform ${channelDropOpen ? "rotate-180" : ""}`} />}
                </button>
                {channelDropOpen && !readOnly && (
                  <div className="absolute z-10 mt-2 left-0 w-64 rounded-lg bg-card border border-border overflow-hidden shadow-lg">
                    {channels.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-muted-foreground text-center">
                        No channels added yet. Add your channels in the Channels page.
                      </div>
                    ) : (
                    channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onChannelSelect(c.id);
                          setChannelDropOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-card ${
                          selectedChannelId === c.id ? "bg-primary/10" : ""
                        }`}
                      >
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt={channelName(c)} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-card flex items-center justify-center text-[10px] font-mono text-muted-foreground uppercase">
                            {channelName(c).slice(0, 2)}
                          </div>
                        )}
                        <span className="flex-1 text-right font-medium">{channelName(c)}</span>
                        {selectedChannelId === c.id && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))
                    )}
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-border" />

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
                    onClick={() => canGenerate && !generating && onGenerate()}
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

        </div>

        <div className="px-5 max-sm:px-3 py-4 overflow-visible bg-card">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onScriptChange?.(e.target.value)}
            readOnly={readOnly}
            dir="auto"
            placeholder="Write your script here…"
            className="w-full min-h-[200px] bg-transparent text-foreground text-[0.95rem] leading-[1.7] resize-y focus:outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>
    </section>
  );
}
