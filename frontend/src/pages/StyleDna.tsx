import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Dna,
  Loader2,
  RefreshCw,
  MessageSquareQuote,
  BookOpen,
  Mic2,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Type,
  Volume2,
  Palette,
  BarChart3,
  Globe,
  Navigation,
  Pencil,
} from "lucide-react";
import { fmtDateTime } from "@/lib/utils";

interface StyleDnaMeta {
  transcriptsAnalyzed: number;
  channelName: string;
  channelHandle: string;
  builtAt: string;
  model: string;
}

interface NarrativeStructure {
  name: string;
  description: string;
  frequency: string;
  example: string;
}

interface Pattern {
  type: string;
  frequency: string;
  examples: string[];
}

interface SentenceStyle {
  avgLength: string;
  structure: string;
  rhythm: string;
}

interface Vocabulary {
  signatureWords: string[];
  avoidedPatterns: string[];
  collocations: string[];
}

interface Tone {
  primary: string;
  emotionalArc: string;
  humorStyle: string;
}

interface StoryBeats {
  typicalStructure: string[];
  hookTechnique: string;
  tensionBuilding: string;
}

interface DialectMarkers {
  dialectName: string;
  specificExpressions: string[];
  formalityLevel: string;
}

interface ProductionNotes {
  avgScriptLength: string;
  pacingNotes: string;
  targetDuration: string;
}

interface StyleEvolution {
  summary: string;
  recentAdoptions: string[];
  abandonedHabits: string[];
  consistentCore: string[];
}

interface Confidence {
  overall: string;
  weakAreas: string[];
}

interface NarrativeDirectionAnalysis {
  perVideo?: { title: string; direction: string; confidence?: string }[];
  breakdown?: Record<string, number>;
  dominant?: string;
  notes?: string;
}

interface NarrativeDirectionDef {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  description: string;
}

interface StyleDna {
  narrativeStructures: NarrativeStructure[];
  openingPatterns: Pattern[];
  closingPatterns: Pattern[];
  transitionPhrases: string[];
  sentenceStyle: SentenceStyle;
  vocabulary: Vocabulary;
  tone: Tone;
  storyBeats: StoryBeats;
  dialectMarkers: DialectMarkers;
  productionNotes: ProductionNotes;
  styleEvolution?: StyleEvolution;
  narrativeDirectionAnalysis?: NarrativeDirectionAnalysis;
  confidence: Confidence;
  _meta: StyleDnaMeta;
}

interface StyleDnaResponse {
  styleDna: StyleDna | null;
  styleDnaBuiltAt: string | null;
  transcriptCount: number;
  minRequired: number;
}

interface TranscriptValidation {
  title: string;
  score: number;
  matchedClaims: string[];
  missedPatterns: string[];
  wrongClaims: string[];
}

interface ValidationResult {
  overallScore: number;
  overallVerdict: string;
  transcripts: TranscriptValidation[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-card/50 hover:bg-card/80 transition-colors text-left"
      >
        <Icon className="w-4 h-4 text-primary shrink-0" strokeWidth={1.5} />
        <span className="text-[13px] font-semibold text-foreground flex-1">{title}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
      {children}
    </span>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-r-2 border-primary/30 pr-3 mr-1 text-[12px] text-muted-foreground italic leading-relaxed" dir="rtl">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{children}</div>;
}

interface DirectionForm {
  slug: string;
  nameEn: string;
  nameAr: string;
  description: string;
  detectHint: string;
}

function NarrativeDirectionSection({ channelId, analysis }: { channelId: string; analysis?: NarrativeDirectionAnalysis }) {
  const [directions, setDirections] = useState<(NarrativeDirectionDef & { detectHint?: string })[]>([]);
  const [preference, setPreference] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const emptyForm: DirectionForm = { slug: "", nameEn: "", nameAr: "", description: "", detectHint: "" };
  const [form, setForm] = useState<DirectionForm>(emptyForm);
  const [formSaving, setFormSaving] = useState(false);

  const fetchDirections = () => {
    fetch("/api/narrative-directions", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setDirections)
      .catch(() => {});
  };

  useEffect(() => {
    fetchDirections();
    fetch(`/api/channels/${channelId}/narrative-preference`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { preferredNarrativeDirection?: string | null }) => setPreference(d.preferredNarrativeDirection ?? null))
      .catch(() => {});
  }, [channelId]);

  const handlePreferenceChange = async (slug: string | null) => {
    setSaving(true);
    setPreference(slug);
    try {
      const res = await fetch(`/api/channels/${channelId}/narrative-preference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferredNarrativeDirection: slug }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(slug ? "Preference saved" : "Preference cleared");
    } catch {
      toast.error("Failed to save preference");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (d: NarrativeDirectionDef & { detectHint?: string }) => {
    setEditingId(d.id);
    setAdding(false);
    setForm({ slug: d.slug, nameEn: d.nameEn, nameAr: d.nameAr, description: d.description, detectHint: d.detectHint || "" });
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSaveForm = async () => {
    if (!form.nameEn.trim() || !form.nameAr.trim() || !form.description.trim() || !form.detectHint.trim()) return;
    setFormSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/narrative-directions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ nameEn: form.nameEn, nameAr: form.nameAr, description: form.description, detectHint: form.detectHint }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        toast.success("Direction updated");
      } else {
        if (!form.slug.trim()) return;
        const res = await fetch("/api/narrative-directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        toast.success("Direction created");
      }
      cancelForm();
      fetchDirections();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/narrative-directions/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Direction deleted");
      if (editingId === id) cancelForm();
      fetchDirections();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const renderForm = () => (
    <div className="mt-2 px-3 py-3 rounded-lg border border-primary/30 bg-card space-y-2">
      <div className="text-[12px] font-medium text-foreground mb-2">
        {editingId ? "Edit Direction" : "New Direction"}
      </div>
      {!editingId && (
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Slug (lowercase, dashes only)</label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            className="w-full px-2 py-1.5 text-[12px] bg-card border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono"
            placeholder="e.g. flashback-loop"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Name (English)</label>
          <input
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            className="w-full px-2 py-1.5 text-[12px] bg-card border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Flashback Loop"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Name (Arabic)</label>
          <input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            dir="rtl"
            className="w-full px-2 py-1.5 text-[12px] bg-card border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="حلقة الفلاش باك"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 text-[12px] bg-card border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
          placeholder="What this direction means..."
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Detection Hint (tells AI how to identify this direction)</label>
        <textarea
          value={form.detectHint}
          onChange={(e) => setForm({ ...form, detectHint: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 text-[12px] bg-card border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
          placeholder="The presenter does X, then Y, which indicates this structure..."
        />
      </div>
      <div className="flex items-center gap-2 justify-end pt-1">
        <button onClick={cancelForm} className="px-3 py-1 text-[11px] font-medium rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSaveForm}
          disabled={formSaving}
          className="px-4 py-1 text-[11px] font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {formSaving ? "Saving…" : editingId ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );

  const breakdown = analysis?.breakdown || {};
  const totalClassified = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <Section title="Story Direction" icon={Navigation}>
      {/* Breakdown bar chart */}
      {totalClassified > 0 && (
        <div className="space-y-2">
          <Label>Analysis from Style DNA</Label>
          {Object.entries(breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([slug, count]) => {
              const dir = directions.find((d) => d.slug === slug);
              const pct = Math.round((count / totalClassified) * 100);
              return (
                <div key={slug} className="flex items-center gap-3">
                  <span className="text-[12px] text-foreground w-28 shrink-0 truncate" title={dir?.nameEn || slug}>
                    {dir?.nameAr || dir?.nameEn || slug}
                  </span>
                  <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          {analysis?.notes && (
            <p className="text-[11px] text-muted-foreground mt-2 italic">{analysis.notes}</p>
          )}
        </div>
      )}

      {totalClassified === 0 && (
        <p className="text-[12px] text-muted-foreground">
          Build or rebuild Style DNA to see story direction analysis.
        </p>
      )}

      {/* Manual preference */}
      <div className="pt-3 border-t border-border mt-3">
        <Label>Manual Preference</Label>
        <p className="text-[11px] text-muted-foreground mb-2">
          Override for script generation. If set, new scripts will use this direction.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handlePreferenceChange(null)}
            disabled={saving}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full border transition-colors ${
              preference === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
            }`}
          >
            Auto
          </button>
          {directions.map((d) => (
            <button
              key={d.slug}
              onClick={() => handlePreferenceChange(d.slug)}
              disabled={saving}
              title={d.description}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-full border transition-colors ${
                preference === d.slug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {d.nameEn}
            </button>
          ))}
        </div>
      </div>

      {/* Manage directions */}
      <div className="pt-3 border-t border-border mt-3">
        <button
          onClick={() => setShowManage(!showManage)}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {showManage ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Manage Directions ({directions.length})
        </button>

        {showManage && (
          <div className="mt-3 space-y-2">
            {directions.map((d) => (
              <div key={d.id}>
                <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-foreground">{d.nameEn}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">{d.slug}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => startEdit(d)}
                      className="px-2 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="px-2 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editingId === d.id && renderForm()}
              </div>
            ))}

            {!adding && !editingId && (
              <button
                onClick={startAdd}
                className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                + Add Direction
              </button>
            )}

            {adding && renderForm()}
          </div>
        )}
      </div>
    </Section>
  );
}

export default function StyleDnaPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [data, setData] = useState<StyleDnaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const validationRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/style-dna`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load Style DNA");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRebuild = async () => {
    if (!channelId) return;
    setBuilding(true);
    setValidation(null);
    try {
      // Clear old DNA first
      await fetch(`/api/channels/${channelId}/style-dna`, { method: "DELETE", credentials: "include" });

      // Build new
      const res = await fetch(`/api/channels/${channelId}/style-dna/build`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Build failed");
      }
      toast.success("Style DNA rebuilt successfully");
      await fetchData();

      // Auto-validate after build
      setValidating(true);
      setTimeout(() => validationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      const valRes = await fetch(`/api/channels/${channelId}/style-dna/validate`, {
        method: "POST",
        credentials: "include",
      });
      if (valRes.ok) {
        const result = await valRes.json();
        setValidation(result);
        setTimeout(() => validationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBuilding(false);
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const dna = data.styleDna;
  const canBuild = data.transcriptCount >= data.minRequired;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-foreground flex items-center gap-2">
            <Dna className="w-5 h-5 text-primary" strokeWidth={1.5} />
            Style DNA
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">
            Deep writing-style profile learned from channel transcripts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRebuild}
            disabled={building || validating || !canBuild}
            className="px-4 py-1.5 text-[12px] font-medium rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            {building ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {validating ? "Validating..." : "Analyzing..."}
              </>
            ) : (
              <>
                {dna ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {dna ? "Rebuild" : "Build Style DNA"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">
            {data.transcriptCount} transcripts available
            {!canBuild && (
              <span className="text-amber-500 ml-1">(need {data.minRequired}+)</span>
            )}
          </span>
        </div>
        {dna?._meta && (
          <>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[12px] text-muted-foreground">
                Built from {dna._meta.transcriptsAnalyzed} transcripts
              </span>
            </div>
            <div className="w-px h-4 bg-border" />
            <span className="text-[11px] text-muted-foreground">
              {fmtDateTime(dna._meta.builtAt)}
            </span>
          </>
        )}
      </div>

      {/* No DNA state */}
      {!dna && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Dna className="w-10 h-10 text-muted-foreground/30 mb-4" />
          <h3 className="text-[14px] font-semibold text-foreground mb-1">No Style DNA yet</h3>
          <p className="text-[12px] text-muted-foreground max-w-md">
            {canBuild
              ? "Click \"Build Style DNA\" to analyze this channel's transcripts and create a deep writing-style profile."
              : `This channel needs at least ${data.minRequired} video transcripts. Currently has ${data.transcriptCount}.`}
          </p>
          {!canBuild && (
            <div className="flex items-center gap-1.5 mt-3 text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Process more videos in the pipeline first</span>
            </div>
          )}
        </div>
      )}

      {/* Narrative Direction Section — always show when channel exists */}
      {channelId && (
        <NarrativeDirectionSection
          channelId={channelId}
          analysis={dna?.narrativeDirectionAnalysis}
        />
      )}

      {/* DNA Profile */}
      {dna && (
        <div className="space-y-4">
          {/* Narrative Structures */}
          {dna.narrativeStructures?.length > 0 && (
            <Section title="Narrative Structures" icon={BookOpen}>
              {dna.narrativeStructures.map((ns, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">{ns.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ns.frequency}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{ns.description}</p>
                  {ns.example && <Quote>{ns.example}</Quote>}
                </div>
              ))}
            </Section>
          )}

          {/* Opening Patterns */}
          {dna.openingPatterns?.length > 0 && (
            <Section title="Opening Patterns" icon={Mic2}>
              {dna.openingPatterns.map((p, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-3 h-3 text-emerald-500" />
                    <span className="text-[13px] font-medium text-foreground">{p.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.frequency}</span>
                  </div>
                  {p.examples?.map((ex, j) => <Quote key={j}>{ex}</Quote>)}
                </div>
              ))}
            </Section>
          )}

          {/* Closing Patterns */}
          {dna.closingPatterns?.length > 0 && (
            <Section title="Closing Patterns" icon={MessageSquareQuote}>
              {dna.closingPatterns.map((p, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-3 h-3 text-rose-500" />
                    <span className="text-[13px] font-medium text-foreground">{p.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.frequency}</span>
                  </div>
                  {p.examples?.map((ex, j) => <Quote key={j}>{ex}</Quote>)}
                </div>
              ))}
            </Section>
          )}

          {/* Transition Phrases */}
          {dna.transitionPhrases?.length > 0 && (
            <Section title="Transition Phrases" icon={ArrowRight} defaultOpen={false}>
              <div className="flex flex-wrap gap-1.5">
                {dna.transitionPhrases.map((p, i) => <Tag key={i}>{p}</Tag>)}
              </div>
            </Section>
          )}

          {/* Sentence Style */}
          {dna.sentenceStyle && (
            <Section title="Sentence Style" icon={Type}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Average Length</Label>
                  <p className="text-[12px] text-foreground">{dna.sentenceStyle.avgLength}</p>
                </div>
                <div>
                  <Label>Structure</Label>
                  <p className="text-[12px] text-foreground">{dna.sentenceStyle.structure}</p>
                </div>
                <div>
                  <Label>Rhythm</Label>
                  <p className="text-[12px] text-foreground">{dna.sentenceStyle.rhythm}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Vocabulary */}
          {dna.vocabulary && (
            <Section title="Vocabulary" icon={Sparkles} defaultOpen={false}>
              {dna.vocabulary.signatureWords?.length > 0 && (
                <div>
                  <Label>Signature Words</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dna.vocabulary.signatureWords.map((w, i) => <Tag key={i}>{w}</Tag>)}
                  </div>
                </div>
              )}
              {dna.vocabulary.collocations?.length > 0 && (
                <div>
                  <Label>Collocations</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dna.vocabulary.collocations.map((c, i) => <Tag key={i}>{c}</Tag>)}
                  </div>
                </div>
              )}
              {dna.vocabulary.avoidedPatterns?.length > 0 && (
                <div>
                  <Label>Avoided Patterns</Label>
                  <ul className="text-[12px] text-muted-foreground list-disc list-inside mt-1">
                    {dna.vocabulary.avoidedPatterns.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Tone */}
          {dna.tone && (
            <Section title="Tone & Emotion" icon={Volume2}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Primary Tone</Label>
                  <p className="text-[12px] text-foreground">{dna.tone.primary}</p>
                </div>
                <div>
                  <Label>Emotional Arc</Label>
                  <p className="text-[12px] text-foreground">{dna.tone.emotionalArc}</p>
                </div>
                <div>
                  <Label>Humor Style</Label>
                  <p className="text-[12px] text-foreground">{dna.tone.humorStyle}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Story Beats */}
          {dna.storyBeats && (
            <Section title="Story Beats" icon={BarChart3}>
              {dna.storyBeats.typicalStructure?.length > 0 && (
                <div>
                  <Label>Typical Structure</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dna.storyBeats.typicalStructure.map((b, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-[10px] w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                          {i + 1}
                        </span>
                        <span className="text-[12px] text-foreground">{b}</span>
                        {i < dna.storyBeats.typicalStructure.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-muted-foreground/40 mx-0.5" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Hook Technique</Label>
                  <p className="text-[12px] text-foreground">{dna.storyBeats.hookTechnique}</p>
                </div>
                <div>
                  <Label>Tension Building</Label>
                  <p className="text-[12px] text-foreground">{dna.storyBeats.tensionBuilding}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Dialect */}
          {dna.dialectMarkers && (
            <Section title="Dialect Markers" icon={Globe}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Dialect</Label>
                  <span className="text-[12px] text-foreground font-medium">{dna.dialectMarkers.dialectName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {dna.dialectMarkers.formalityLevel}
                  </span>
                </div>
                {dna.dialectMarkers.specificExpressions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {dna.dialectMarkers.specificExpressions.map((e, i) => <Tag key={i}>{e}</Tag>)}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Production Notes */}
          {dna.productionNotes && (
            <Section title="Production Notes" icon={Palette} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Avg Script Length</Label>
                  <p className="text-[12px] text-foreground">{dna.productionNotes.avgScriptLength}</p>
                </div>
                <div>
                  <Label>Pacing</Label>
                  <p className="text-[12px] text-foreground">{dna.productionNotes.pacingNotes}</p>
                </div>
                <div>
                  <Label>Target Duration</Label>
                  <p className="text-[12px] text-foreground">{dna.productionNotes.targetDuration}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Style Evolution */}
          {dna.styleEvolution && (
            <Section title="Style Evolution" icon={RefreshCw}>
              <p className="text-[12px] text-foreground leading-relaxed">{dna.styleEvolution.summary}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {dna.styleEvolution.recentAdoptions?.length > 0 && (
                  <div>
                    <Label>Recent Adoptions</Label>
                    <ul className="text-[12px] text-emerald-500 list-disc list-inside mt-1 space-y-0.5">
                      {dna.styleEvolution.recentAdoptions.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {dna.styleEvolution.abandonedHabits?.length > 0 && (
                  <div>
                    <Label>Abandoned Habits</Label>
                    <ul className="text-[12px] text-muted-foreground line-through list-disc list-inside mt-1 space-y-0.5">
                      {dna.styleEvolution.abandonedHabits.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {dna.styleEvolution.consistentCore?.length > 0 && (
                  <div>
                    <Label>Consistent Core</Label>
                    <ul className="text-[12px] text-primary list-disc list-inside mt-1 space-y-0.5">
                      {dna.styleEvolution.consistentCore.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Confidence */}
          {dna.confidence && (
            <div className="px-4 py-3 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  dna.confidence.overall === "high" ? "bg-emerald-500" :
                  dna.confidence.overall === "medium" ? "bg-amber-500" : "bg-rose-500"
                }`} />
                <span className="text-[12px] font-medium text-foreground capitalize">{dna.confidence.overall} confidence</span>
              </div>
              {dna.confidence.weakAreas?.length > 0 && (
                <div>
                  <Label>Weak Areas</Label>
                  <ul className="text-[11px] text-muted-foreground list-disc list-inside mt-1 space-y-0.5">
                    {dna.confidence.weakAreas.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Validation Results */}
      {(validation || validating) && (
        <div ref={validationRef} className="space-y-4">
          {validating && (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-border rounded-xl bg-card/50">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
              <div className="text-[13px] font-medium text-foreground">Running Validation</div>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-sm">
                Testing Style DNA against 3 random holdout transcripts. Claude is critically evaluating each match...
              </p>
            </div>
          )}
          {validation && (
          <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-primary" strokeWidth={1.5} />
            <h2 className="text-[16px] font-bold text-foreground">Validation Report</h2>
          </div>

          {/* Overall score */}
          <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3">
              <div className={`text-[28px] font-bold ${
                validation.overallScore >= 8 ? "text-emerald-500" :
                validation.overallScore >= 6 ? "text-amber-500" : "text-rose-500"
              }`}>
                {validation.overallScore}/10
              </div>
              <div>
                <div className="text-[13px] font-medium text-foreground">Overall Accuracy</div>
                <div className="text-[12px] text-muted-foreground">{validation.overallVerdict}</div>
              </div>
            </div>
          </div>

          {/* Per-transcript scores */}
          {validation.transcripts?.map((t, i) => (
            <div key={i} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-card/50">
                <span className="text-[13px] font-medium text-foreground truncate max-w-[70%]" dir="rtl">{t.title}</span>
                <span className={`text-[14px] font-bold ${
                  t.score >= 8 ? "text-emerald-500" :
                  t.score >= 6 ? "text-amber-500" : "text-rose-500"
                }`}>{t.score}/10</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {t.matchedClaims?.length > 0 && (
                  <div>
                    <Label>Matched Claims</Label>
                    <ul className="text-[12px] text-emerald-600 list-disc list-inside">
                      {t.matchedClaims.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {t.missedPatterns?.length > 0 && (
                  <div>
                    <Label>Missed Patterns</Label>
                    <ul className="text-[12px] text-amber-500 list-disc list-inside">
                      {t.missedPatterns.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {t.wrongClaims?.length > 0 && (
                  <div>
                    <Label>Wrong Claims</Label>
                    <ul className="text-[12px] text-rose-500 list-disc list-inside">
                      {t.wrongClaims.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {validation.strengths?.length > 0 && (
              <div className="border border-border rounded-xl px-4 py-3">
                <Label>Strengths</Label>
                <ul className="text-[12px] text-emerald-600 list-disc list-inside mt-1">
                  {validation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {validation.weaknesses?.length > 0 && (
              <div className="border border-border rounded-xl px-4 py-3">
                <Label>Weaknesses</Label>
                <ul className="text-[12px] text-amber-500 list-disc list-inside mt-1">
                  {validation.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {validation.suggestions?.length > 0 && (
            <div className="border border-border rounded-xl px-4 py-3">
              <Label>Improvement Suggestions</Label>
              <ul className="text-[12px] text-muted-foreground list-disc list-inside mt-1">
                {validation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
