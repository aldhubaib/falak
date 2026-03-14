import { useRef, useEffect } from "react";
import type { Video, PipelineStep } from "@/data/mock";
import { X, Eye, Heart, MessageCircle, Clock, Calendar, Film, RefreshCw, ExternalLink } from "lucide-react";

interface VideoRightPanelProps {
  video: Video;
  visible: boolean;
  onClose: () => void;
  pipeline: PipelineStep[];
}

export function VideoRightPanel({ video, visible, onClose, pipeline }: VideoRightPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  if (!visible) return null;

  const infoRows = [
    { icon: Eye, label: "Views", value: video.views },
    { icon: Heart, label: "Likes", value: video.likes },
    { icon: MessageCircle, label: "Comments", value: video.comments },
    { icon: Clock, label: "Duration", value: video.duration },
    { icon: Calendar, label: "Published", value: video.date },
    { icon: Film, label: "Type", value: video.type },
  ];

  return (
    <div
      ref={ref}
      className="absolute top-2 right-2 w-[260px] rounded-xl bg-surface border border-border shadow-xl shadow-black/30 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[11px] text-dim font-mono uppercase tracking-widest">Video Info</span>
        <button onClick={onClose} className="w-5 h-5 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Info rows */}
      <div className="px-4 py-3 space-y-0">
        {infoRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-1.5">
              <row.icon className="w-3 h-3 text-dim" />
              <span className="text-[11px] text-dim">{row.label}</span>
            </div>
            <span className="text-[12px] font-mono font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>


      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <button title="Re-analyze" className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 border border-primary/15 text-primary cursor-pointer transition-all hover:bg-primary/15">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button title="Open on YouTube" className="w-10 h-10 rounded-full flex items-center justify-center bg-elevated border border-border text-sensor cursor-pointer transition-all hover:bg-border hover:text-foreground">
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
