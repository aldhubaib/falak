import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  ArrowLeft, Loader2, Save, Send, CheckCircle, RotateCcw,
  Pencil, Film, Eye, Clock, History, ExternalLink,
} from "lucide-react";
import { PageError } from "@/components/PageError";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface LogEntry {
  id: string;
  action: string;
  note: string | null;
  user: { name: string | null; avatarUrl: string | null } | null;
  createdAt: string;
}

interface WriterStoryFull {
  id: string;
  headline: string;
  stage: string;
  origin: string;
  scriptLong: string | null;
  scriptShort: string | null;
  writerNotes: string | null;
  brief: Record<string, unknown> | null;
  channelId: string;
  writerId: string | null;
  producedVideoId: string | null;
  producedVideo: {
    id: string;
    titleAr: string | null;
    titleEn: string | null;
    thumbnailUrl: string | null;
    youtubeId: string | null;
  } | null;
  log: LogEntry[];
  createdAt: string;
  updatedAt: string;
}

const STAGE_META: Record<string, { label: string; color: string; description: string }> = {
  writer_draft:     { label: "Draft",          color: "bg-orange/15 text-foreground",   description: "Edit your script and submit when ready." },
  writer_submitted: { label: "Submitted",      color: "bg-primary/15 text-foreground",  description: "Waiting for editorial review." },
  writer_approved:  { label: "Approved",        color: "bg-success/15 text-foreground",  description: "Approved for production. Filming will begin soon." },
  scripting:        { label: "In Production",  color: "bg-primary/15 text-foreground",  description: "Your story is being produced." },
  filmed:           { label: "Filmed",         color: "bg-success/15 text-foreground",  description: "Video has been filmed." },
  writer_review:    { label: "Review Needed",  color: "bg-warning/15 text-foreground",  description: "Watch the filmed video and approve or request changes." },
  writer_revision:  { label: "Needs Revision", color: "bg-orange/15 text-foreground",   description: "Please revise your script based on feedback." },
  done:             { label: "Published",      color: "bg-foreground/15 text-foreground", description: "This story has been published." },
  trash:            { label: "Rejected",       color: "bg-card text-muted-foreground border border-border", description: "This story was not approved." },
};

function getStageMeta(stage: string) {
  return STAGE_META[stage] ?? { label: stage, color: "bg-card text-foreground", description: "" };
}

export default function WriterStoryDetail() {
  const { id } = useParams();
  const { channelId } = useParams();
  const cp = useChannelPath();
  const navigate = useNavigate();

  const [story, setStory] = useState<WriterStoryFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [headline, setHeadline] = useState("");
  const [scriptLong, setScriptLong] = useState("");
  const [writerNotes, setWriterNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  const fetchStory = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/writer/stories/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load story");
      const data: WriterStoryFull = await res.json();
      setStory(data);
      setHeadline(data.headline);
      setScriptLong(data.scriptLong ?? "");
      setWriterNotes(data.writerNotes ?? "");
      setDirty(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchStory(); }, [fetchStory]);

  const isEditable = story?.stage === "writer_draft" || story?.stage === "writer_revision";
  const canSubmit = isEditable && headline.trim().length > 0 && scriptLong.trim().length > 0;
  const canReview = story?.stage === "writer_review";

  const handleSave = async () => {
    if (!story || !isEditable) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ headline, scriptLong, writerNotes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      const updated = await res.json();
      setStory(prev => prev ? { ...prev, ...updated, log: updated.log ?? prev.log } : prev);
      setDirty(false);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!story || !canSubmit) return;
    setSubmitting(true);
    try {
      if (dirty) {
        const saveRes = await fetch(`/api/stories/${story.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ headline, scriptLong, writerNotes }),
        });
        if (!saveRes.ok) throw new Error("Failed to save before submitting");
      }
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage: "writer_submitted" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit");
      }
      toast.success("Story submitted for review");
      await fetchStory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewAction = async (action: "approve" | "revise") => {
    if (!story || !canReview) return;
    const stage = action === "approve" ? "writer_approved" : "writer_revision";
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage, writerNotes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success(action === "approve" ? "Video approved" : "Revision requested");
      await fetchStory();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !story) return <PageError title="Error" message={error ?? "Story not found"} onRetry={fetchStory} />;

  const meta = getStageMeta(story.stage);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(cp("/writer"))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-card transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isEditable && (
            <>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-border text-foreground hover:bg-card transition-colors disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Submit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stage info banner */}
      {meta.description && (
        <div className="rounded-xl bg-card border border-border p-3 mb-5">
          <p className="text-[12px] text-muted-foreground">{meta.description}</p>
        </div>
      )}

      {/* Headline */}
      <div className="mb-5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Headline</label>
        {isEditable ? (
          <input
            value={headline}
            onChange={e => { setHeadline(e.target.value); setDirty(true); }}
            className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Story headline..."
          />
        ) : (
          <h2 className="text-[16px] font-semibold text-foreground">{story.headline}</h2>
        )}
      </div>

      {/* Script */}
      <div className="mb-5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Script</label>
        {isEditable ? (
          <textarea
            value={scriptLong}
            onChange={e => { setScriptLong(e.target.value); setDirty(true); }}
            rows={16}
            className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y font-mono leading-relaxed"
            placeholder="Write your script here..."
            dir="auto"
          />
        ) : (
          <div className="bg-card border border-border rounded-xl px-3.5 py-3 text-[13px] text-foreground whitespace-pre-wrap font-mono leading-relaxed min-h-[200px]" dir="auto">
            {story.scriptLong || <span className="text-muted-foreground italic">No script yet</span>}
          </div>
        )}
      </div>

      {/* Writer notes */}
      <div className="mb-5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes</label>
        {isEditable || canReview ? (
          <textarea
            value={writerNotes}
            onChange={e => { setWriterNotes(e.target.value); setDirty(true); }}
            rows={3}
            className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y"
            placeholder={canReview ? "Add notes about what to change (if requesting revision)..." : "Any notes for the production team..."}
            dir="auto"
          />
        ) : (
          story.writerNotes ? (
            <div className="bg-card border border-border rounded-xl px-3.5 py-3 text-[13px] text-foreground whitespace-pre-wrap" dir="auto">
              {story.writerNotes}
            </div>
          ) : null
        )}
      </div>

      {/* Video preview (for review stage) */}
      {story.producedVideo && (
        <div className="mb-5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Filmed Video</label>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              {story.producedVideo.thumbnailUrl && (
                <img src={story.producedVideo.thumbnailUrl} alt="" className="w-32 h-20 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-medium text-foreground">
                  {story.producedVideo.titleAr || story.producedVideo.titleEn || "Untitled"}
                </h4>
                {story.producedVideo.youtubeId && (
                  <a
                    href={`https://www.youtube.com/watch?v=${story.producedVideo.youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary flex items-center gap-1 mt-1 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Watch on YouTube
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review actions */}
      {canReview && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-card border border-border rounded-xl">
          <div className="flex-1">
            <p className="text-[13px] font-medium text-foreground">Review this video</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Approve to publish, or request revisions with notes above.</p>
          </div>
          <button
            onClick={() => handleReviewAction("revise")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-border text-foreground hover:bg-card transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Request Changes
          </button>
          <button
            onClick={() => handleReviewAction("approve")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-success text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Approve
          </button>
        </div>
      )}

      {/* Activity log */}
      {story.log.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Activity</span>
          </div>
          <div className="space-y-2">
            {story.log.map(entry => (
              <div key={entry.id} className="flex items-start gap-2.5 text-[12px]">
                {entry.user?.avatarUrl ? (
                  <img src={entry.user.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-card flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">
                    {(entry.user?.name ?? "?")[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{entry.user?.name ?? "System"}</span>
                  <span className="text-muted-foreground ml-1.5">{entry.note ?? entry.action}</span>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
