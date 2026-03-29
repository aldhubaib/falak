import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Loader2, Plus, FileText, Send, CheckCircle, Film, Eye, Pencil, Clock, Trash2 } from "lucide-react";
import { PageError } from "@/components/PageError";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

interface WriterStory {
  id: string;
  headline: string;
  stage: string;
  scriptLong: string | null;
  scriptShort: string | null;
  writerNotes: string | null;
  createdAt: string;
  updatedAt: string;
  channelId: string;
  producedVideoId: string | null;
  producedVideo: { id: string; titleAr: string | null; thumbnailUrl: string | null } | null;
}

interface Summary {
  total: number;
  writer_draft: number;
  writer_submitted: number;
  writer_approved: number;
  scripting: number;
  filmed: number;
  writer_review: number;
  writer_revision: number;
  done: number;
  trash: number;
}

type WriterStage = "all" | "writer_draft" | "writer_submitted" | "writer_approved" | "scripting" | "filmed" | "writer_review" | "writer_revision" | "done" | "trash";

const WRITER_STAGES: { key: WriterStage; label: string; icon: typeof FileText; color: string }[] = [
  { key: "all",               label: "All",              icon: FileText,    color: "text-foreground" },
  { key: "writer_draft",      label: "Drafts",           icon: Pencil,      color: "text-orange" },
  { key: "writer_submitted",  label: "Submitted",        icon: Send,        color: "text-primary" },
  { key: "writer_approved",   label: "Approved",         icon: CheckCircle, color: "text-success" },
  { key: "filmed",            label: "Filmed",           icon: Film,        color: "text-success" },
  { key: "writer_review",     label: "Review Needed",    icon: Eye,         color: "text-warning" },
  { key: "writer_revision",   label: "Needs Revision",   icon: Pencil,      color: "text-orange" },
  { key: "done",              label: "Published",        icon: CheckCircle, color: "text-foreground" },
  { key: "trash",             label: "Rejected",         icon: Trash2,      color: "text-muted-foreground" },
];

function stageLabel(stage: string): string {
  return WRITER_STAGES.find(s => s.key === stage)?.label ?? stage;
}

function stagePill(stage: string) {
  const meta = WRITER_STAGES.find(s => s.key === stage);
  const colorMap: Record<string, string> = {
    writer_draft:     "bg-orange/15 text-foreground",
    writer_submitted: "bg-primary/15 text-foreground",
    writer_approved:  "bg-success/15 text-foreground",
    scripting:        "bg-primary/15 text-foreground",
    filmed:           "bg-success/15 text-foreground",
    writer_review:    "bg-warning/15 text-foreground",
    writer_revision:  "bg-orange/15 text-foreground",
    done:             "bg-foreground/15 text-foreground",
    trash:            "bg-card text-muted-foreground border border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${colorMap[stage] ?? "bg-card text-foreground"}`}>
      {meta?.icon && <meta.icon className="w-3 h-3" />}
      {stageLabel(stage)}
    </span>
  );
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 min ago" : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WriterDashboard() {
  const { channelId } = useParams();
  const cp = useChannelPath();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [stories, setStories] = useState<WriterStory[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<WriterStage>("all");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!channelId) return;
    try {
      const [storiesRes, summaryRes] = await Promise.all([
        fetch(`/api/writer/stories?channelId=${channelId}`, { credentials: "include" }),
        fetch(`/api/writer/stories/summary?channelId=${channelId}`, { credentials: "include" }),
      ]);
      if (!storiesRes.ok || !summaryRes.ok) throw new Error("Failed to load");
      setStories(await storiesRes.json());
      setSummary(await summaryRes.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!channelId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channelId, headline: "Untitled Story" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create story");
      }
      const story = await res.json();
      navigate(cp(`/writer/story/${story.id}`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <PageError title="Error" message={error} onRetry={fetchData} />;

  const filtered = activeStage === "all" ? stories : stories.filter(s => s.stage === activeStage);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Writer Dashboard</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {summary?.total ?? 0} {summary?.total === 1 ? "story" : "stories"} total
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          New Story
        </button>
      </div>

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-none">
        {WRITER_STAGES.map(({ key, label, icon: Icon, color }) => {
          const count = key === "all" ? (summary?.total ?? 0) : (summary?.[key as keyof Summary] ?? 0);
          const isActive = activeStage === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStage(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                isActive
                  ? "bg-card text-foreground border border-border"
                  : "text-muted-foreground hover:bg-card/60"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? color : ""}`} strokeWidth={1.5} />
              {label}
              <span className={`text-[11px] ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Story list */}
      {filtered.length === 0 ? (
        <EmptyState
          title={activeStage === "all" ? "No stories yet" : `No ${stageLabel(activeStage).toLowerCase()} stories`}
          description={activeStage === "all" ? "Create your first story pitch to get started." : "No stories in this stage."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(story => (
            <Link
              key={story.id}
              to={cp(`/writer/story/${story.id}`)}
              className="block rounded-xl bg-card border border-border p-4 hover:border-primary/30 transition-colors no-underline"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-medium text-foreground truncate">{story.headline}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    {stagePill(story.stage)}
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(story.updatedAt)}
                    </span>
                  </div>
                  {story.writerNotes && (
                    <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-1">{story.writerNotes}</p>
                  )}
                </div>
                {story.producedVideo?.thumbnailUrl && (
                  <img
                    src={story.producedVideo.thumbnailUrl}
                    alt=""
                    className="w-20 h-12 rounded-lg object-cover shrink-0"
                  />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
