import { useCallback, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMediaUpload } from "@/hooks/useGallery";

interface UploadZoneProps {
  channelId: string;
  albumId?: string;
}

interface PreviewItem {
  id: string;
  name: string;
  url: string;
}

function formatEta(seconds?: number) {
  if (seconds === undefined) return "Calculating...";
  if (seconds <= 0) return "Done";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s left`;
  return `${mins}m ${secs}s left`;
}

async function createImageThumb(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

async function createVideoThumb(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Video load failed"));
  });
  video.currentTime = Math.min(0.2, Number.isFinite(video.duration) ? video.duration / 10 : 0.2);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 180;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(objectUrl);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function UploadZone({ channelId, albumId }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const { queue, uploadFiles, dismissItem, clearFinished } = useMediaUpload(channelId, albumId);

  const processFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
      if (accepted.length === 0) return;

      const thumbs = await Promise.all(
        accepted.map(async (file) => {
          try {
            const url = file.type.startsWith("video/") ? await createVideoThumb(file) : await createImageThumb(file);
            return { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, url };
          } catch {
            return null;
          }
        })
      );
      setPreviews((prev) => [...thumbs.filter(Boolean) as PreviewItem[], ...prev].slice(0, 20));
      const result = await uploadFiles(accepted);
      if (result?.skipped && result.skipped > 0) {
        alert(`Only 100 files can be queued at once. ${result.skipped} file(s) were skipped.`);
      }
    },
    [uploadFiles]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void processFiles(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <UploadCloud className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <div className="text-sm font-medium">Drop photos/videos here</div>
        <div className="text-xs text-muted-foreground mt-1">Supports multiple files (up to 100 at once)</div>
        <Button className="mt-3" size="sm" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            void processFiles(files);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {previews.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-2">Generated thumbnails</div>
          <div className="grid grid-cols-6 gap-2">
            {previews.map((preview) => (
              <img key={preview.id} src={preview.url} alt={preview.name} className="w-full aspect-square object-cover rounded-lg border border-border" />
            ))}
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="rounded-lg border border-border p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Uploads</div>
            <Button size="sm" variant="outline" onClick={clearFinished}>Clear finished</Button>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {queue.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs truncate">{item.file.name}</div>
                  <button onClick={() => dismissItem(item.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Progress className="mt-2 h-2" value={item.progress} />
                <div className="text-[11px] mt-1 text-muted-foreground flex items-center justify-between gap-2">
                  <span>{item.status}{item.error ? ` - ${item.error}` : ""}</span>
                  <span>{formatEta(item.etaSeconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
