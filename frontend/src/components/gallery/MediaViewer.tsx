import { useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Download, Trash2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GalleryMedia, MediaMetadata } from "@/lib/gallery-api";

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

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaViewer({ open, items, index, onOpenChange, onIndexChange, onDownload, onDelete }: MediaViewerProps) {
  const active = useMemo(() => (index >= 0 && index < items.length ? items[index] : null), [index, items]);
  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  const goPrev = useCallback(() => { if (canPrev) onIndexChange(index - 1); }, [canPrev, index, onIndexChange]);
  const goNext = useCallback(() => { if (canNext) onIndexChange(index + 1); }, [canNext, index, onIndexChange]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext, close]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 overflow-hidden bg-black border-border">
        {!active ? null : (
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-[1fr_300px] overflow-hidden">
            {/* Media area */}
            <div className="relative bg-black flex items-center justify-center overflow-hidden">
              {/* Close */}
              <button
                onClick={close}
                className="absolute top-3 right-3 z-20 rounded-full bg-white/10 backdrop-blur-sm p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Counter */}
              <span className="absolute top-3.5 left-3 z-20 text-[11px] text-white/50 font-mono">
                {index + 1} / {items.length}
              </span>

              {/* Prev */}
              {canPrev && (
                <button
                  onClick={goPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {/* Next */}
              {canNext && (
                <button
                  onClick={goNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {active.type === "PHOTO" ? (
                <img
                  src={active.r2Url}
                  alt={active.fileName}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              ) : (
                <video
                  key={active.id}
                  src={active.r2Url}
                  className="max-w-full max-h-full"
                  controls
                  autoPlay
                />
              )}
            </div>

            {/* Sidebar */}
            <div className="bg-background border-l border-border flex flex-col h-full min-h-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border shrink-0">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Details</div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                <MetadataSection title="File">
                  <DetailRow label="Name" value={active.fileName} />
                  <DetailRow label="Type" value={active.type} />
                  <DetailRow label="Size" value={formatBytes(active.fileSize)} />
                  <DetailRow label="Format" value={active.mimeType} />
                  {(active.width || active.metadata?.width) && (active.height || active.metadata?.height) && (
                    <DetailRow label="Dimensions" value={`${active.width || active.metadata?.width} × ${active.height || active.metadata?.height}`} />
                  )}
                  {(active.duration != null || active.metadata?.duration != null) && (
                    <DetailRow label="Duration" value={formatDuration(active.duration ?? active.metadata?.duration ?? null) || `${Math.round(active.duration ?? active.metadata?.duration ?? 0)}s`} />
                  )}
                  <DetailRow label="Uploaded" value={new Date(active.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} />
                  {active.album && <DetailRow label="Album" value={active.album.name} />}
                </MetadataSection>

                <MetadataDetails metadata={active.metadata} type={active.type} />
              </div>

              <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
                <button
                  onClick={() => onDownload(active)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface text-[12px] text-foreground font-medium hover:bg-elevated transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                {onDelete && (
                  <button
                    onClick={() => onDelete(active)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/10 text-[12px] text-destructive font-medium hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetadataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[10px] text-dim font-mono uppercase tracking-widest">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-dim font-mono shrink-0">{label}</span>
      <span className="text-[12px] text-sensor text-right break-all leading-tight">{value}</span>
    </div>
  );
}

function formatBitrate(kbps: number) {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps} kbps`;
}

function MetadataDetails({ metadata, type }: { metadata: MediaMetadata | null; type: string }) {
  if (!metadata) return null;

  const hasLocation = metadata.gps?.latitude != null && metadata.gps?.longitude != null;
  const hasCamera = metadata.cameraMake || metadata.cameraModel || metadata.lens;
  const hasSettings = metadata.aperture || metadata.shutterSpeed || metadata.iso || metadata.focalLength || metadata.flash;
  const hasTiming = metadata.dateTaken || metadata.dateCreated;
  const hasSoftware = metadata.software;
  const hasVideo = type === "VIDEO" && (metadata.codec || metadata.frameRate || metadata.bitrate);
  const hasAudio = type === "VIDEO" && (metadata.audioCodec || metadata.audioSampleRate);

  return (
    <>
      {hasTiming && (
        <MetadataSection title="Timestamp">
          {metadata.dateTaken && <DetailRow label="Taken" value={new Date(metadata.dateTaken).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })} />}
          {metadata.dateCreated && <DetailRow label="Created" value={new Date(metadata.dateCreated).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })} />}
        </MetadataSection>
      )}

      {hasLocation && (
        <MetadataSection title="Location">
          <DetailRow label="Latitude" value={String(metadata.gps!.latitude)} />
          <DetailRow label="Longitude" value={String(metadata.gps!.longitude)} />
          {metadata.gps!.altitude != null && <DetailRow label="Altitude" value={`${metadata.gps!.altitude}m`} />}
          {metadata.gps!.direction != null && <DetailRow label="Direction" value={`${metadata.gps!.direction}°`} />}
          <a
            href={`https://www.google.com/maps?q=${metadata.gps!.latitude},${metadata.gps!.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono transition-colors"
          >
            Open in Maps &rarr;
          </a>
        </MetadataSection>
      )}

      {hasCamera && (
        <MetadataSection title="Camera">
          {metadata.cameraMake && <DetailRow label="Make" value={metadata.cameraMake} />}
          {metadata.cameraModel && <DetailRow label="Model" value={metadata.cameraModel} />}
          {metadata.lens && <DetailRow label="Lens" value={metadata.lens} />}
        </MetadataSection>
      )}

      {hasSettings && (
        <MetadataSection title="Settings">
          {metadata.aperture && <DetailRow label="Aperture" value={metadata.aperture} />}
          {metadata.shutterSpeed && <DetailRow label="Shutter" value={`${metadata.shutterSpeed}s`} />}
          {metadata.iso != null && <DetailRow label="ISO" value={String(metadata.iso)} />}
          {metadata.focalLength && <DetailRow label="Focal Length" value={metadata.focalLength} />}
          {metadata.flash && <DetailRow label="Flash" value={metadata.flash} />}
        </MetadataSection>
      )}

      {hasVideo && (
        <MetadataSection title="Video">
          {metadata.codec && <DetailRow label="Codec" value={metadata.codec.toUpperCase()} />}
          {metadata.frameRate != null && <DetailRow label="Frame Rate" value={`${metadata.frameRate} fps`} />}
          {metadata.bitrate != null && <DetailRow label="Bitrate" value={formatBitrate(metadata.bitrate)} />}
        </MetadataSection>
      )}

      {hasAudio && (
        <MetadataSection title="Audio">
          {metadata.audioCodec && <DetailRow label="Codec" value={metadata.audioCodec.toUpperCase()} />}
          {metadata.audioSampleRate != null && <DetailRow label="Sample Rate" value={`${metadata.audioSampleRate} Hz`} />}
          {metadata.audioChannels != null && <DetailRow label="Channels" value={metadata.audioChannels === 1 ? "Mono" : metadata.audioChannels === 2 ? "Stereo" : String(metadata.audioChannels)} />}
        </MetadataSection>
      )}

      {hasSoftware && (
        <MetadataSection title="Software">
          <DetailRow label="App" value={metadata.software!} />
        </MetadataSection>
      )}

      {metadata.colorSpace && (
        <MetadataSection title="Color">
          <DetailRow label="Space" value={metadata.colorSpace} />
          {metadata.density != null && <DetailRow label="DPI" value={String(metadata.density)} />}
        </MetadataSection>
      )}
    </>
  );
}
