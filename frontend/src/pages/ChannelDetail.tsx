import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { channels, videos } from "@/data/mock";
import { ChannelRightPanel } from "@/components/ChannelRightPanel";
import { VideoTable } from "@/components/VideoTable";
import { ArrowLeft, Info } from "lucide-react";

const filterTabs = ["All", "Videos", "Shorts", "Analyzing", "Done", "Failed"];

export default function ChannelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const channelData = channels.find((c) => c.id === id);
  const channelVideos = videos.filter((v) => v.channelId === id);
  const [activeFilter, setActiveFilter] = useState("All");
  const [panelVisible, setPanelVisible] = useState(false);
  const [channelType, setChannelType] = useState<"ours" | "competition">(channelData?.type ?? "ours");
  const closePanel = useCallback(() => setPanelVisible(false), []);

  const channel = channelData ? { ...channelData, type: channelType } : undefined;

  if (!channel) {
    return <div className="p-10 text-sensor">Channel not found</div>;
  }

  const filteredVideos = channelVideos.filter((v) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Videos") return v.type === "video";
    if (activeFilter === "Shorts") return v.type === "short";
    if (activeFilter === "Analyzing") return v.status === "analyzing";
    if (activeFilter === "Done") return v.status === "done";
    if (activeFilter === "Failed") return v.status === "failed";
    return true;
  });

  const stats = [
    { val: channel.subscribers, label: "Subscribers", change: channel.growthSubs, up: true },
    { val: channel.views, label: "Total Views", change: channel.growthViews, up: true },
    { val: channel.videos, label: "Videos", change: "+4", up: true },
    { val: channel.avgViews, label: "Avg. Views", change: "-1.2%", up: false },
    { val: channel.engRate, label: "Eng. Rate", change: "+0.3%", up: true },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <button
          onClick={() => navigate("/")}
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
        {/* Main content */}
        <div>
          {/* Hero */}
          <div className="px-6 py-5 flex items-start gap-3.5 max-lg:px-4">
            <img
              src={channel.avatarImg}
              alt={channel.name}
              className="w-12 h-12 rounded-full object-cover shrink-0 max-md:w-10 max-md:h-10"
            />
            <div>
              <h1 className="text-base font-semibold tracking-tight mb-0.5 max-md:text-sm" dir="rtl">
                {channel.name}
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
                  Active
                </span>
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-primary/10 text-primary">
                  {channel.country}
                </span>
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-mono font-medium bg-elevated text-dim">
                  Since {channel.joinedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
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
                  <div className={`text-[11px] font-mono mt-0.5 ${s.up ? "text-success" : "text-destructive"}`}>
                    {s.change}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Videos section */}
          <div className="px-6 py-5 pb-16 max-lg:px-4 max-lg:pb-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] text-dim font-medium">Recent Videos</span>
            </div>

            {/* Filter tabs */}
            {(() => {
              const counts: Record<string, number> = {
                All: channelVideos.length,
                Videos: channelVideos.filter(v => v.type === "video").length,
                Shorts: channelVideos.filter(v => v.type === "short").length,
                Analyzing: channelVideos.filter(v => v.status === "analyzing").length,
                Done: channelVideos.filter(v => v.status === "done").length,
                Failed: channelVideos.filter(v => v.status === "failed").length,
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

            <VideoTable videos={filteredVideos} onVideoClick={(vid) => navigate(`/video/${vid}`)} />
          </div>
        </div>

        {/* Popover panel */}
        <ChannelRightPanel channel={channel} visible={panelVisible} onClose={closePanel} videoCount={channelVideos.filter(v => v.type === "video").length} shortCount={channelVideos.filter(v => v.type === "short").length} onTypeChange={setChannelType} />
      </div>
    </div>
  );
}
