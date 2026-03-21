import { useState } from "react";
import { Loader2, Mic, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { StoryBrief } from "./types";

export interface TranscriptSectionProps {
  storyId: string;
  brief: StoryBrief;
  onBriefChange: (updater: (prev: StoryBrief) => StoryBrief) => void;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TranscriptSection({ storyId, brief, onBriefChange }: TranscriptSectionProps) {
  const [transcribing, setTranscribing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const hasTranscript = !!brief.transcript;
  const segments = brief.transcriptSegments || [];
  const wordCount = brief.transcript ? brief.transcript.split(/\s+/).filter(Boolean).length : 0;
  const charCount = brief.transcript?.length || 0;

  const handleTranscribe = async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/transcribe`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.error
          || (res.status === 502 ? "Server timed out — the video may be too large. Try a shorter clip." : `Transcription failed (${res.status})`);
        toast.error(msg);
        return;
      }
      const data = await res.json();
      onBriefChange((b) => ({
        ...b,
        transcript: data.transcript,
        transcriptSegments: data.segments,
        subtitlesSRT: data.srt,
        script: data.transcript,
      }));
      toast.success("Video transcribed successfully");
    } catch {
      toast.error("Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopy = () => {
    if (!brief.transcript) return;
    navigator.clipboard.writeText(brief.transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg bg-background border border-border overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground font-medium">Transcript</span>
          {hasTranscript && (
            <span className="text-[10px] font-mono text-success/70 bg-success/10 px-1.5 py-0.5 rounded">
              Whisper
            </span>
          )}
          {hasTranscript && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {wordCount} words · {charCount} chars
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasTranscript && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-muted-foreground font-medium transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={transcribing || !brief.videoR2Key}
            className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transcribing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Mic className="w-3 h-3" />
            )}
            {transcribing ? "Transcribing…" : hasTranscript ? "Re-transcribe" : "Transcribe Video"}
          </button>
        </div>
      </div>

      {!hasTranscript && !transcribing && (
        <div className="px-4 pb-4">
          <div className="rounded-lg bg-card border border-border/50 px-4 py-6 text-center">
            <Mic className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground">
              {brief.videoR2Key
                ? 'Click "Transcribe Video" to extract text from your video using AI.'
                : "Upload a video first, then transcribe it."}
            </p>
          </div>
        </div>
      )}

      {transcribing && (
        <div className="px-4 pb-4">
          <div className="rounded-lg bg-card border border-primary/20 px-4 py-6 text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground">Transcribing with OpenAI Whisper… This may take a few minutes for large videos.</p>
          </div>
        </div>
      )}

      {hasTranscript && expanded && (
        <div className="px-4 pb-4">
          {segments.length > 0 ? (
            <div className="rounded-lg bg-card border border-border/50 max-h-[300px] overflow-y-auto">
              {segments.map((seg, i) => (
                <div key={i} className="flex gap-3 px-3 py-2 border-b border-border/30 last:border-b-0">
                  <span className="text-[10px] font-mono text-primary shrink-0 pt-0.5 w-8 text-right">
                    {fmtTime(seg.start)}
                  </span>
                  <span className="text-[12px] text-foreground/90 leading-relaxed" dir="auto">
                    {seg.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="rounded-lg bg-card border border-border/50 px-3 py-2 text-[12px] text-foreground/80 leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-wrap" dir="auto">
              {brief.transcript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
