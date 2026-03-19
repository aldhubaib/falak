import { Link, useParams } from "react-router-dom";
import { Images } from "lucide-react";
import type { GalleryAlbum } from "@/lib/gallery-api";

interface AlbumCardProps {
  album: GalleryAlbum;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const { channelId } = useParams();
  const coverUrl = album.coverMedia?.thumbnailR2Url || album.coverMedia?.r2Url || null;

  return (
    <Link
      to={`/c/${channelId}/gallery/album/${album.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-background hover:border-primary/50 transition-colors no-underline"
    >
      <div className="aspect-[4/3] bg-muted relative">
        {coverUrl ? (
          <img src={coverUrl} alt={album.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Images className="w-7 h-7" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium text-sm text-foreground truncate">{album.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{album._count?.media ?? 0} items</div>
      </div>
    </Link>
  );
}
