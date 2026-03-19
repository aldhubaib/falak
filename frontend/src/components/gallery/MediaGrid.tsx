import { Play, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { GalleryMedia } from "@/lib/gallery-api";

interface MediaGridProps {
  items: GalleryMedia[];
  selectedIds: string[];
  selectionMode: boolean;
  onToggleSelect: (mediaId: string, selected: boolean) => void;
  onOpen: (index: number) => void;
}

export function MediaGrid({ items, selectedIds, selectionMode, onToggleSelect, onOpen }: MediaGridProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No media found yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
      {items.map((item, index) => {
        const selected = selectedIds.includes(item.id);
        const thumb = item.thumbnailR2Url || item.r2Url;
        return (
          <button
            key={item.id}
            onClick={() => onOpen(index)}
            className="group relative rounded-lg overflow-hidden border border-border bg-background text-left"
          >
            <div className="aspect-square bg-muted">
              {item.type === "PHOTO" ? (
                <img src={thumb} alt={item.fileName} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
              ) : (
                <div className="relative w-full h-full">
                  <video src={item.r2Url} preload="metadata" className="w-full h-full object-cover opacity-80" muted />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/60 p-2 text-white">
                      <Play className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {item.type === "VIDEO" && (
              <div className="absolute left-2 bottom-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white flex items-center gap-1">
                <Video className="w-3 h-3" />
                VIDEO
              </div>
            )}

            <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
              <div className="max-w-[80%] rounded bg-black/60 text-white text-[11px] px-2 py-1 truncate">{item.fileName}</div>
              {selectionMode && (
                <span className="rounded bg-black/60 p-1">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(value) => onToggleSelect(item.id, value === true)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
