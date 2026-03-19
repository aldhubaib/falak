import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Check, CheckSquare, FolderPlus, Image, Plus, RefreshCw,
  Search, SlidersHorizontal, Trash2, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UploadZone } from "@/components/gallery/UploadZone";
import { MediaGrid } from "@/components/gallery/MediaGrid";
import { MediaViewer } from "@/components/gallery/MediaViewer";
import { AlbumCard } from "@/components/gallery/AlbumCard";
import {
  useGalleryActions,
  useGalleryAlbums,
  useGalleryMedia,
  useMediaUpload,
} from "@/hooks/useGallery";
import type { GalleryMediaFilters } from "@/lib/gallery-api";

const TABS = ["media", "albums"] as const;
type Tab = (typeof TABS)[number];

const TYPE_FILTERS = [
  { value: "all" as const, label: "All", icon: null },
  { value: "PHOTO" as const, label: "Photos", icon: Image },
  { value: "VIDEO" as const, label: "Videos", icon: Video },
];

const SORT_OPTIONS: { value: GalleryMediaFilters["sortBy"]; label: string }[] = [
  { value: "createdAt", label: "Date" },
  { value: "fileName", label: "Name" },
  { value: "fileSize", label: "Size" },
];

export default function Gallery() {
  const { channelId = "" } = useParams();

  const [activeTab, setActiveTab] = useState<Tab>("media");
  const [type, setType] = useState<"all" | "PHOTO" | "VIDEO">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<GalleryMediaFilters["sortBy"]>("createdAt");
  const [sortOrder, setSortOrder] = useState<GalleryMediaFilters["sortOrder"]>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 60;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [showSort, setShowSort] = useState(false);

  const {
    data: mediaData,
    isLoading: loadingMedia,
    refetch: refetchMedia,
  } = useGalleryMedia(channelId, {
    page,
    pageSize,
    type,
    q: search.trim() || undefined,
    sortBy,
    sortOrder,
  });
  const { data: albums = [], isLoading: loadingAlbums } = useGalleryAlbums(channelId);
  const { bulkDelete, deleteMedia, createAlbum, addToAlbum } = useGalleryActions(channelId);
  const { getDownloadUrl } = useMediaUpload(channelId);

  const mediaItems = mediaData?.items || [];
  const total = mediaData?.total ?? 0;
  const totalPages = mediaData?.totalPages ?? 1;
  const photoCount = useMemo(() => mediaItems.filter((m) => m.type === "PHOTO").length, [mediaItems]);
  const videoCount = useMemo(() => mediaItems.filter((m) => m.type === "VIDEO").length, [mediaItems]);

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

  const handleDownload = async (mediaId: string) => {
    try {
      const { url } = await getDownloadUrl(mediaId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate download URL");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDelete.mutateAsync(selectedIds);
      toast.success(`Deleted ${selectedIds.length} item(s)`);
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  const handleCreateAlbum = async () => {
    const name = albumName.trim();
    if (!name) return;
    try {
      const album = await createAlbum.mutateAsync({ name });
      toast.success(`Album "${album.name}" created`);
      setAlbumName("");
      setCreateAlbumOpen(false);
      if (selectedIds.length > 0) {
        await addToAlbum.mutateAsync({ albumId: album.id, mediaIds: selectedIds });
        toast.success(`Added ${selectedIds.length} item(s) to album`);
        setSelectedIds([]);
        setSelectionMode(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to create album");
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div className="h-12 flex items-center gap-0 px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative h-full px-4 text-[13px] font-medium transition-colors capitalize ${
              activeTab === tab ? "text-foreground" : "text-dim hover:text-sensor"
            }`}
          >
            {tab === "media" ? "All Media" : "Albums"}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void refetchMedia()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="max-sm:hidden">Refresh</span>
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" />
            Upload
          </button>
        </div>
      </div>

      {activeTab === "media" && (
        <div className="flex-1 overflow-auto">
          {/* Stats row */}
          <div className="px-6 pt-4 max-lg:px-4 mb-4">
            <div className="flex rounded-xl overflow-hidden border border-border">
              <div className="px-5 py-4 bg-background border-r border-border min-w-[120px]">
                <div className="text-2xl font-semibold font-mono tracking-tight">{total}</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Total</div>
              </div>
              <div className="flex-1 px-5 py-4 bg-background border-r border-border">
                <div className="text-2xl font-semibold font-mono tracking-tight text-blue">{photoCount}</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Photos</div>
              </div>
              <div className="flex-1 px-5 py-4 bg-background border-r border-border">
                <div className="text-2xl font-semibold font-mono tracking-tight text-purple">{videoCount}</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Videos</div>
              </div>
              <div className="flex-1 px-5 py-4 bg-background">
                <div className="text-2xl font-semibold font-mono tracking-tight text-orange">{albums.length}</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Albums</div>
              </div>
            </div>
          </div>

          {/* Filters bar */}
          <div className="px-6 max-lg:px-4 mb-4 flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
            <div className="flex flex-wrap items-center gap-2">
              {/* Type filter pills */}
              <div className="flex items-center bg-elevated rounded-full p-0.5">
                {TYPE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setType(f.value); setPage(1); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors ${
                      type === f.value ? "bg-surface text-foreground" : "text-dim hover:text-sensor"
                    }`}
                  >
                    {f.icon && <f.icon className="w-3 h-3" />}
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowSort((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${
                    showSort ? "border-border bg-surface text-foreground" : "border-border/50 text-dim hover:text-sensor hover:border-border"
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Sort
                </button>
                {showSort && (
                  <div className="absolute top-full left-0 mt-1.5 z-20 rounded-xl border border-border bg-background shadow-xl p-2 min-w-[160px]">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          if (sortBy === opt.value) {
                            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
                          } else {
                            setSortBy(opt.value);
                            setSortOrder("desc");
                          }
                          setPage(1);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] transition-colors ${
                          sortBy === opt.value ? "bg-surface text-foreground" : "text-dim hover:text-sensor hover:bg-surface/50"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.value && (
                          <span className="text-[10px] font-mono">{sortOrder === "desc" ? "↓" : "↑"}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection toggle */}
              {selectionMode ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
                  >
                    <CheckSquare className="w-3 h-3" />
                    All
                  </button>
                  <button
                    onClick={exitSelection}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Exit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border/50 text-[11px] text-dim font-medium hover:text-sensor hover:border-border transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Select
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative max-sm:w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
              <input
                type="text"
                placeholder="Search media..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-border/50 rounded-full text-sensor placeholder:text-dim focus:outline-none focus:border-border w-[200px] max-sm:w-full"
              />
            </div>
          </div>

          {/* Selection action bar */}
          {selectionMode && selectedIds.length > 0 && (
            <div className="px-6 max-lg:px-4 mb-4">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-[12px] text-foreground font-medium font-mono mr-auto">
                  {selectedIds.length} selected
                </span>
                <button
                  onClick={() => setCreateAlbumOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
                >
                  <FolderPlus className="w-3 h-3" />
                  New album
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDelete.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="px-6 pb-6 max-lg:px-4">
            {loadingMedia ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mediaItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Image className="w-10 h-10 text-dim/50 mb-3" />
                <div className="text-[13px] text-dim font-mono">No media found</div>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3 h-3" />
                  Upload your first media
                </button>
              </div>
            ) : (
              <>
                <MediaGrid
                  items={mediaItems}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  onToggleSelect={toggleSelect}
                  onOpen={(index) => setViewerIndex(index)}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="text-[11px] text-dim font-mono">
                      {page} / {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "albums" && (
        <div className="flex-1 overflow-auto">
          <div className="px-6 pt-4 pb-2 flex items-center justify-between max-lg:px-4">
            <span className="text-[11px] text-dim font-mono">
              {loadingAlbums ? "Loading…" : `${albums.length} album(s)`}
            </span>
            <button
              onClick={() => setCreateAlbumOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
            >
              <FolderPlus className="w-3 h-3" />
              Create album
            </button>
          </div>
          <div className="px-6 pb-8 max-lg:px-4">
            {loadingAlbums ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
              </div>
            ) : albums.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FolderPlus className="w-10 h-10 text-dim/50 mb-3" />
                <div className="text-[13px] text-dim font-mono">No albums yet</div>
                <button
                  onClick={() => setCreateAlbumOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  <FolderPlus className="w-3 h-3" />
                  Create your first album
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Viewer */}
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

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
          </DialogHeader>
          <UploadZone channelId={channelId} />
        </DialogContent>
      </Dialog>

      {/* Create Album Dialog */}
      <Dialog open={createAlbumOpen} onOpenChange={setCreateAlbumOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Album</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-[12px] text-dim font-mono uppercase tracking-wider block mb-2">
                Album name
              </label>
              <input
                type="text"
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                placeholder="Enter album name..."
                className="w-full px-3 py-2 bg-background border border-border text-foreground text-[13px] rounded-lg outline-none focus:border-primary/50 transition-colors placeholder:text-dim"
                onKeyDown={(e) => e.key === "Enter" && handleCreateAlbum()}
              />
            </div>
            {selectedIds.length > 0 && (
              <div className="text-[11px] text-dim font-mono">
                {selectedIds.length} selected item(s) will be added to the album
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateAlbumOpen(false)}
                className="px-3 py-1.5 rounded-full border border-border text-[12px] text-dim font-medium hover:text-sensor transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlbum}
                disabled={!albumName.trim() || createAlbum.isPending}
                className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
