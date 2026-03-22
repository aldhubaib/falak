import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Check, CheckSquare, Eye, EyeOff, Loader2, Lock, Pencil, Plus, Save, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaGrid } from "@/components/gallery/MediaGrid";
import { UploadZone } from "@/components/gallery/UploadZone";
import { MediaViewer } from "@/components/gallery/MediaViewer";
import { useGalleryActions, useGalleryAlbum, useMediaUpload } from "@/hooks/useGallery";
import { EmptyState } from "@/components/ui/empty-state";

export default function AlbumDetail() {
  const { channelId = "", albumId = "" } = useParams();
  const { data: album, isLoading } = useGalleryAlbum(channelId, albumId);
  const { patchAlbum, removeFromAlbum, deleteMedia } = useGalleryActions(channelId);
  const { getDownloadUrl } = useMediaUpload(channelId, albumId);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const mediaItems = useMemo(() => album?.media || [], [album?.media]);
  const isLocked = album?.isLocked ?? false;

  const toggleSelect = useCallback((mediaId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (selected) set.add(mediaId);
      else set.delete(mediaId);
      return Array.from(set);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(mediaItems.map((m) => m.id));
  }, [mediaItems]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const handleRename = async () => {
    const next = nameDraft.trim();
    if (!next || !album) return;
    try {
      await patchAlbum.mutateAsync({ albumId: album.id, name: next });
      toast.success("Album renamed");
      setRenaming(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to rename album");
    }
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      await removeFromAlbum.mutateAsync({ albumId, mediaIds: selectedIds });
      toast.success(`Removed ${selectedIds.length} item(s)`);
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!album) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <div className="text-[13px] text-muted-foreground font-mono">Album not found</div>
        <Link
          to={`/c/${channelId}/gallery`}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors no-underline"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to gallery
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header bar */}
      <div className="h-12 flex items-center gap-3 px-6 border-b border-border shrink-0 max-lg:px-4">
        <Link
          to={`/c/${channelId}/gallery`}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-muted-foreground transition-colors no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="max-sm:hidden">Gallery</span>
        </Link>

        <span className="w-px h-4 bg-border" />

        {renaming && !isLocked ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="flex-1 min-w-0 px-2 py-1 bg-transparent border border-border rounded-lg text-[13px] text-foreground font-medium outline-none focus:border-primary/50 transition-colors"
              autoFocus
            />
            <button
              onClick={handleRename}
              disabled={patchAlbum.isPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors"
            >
              <Save className="w-3 h-3" />
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <h1 className="text-[13px] font-semibold truncate">{album.name}</h1>
            <span className="text-[11px] text-muted-foreground font-mono">({mediaItems.length})</span>
            {!isLocked && (
              <button
                onClick={() => { setNameDraft(album.name); setRenaming(true); }}
                className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {isLocked && (
          <button
            onClick={async () => {
              try {
                await patchAlbum.mutateAsync({ albumId: album.id, showInAllMedia: !album.showInAllMedia });
                toast.success(album.showInAllMedia ? "Hidden from All Media" : "Visible in All Media");
              } catch (e: any) {
                toast.error(e?.message || "Failed to update");
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors shrink-0 ${
              album.showInAllMedia
                ? "border-border text-muted-foreground hover:text-foreground"
                : "border-orange/30 bg-orange/10 text-orange"
            }`}
            title={album.showInAllMedia ? "Media visible in All Media — click to hide" : "Media hidden from All Media — click to show"}
          >
            {album.showInAllMedia ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span className="max-sm:hidden">{album.showInAllMedia ? "In All Media" : "Hidden"}</span>
          </button>
        )}

        {!isLocked && (
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Upload className="w-3 h-3" />
            <span className="max-sm:hidden">Upload</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      {isLocked ? (
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 max-lg:px-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-orange/10 border border-orange/20 text-[11px] text-orange font-medium">
            <Lock className="w-3 h-3" />
            System album — read only
          </span>
        </div>
      ) : (
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 max-lg:px-4">
          {selectionMode ? (
            <>
              <button
                onClick={selectAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors"
              >
                <CheckSquare className="w-3 h-3" />
                All
              </button>
              <button
                onClick={exitSelection}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-[11px] text-muted-foreground font-medium hover:text-muted-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                Exit
              </button>
              {selectedIds.length > 0 && (
                <>
                  <span className="text-[11px] text-foreground font-mono ml-1">{selectedIds.length} selected</span>
                  <button
                    onClick={handleRemoveSelected}
                    disabled={removeFromAlbum.isPending}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50 ml-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </>
              )}
            </>
          ) : (
            <button
              onClick={() => setSelectionMode(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border/50 text-[11px] text-muted-foreground font-medium hover:text-muted-foreground hover:border-border transition-colors"
            >
              <Check className="w-3 h-3" />
              Select
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto px-6 pb-8 max-lg:px-4">
        {mediaItems.length === 0 ? (
          <EmptyState icon={isLocked ? Lock : Plus} title={isLocked ? "No media in this album yet" : "This album is empty"} className="h-64">
            {!isLocked && (
              <button
                onClick={() => setUploadOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
              >
                <Upload className="w-3 h-3" />
                Upload to album
              </button>
            )}
          </EmptyState>
        ) : (
          <MediaGrid
            items={mediaItems}
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelect={toggleSelect}
            onOpen={(index) => setViewerIndex(index)}
          />
        )}
      </div>

      {/* Media Viewer */}
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
        onDelete={isLocked ? undefined : async (media) => {
          try {
            await deleteMedia.mutateAsync(media.id);
            toast.success("Media deleted");
            setViewerIndex(-1);
          } catch (e: any) {
            toast.error(e?.message || "Failed to delete media");
          }
        }}
      />

      {/* Upload Dialog */}
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
