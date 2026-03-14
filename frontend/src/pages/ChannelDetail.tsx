import { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { ChannelRightPanel } from "@/components/ChannelRightPanel";
import { VideoTable } from "@/components/VideoTable";
import { ArrowLeft, Info } from "lucide-react";
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
    date: v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "",
    duration: v.duration || "",
    status: status === "running" ? "analyzing" : status,
    viewsRaw: views,
    likesRaw: likes,
    commentsRaw: 0,
    thumbnail: v.thumbnailUrl || undefined,
    pipeline: [],
  };
}

export default function ChannelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [channel, setChannel] = useState<ApiChannel | null>(null);
  const [channelVideos, setChannelVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [panelVisible, setPanelVisible] = useState(false);
  const [channelType, setChannelType] = useState<"ours" | "competition">("ours");
  const closePanel = useCallback(() => setPanelVisible(false), []);

  const refetchChannel = useCallback(() => {
    if (!id) return;
    fetch(`/api/channels/${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.id === "string") {
          setChannel(data);
          setChannelType(data.type === "own" ? "ours" : "competition");
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setChannel(null);
    fetch(`/api/channels/${id}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error("Failed to load channel");
        return r.json();
      })
      .then((data) => {
        if (data && typeof data.id === "string") {
          setChannel(data);
          setChannelType(data.type === "own" ? "ours" : "competition");
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/channels/${id}/videos?limit=100`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((data: { videos: ApiVideo[] }) => setChannelVideos((data.videos || []).map(mapVideo)))
      .catch(() => setChannelVideos([]));
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
  const joinedDate = channel?.createdAt ? new Date(channel.createdAt).toLocaleDateString() : "—";

  const stats = [
    { val: subs, label: "Subscribers", change: growthSubs, up: true },
    { val: views, label: "Total Views", change: growthViews, up: true },
    { val: String(channelVideos.length), label: "Videos", change: "—", up: true },
    { val: avgViews, label: "Avg. Views", change: "—", up: false },
    { val: engRate, label: "Eng. Rate", change: "—", up: true },
  ];

  const lastSynced = channel?.lastFetchedAt ? new Date(channel.lastFetchedAt).toLocaleString() : "—";
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
        country: "",
        joinedDate,
        lastSynced,
        startHook: (channel as { startHook?: string | null }).startHook ?? "",
        endHook: (channel as { endHook?: string | null }).endHook ?? "",
      }
    : null;

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-sensor border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[13px] text-foreground">Loading channel…</p>
      </div>
    );
  }

  if (notFound || !channel) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-surface p-6">
        <p className="text-foreground text-[14px] mb-2">This page has been deleted.</p>
        <button
          onClick={() => navigate(projectPath(""))}
          className="text-sensor hover:text-foreground underline text-[13px]"
        >
          Return to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <button
          onClick={() => navigate(projectPath(""))}
          className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Channels
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelVisible(!panelVisible)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-dim hover:text-foreground hover:bg-elevated transition-colors"
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
              className="w-12 h-12 rounded-full object-cover shrink-0 max-md:w-10 max-md:h-10 bg-elevated"
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
                className="text-[12px] text-dim font-mono mb-2 inline-block hover:text-sensor transition-colors no-underline"
              >
                {channel.handle}
              </a>
              <div className="flex gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-success/10 text-success">
                  {channel.status === "active" ? "Active" : channel.status}
                </span>
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-elevated text-dim">
                  Since {joinedDate}
                </span>
              </div>
            </div>
          </div>

          <div className="px-6 max-lg:px-4">
            <div className="grid grid-cols-5 max-lg:grid-cols-2 rounded-xl overflow-hidden border border-border">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-5 py-4 bg-background border-r border-b border-border last:border-r-0 ${
                    i === stats.length - 1 ? "max-lg:col-span-2 max-lg:border-r-0" : ""
                  }`}
                >
                  <div className="text-lg font-semibold font-mono tracking-tight mb-0.5">{s.val}</div>
                  <div className="text-[11px] text-dim">{s.label}</div>
                  <div className="text-[11px] font-mono mt-0.5 text-sensor">{s.change}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-5 pb-16 max-lg:px-4 max-lg:pb-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] text-dim font-medium">Recent Videos</span>
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
                          ? "bg-surface text-foreground border-border"
                          : "bg-transparent text-dim border-border/50 hover:text-sensor hover:border-border"
                      }`}
                    >
                      {tab} <span className="text-[11px] opacity-60">({counts[tab]})</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            <VideoTable videos={filteredVideos} onVideoClick={(vid) => navigate(projectPath(`/video/${vid}`))} />
          </div>
        </div>

        {channelForPanel && (
          <ChannelRightPanel
            channel={channelForPanel}
            visible={panelVisible}
            onClose={closePanel}
            videoCount={channelVideos.filter((v) => v.type === "video").length}
            shortCount={channelVideos.filter((v) => v.type === "short").length}
            onTypeChange={setChannelType}
            onBrandedHooksSaved={refetchChannel}
          />
        )}
      </div>
    </div>
  );
}
