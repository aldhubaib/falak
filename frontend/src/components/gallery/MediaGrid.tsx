import { Image, Play, Video } from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import type { GalleryMedia } from "@/lib/gallery-api";
import type { Photo, RenderPhotoProps } from "react-photo-album";

export type GalleryPhoto = Photo & { media: GalleryMedia };

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

export function mediaToPhoto(item: GalleryMedia): GalleryPhoto {
  return {
    src: item.thumbnailR2Url || item.r2Url,
    width: item.width || 400,
    height: item.height || 400,
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
  const sizeLabel = formatBytes(media.fileSize);

  return (
    <>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 flex items-end justify-between gap-1">
        <span className="text-[10px] text-white/90 font-medium truncate leading-tight">
          {media.fileName}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {sizeLabel && (
            <span className="text-[9px] text-white/60 font-mono">{sizeLabel}</span>
          )}
          {media.type === "VIDEO" && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-white/80 font-mono bg-black/40 rounded px-1 py-0.5">
              <Video className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>

      {media.type === "VIDEO" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="rounded-full bg-black/50 backdrop-blur-sm p-2.5 text-white">
            <Play className="w-4 h-4 fill-current" />
          </span>
        </div>
      )}

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
    </>
  );
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

  const photos: GalleryPhoto[] = items.map(mediaToPhoto);

  return (
    <RowsPhotoAlbum
      photos={photos}
      targetRowHeight={220}
      rowConstraints={{ maxPhotos: 6 }}
      spacing={4}
      onClick={({ index }) => {
        if (selectionMode) {
          const item = items[index];
          if (item) onToggleSelect(item.id, !selectedIds.includes(item.id));
        } else {
          onOpen(index);
        }
      }}
      render={{
        extras: (_, { photo, index }) => {
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
          if (gp.media.type === "VIDEO" && gp.media.thumbnailR2Url) {
            return <img {...props} />;
          }
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
          className: "group relative rounded-xl overflow-hidden transition-all hover:ring-1 hover:ring-border",
        },
        image: { loading: "lazy", decoding: "async" },
      }}
    />
  );
}
