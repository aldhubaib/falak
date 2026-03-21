import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { DeleteChannelModal } from "@/components/DeleteChannelModal";
import { Plus, ArrowUpRight, RefreshCw, X, Users, Eye, PlayCircle, ChevronDown } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { COUNTRIES } from "@/data/countries";
import { EmptyState } from "@/components/ui/empty-state";

interface ApiChannel {
  id: string;
  handle: string;
  nameAr: string | null;
  nameEn: string | null;
  type: "ours" | "competitor";
  avatarUrl: string | null;
  status: string;
  subscribers: string;
  totalViews: string;
  videoCount: number;
  lastFetchedAt: string | null;
  parentChannelId?: string | null;
  nationality?: string | null;
}

interface Channel {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  avatarImg: string;
  subscribers: string;
  views: string;
  videos: string;
  lastSynced: string;
  nationality?: string | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function mapApiChannel(api: ApiChannel): Channel {
  const subs = Number(api.subscribers) || 0;
  const views = Number(api.totalViews) || 0;
  const name = api.nameEn || api.nameAr || api.handle || "Channel";
  return {
    id: api.id,
    name,
    handle: api.handle,
    avatar: name.charAt(0).toUpperCase(),
    avatarImg: api.avatarUrl || "/placeholder.svg",
    subscribers: formatCount(subs),
    views: formatCount(views),
    videos: String(api.videoCount ?? 0),
    lastSynced: api.lastFetchedAt ? new Date(api.lastFetchedAt).toISOString() : new Date().toISOString(),
    nationality: api.nationality ?? null,
  };
}

export default function Competitions() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [nationality, setNationality] = useState<string>("");

  const fetchChannels = () => {
    setLoading(true);
    const url = channelId
      ? `/api/channels?parentChannelId=${encodeURIComponent(channelId)}`
      : "/api/channels";
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Unauthorized"))))
      .then((data: { channels: ApiChannel[] }) => {
        const competitors = (data.channels || []).filter((ch) => ch.type === "competitor");
        setChannels(competitors.map(mapApiChannel));
      })
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchChannels();
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = () => {
    const val = inputValue.trim();
    if (!val) {
      setInputError("Please enter a channel URL, handle, or ID");
      return;
    }
    if (!channelId) {
      setInputError("No channel selected.");
      return;
    }
    const exists = channels.some(
      (ch) => ch.handle === val || ch.handle === `@${val}` || ch.id === val
    );
    if (exists) {
      setInputError("This channel is already tracked");
      return;
    }
    setInputError("");
    fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        input: val,
        channelId,
        type: "competitor",
        ...(nationality ? { nationality } : {}),
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e?.error || "Failed to add")));
        return r.json();
      })
      .then(() => {
        setInputValue("");
        fetchChannels();
      })
      .catch((err) => setInputError(err.message || "Failed to add channel"));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    fetch(`/api/channels/${deleteTarget}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) return Promise.reject(new Error("Delete failed"));
        setChannels((prev) => prev.filter((c) => c.id !== deleteTarget));
        setDeleteTarget(null);
      })
      .catch(() => setInputError("Delete failed. You may need owner/admin role."));
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center px-6 border-b shrink-0 max-md:px-4 border-border">
        <h1 className="text-sm font-semibold">
          Competitions <span className="text-dim font-normal">({channels.length})</span>
        </h1>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 pb-1 max-md:px-4">
          <div className="flex gap-2 max-md:flex-col items-start flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[12px] text-dim">Nationality:</span>
              <div className="relative">
                <select
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 bg-background border border-border text-foreground text-[13px] font-sans outline-none transition-colors focus:border-border cursor-pointer min-w-[180px]"
                  style={{ borderRadius: "20px" }}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 relative max-md:w-full min-w-0">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setInputError("");
                }}
                placeholder="@handle or channel ID..."
                className={`w-full pl-3 pr-3 py-2 bg-background border text-foreground text-[13px] font-sans outline-none transition-colors placeholder:text-dim ${
                  inputError ? "border-destructive/50" : "border-border focus:border-border"
                }`}
                style={{ borderRadius: "20px" }}
              />
            </div>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-primary text-white text-[13px] font-medium cursor-pointer whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity flex items-center gap-1.5 max-md:w-full max-md:justify-center"
              style={{ borderRadius: "20px" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
          {inputError && (
            <p className="text-[11px] mt-1.5 text-destructive">{inputError}</p>
          )}
        </div>

        <div className="px-6 py-4 max-md:px-4">
          {loading ? (
            <p className="text-dim text-[13px]">Loading channels...</p>
          ) : channels.length === 0 ? (
            <EmptyState title="No competitor channels yet" description="Add your first competitor above." />
          ) : (
            <div className="rounded-lg overflow-hidden border border-border">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="bg-background flex items-center gap-3 px-4 py-3 hover:bg-card transition-colors group border-b border-border last:border-b-0"
                >
                  <div className="relative shrink-0">
                    <img
                      src={ch.avatarImg}
                      alt={ch.name}
                      className="w-8 h-8 rounded-full object-cover bg-elevated"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='%23666'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='14'%3E" + ch.avatar + "%3C/text%3E%3C/svg%3E";
                      }}
                    />
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-success ring-[1.5px] ring-orange" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={channelPath(`/channel/${ch.id}`)}
                      className="flex items-center gap-1.5 mb-0.5 link group no-underline"
                    >
                      <span className="text-[13px] font-medium truncate" dir="rtl">
                        {ch.name}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-dim font-mono">{ch.handle}</span>
                      <span className="text-[10px] text-dim">
                        {formatDistanceToNow(new Date(ch.lastSynced), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-6">
                    <div className="flex items-center gap-1.5 text-[12px] font-mono text-sensor">
                      <Users className="w-3 h-3 text-dim" />
                      {ch.subscribers}
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] font-mono text-sensor">
                      <Eye className="w-3 h-3 text-dim" />
                      {ch.views}
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] font-mono text-sensor">
                      <PlayCircle className="w-3 h-3 text-dim" />
                      {ch.videos}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => fetchChannels()}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Sync channel</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(ch.id);
                          }}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Remove channel</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DeleteChannelModal
        open={!!deleteTarget}
        channelName={channels.find((c) => c.id === deleteTarget)?.name || ""}
        onClose={() => setDeleteTarget(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}
