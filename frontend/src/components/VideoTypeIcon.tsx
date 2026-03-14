import { Play, Zap } from "lucide-react";

/** Global default: Play = video, Zap = short. Icon only (no text). */
export function VideoTypeIcon({
  type,
  className = "w-3.5 h-3.5 text-dim",
  title,
}: {
  type: "short" | "video";
  className?: string;
  title?: boolean;
}) {
  const isShort = type === "short";
  const label = isShort ? "Short" : "Video";
  return (
    <span title={title !== false ? label : undefined} className="inline-flex shrink-0">
      {isShort ? (
        <Zap className={className} aria-label={label} />
      ) : (
        <Play className={className} aria-label={label} />
      )}
    </span>
  );
}
