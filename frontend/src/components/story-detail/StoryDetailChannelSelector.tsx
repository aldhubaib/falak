import { Check, ChevronDown } from "lucide-react";
import type { ApiChannel } from "./types";

export function channelName(ch: ApiChannel): string {
  return ch.nameAr || ch.nameEn || ch.handle;
}

export interface StoryDetailChannelSelectorProps {
  channels: ApiChannel[];
  selectedId: string;
  open: boolean;
  onToggleOpen: () => void;
  onSelect: (channelId: string) => void;
}

export function StoryDetailChannelSelector({
  channels,
  selectedId,
  open,
  onToggleOpen,
  onSelect,
}: StoryDetailChannelSelectorProps) {
  const selected = channels.find((c) => c.id === selectedId);
  return (
    <div className="rounded-lg bg-background p-5">
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">
        Assign to Channel
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={onToggleOpen}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-full text-[13px] font-medium focus:outline-none focus:border-primary/40"
        >
          {selected ? (
            <>
              {selected.avatarUrl ? (
                <img
                  src={selected.avatarUrl}
                  alt={channelName(selected)}
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-card shrink-0 flex items-center justify-center text-[9px] font-mono text-muted-foreground uppercase">
                  {channelName(selected).slice(0, 2)}
                </div>
              )}
              <span className="flex-1 text-right">{channelName(selected)}</span>
            </>
          ) : (
            <span className="flex-1 text-right text-muted-foreground">Select one of your channels…</span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute z-10 mt-1.5 w-full rounded-lg bg-card border border-border overflow-hidden shadow-lg">
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-card ${
                  selectedId === c.id ? "bg-blue/10" : ""
                }`}
              >
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt={channelName(c)}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-card shrink-0 flex items-center justify-center text-[9px] font-mono text-muted-foreground uppercase">
                    {channelName(c).slice(0, 2)}
                  </div>
                )}
                <span className="flex-1 text-right font-medium">{channelName(c)}</span>
                {selectedId === c.id && (
                  <Check className="w-3.5 h-3.5 text-blue shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
