import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Images } from "lucide-react";
import type { GalleryAlbum } from "@/lib/gallery-api";

interface AlbumCardProps {
  album: GalleryAlbum;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const { channelId } = useParams();
  const coverUrl = album.coverMedia?.thumbnailR2Url || album.coverMedia?.r2Url || null;
  const count = album._count?.media ?? 0;

  return (
    <Link
      to={`/c/${channelId}/gallery/album/${album.id}`}
      className="group block overflow-hidden rounded-lg bg-background hover:bg-card transition-colors no-underline cursor-pointer"
    >
      <div className="aspect-[4/3] bg-elevated relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={album.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-dim/30">
            <Images className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-foreground truncate">{album.name}</span>
          <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
        <div className="text-[11px] text-dim font-mono mt-0.5">{count} item{count !== 1 ? "s" : ""}</div>
      </div>
    </Link>
  );
}
