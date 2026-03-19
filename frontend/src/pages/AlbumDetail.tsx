import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaGrid } from "@/components/gallery/MediaGrid";
import { UploadZone } from "@/components/gallery/UploadZone";
import { MediaViewer } from "@/components/gallery/MediaViewer";
import { useGalleryActions, useGalleryAlbum, useMediaUpload } from "@/hooks/useGallery";

export default function AlbumDetail() {
  const { channelId = "", albumId = "" } = useParams();
  const { data: album, isLoading } = useGalleryAlbum(channelId, albumId);
  const { patchAlbum, removeFromAlbum, deleteMedia } = useGalleryActions(channelId);
  const { getDownloadUrl } = useMediaUpload(channelId, albumId);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const mediaItems = useMemo(() => album?.media || [], [album?.media]);
  const selectedLabel = `${selectedIds.length} selected`;

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading album...</div>;
  if (!album) return <div className="p-6 text-sm text-muted-foreground">Album not found.</div>;

  const toggleSelect = (mediaId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (selected) set.add(mediaId);
      else set.delete(mediaId);
      return Array.from(set);
    });
  };

  return (
    <div className="p-6 max-lg:p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to={`/c/${channelId}/gallery`} className="no-underline">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">{album.name}</h1>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          Upload to album
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-background p-3 flex flex-wrap gap-2 items-center">
        <Input
          value={nameDraft || album.name}
          onChange={(e) => setNameDraft(e.target.value)}
          className="w-full md:w-80"
        />
        <Button
          variant="outline"
          className="gap-2"
          onClick={async () => {
            const next = (nameDraft || album.name).trim();
            if (!next) return;
            try {
              await patchAlbum.mutateAsync({ albumId: album.id, name: next });
              toast.success("Album renamed");
            } catch (e: any) {
              toast.error(e?.message || "Failed to rename album");
            }
          }}
        >
          <Save className="w-4 h-4" />
          Save name
        </Button>

        <Button
          variant={selectionMode ? "default" : "outline"}
          onClick={() => {
            setSelectionMode((v) => !v);
            setSelectedIds([]);
          }}
        >
          {selectionMode ? "Exit selection" : "Select"}
        </Button>

        {selectionMode && (
          <>
            <span className="text-xs text-muted-foreground">{selectedLabel}</span>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={selectedIds.length === 0 || removeFromAlbum.isPending}
              onClick={async () => {
                try {
                  await removeFromAlbum.mutateAsync({ albumId, mediaIds: selectedIds });
                  toast.success("Removed from album");
                  setSelectedIds([]);
                } catch (e: any) {
                  toast.error(e?.message || "Failed to remove selected items");
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
              Remove selected
            </Button>
          </>
        )}
      </div>

      <MediaGrid
        items={mediaItems}
        selectedIds={selectedIds}
        selectionMode={selectionMode}
        onToggleSelect={toggleSelect}
        onOpen={(index) => setViewerIndex(index)}
      />

      <MediaViewer
        open={viewerIndex >= 0}
        items={mediaItems}
        index={viewerIndex}
        onOpenChange={(open) => {
          if (!open) setViewerIndex(-1);
        }}
        onIndexChange={setViewerIndex}
        onDownload={async (media) => {
          try {
            const { url } = await getDownloadUrl(media.id);
            window.open(url, "_blank", "noopener,noreferrer");
          } catch (e: any) {
            toast.error(e?.message || "Failed to generate download URL");
          }
        }}
        onDelete={async (media) => {
          try {
            await deleteMedia.mutateAsync(media.id);
            toast.success("Media deleted");
            setViewerIndex(-1);
          } catch (e: any) {
            toast.error(e?.message || "Failed to delete media");
          }
        }}
      />

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload to {album.name}</DialogTitle>
          </DialogHeader>
          <UploadZone channelId={channelId} albumId={album.id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
