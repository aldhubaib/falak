import { memo } from "react";
import type { Video } from "@/data/mock";
import { Link } from "react-router-dom";
import { Eye, CheckCircle2, XCircle, Loader2, Clock, ArrowUpRight } from "lucide-react";
import { VideoTypeIcon } from "@/components/VideoTypeIcon";

interface VideoTableProps {
  videos: Video[];
  onVideoClick?: (videoId: string) => void;
  getVideoHref?: (videoId: string) => string;
}

const statusIcon: Record<string, { icon: React.ElementType; className: string; title: string }> = {
  done: { icon: CheckCircle2, className: "text-success", title: "Done" },
  failed: { icon: XCircle, className: "text-destructive", title: "Failed" },
  pending: { icon: Clock, className: "text-muted-foreground", title: "Pending" },
  analyzing: { icon: Loader2, className: "text-blue animate-spin", title: "Analyzing" },
};

export const VideoTable = memo(function VideoTable({ videos, onVideoClick, getVideoHref }: VideoTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block rounded-lg overflow-hidden border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-card/40">
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-4 text-left border-b border-border">Title</th>
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-3 text-left border-b border-border w-10">Type</th>
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-3 text-left border-b border-border">Views</th>
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-3 text-left border-b border-border">Likes</th>
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-3 text-left border-b border-border">Date</th>
              <th className="text-[11px] text-muted-foreground font-medium py-2.5 px-3 text-left border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => {
              const href = getVideoHref?.(v.id);
              const Row = href ? "tr" : "tr";
              const rowContent = (
                <>
                <td className="py-2.5 px-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 rounded-lg bg-card shrink-0 overflow-hidden">
                      {v.thumbnail ? (
                        <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <VideoTypeIcon type={v.type} className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {href ? (
                      <Link to={href} className="text-[13px] font-medium max-w-[320px] whitespace-nowrap overflow-hidden text-ellipsis block text-foreground hover:opacity-80 transition-opacity no-underline" dir="rtl">
                        {v.title}
                      </Link>
                    ) : (
                      <span className="text-[13px] font-medium max-w-[320px] whitespace-nowrap overflow-hidden text-ellipsis block text-foreground hover:opacity-80 transition-opacity" dir="rtl">
                        {v.title}
                      </span>
                    )}
                    <ArrowUpRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </td>
                <td className="py-2.5 px-3 border-b border-border">
                  <VideoTypeIcon type={v.type} className="w-3.5 h-3.5 text-muted-foreground" />
                </td>
                <td className="py-2.5 px-3 border-b border-border text-[12px] font-mono text-muted-foreground">{v.views}</td>
                <td className="py-2.5 px-3 border-b border-border text-[12px] font-mono text-muted-foreground">{v.likes}</td>
                <td className="py-2.5 px-3 border-b border-border text-[11px] font-mono text-muted-foreground">{v.date}</td>
                <td className="py-2.5 px-3 border-b border-border">
                  {(() => { const s = statusIcon[v.status]; return <s.icon className={`w-4 h-4 ${s.className}`} title={s.title} />; })()}
                </td>
                </>
              );
              return (
                <tr
                  key={v.id}
                  onClick={() => onVideoClick?.(v.id)}
                  className={`bg-background hover:bg-card transition-colors group ${onVideoClick || href ? "cursor-pointer" : ""}`}
                >
                  {rowContent}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col lg:hidden rounded-lg overflow-hidden border border-border">
        {videos.map((v) => {
          const href = getVideoHref?.(v.id);
          if (href) {
            return (
              <Link
                key={v.id}
                to={href}
                className="bg-background flex items-center gap-3 px-4 py-3 hover:bg-card transition-colors border-b border-border last:border-b-0 cursor-pointer no-underline"
              >
                <div className="w-10 h-7 rounded-lg bg-card shrink-0 overflow-hidden">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoTypeIcon type={v.type} className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-[13px] font-medium truncate text-foreground mb-0.5" dir="rtl">{v.title}</div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" />{v.views}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{v.date}</span>
                    {(() => { const s = statusIcon[v.status]; return <s.icon className={`w-3.5 h-3.5 ${s.className}`} title={s.title} />; })()}
                  </div>
                </div>
              </Link>
            );
          }
          return (
            <div
              key={v.id}
              onClick={() => onVideoClick?.(v.id)}
              className={`bg-background flex items-center gap-3 px-4 py-3 hover:bg-card transition-colors border-b border-border last:border-b-0 ${onVideoClick ? "cursor-pointer" : ""}`}
            >
              <div className="w-10 h-7 rounded-lg bg-card shrink-0 overflow-hidden">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <VideoTypeIcon type={v.type} className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-[13px] font-medium truncate text-foreground mb-0.5" dir="rtl">{v.title}</div>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Eye className="w-2.5 h-2.5" />{v.views}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{v.date}</span>
                  {(() => { const s = statusIcon[v.status]; return <s.icon className={`w-3.5 h-3.5 ${s.className}`} title={s.title} />; })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-3 mt-2 flex-wrap gap-2">
        <span className="text-[11px] text-muted-foreground font-mono">Showing 1–{videos.length} of {videos.length}</span>
        <div className="flex items-center gap-1">
          <button disabled className="w-7 h-7 rounded-full border border-border bg-card text-muted-foreground text-xs font-mono cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">«</button>
          <button disabled className="w-7 h-7 rounded-full border border-border bg-card text-muted-foreground text-xs font-mono cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">‹</button>
          <button className="w-7 h-7 rounded-full bg-primary text-white text-xs font-mono flex items-center justify-center">1</button>
          <button disabled className="w-7 h-7 rounded-full border border-border bg-card text-muted-foreground text-xs font-mono cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">›</button>
          <button disabled className="w-7 h-7 rounded-full border border-border bg-card text-muted-foreground text-xs font-mono cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">»</button>
        </div>
      </div>
    </>
  );
});
