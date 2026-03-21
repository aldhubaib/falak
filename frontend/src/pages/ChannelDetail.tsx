import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { parseDuration, fmtDate, fmtDateTime } from "@/lib/utils";
import { ChannelRightPanel } from "@/components/ChannelRightPanel";
import { VideoTable } from "@/components/VideoTable";
import { getCountryName } from "@/data/countries";
import { ArrowLeft, Info, Loader2, Tag, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Video } from "@/data/mock";

const filterTabs = ["All", "Videos", "Shorts", "Analyzing", "Done", "Failed"];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

interface ApiChannel {
  id: string;
  handle: string;
  nameAr: string | null;
  nameEn: string | null;
  type: string;
  avatarUrl: string | null;
  status: string;
  subscribers: string;
  totalViews: string;
  videoCount: number;
  avgViews?: number;
  engagement?: number;
  deltas?: Record<string, number | null>;
  lastFetchedAt: string | null;
  createdAt: string;
  nationality?: string | null;
}

interface ApiVideo {
  id: string;
  channelId: string;
  titleAr: string | null;
  titleEn: string | null;
  viewCount: bigint | number;
  likeCount: bigint | number;
  commentCount?: bigint | number;
  publishedAt: string | null;
  duration: string | null;
  videoType: string;
  thumbnailUrl: string | null;
  pipelineItem?: { stage: string; status: string } | null;
}

/** Derive "short" | "video" from API (videoType case-insensitive; fallback from duration ≤60s). */
function videoType(v: ApiVideo): "short" | "video" {
  const t = (v.videoType || "").toLowerCase();
  if (t === "short") return "short";
  if (t === "video") return "video";
  if (v.duration) {
    const m = v.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (m) {
      const secs = (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
      return secs <= 60 ? "short" : "video";
    }
  }
  return "video";
}

function mapVideo(v: ApiVideo): Video {
  const views = Number(v.viewCount) || 0;
  const likes = Number(v.likeCount) || 0;
  const status = (v.pipelineItem?.status as Video["status"]) || "pending";
  return {
    id: v.id,
    channelId: v.channelId,
    title: v.titleEn || v.titleAr || "",
    type: videoType(v),
    views: formatCount(views),
    likes: formatCount(likes),
    comments: "",
    date: v.publishedAt ? fmtDate(v.publishedAt) : "",
    duration: parseDuration(v.duration),
    status: status === "running" ? "analyzing" : status,
    viewsRaw: views,
    likesRaw: likes,
    commentsRaw: 0,
    thumbnail: v.thumbnailUrl || undefined,
    pipeline: [],
  };
}

const DEFAULT_EN_TAGS = [
  "unsolved", "cold case", "missing", "disappeared", "no arrest", "still at large",
  "unidentified", "Jane Doe", "John Doe", "remains found", "unexplained",
  "suspicious death", "open case", "no leads", "reward offered", "tip line",
  "last seen", "vanished", "buried secrets", "hidden body", "anonymous tip",
  "decades old", "case reopened", "new evidence", "witness needed",
  "person of interest", "baffling", "strange disappearance", "never found",
  "presumed dead", "unnamed victim", "secret identity", "cover up", "conspiracy",
  "whistleblower", "undiscovered",
];

function ContentDNASection({ channelId }: { channelId: string }) {
  const [enTags, setEnTags] = useState<string[]>([]);
  const [arTags, setArTags] = useState<string[]>([]);
  const [enInput, setEnInput] = useState("");
  const [arInput, setArInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [embStatus, setEmbStatus] = useState<{ hasEmbedding: boolean; generatedAt: string | null } | null>(null);
  const enRef = useRef<HTMLInputElement>(null);
  const arRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/channels/${channelId}/niche-tags`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { nicheTags: [], nicheTagsAr: [] }))
      .then((data: { nicheTags: string[]; nicheTagsAr: string[] }) => {
        if (cancelled) return;
        const en = data.nicheTags ?? [];
        setEnTags(en.length === 0 ? [...DEFAULT_EN_TAGS] : en);
        setArTags(data.nicheTagsAr ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [channelId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/channels/${channelId}/niche-embedding-status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setEmbStatus(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channelId]);

  const handleGenerate = () => {
    setGenerating(true);
    fetch(`/api/channels/${channelId}/generate-niche-embedding`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((data) => {
        toast.success("Embedding generated");
        setEmbStatus({ hasEmbedding: true, generatedAt: data.generatedAt ?? new Date().toISOString() });
      })
      .catch(() => toast.error("Failed to generate embedding"))
      .finally(() => setGenerating(false));
  };

  const addTag = (
    value: string,
    tags: string[],
    setTags: (t: string[]) => void,
    setInput: (v: string) => void,
    caseInsensitive: boolean,
  ) => {
    const trimmed = value.trim();
    if (!trimmed || tags.length >= 100) return;
    const dup = caseInsensitive
      ? tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())
      : tags.includes(trimmed);
    if (dup) { setInput(""); return; }
    setTags([...tags, trimmed]);
    setInput("");
  };

  const addMany = (
    raw: string,
    tags: string[],
    setTags: (t: string[]) => void,
    caseInsensitive: boolean,
  ) => {
    const items = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    const next = [...tags];
    for (const item of items) {
      if (next.length >= 100) break;
      const dup = caseInsensitive
        ? next.some((t) => t.toLowerCase() === item.toLowerCase())
        : next.includes(item);
      if (!dup) next.push(item);
    }
    setTags(next);
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    tags: string[],
    setTags: (t: string[]) => void,
    setInput: (v: string) => void,
    caseInsensitive: boolean,
  ) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n") || text.includes(",")) {
      e.preventDefault();
      addMany(text, tags, setTags, caseInsensitive);
      setInput("");
    }
  };

  const handleKey = (
    e: KeyboardEvent<HTMLInputElement>,
    input: string,
    tags: string[],
    setTags: (t: string[]) => void,
    setInput: (v: string) => void,
    caseInsensitive: boolean,
  ) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input.replace(/,$/, ""), tags, setTags, setInput, caseInsensitive);
    }
  };

  const removeTag = (idx: number, tags: string[], setTags: (t: string[]) => void) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    setSaving(true);
    fetch(`/api/channels/${channelId}/niche-tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nicheTags: enTags, nicheTagsAr: arTags }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        toast.success("Content DNA saved");
      })
      .catch(() => toast.error("Failed to save Content DNA"))
      .finally(() => setSaving(false));
  };

  if (!loaded) return null;

  return (
    <div className="px-6 pt-5 max-lg:px-4">
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className="text-[13px] font-semibold text-foreground">Content DNA</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tags that define your niche. Used by the scoring system to identify relevant stories.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 max-md:grid-cols-1 divide-x max-md:divide-x-0 max-md:divide-y divide-border">
          {/* English Tags */}
          <div className="px-5 py-4">
            <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-2 block">
              English Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
              {enTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-card text-secondary-foreground"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(i, enTags, setEnTags)}
                    className="ml-0.5 hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              ref={enRef}
              type="text"
              value={enInput}
              onChange={(e) => setEnInput(e.target.value)}
              onKeyDown={(e) => handleKey(e, enInput, enTags, setEnTags, setEnInput, true)}
              onPaste={(e) => handlePaste(e, enTags, setEnTags, setEnInput, true)}
              className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Type a tag and press Enter, or paste a list…"
              disabled={enTags.length >= 100}
            />
          </div>

          {/* Arabic Tags */}
          <div className="px-5 py-4">
            <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-2 block" dir="rtl">
              Arabic Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]" dir="rtl">
              {arTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-medium bg-card text-secondary-foreground"
                  dir="rtl"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(i, arTags, setArTags)}
                    className="ml-0.5 hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              ref={arRef}
              type="text"
              value={arInput}
              onChange={(e) => setArInput(e.target.value)}
              onKeyDown={(e) => handleKey(e, arInput, arTags, setArTags, setArInput, false)}
              onPaste={(e) => handlePaste(e, arTags, setArTags, setArInput, false)}
              dir="rtl"
              className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="اكتب وسم واضغط Enter، أو الصق قائمة…"
              disabled={arTags.length >= 100}
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-[12px] font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="px-5 py-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {generating ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : embStatus?.hasEmbedding ? (
                <span className="w-2 h-2 rounded-full bg-success shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
              )}
              <span className="text-[12px] text-foreground">
                {generating
                  ? "Generating…"
                  : embStatus?.hasEmbedding
                    ? `Active — generated ${embStatus.generatedAt ? fmtDate(embStatus.generatedAt) : ""}`
                    : "Not generated"}
              </span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-border bg-background text-foreground hover:bg-card transition-colors disabled:opacity-50"
            >
              <Zap className="w-3 h-3" />
              {embStatus?.hasEmbedding ? "Regenerate" : "Generate Embedding"}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            The embedding is a semantic fingerprint of your niche. Regenerate it whenever you update your tags.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChannelDetail() {
  const { id } = useParams();
  const channelPath = useChannelPath();
  const [channel, setChannel] = useState<ApiChannel | null>(null);
  const [channelVideos, setChannelVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [panelVisible, setPanelVisible] = useState(false);
  const [channelType, setChannelType] = useState<"ours" | "competition">("ours");
  const closePanel = useCallback(() => setPanelVisible(false), []);

  const handleTypeChange = useCallback((newType: "ours" | "competition") => {
    if (!id) return;
    const dbType = newType === "ours" ? "ours" : "competitor";
    setChannelType(newType);
    fetch(`/api/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: dbType }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        toast.success(`Channel marked as ${newType === "ours" ? "Ours" : "Competition"}`);
      })
      .catch(() => {
        setChannelType(newType === "ours" ? "competition" : "ours");
        toast.error("Failed to update classification");
      });
  }, [id]);

  const refetchChannel = useCallback(() => {
    if (!id) return;
    fetch(`/api/channels/${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.id === "string") {
          setChannel(data);
          setChannelType(data.type === "ours" ? "ours" : "competition");
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setChannel(null);
    fetch(`/api/channels/${id}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 404) { if (!cancelled) setNotFound(true); return null; }
        if (!r.ok) throw new Error("Failed to load channel");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.id === "string") {
          setChannel(data);
          setChannelType(data.type === "ours" ? "ours" : "competition");
        } else {
          setNotFound(true);
        }
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/channels/${id}/videos?limit=100`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((data: { videos: ApiVideo[] }) => { if (!cancelled) setChannelVideos((data.videos || []).map(mapVideo)); })
      .catch(() => { if (!cancelled) setChannelVideos([]); });
    return () => { cancelled = true; };
  }, [id]);

  const filteredVideos = channelVideos.filter((v) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Videos") return v.type === "video";
    if (activeFilter === "Shorts") return v.type === "short";
    if (activeFilter === "Analyzing") return v.status === "analyzing";
    if (activeFilter === "Done") return v.status === "done";
    if (activeFilter === "Failed") return v.status === "failed";
    return true;
  });

  // All stats from DB: channel from GET /api/channels/:id (Channel + getChannelStats), videos from GET /api/channels/:id/videos
  const name = channel ? (channel.nameEn || channel.nameAr || channel.handle) : "";
  const avatarImg = channel?.avatarUrl || "/placeholder.svg";
  const subs = channel ? formatCount(Number(channel.subscribers) || 0) : "0";           // Channel.subscribers
  const views = channel ? formatCount(Number(channel.totalViews) || 0) : "0";          // Channel.totalViews
  const avgViews = channel?.avgViews != null ? formatCount(channel.avgViews) : "—";    // Video aggregate _avg(viewCount)
  const engRate = channel?.engagement != null ? `${channel.engagement.toFixed(1)}%` : "—"; // Video (likes+comments)/views
  const deltaSubs = channel?.deltas?.subscribers;
  const deltaViews = channel?.deltas?.totalViews;
  const growthSubs = deltaSubs != null ? (deltaSubs >= 0 ? `+${deltaSubs}` : String(deltaSubs)) : "—";
  const growthViews = deltaViews != null ? (deltaViews >= 0 ? `+${deltaViews}` : String(deltaViews)) : "—";
  const joinedDate = channel?.createdAt ? fmtDate(channel.createdAt) : "—";

  const stats = [
    { val: subs, label: "Subscribers", change: growthSubs, up: true },
    { val: views, label: "Total Views", change: growthViews, up: true },
    { val: String(channelVideos.length), label: "Videos", change: "—", up: true },
    { val: avgViews, label: "Avg. Views", change: "—", up: false },
    { val: engRate, label: "Eng. Rate", change: "—", up: true },
  ];

  const lastSynced = channel?.lastFetchedAt ? fmtDateTime(channel.lastFetchedAt) : "—";
  const channelForPanel = channel
    ? {
        id: channel.id,
        name,
        handle: channel.handle,
        avatarImg,
        type: channelType,
        subscribers: subs,
        views,
        videos: String(channelVideos.length),
        avgViews,
        engRate,
        growthSubs,
        growthViews,
        country: channel.nationality ? getCountryName(channel.nationality) : "",
        nationality: channel.nationality ?? undefined,
        joinedDate,
        lastSynced,
        startHook: (channel as { startHook?: string | null }).startHook ?? "",
        endHook: (channel as { endHook?: string | null }).endHook ?? "",
      }
    : null;

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-[13px] text-foreground">Loading channel…</p>
      </div>
    );
  }

  if (notFound || !channel) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-card p-6">
        <p className="text-foreground text-[14px] mb-2">This page has been deleted.</p>
        <Link
          to={channelPath("")}
          className="text-muted-foreground hover:text-foreground underline text-[13px]"
        >
          Return to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <Link
          to={channelPath(channelType === "competition" ? "/competitions" : "")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground bg-transparent border-none font-sans hover:text-foreground transition-colors no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {channelType === "competition" ? "Competitions" : "Our Channels"}
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelVisible(!panelVisible)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div>
          <div className="px-6 py-5 flex items-start gap-3.5 max-lg:px-4">
            <img
              src={avatarImg}
              alt={name}
              className="w-12 h-12 rounded-full object-cover shrink-0 max-md:w-10 max-md:h-10 bg-card"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='%23666'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='14'%3E" + (name.charAt(0) || "?") + "%3C/text%3E%3C/svg%3E";
              }}
            />
            <div>
              <h1 className="text-base font-semibold tracking-tight mb-0.5 max-md:text-sm" dir="rtl">
                {name}
              </h1>
              <a
                href={`https://youtube.com/${channel.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-muted-foreground font-mono mb-2 inline-block hover:text-muted-foreground transition-colors no-underline"
              >
                {channel.handle}
              </a>
              <div className="flex gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-success/10 text-success">
                  {channel.status === "active" ? "Active" : channel.status}
                </span>
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-card text-muted-foreground">
                  Since {joinedDate}
                </span>
              </div>
            </div>
          </div>

          <div className="px-6 max-lg:px-4">
            <div className="grid grid-cols-5 max-lg:grid-cols-2 rounded-lg overflow-hidden border border-border">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-5 py-4 bg-background border-r border-b border-border last:border-r-0 ${
                    i === stats.length - 1 ? "max-lg:col-span-2 max-lg:border-r-0" : ""
                  }`}
                >
                  <div className="text-lg font-semibold font-mono tracking-tight mb-0.5">{s.val}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  <div className="text-[11px] font-mono mt-0.5 text-muted-foreground">{s.change}</div>
                </div>
              ))}
            </div>
          </div>

          {channelType === "ours" && channel && (
            <ContentDNASection channelId={channel.id} />
          )}

          <div className="px-6 py-5 pb-16 max-lg:px-4 max-lg:pb-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] text-muted-foreground font-medium">Recent Videos</span>
            </div>
            {(() => {
              const counts: Record<string, number> = {
                All: channelVideos.length,
                Videos: channelVideos.filter((v) => v.type === "video").length,
                Shorts: channelVideos.filter((v) => v.type === "short").length,
                Analyzing: channelVideos.filter((v) => v.status === "analyzing").length,
                Done: channelVideos.filter((v) => v.status === "done").length,
                Failed: channelVideos.filter((v) => v.status === "failed").length,
              };
              return (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {filterTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFilter(tab)}
                      className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors whitespace-nowrap border ${
                        activeFilter === tab
                          ? "bg-card text-foreground border-border"
                          : "bg-transparent text-muted-foreground border-border/50 hover:text-muted-foreground hover:border-border"
                      }`}
                    >
                      {tab} <span className="text-[11px] opacity-60">({counts[tab]})</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            <VideoTable videos={filteredVideos} getVideoHref={(vid) => channelPath(`/video/${vid}`)} />
          </div>
        </div>

        {channelForPanel && (
          <ChannelRightPanel
            channel={channelForPanel}
            visible={panelVisible}
            onClose={closePanel}
            videoCount={channelVideos.filter((v) => v.type === "video").length}
            shortCount={channelVideos.filter((v) => v.type === "short").length}
            onTypeChange={handleTypeChange}
            onCountryChange={refetchChannel}
            onBrandedHooksSaved={refetchChannel}
          />
        )}
      </div>
    </div>
  );
}
