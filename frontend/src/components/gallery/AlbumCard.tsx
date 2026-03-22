import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Images, Lock } from "lucide-react";
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
      className="group block overflow-hidden rounded-lg bg-card hover:bg-card transition-colors no-underline cursor-pointer"
    >
      <div className="aspect-[4/3] bg-card relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={album.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <Images className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        {album.isLocked && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Lock className="w-3 h-3 text-white/80" />
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {album.isLocked && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
          <span className="text-[13px] font-medium text-foreground truncate">{album.name}</span>
          <ArrowUpRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{count} item{count !== 1 ? "s" : ""}</div>
      </div>
    </Link>
  );
}
