import { Check, Image, Play } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import type { GalleryMedia } from "@/lib/gallery-api";
import type { Photo } from "react-photo-album";

export type GalleryPhoto = Photo & { media: GalleryMedia };

interface MediaGridProps {
  items: GalleryMedia[];
  selectedIds: string[];
  selectionMode: boolean;
  onToggleSelect: (mediaId: string, selected: boolean) => void;
  onOpen: (index: number) => void;
}

export function mediaToPhoto(item: GalleryMedia): GalleryPhoto {
  const w = item.width || item.metadata?.width || null;
  const h = item.height || item.metadata?.height || null;

  return {
    src: item.thumbnailR2Url || item.r2Url,
    width: w || (item.type === "VIDEO" ? 9 : 4),
    height: h || (item.type === "VIDEO" ? 16 : 4),
    key: item.id,
    media: item,
  };
}

export function MediaOverlay({
  media,
  selected,
  selectionMode,
}: {
  media: GalleryMedia;
  selected: boolean;
  selectionMode: boolean;
}) {
  return (
    <>
      {media.type === "VIDEO" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="rounded-full bg-black/50 backdrop-blur-sm p-2.5 text-white">
            <Play className="w-5 h-5 fill-current" />
          </span>
        </div>
      )}

      {media.type === "VIDEO" && media.duration != null && media.duration > 0 && (
        <div className="absolute bottom-1.5 right-1.5 pointer-events-none">
          <span className="text-[11px] text-white font-medium tabular-nums drop-shadow-[0_1px_2px_hsl(0_0%_0%/0.6)]">
            {formatDuration(media.duration)}
          </span>
        </div>
      )}

      {selectionMode && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-[0_1px_3px_hsl(0_0%_0%/0.3)] ${
              selected
                ? "bg-blue-500 text-white scale-100"
                : "bg-white/80 backdrop-blur-sm border-2 border-foreground/60 scale-90"
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
          </span>
        </div>
      )}

      {!selectionMode && (
        <div className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="w-6 h-6 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-sm border-2 border-foreground/60 shadow-[0_1px_3px_hsl(0_0%_0%/0.3)]" />
        </div>
      )}

      {selected && (
        <div className="absolute inset-0 ring-2 ring-inset ring-blue pointer-events-none" />
      )}
    </>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaGrid({ items, selectedIds, selectionMode, onToggleSelect, onOpen }: MediaGridProps) {
  if (items.length === 0) {
    return (
      <EmptyState icon={Image} title="No media found" className="h-64" />
    );
  }

  const photos: GalleryPhoto[] = items.map(mediaToPhoto);

  return (
    <RowsPhotoAlbum
      photos={photos}
      targetRowHeight={280}
      rowConstraints={{ maxPhotos: 5, singleRowMaxHeight: 400 }}
      spacing={2}
      onClick={({ index }) => {
        if (selectionMode) {
          const item = items[index];
          if (item) onToggleSelect(item.id, !selectedIds.includes(item.id));
        } else {
          onOpen(index);
        }
      }}
      render={{
        extras: (_, { photo }) => {
          const gp = photo as GalleryPhoto;
          return (
            <MediaOverlay
              media={gp.media}
              selected={selectedIds.includes(gp.media.id)}
              selectionMode={selectionMode}
            />
          );
        },
        image: (props, { photo }) => {
          const gp = photo as GalleryPhoto;
          if (gp.media.type === "VIDEO" && !gp.media.thumbnailR2Url) {
            return (
              <video
                src={gp.media.r2Url}
                preload="metadata"
                muted
                className={props.className}
                style={props.style}
              />
            );
          }
          return <img {...props} />;
        },
      }}
      componentsProps={{
        button: {
          className: "group relative overflow-hidden rounded-lg hover:brightness-90 transition-[filter]",
        },
        image: { loading: "lazy", decoding: "async", className: "object-cover" },
      }}
    />
  );
}
