import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UploadZone } from "@/components/gallery/UploadZone";
import { MediaGrid } from "@/components/gallery/MediaGrid";
import { MediaViewer } from "@/components/gallery/MediaViewer";
import { AlbumCard } from "@/components/gallery/AlbumCard";
import { useGalleryActions, useGalleryAlbums, useGalleryMedia, useMediaUpload } from "@/hooks/useGallery";

type ViewMode = "media" | "albums";

export default function Gallery() {
  const { channelId = "" } = useParams();
  const [viewMode, setViewMode] = useState<ViewMode>("media");
  const [type, setType] = useState<"all" | "PHOTO" | "VIDEO">("all");
  const [search, setSearch] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: mediaData, isLoading: loadingMedia, refetch: refetchMedia } = useGalleryMedia(channelId, {
    page: 1,
    pageSize: 120,
    type,
    q: search.trim() || undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const { data: albums = [], isLoading: loadingAlbums } = useGalleryAlbums(channelId);
  const { bulkDelete, deleteMedia } = useGalleryActions(channelId);
  const { getDownloadUrl } = useMediaUpload(channelId);

  const mediaItems = mediaData?.items || [];

  const selectedCount = selectedIds.length;
  const selectedLabel = useMemo(
    () => (selectedCount > 0 ? `${selectedCount} selected` : "No items selected"),
    [selectedCount]
  );

  const toggleSelect = (mediaId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (selected) set.add(mediaId);
      else set.delete(mediaId);
      return Array.from(set);
    });
  };

  const handleDownload = async (mediaId: string) => {
    try {
      const { url } = await getDownloadUrl(mediaId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate download URL");
    }
  };

  return (
    <div className="p-6 max-lg:p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold">Gallery</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refetchMedia()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Upload
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="media">All Media</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === "media" && (
        <>
          <div className="rounded-xl border border-border bg-background p-3 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename or mime type"
              className="w-full md:w-72"
            />
            <Select value={type} onValueChange={(value: "all" | "PHOTO" | "VIDEO") => setType(value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="PHOTO">Photos</SelectItem>
                <SelectItem value="VIDEO">Videos</SelectItem>
              </SelectContent>
            </Select>
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
                  disabled={selectedIds.length === 0 || bulkDelete.isPending}
                  onClick={async () => {
                    try {
                      await bulkDelete.mutateAsync(selectedIds);
                      toast.success("Selected items deleted");
                      setSelectedIds([]);
                    } catch (e: any) {
                      toast.error(e?.message || "Failed to delete selected items");
                    }
                  }}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete selected
                </Button>
              </>
            )}
          </div>

          {loadingMedia ? (
            <div className="text-sm text-muted-foreground">Loading media...</div>
          ) : (
            <MediaGrid
              items={mediaItems}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onToggleSelect={toggleSelect}
              onOpen={(index) => setViewerIndex(index)}
            />
          )}
        </>
      )}

      {viewMode === "albums" && (
        <>
          {loadingAlbums ? (
            <div className="text-sm text-muted-foreground">Loading albums...</div>
          ) : albums.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No albums yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}
        </>
      )}

      <MediaViewer
        open={viewerIndex >= 0}
        items={mediaItems}
        index={viewerIndex}
        onOpenChange={(open) => {
          if (!open) setViewerIndex(-1);
        }}
        onIndexChange={setViewerIndex}
        onDownload={(media) => void handleDownload(media.id)}
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
            <DialogTitle>Upload Media</DialogTitle>
          </DialogHeader>
          <UploadZone channelId={channelId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
