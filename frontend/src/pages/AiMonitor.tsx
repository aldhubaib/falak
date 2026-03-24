import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Brain,
  BookOpen,
  GitCompare,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Zap,
  AlertCircle,
  Check,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  X,
} from "lucide-react";
import { fmtDateTime } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  channelId: string;
  storyId: string | null;
  action: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

interface LogDetail extends LogEntry {
  systemPrompt: string | null;
  userPrompt: string | null;
  response: string | null;
}

interface Correction {
  wrong: string;
  correct: string;
  category: string;
  learnedFrom?: string;
  learnedAt?: string;
}

interface StyleGuide {
  corrections: Correction[];
  signatures: { startHook: string[]; endHook: string[] };
  notes: string[];
  learnedAt: string | null;
  storyCount: number;
}

interface DiffStory {
  id: string;
  headline: string;
  stage: string;
  createdAt: string;
}

// ── Tabs ────────────────────────────────────────────────────────

type Tab = "logs" | "guide" | "diff";
const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "logs", label: "Generation Log", icon: Brain },
  { key: "guide", label: "Style Guide", icon: BookOpen },
  { key: "diff", label: "Diff View", icon: GitCompare },
];

// ── Main Component ────────────────────────────────────────────

export default function AiMonitor() {
  const { channelId } = useParams<{ channelId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("logs");

  return (
    <div className="max-w-[1000px] mx-auto px-16 max-lg:px-10 max-sm:px-4 py-5 pb-16 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">AI Monitor</h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "logs" && <GenerationLogTab channelId={channelId!} />}
      {activeTab === "guide" && <StyleGuideTab channelId={channelId!} />}
      {activeTab === "diff" && <DiffViewTab channelId={channelId!} />}
    </div>
  );
}

// ── Generation Log Tab ────────────────────────────────────────

function GenerationLogTab({ channelId }: { channelId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ai-monitor/logs?channelId=${channelId}&page=${page}&limit=30`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load AI logs");
    } finally {
      setLoading(false);
    }
  }, [channelId, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/ai-monitor/logs/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setSelectedLog(await res.json());
    } catch {
      toast.error("Failed to load log detail");
    } finally {
      setLoadingDetail(false);
    }
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{total} AI generation calls logged</p>
        <button onClick={fetchLogs} className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">No AI calls logged yet. Logs start appearing when you generate scripts, titles, tags, or descriptions.</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{log.action}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{log.model.replace('claude-', '').replace('-20251001', '')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {log.inputTokens != null ? `${(log.inputTokens + (log.outputTokens || 0)).toLocaleString()}` : "–"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {log.durationMs != null ? `${(log.durationMs / 1000).toFixed(1)}s` : "–"}
                  </td>
                  <td className="px-3 py-2.5">
                    {log.status === "ok" ? (
                      <span className="inline-flex items-center gap-1 text-green-500"><Check className="w-3 h-3" /> OK</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400"><AlertCircle className="w-3 h-3" /> Fail</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtDateTime(log.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => openDetail(log.id)}
                      className="text-[12px] text-primary hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[13px] text-muted-foreground">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Detail modal */}
      {(selectedLog || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedLog(null)}>
          <div
            className="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail && !selectedLog ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : selectedLog ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[15px]">{selectedLog.action}</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {selectedLog.model} · {fmtDateTime(selectedLog.createdAt)}
                      {selectedLog.durationMs != null && ` · ${(selectedLog.durationMs / 1000).toFixed(1)}s`}
                      {selectedLog.inputTokens != null && ` · ${selectedLog.inputTokens.toLocaleString()} in / ${(selectedLog.outputTokens || 0).toLocaleString()} out`}
                    </p>
                  </div>
                  <button onClick={() => setSelectedLog(null)} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>

                {selectedLog.systemPrompt && (
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground mb-1">System Prompt</p>
                    <pre className="text-[12px] bg-muted/30 border border-border rounded-md p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{selectedLog.systemPrompt}</pre>
                  </div>
                )}
                {selectedLog.userPrompt && (
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground mb-1">User Prompt</p>
                    <pre className="text-[12px] bg-muted/30 border border-border rounded-md p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{selectedLog.userPrompt}</pre>
                  </div>
                )}
                {selectedLog.response && (
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground mb-1">Response</p>
                    <pre className="text-[12px] bg-muted/30 border border-border rounded-md p-3 whitespace-pre-wrap max-h-64 overflow-y-auto">{selectedLog.response}</pre>
                  </div>
                )}
                {selectedLog.error && (
                  <div>
                    <p className="text-[12px] font-medium text-red-400 mb-1">Error</p>
                    <pre className="text-[12px] bg-red-500/10 border border-red-500/20 rounded-md p-3 whitespace-pre-wrap text-red-400">{selectedLog.error}</pre>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Style Guide Tab ────────────────────────────────────────

function StyleGuideTab({ channelId }: { channelId: string }) {
  const [guide, setGuide] = useState<StyleGuide | null>(null);
  const [channelInfo, setChannelInfo] = useState<{ nameAr: string; startHook: string | null; endHook: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState("");

  const fetchGuide = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-monitor/style-guide/${channelId}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuide(data.styleGuide);
      setChannelInfo(data.channel);
    } catch {
      toast.error("Failed to load style guide");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { fetchGuide(); }, [fetchGuide]);

  const saveGuide = async (updated: StyleGuide) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ai-monitor/style-guide/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuide(data.styleGuide);
      toast.success("Style guide saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const removeCorrection = (idx: number) => {
    if (!guide) return;
    const updated = { ...guide, corrections: guide.corrections.filter((_, i) => i !== idx) };
    setGuide(updated);
    saveGuide(updated);
  };

  const removeNote = (idx: number) => {
    if (!guide) return;
    const updated = { ...guide, notes: guide.notes.filter((_, i) => i !== idx) };
    setGuide(updated);
    saveGuide(updated);
  };

  const addNote = () => {
    if (!guide || !newNote.trim()) return;
    const updated = { ...guide, notes: [...guide.notes, newNote.trim()] };
    setGuide(updated);
    setNewNote("");
    saveGuide(updated);
  };

  const removeHookExample = (type: "startHook" | "endHook", idx: number) => {
    if (!guide) return;
    const updated = {
      ...guide,
      signatures: {
        ...guide.signatures,
        [type]: guide.signatures[type].filter((_, i) => i !== idx),
      },
    };
    setGuide(updated);
    saveGuide(updated);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!guide) return <div className="text-center py-12 text-muted-foreground text-[13px]">Failed to load style guide</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Corrections Learned</p>
          <p className="text-2xl font-semibold mt-1">{guide.corrections.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Stories Analyzed</p>
          <p className="text-2xl font-semibold mt-1">{guide.storyCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] text-muted-foreground">Last Learned</p>
          <p className="text-[13px] font-medium mt-1">{guide.learnedAt ? fmtDateTime(guide.learnedAt) : "Never"}</p>
        </div>
      </div>

      {/* Current hooks from channel */}
      {channelInfo && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-[13px] font-semibold mb-2">Channel Branded Hooks</h3>
          <div className="space-y-2 text-[12px]">
            <div>
              <span className="text-muted-foreground">Start Hook: </span>
              <span className="font-medium">{channelInfo.startHook || "Not set"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">End Hook: </span>
              <span className="font-medium">{channelInfo.endHook || "Not set"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Corrections */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold">Learned Corrections</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">These corrections are injected into every AI generation prompt</p>
        </div>
        {guide.corrections.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            No corrections yet. They'll appear here as stories move to "Done" and the AI compares script vs transcript.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {guide.corrections.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      c.category === "branded_hook" ? "bg-orange-500/15 text-orange-400" :
                      c.category === "factual" ? "bg-red-500/15 text-red-400" :
                      c.category === "format" ? "bg-blue-500/15 text-blue-400" :
                      "bg-purple-500/15 text-purple-400"
                    }`}>
                      {c.category}
                    </span>
                    {c.learnedAt && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="w-3 h-3" /> {fmtDateTime(c.learnedAt)}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px]">
                    <span className="text-red-400 line-through">{c.wrong}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span className="text-green-400">{c.correct}</span>
                  </div>
                </div>
                <button onClick={() => removeCorrection(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hook Examples */}
      {(guide.signatures.startHook.length > 0 || guide.signatures.endHook.length > 0) && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-[13px] font-semibold">Hook Examples from Real Videos</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">Actual hooks the presenter used — fed as few-shot examples to the AI</p>
          </div>
          <div className="divide-y divide-border">
            {guide.signatures.startHook.map((h, i) => (
              <div key={`s-${i}`} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-medium shrink-0">opening</span>
                <span className="text-[12px] flex-1">"{h}"</span>
                <button onClick={() => removeHookExample("startHook", i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {guide.signatures.endHook.map((h, i) => (
              <div key={`e-${i}`} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">closing</span>
                <span className="text-[12px] flex-1">"{h}"</span>
                <button onClick={() => removeHookExample("endHook", i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold">Style Notes</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">General observations about the presenter's style</p>
        </div>
        {guide.notes.length > 0 && (
          <div className="divide-y divide-border">
            {guide.notes.map((n, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-[12px] flex-1">{n}</span>
                <button onClick={() => removeNote(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border flex gap-2">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="Add a style note..."
            className="flex-1 text-[13px] px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addNote}
            disabled={!newNote.trim() || saving}
            className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diff View Tab ────────────────────────────────────────

function DiffViewTab({ channelId }: { channelId: string }) {
  const [stories, setStories] = useState<DiffStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<{ aiScript: string | null; transcript: string | null } | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [corrections, setCorrections] = useState<{ corrections: Correction[]; startHookExample?: string | null; endHookExample?: string | null; styleNotes?: string[] } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [learning, setLearning] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ai-monitor/stories-with-both?channelId=${channelId}`, { credentials: "include" });
        if (!res.ok) throw new Error();
        setStories(await res.json());
      } catch {
        toast.error("Failed to load stories");
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  const loadDiff = async (storyId: string) => {
    setSelectedStoryId(storyId);
    setDiffData(null);
    setCorrections(null);
    setLoadingDiff(true);
    try {
      const res = await fetch(`/api/ai-monitor/diff-data/${storyId}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setDiffData(await res.json());
    } catch {
      toast.error("Failed to load diff data");
    } finally {
      setLoadingDiff(false);
    }
  };

  const previewCorrections = async () => {
    if (!selectedStoryId) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/ai-monitor/preview-corrections/${selectedStoryId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setCorrections(await res.json());
    } catch {
      toast.error("Failed to extract corrections");
    } finally {
      setExtracting(false);
    }
  };

  const learnFromThis = async () => {
    if (!selectedStoryId) return;
    setLearning(true);
    try {
      const res = await fetch(`/api/ai-monitor/learn/${selectedStoryId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast.success("Learning complete — style guide updated");
    } catch {
      toast.error("Learning failed");
    } finally {
      setLearning(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Compare AI-generated scripts with actual transcripts to identify what the AI should learn.
      </p>

      {stories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          No stories with both an AI script and a transcript. Complete a video (filmed → done) to see comparisons here.
        </div>
      ) : (
        <div className="grid grid-cols-[280px,1fr] gap-4 max-md:grid-cols-1">
          {/* Story list */}
          <div className="rounded-lg border border-border bg-card overflow-hidden max-h-[70vh] overflow-y-auto">
            {stories.map((s) => (
              <button
                key={s.id}
                onClick={() => loadDiff(s.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors text-[13px] ${
                  selectedStoryId === s.id ? "bg-primary/10" : "hover:bg-muted/30"
                }`}
              >
                <p className="font-medium truncate">{s.headline || "Untitled"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDateTime(s.createdAt)} · {s.stage}</p>
              </button>
            ))}
          </div>

          {/* Diff area */}
          <div className="space-y-4">
            {!selectedStoryId ? (
              <div className="text-center py-12 text-muted-foreground text-[13px] rounded-lg border border-border bg-card">
                Select a story to view the diff
              </div>
            ) : loadingDiff ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : diffData ? (
              <>
                {/* Side-by-side */}
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-blue-500/10">
                      <p className="text-[12px] font-semibold text-blue-400">AI-Generated Script</p>
                    </div>
                    <pre className="text-[12px] p-3 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                      {diffData.aiScript || "No script available"}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-green-500/10">
                      <p className="text-[12px] font-semibold text-green-400">Actual Transcript</p>
                    </div>
                    <pre className="text-[12px] p-3 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                      {diffData.transcript || "No transcript available"}
                    </pre>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={previewCorrections}
                    disabled={extracting}
                    className="px-3 py-2 text-[12px] font-medium rounded-md border border-border hover:bg-muted flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
                    Preview Corrections
                  </button>
                  <button
                    onClick={learnFromThis}
                    disabled={learning}
                    className="px-3 py-2 text-[12px] font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {learning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Learn from This
                  </button>
                </div>

                {/* Preview corrections */}
                {corrections && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="text-[13px] font-semibold">Extracted Corrections</h3>
                    </div>
                    {corrections.corrections.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No significant corrections found — the AI script is close to the actual transcript.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {corrections.corrections.map((c, i) => (
                          <div key={i} className="px-4 py-2.5 text-[12px]">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium mr-2 ${
                              c.category === "branded_hook" ? "bg-orange-500/15 text-orange-400" :
                              c.category === "factual" ? "bg-red-500/15 text-red-400" :
                              c.category === "format" ? "bg-blue-500/15 text-blue-400" :
                              "bg-purple-500/15 text-purple-400"
                            }`}>{c.category}</span>
                            <span className="text-red-400 line-through">{c.wrong}</span>
                            <span className="text-muted-foreground mx-2">→</span>
                            <span className="text-green-400">{c.correct}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {corrections.startHookExample && (
                      <div className="px-4 py-2.5 border-t border-border text-[12px]">
                        <span className="text-muted-foreground">Opening hook: </span>
                        <span className="text-green-400">"{corrections.startHookExample}"</span>
                      </div>
                    )}
                    {corrections.endHookExample && (
                      <div className="px-4 py-2.5 border-t border-border text-[12px]">
                        <span className="text-muted-foreground">Closing hook: </span>
                        <span className="text-green-400">"{corrections.endHookExample}"</span>
                      </div>
                    )}
                    {corrections.styleNotes && corrections.styleNotes.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-border text-[12px] space-y-1">
                        <p className="text-muted-foreground font-medium">Style Notes:</p>
                        {corrections.styleNotes.map((n, i) => (
                          <p key={i}>• {n}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
