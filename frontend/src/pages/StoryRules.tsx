import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Plus, Trash2, RotateCw, Hash, ArrowRightLeft, Power, Info } from "lucide-react";
import { toast } from "sonner";

interface PatternEntry {
  id: string;
  pattern: string;
  label: string;
  active: boolean;
}

interface StoryPatterns {
  titlePatterns: PatternEntry[];
  transitionPatterns: PatternEntry[];
  minTransitions: number;
  minStoryNumber: number;
}

export default function StoryRules() {
  const { channelId } = useParams();
  const [patterns, setPatterns] = useState<StoryPatterns | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [dirty, setDirty] = useState(false);

  const fetchPatterns = useCallback(() => {
    if (!channelId) return;
    setLoading(true);
    fetch(`/api/article-pipeline/story-patterns?channelId=${channelId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { setPatterns(d.patterns); setIsDefault(d.isDefault); setDirty(false); })
      .catch(() => toast.error("Failed to load story patterns"))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const handleSave = () => {
    if (!channelId || !patterns) return;
    setSaving(true);
    fetch("/api/article-pipeline/story-patterns", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, patterns }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Story rules saved"); setIsDefault(false); setDirty(false); })
      .catch((e) => toast.error(e?.error || "Failed to save"))
      .finally(() => setSaving(false));
  };

  const handleReset = () => {
    if (!channelId) return;
    setSaving(true);
    fetch("/api/article-pipeline/story-patterns/reset", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { setPatterns(d.patterns); setIsDefault(true); setDirty(false); toast.success("Reset to defaults"); })
      .catch(() => toast.error("Failed to reset"))
      .finally(() => setSaving(false));
  };

  const update = (fn: (p: StoryPatterns) => StoryPatterns) => {
    setPatterns((prev) => { if (!prev) return prev; const next = fn({ ...prev }); setDirty(true); return next; });
  };

  const addPattern = (type: "titlePatterns" | "transitionPatterns") => {
    update((p) => ({
      ...p,
      [type]: [...p[type], { id: `${type === "titlePatterns" ? "tp" : "tr"}_${Date.now()}`, pattern: "", label: "", active: true }],
    }));
  };

  const removePattern = (type: "titlePatterns" | "transitionPatterns", id: string) => {
    update((p) => ({ ...p, [type]: p[type].filter((x) => x.id !== id) }));
  };

  const updatePattern = (type: "titlePatterns" | "transitionPatterns", id: string, field: keyof PatternEntry, value: string | boolean) => {
    update((p) => ({
      ...p,
      [type]: p[type].map((x) => x.id === id ? { ...x, [field]: value } : x),
    }));
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!patterns) return null;

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 pt-5 max-lg:px-4 space-y-6 pb-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-semibold">Story Detection Rules</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Configure how the pipeline detects multi-story videos. Only videos matching these rules go to AI splitting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isDefault && (
              <button onClick={handleReset} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground font-medium hover:text-foreground transition-colors disabled:opacity-50">
                <RotateCw className="w-3.5 h-3.5" /> Reset Defaults
              </button>
            )}
            <button onClick={handleSave} disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Rules
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-[12px] text-foreground/80 space-y-1">
            <p><strong>How it works:</strong> The Story Count stage runs pure server logic (zero AI cost). If a video title matches a <strong>Title Pattern</strong> or the transcript has enough <strong>Transition Markers</strong>, it goes to Story Split (AI). Everything else is treated as single-story and skips AI.</p>
            <p className="text-muted-foreground">Patterns use regular expressions. Example: <code className="text-[11px] bg-card px-1 py-0.5 rounded">(\d+)\s*(stories|headlines)</code> matches "5 stories about tech".</p>
          </div>
        </div>

        {/* Thresholds */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" /> Thresholds
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">
                Min Story Number
              </label>
              <p className="text-[10px] text-muted-foreground mb-1.5">Numbers in title above this trigger multi-story (default: 2 = any number above 1)</p>
              <input
                type="number" min={2} max={100}
                value={patterns.minStoryNumber}
                onChange={(e) => update((p) => ({ ...p, minStoryNumber: Math.max(2, parseInt(e.target.value) || 2) }))}
                className="w-full px-3 py-2 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">
                Min Transition Markers
              </label>
              <p className="text-[10px] text-muted-foreground mb-1.5">How many transition phrases needed in transcript to trigger multi-story</p>
              <input
                type="number" min={1} max={50}
                value={patterns.minTransitions}
                onChange={(e) => update((p) => ({ ...p, minTransitions: Math.max(1, parseInt(e.target.value) || 3) }))}
                className="w-full px-3 py-2 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Title Patterns */}
        <PatternSection
          title="Title Patterns"
          subtitle="Regex patterns matched against the video title. If any active pattern matches, the video is flagged as multi-story."
          icon={<Hash className="w-4 h-4 text-orange" />}
          patterns={patterns.titlePatterns}
          type="titlePatterns"
          onAdd={() => addPattern("titlePatterns")}
          onRemove={(id) => removePattern("titlePatterns", id)}
          onUpdate={(id, field, value) => updatePattern("titlePatterns", id, field, value)}
        />

        {/* Transition Patterns */}
        <PatternSection
          title="Transition Markers"
          subtitle={`Regex patterns matched against the transcript body. If ${patterns.minTransitions}+ markers are found, the video is flagged as multi-story.`}
          icon={<ArrowRightLeft className="w-4 h-4 text-purple" />}
          patterns={patterns.transitionPatterns}
          type="transitionPatterns"
          onAdd={() => addPattern("transitionPatterns")}
          onRemove={(id) => removePattern("transitionPatterns", id)}
          onUpdate={(id, field, value) => updatePattern("transitionPatterns", id, field, value)}
        />
      </div>
    </div>
  );
}

function PatternSection({
  title, subtitle, icon, patterns, type, onAdd, onRemove, onUpdate,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  patterns: PatternEntry[];
  type: "titlePatterns" | "transitionPatterns";
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof PatternEntry, value: string | boolean) => void;
}) {
  const activeCount = patterns.filter((p) => p.active).length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            {icon} {title}
            <span className="text-[11px] text-muted-foreground font-mono">
              ({activeCount}/{patterns.length} active)
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-[11px] text-muted-foreground font-medium hover:text-foreground transition-colors">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      <div className="divide-y divide-border">
        {patterns.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            No patterns configured. Click "Add" to create one.
          </div>
        ) : (
          patterns.map((p) => (
            <div key={p.id} className={`px-4 py-3 flex items-start gap-3 transition-opacity ${!p.active ? "opacity-40" : ""}`}>
              <button onClick={() => onUpdate(p.id, "active", !p.active)}
                title={p.active ? "Disable" : "Enable"}
                className={`mt-1.5 shrink-0 transition-colors ${p.active ? "text-success" : "text-muted-foreground hover:text-foreground"}`}>
                <Power className="w-3.5 h-3.5" />
              </button>

              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => onUpdate(p.id, "label", e.target.value)}
                  placeholder="Description (e.g. Number + plural noun)"
                  className="w-full px-2.5 py-1.5 text-[12px] bg-transparent border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
                <input
                  type="text"
                  value={p.pattern}
                  onChange={(e) => onUpdate(p.id, "pattern", e.target.value)}
                  placeholder="Regex pattern"
                  dir="ltr"
                  className="w-full px-2.5 py-1.5 text-[12px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
                {p.pattern && (() => {
                  try { new RegExp(p.pattern, "i"); return null; } catch (e: unknown) {
                    return <p className="text-[10px] text-destructive font-mono">{(e as Error).message}</p>;
                  }
                })()}
              </div>

              <button onClick={() => onRemove(p.id)}
                className="mt-1.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
