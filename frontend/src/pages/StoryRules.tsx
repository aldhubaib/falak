import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import { useParams } from "react-router-dom";
import { Loader2, X, RotateCw, Hash, ArrowRightLeft, Info } from "lucide-react";
import { toast } from "sonner";

interface StoryPatterns {
  titleWords: string[];
  transitionPhrases: string[];
  minTransitions: number;
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
    setPatterns((prev) => { if (!prev) return prev; setDirty(true); return fn({ ...prev }); });
  };

  const addWord = (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    update((p) => {
      if (p.titleWords.some((x) => x.toLowerCase() === w)) return p;
      return { ...p, titleWords: [...p.titleWords, word.trim()] };
    });
  };

  const removeWord = (word: string) => {
    update((p) => ({ ...p, titleWords: p.titleWords.filter((x) => x !== word) }));
  };

  const addPhrase = (phrase: string) => {
    const ph = phrase.trim();
    if (!ph) return;
    update((p) => {
      if (p.transitionPhrases.some((x) => x.toLowerCase() === ph.toLowerCase())) return p;
      return { ...p, transitionPhrases: [...p.transitionPhrases, ph] };
    });
  };

  const removePhrase = (phrase: string) => {
    update((p) => ({ ...p, transitionPhrases: p.transitionPhrases.filter((x) => x !== phrase) }));
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
              Configure how the pipeline detects multi-story videos.
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

        {/* Info */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-[12px] text-foreground/80 space-y-1">
            <p>If a video title contains any <strong>Title Word</strong>, the video goes to AI splitting. Otherwise it's treated as single-story (no AI cost).</p>
            <p>If the transcript contains enough <strong>Transition Phrases</strong>, the video also goes to AI splitting.</p>
          </div>
        </div>

        {/* Title Words */}
        <WordSection
          title="Title Words"
          subtitle="If any of these words appear in the video title, the video is flagged as multi-story."
          icon={<Hash className="w-4 h-4 text-orange" />}
          words={patterns.titleWords}
          placeholder="Type a word and press Enter… e.g. stories"
          onAdd={addWord}
          onRemove={removeWord}
        />

        {/* Transition Phrases */}
        <WordSection
          title="Transition Phrases"
          subtitle={`Phrases that signal a topic change in the transcript. If ${patterns.minTransitions}+ are found, video goes to AI splitting.`}
          icon={<ArrowRightLeft className="w-4 h-4 text-purple" />}
          words={patterns.transitionPhrases}
          placeholder="Type a phrase and press Enter… e.g. in other news"
          onAdd={addPhrase}
          onRemove={removePhrase}
        />

        {/* Min Transitions */}
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="text-[12px] font-semibold flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-primary" /> Min Transition Phrases
          </label>
          <p className="text-[11px] text-muted-foreground mb-3">How many transition phrases must appear in the transcript to trigger AI splitting.</p>
          <input
            type="number" min={1} max={50}
            value={patterns.minTransitions}
            onChange={(e) => update((p) => ({ ...p, minTransitions: Math.max(1, parseInt(e.target.value) || 3) }))}
            className="w-24 px-3 py-2 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>
    </div>
  );
}

function WordSection({
  title, subtitle, icon, words, placeholder, onAdd, onRemove,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  words: string[];
  placeholder: string;
  onAdd: (word: string) => void;
  onRemove: (word: string) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) { onAdd(input); setInput(""); }
    }
    if (e.key === "Backspace" && input === "" && words.length > 0) {
      onRemove(words[words.length - 1]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      text.split(/[,\n]/).map((w) => w.trim()).filter(Boolean).forEach(onAdd);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          {icon} {title}
          <span className="text-[11px] text-muted-foreground font-mono">({words.length})</span>
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <div
        className="px-3 py-3 flex flex-wrap items-center gap-1.5 min-h-[48px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {words.map((w) => (
          <span key={w} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-medium" dir="auto">
            {w}
            <button onClick={(e) => { e.stopPropagation(); onRemove(w); }}
              className="hover:text-destructive transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onPaste={handlePaste}
          placeholder={words.length === 0 ? placeholder : ""}
          dir="auto"
          className="flex-1 min-w-[140px] px-1 py-1 text-[12px] bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>
    </div>
  );
}
