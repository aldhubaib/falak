import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Download, Info, Trash2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GalleryMedia } from "@/lib/gallery-api";

interface MediaViewerProps {
  open: boolean;
  items: GalleryMedia[];
  index: number;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (nextIndex: number) => void;
  onDownload: (media: GalleryMedia) => void;
  onDelete?: (media: GalleryMedia) => void;
}

function formatBytes(size: string | number) {
  const num = Number(size || 0);
  if (!Number.isFinite(num) || num <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const value = num / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function MediaViewer({ open, items, index, onOpenChange, onIndexChange, onDownload, onDelete }: MediaViewerProps) {
  const active = useMemo(() => (index >= 0 && index < items.length ? items[index] : null), [index, items]);
  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 overflow-hidden bg-black border-border">
        {!active ? null : (
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div className="relative bg-black flex items-center justify-center">
              <button
                onClick={() => onOpenChange(false)}
                className="absolute top-3 right-3 z-20 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>

              {canPrev && (
                <button
                  onClick={() => onIndexChange(index - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {canNext && (
                <button
                  onClick={() => onIndexChange(index + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {active.type === "PHOTO" ? (
                <img src={active.r2Url} alt={active.fileName} className="max-w-full max-h-full object-contain" />
              ) : (
                <video src={active.r2Url} className="max-w-full max-h-full" controls autoPlay />
              )}
            </div>

            <div className="bg-background border-l border-border p-4 overflow-y-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Info className="w-4 h-4" />
                Media Details
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {active.fileName}</div>
                <div><span className="text-muted-foreground">Type:</span> {active.type}</div>
                <div><span className="text-muted-foreground">Size:</span> {formatBytes(active.fileSize)}</div>
                <div><span className="text-muted-foreground">Mime:</span> {active.mimeType}</div>
                {active.width && active.height ? <div><span className="text-muted-foreground">Dimensions:</span> {active.width}x{active.height}</div> : null}
                {active.duration ? <div><span className="text-muted-foreground">Duration:</span> {Math.round(active.duration)} sec</div> : null}
                <div><span className="text-muted-foreground">Uploaded:</span> {new Date(active.createdAt).toLocaleString()}</div>
              </div>

              <div className="mt-6 flex gap-2">
                <Button onClick={() => onDownload(active)} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                {onDelete ? (
                  <Button variant="destructive" onClick={() => onDelete(active)} className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
