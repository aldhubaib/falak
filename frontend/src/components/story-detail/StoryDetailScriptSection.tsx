import { useState } from "react";
import { User, ChevronDown, Clock, Sparkles, Check } from "lucide-react";
import type { ApiChannel } from "./types";
import { channelName } from "./StoryDetailChannelSelector";

export interface StoryDetailScriptSectionProps {
  channels: ApiChannel[];
  selectedChannelId: string;
  onChannelSelect: (id: string) => void;
  scriptFormat: "short" | "long";
  onScriptFormatChange: (format: "short" | "long") => void;
  scriptDuration: number;
  onScriptDurationChange: (minutes: number) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
  readOnly: boolean;
  scriptValue?: string;
  onScriptChange?: (value: string) => void;
}

export function StoryDetailScriptSection({
  channels,
  selectedChannelId,
  onChannelSelect,
  scriptFormat,
  onScriptFormatChange,
  scriptDuration,
  onScriptDurationChange,
  canGenerate,
  generating,
  onGenerate,
  readOnly,
  scriptValue,
  onScriptChange,
}: StoryDetailScriptSectionProps) {
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const selectedCh = channels.find((c) => c.id === selectedChannelId);

  return (
    <section>
      <div className="mb-2">
        <span className="text-[12px] text-dim font-medium">Script</span>
      </div>
      <div className="rounded-xl bg-background border border-border overflow-visible">
        <div className="px-4 max-sm:px-3 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="inline-flex items-center bg-surface rounded-full border border-border flex-wrap">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setChannelDropOpen(!channelDropOpen)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 hover:bg-elevated transition-colors rounded-l-full"
                >
                  {selectedCh ? (
                    selectedCh.avatarUrl ? (
                      <img
                        src={selectedCh.avatarUrl}
                        alt={channelName(selectedCh)}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                        {channelName(selectedCh).slice(0, 2)}
                      </div>
                    )
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center">
                      <User className="w-3 h-3 text-dim" />
                    </div>
                  )}
                  <ChevronDown className={`w-2.5 h-2.5 text-dim transition-transform ${channelDropOpen ? "rotate-180" : ""}`} />
                </button>
                {channelDropOpen && (
                  <div className="absolute z-10 mt-2 left-0 w-64 rounded-xl bg-surface border border-border overflow-hidden shadow-lg">
                    {channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onChannelSelect(c.id);
                          setChannelDropOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-elevated ${
                          selectedChannelId === c.id ? "bg-blue/10" : ""
                        }`}
                      >
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt={channelName(c)} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                            {channelName(c).slice(0, 2)}
                          </div>
                        )}
                        <span className="flex-1 text-right font-medium">{channelName(c)}</span>
                        {selectedChannelId === c.id && <Check className="w-3.5 h-3.5 text-blue" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-border" />

              <div className="flex items-center px-1">
                {(["short", "long"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      onScriptFormatChange(fmt);
                      onScriptDurationChange(fmt === "short" ? 3 : 40);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap ${
                      scriptFormat === fmt
                        ? "bg-background text-foreground shadow-sm"
                        : "text-dim hover:text-sensor"
                    }`}
                  >
                    {fmt === "short" ? "Short" : "Video"}
                  </button>
                ))}
              </div>

              <span className="w-px h-4 bg-border" />

              <div className="flex items-center gap-1 px-2.5 text-[11px] text-dim">
                <Clock className="w-3 h-3" />
                <input
                  type="number"
                  value={scriptDuration}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (scriptFormat === "short") {
                      onScriptDurationChange(Math.max(1, Math.min(3, val)));
                    } else {
                      onScriptDurationChange(Math.max(3, val));
                    }
                  }}
                  className="w-10 px-1 py-0.5 text-[11px] font-mono bg-background border border-border rounded-full text-foreground text-center focus:outline-none focus:border-blue [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="font-mono text-[10px]">m</span>
              </div>

              <span className="w-px h-4 bg-border" />

              <button
                type="button"
                onClick={() => canGenerate && !generating && onGenerate()}
                disabled={!canGenerate}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap rounded-r-full ${
                  canGenerate ? "text-dim hover:text-foreground hover:bg-elevated" : "text-dim/30 cursor-not-allowed"
                }`}
              >
                {generating ? (
                  <span className="w-3 h-3 border border-dim border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Generate
              </button>
            </div>
          </div>

          <div className="flex items-center -space-x-2 max-sm:hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative">
                <div className="w-7 h-7 rounded-full bg-elevated border-2 border-background flex items-center justify-center text-[10px] font-mono text-dim">
                  {i}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success border border-background" />
              </div>
            ))}
            <div className="w-7 h-7 rounded-full bg-surface border-2 border-background flex items-center justify-center text-[10px] text-muted-foreground font-medium">
              +2
            </div>
          </div>
        </div>

        <div className="px-5 max-sm:px-3 py-4 overflow-visible">
          <textarea
            className="w-full min-h-[200px] p-0 text-[14px] bg-transparent text-foreground border-none resize-y focus:outline-none placeholder:text-dim"
            value={scriptValue ?? ""}
            onChange={(e) => onScriptChange?.(e.target.value)}
            readOnly={readOnly}
            placeholder="Type your script here…"
          />
        </div>
      </div>
    </section>
  );
}
