import { useRef, useEffect, useState } from "react";
import type { Channel } from "@/data/mock";
import { toast } from "sonner";
import { RefreshCw, Play, Trash2, Calendar, Hash, TrendingUp, X, Zap, Users, Eye, CircleDot, Clock, Globe } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";
import { COUNTRIES } from "@/data/countries";

interface ChannelRightPanelProps {
  channel: Channel & { nationality?: string | null };
  visible: boolean;
  onClose: () => void;
  videoCount?: number;
  shortCount?: number;
  onCountryChange?: () => void;
  onBrandedHooksSaved?: () => void;
  onSyncNow?: () => void;
  onAnalyzeAll?: () => void;
  onRemove?: () => void;
}

interface InfoRow {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
  status?: boolean;
}

const buildRows = (channel: Channel, videoCount?: number, shortCount?: number): InfoRow[] => [
  { icon: Hash, label: "Handle", value: channel.handle || "—" },
  ...(channel.country ? [{ icon: Globe, label: "Nationality", value: channel.country }] : []),
  { icon: Calendar, label: "Added", value: "—" },
  { icon: Play, label: "Videos", value: String(videoCount ?? 0) },
  { icon: Zap, label: "Shorts", value: String(shortCount ?? 0) },
  { icon: Users, label: "Subscribers", value: channel.subscribers || "—" },
  { icon: Eye, label: "Total Views", value: channel.views || "—" },
  { icon: TrendingUp, label: "Engagement", value: channel.engRate ? `${channel.engRate} ↑` : "—", highlight: true },
  { icon: CircleDot, label: "Status", value: "● Active", status: true },
  { icon: Clock, label: "Last sync", value: (() => { const s = channel.lastSynced || "—"; return s.includes(",") ? `Today · ${s.split(", ")[1]}` : s; })() },
];

function BrandedHooksSection({
  channelId,
  startHook: initialStartHook,
  endHook: initialEndHook,
  onSaved,
}: {
  channelId: string;
  startHook: string;
  endHook: string;
  onSaved?: () => void;
}) {
  const [hookStart, setHookStart] = useState(initialStartHook);
  const [hookEnd, setHookEnd] = useState(initialEndHook);
  const [saving, setSaving] = useState(false);

  // Sync from parent when panel opens or channel refetches
  useEffect(() => {
    setHookStart(initialStartHook);
    setHookEnd(initialEndHook);
  }, [initialStartHook, initialEndHook]);

  const handleSave = () => {
    setSaving(true);
    fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ startHook: hookStart.trim() || null, endHook: hookEnd.trim() || null }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        toast.success("Branded hooks saved");
        onSaved?.();
      })
      .catch(() => toast.error("Failed to save branded hooks"))
      .finally(() => setSaving(false));
  };

  return (
    <div className="px-4 py-3 border-t border-border space-y-2.5">
      <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest">Branded Hooks</span>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1 block">Start Hook</label>
        <input
          type="text"
          value={hookStart}
          onChange={(e) => setHookStart(e.target.value)}
          className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          placeholder="e.g. Hey everyone, welcome back to..."
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1 block">End Hook</label>
        <input
          type="text"
          value={hookEnd}
          onChange={(e) => setHookEnd(e.target.value)}
          className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          placeholder="e.g. Don't forget to like and subscribe!"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 text-[12px] font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export function ChannelRightPanel({ channel, visible, onClose, videoCount, shortCount, onCountryChange, onBrandedHooksSaved, onSyncNow, onAnalyzeAll, onRemove }: ChannelRightPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  const handleSync = () => {
    setSyncing(true);
    // refresh = update channel metadata; fetch-videos = pull new videos into pipeline
    fetch(`/api/channels/${channel.id}/refresh`, { method: "POST", credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Failed"); })
      .catch(() => {})
    fetch(`/api/channels/${channel.id}/fetch-videos`, { method: "POST", credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Sync failed");
        return r.json();
      })
      .then((data) => {
        toast.success(`Sync done — ${data.added ?? 0} new video(s) queued`);
        onSyncNow?.();
      })
      .catch(() => toast.error("Sync failed"))
      .finally(() => setSyncing(false));
  };

  const handleAnalyzeAll = () => {
    setAnalyzing(true);
    fetch(`/api/channels/${channel.id}/analyze-all`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        toast.success("All videos queued for AI analysis");
        onAnalyzeAll?.();
      })
      .catch(() => toast.error("Failed to queue analysis"))
      .finally(() => setAnalyzing(false));
  };

  const handleRemove = () => {
    fetch(`/api/channels/${channel.id}`, { method: "DELETE", credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Delete failed");
        toast.success("Channel removed");
        setRemoveOpen(false);
        onClose();
        onRemove?.();
      })
      .catch(() => toast.error("Failed to remove channel"));
  };

  if (!visible) return null;

  const rows = buildRows(channel, videoCount, shortCount);

  return (
    <div
      ref={ref}
      className="absolute top-2 right-2 w-[260px] rounded-lg bg-card border border-border shadow-xl shadow-black/30 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest">Overview</span>
        <button onClick={onClose} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Info rows */}
      <div className="px-4 py-3 space-y-0">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-1.5">
              {row.label === "Videos" ? (
                <VideoTypeIcon type="video" className="w-3 h-3 text-muted-foreground" />
              ) : row.label === "Shorts" ? (
                <VideoTypeIcon type="short" className="w-3 h-3 text-muted-foreground" />
              ) : (
                <row.icon className="w-3 h-3 text-muted-foreground" />
              )}
              <span className="text-[11px] text-muted-foreground">{row.label}</span>
            </div>
            <span className={`text-[12px] font-mono font-medium ${
              row.status ? "text-success" : row.highlight ? "text-primary" : "text-foreground"
            }`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Country */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground">Country</span>
        </div>
        <select
          value={channel.nationality ?? ""}
          onChange={(e) => {
            const value = e.target.value || null;
            setSavingCountry(true);
            fetch(`/api/channels/${channel.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ nationality: value }),
            })
              .then((r) => {
                if (!r.ok) throw new Error("Failed to update");
                toast.success("Country updated");
                onCountryChange?.();
              })
              .catch(() => toast.error("Failed to update country"))
              .finally(() => setSavingCountry(false));
          }}
          disabled={savingCountry}
          className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
        >
          <option value="">Select country</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleSync} disabled={syncing} className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-border text-muted-foreground cursor-pointer transition-all hover:bg-border hover:text-foreground disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Sync now</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleAnalyzeAll} disabled={analyzing} className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 border border-primary/15 text-primary cursor-pointer transition-all hover:bg-primary/15 disabled:opacity-50">
              <Play className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Analyze all</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setRemoveOpen(true)} className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent border border-destructive/15 text-destructive cursor-pointer transition-all hover:bg-destructive/[0.06]">
              <Trash2 className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove channel</TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove channel?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {channel.name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
