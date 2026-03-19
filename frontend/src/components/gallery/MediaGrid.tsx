import { Image, Play, Video } from "lucide-react";
import type { GalleryMedia } from "@/lib/gallery-api";

interface MediaGridProps {
  items: GalleryMedia[];
  selectedIds: string[];
  selectionMode: boolean;
  onToggleSelect: (mediaId: string, selected: boolean) => void;
  onOpen: (index: number) => void;
}

function formatBytes(size: string | number) {
  const num = Number(size || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const value = num / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function MediaGrid({ items, selectedIds, selectionMode, onToggleSelect, onOpen }: MediaGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Image className="w-10 h-10 text-dim/50 mb-3" />
        <div className="text-[13px] text-dim font-mono">No media found</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
      {items.map((item, index) => {
        const selected = selectedIds.includes(item.id);
        const thumb = item.thumbnailR2Url || item.r2Url;
        const sizeLabel = formatBytes(item.fileSize);

        return (
          <button
            key={item.id}
            onClick={() => {
              if (selectionMode) {
                onToggleSelect(item.id, !selected);
              } else {
                onOpen(index);
              }
            }}
            className={`group relative rounded-xl overflow-hidden text-left transition-all ${
              selected
                ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "hover:ring-1 hover:ring-border"
            }`}
          >
            <div className="aspect-square bg-elevated relative">
              {item.type === "PHOTO" ? (
                <img
                  src={thumb}
                  alt={item.fileName}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="relative w-full h-full">
                  {item.thumbnailR2Url ? (
                    <img
                      src={item.thumbnailR2Url}
                      alt={item.fileName}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <video
                      src={item.r2Url}
                      preload="metadata"
                      className="w-full h-full object-cover"
                      muted
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/50 backdrop-blur-sm p-2.5 text-white transition-transform group-hover:scale-110">
                      <Play className="w-4 h-4 fill-current" />
                    </span>
                  </div>
                </div>
              )}

              {/* Gradient overlay for text readability */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

              {/* Bottom info */}
              <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 flex items-end justify-between gap-1">
                <span className="text-[10px] text-white/90 font-medium truncate leading-tight">
                  {item.fileName}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {sizeLabel && (
                    <span className="text-[9px] text-white/60 font-mono">{sizeLabel}</span>
                  )}
                  {item.type === "VIDEO" && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-white/80 font-mono bg-black/40 rounded px-1 py-0.5">
                      <Video className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Selection checkbox */}
              {selectionMode && (
                <div className="absolute top-2 left-2">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-black/40 backdrop-blur-sm text-white/70 border border-white/20"
                    }`}
                  >
                    {selected && "✓"}
                  </span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
