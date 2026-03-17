import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Play, Loader2, RotateCw, ExternalLink, ChevronLeft, Circle,
  Database, Search, Download, Sparkles, BarChart3, Trophy, CheckCircle2,
  AlertTriangle, Clock, ShieldCheck, ShieldX, Zap, ArrowRight, X,
  Plus, Trash2, Settings2,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  key: string; label: string; type: string; required?: boolean;
  placeholder?: string; help?: string; options?: string[];
  min?: number; max?: number;
}
interface APISchema {
  label: string; docs: string | null;
  fields: FieldDef[];
}
type FieldSchemaMap = Record<string, APISchema>;

interface FetchLogEntry {
  time: string; raw: number; gated: number; dupes: number;
  inserted: number; error: string | null; ms: number;
}

interface SourceHealth {
  keyConnected: boolean; budgetUsed: number; budgetMax: number;
  cooldownOk: boolean; minutesSinceLast: number | null;
  successRate: number | null; totalFetches: number;
}

interface WorkflowData {
  id: string; type: string; label: string; language: string;
  isActive: boolean; lastPolledAt: string | null;
  config: Record<string, unknown>;
  fetchLog: FetchLogEntry[];
  stats: Record<string, number>;
  totalArticles: number;
  health: SourceHealth;
}

interface ArticleData {
  id: string; url: string; title: string | null; description: string | null;
  stage: string; status: string; error: string | null; retries: number;
  publishedAt: string | null; language: string | null;
  createdAt: string;
}

interface PipelineResponse {
  workflows: WorkflowData[];
  totals: Record<string, number>;
}

const STAGES = [
  { id: "source",   label: "Source",   icon: Database,     active: true },
  { id: "search",   label: "Search",   icon: Search,       active: true },
  { id: "fetch",    label: "Fetch",    icon: Download,     active: true },
  { id: "clean",    label: "Clean",    icon: Sparkles,     active: false },
  { id: "classify", label: "Classify", icon: BarChart3,    active: false },
  { id: "rank",     label: "Rank",     icon: Trophy,       active: false },
  { id: "done",     label: "Done",     icon: CheckCircle2, active: false },
];

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
];

const SOURCE_TYPES = [
  { value: "newsapi",     label: "NewsAPI" },
  { value: "gnews",       label: "GNews Search" },
  { value: "gnews_top",   label: "GNews Top Headlines" },
  { value: "guardian",     label: "The Guardian" },
  { value: "nyt_search",  label: "NYT Article Search" },
  { value: "nyt_top",     label: "NYT Top Stories" },
  { value: "rss",         label: "RSS Feed" },
];

// ── Main Component ──────────────────────────────────────────────────────────

export default function ArticlePipeline() {
  const { projectId } = useParams();
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [fieldSchema, setFieldSchema] = useState<FieldSchemaMap | null>(null);

  const fetchPipeline = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/article-pipeline?projectId=${projectId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: PipelineResponse) => setData(d))
      .catch(() => toast.error("Failed to load pipeline"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const fetchFieldSchema = useCallback(() => {
    fetch("/api/article-sources/field-schema", { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((s: FieldSchemaMap) => setFieldSchema(s))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPipeline(); fetchFieldSchema(); }, [fetchPipeline, fetchFieldSchema]);

  useEffect(() => {
    const tick = setInterval(fetchPipeline, 30000);
    return () => clearInterval(tick);
  }, [fetchPipeline]);

  const handleIngestAll = () => {
    setIngesting(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => {
        const total = d.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) || 0;
        toast.success(`Ingested ${total} articles from ${d.results?.length || 0} sources`);
        fetchPipeline();
      })
      .catch(e => toast.error(e?.error || "Ingest failed"))
      .finally(() => setIngesting(false));
  };

  const selectedSource = useMemo(
    () => data?.workflows.find(w => w.id === selectedSourceId) || null,
    [data, selectedSourceId],
  );

  const totalArticles = data ? Object.values(data.totals).reduce((s, c) => s + c, 0) : 0;

  if (selectedSource && fieldSchema) {
    return (
      <WorkflowView
        source={selectedSource}
        fieldSchema={fieldSchema}
        projectId={projectId!}
        onBack={() => setSelectedSourceId(null)}
        onRefresh={fetchPipeline}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-medium text-foreground">Article Pipeline</h1>
          <span className="text-[11px] text-dim font-mono">Brain v3</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-dim font-mono">{totalArticles} articles</span>
          <button onClick={handleIngestAll} disabled={ingesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue text-blue-foreground text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {ingesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Ingest All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data || data.workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <span className="text-[13px] text-dim">No article sources configured.</span>
            <span className="text-[12px] text-dim font-mono">Go to Source → Add Source to create one.</span>
          </div>
        ) : (
          <div className="px-6 max-lg:px-4 py-5">
            <SourceListTable
              workflows={data.workflows}
              onSelect={(id) => setSelectedSourceId(id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Source List Table ────────────────────────────────────────────────────────

function SourceListTable({ workflows, onSelect }: { workflows: WorkflowData[]; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-elevated/50">
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Status</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Workflow</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">API</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Lang</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Articles</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">API Key</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Success</th>
            <th className="px-4 py-2.5 text-[10px] font-mono text-dim uppercase tracking-wider">Last Run</th>
          </tr>
        </thead>
        <tbody>
          {workflows.map(w => (
            <tr key={w.id}
              onClick={() => onSelect(w.id)}
              className="border-t border-border hover:bg-surface/50 cursor-pointer transition-colors">
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${w.isActive ? "bg-success/15 text-success" : "bg-zinc-600/15 text-zinc-500"}`}>
                  <Circle className="w-1.5 h-1.5 fill-current" />
                  {w.isActive ? "Active" : "Paused"}
                </span>
              </td>
              <td className="px-4 py-3 text-[12px] font-medium text-foreground">{w.label}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 rounded-full bg-elevated text-[10px] font-mono text-dim">
                  {SOURCE_TYPES.find(s => s.value === w.type)?.label || w.type}
                </span>
              </td>
              <td className="px-4 py-3 text-[11px] font-mono text-dim">{w.language}</td>
              <td className="px-4 py-3 text-[12px] font-mono font-medium">{w.totalArticles}</td>
              <td className="px-4 py-3">
                {w.health.keyConnected ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                ) : (
                  <ShieldX className="w-3.5 h-3.5 text-destructive" />
                )}
              </td>
              <td className="px-4 py-3 text-[11px] font-mono text-dim">
                {w.health.successRate != null ? `${w.health.successRate}%` : "—"}
              </td>
              <td className="px-4 py-3 text-[10px] font-mono text-dim">
                {w.lastPolledAt ? timeAgo(w.lastPolledAt) : "Never"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Workflow View (SOURCE → SEARCH → FETCH → …) ────────────────────────────

function WorkflowView({ source, fieldSchema, projectId, onBack, onRefresh }: {
  source: WorkflowData; fieldSchema: FieldSchemaMap;
  projectId: string; onBack: () => void; onRefresh: () => void;
}) {
  const [activeStep, setActiveStep] = useState("source");
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>(source.config || {});
  const [sourceType, setSourceType] = useState(source.type);
  const [sourceLang, setSourceLang] = useState(source.language);
  const [sourceLabel, setSourceLabel] = useState(source.label);
  const [sourceActive, setSourceActive] = useState(source.isActive);

  useEffect(() => {
    setConfig(source.config || {});
    setSourceType(source.type);
    setSourceLang(source.language);
    setSourceLabel(source.label);
    setSourceActive(source.isActive);
  }, [source]);

  const saveSource = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/article-sources/${source.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Save failed");
        return;
      }
      toast.success("Saved");
      onRefresh();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const apiSchema = fieldSchema[sourceType] || null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-dim hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-[13px] font-medium text-foreground">{source.label}</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">
            {SOURCE_TYPES.find(s => s.value === source.type)?.label || source.type}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${source.isActive ? "bg-success/15 text-success" : "bg-zinc-600/15 text-zinc-500"}`}>
            <Circle className="w-1.5 h-1.5 fill-current" />
            {source.isActive ? "Active" : "Paused"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-dim font-mono">{source.totalArticles} articles</span>
        </div>
      </div>

      {/* Workflow Diagram */}
      <div className="px-6 max-lg:px-4 py-5 border-b border-[#151619]">
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {STAGES.map((stage, i) => (
            <div key={stage.id} className="flex items-center shrink-0">
              <button
                onClick={() => stage.active && setActiveStep(stage.id)}
                disabled={!stage.active}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
                  activeStep === stage.id
                    ? "border-blue bg-blue/10 text-blue shadow-sm shadow-blue/10"
                    : stage.active
                      ? "border-border bg-background text-foreground hover:border-blue/40 hover:bg-blue/5 cursor-pointer"
                      : "border-border/40 bg-background/50 text-dim/40 cursor-not-allowed"
                }`}
              >
                <stage.icon className="w-4 h-4" />
                <span className="text-[11px] font-medium">{stage.label}</span>
                {stage.id === "fetch" && source.totalArticles > 0 && (
                  <span className="text-[9px] font-mono bg-blue/20 text-blue px-1.5 py-0.5 rounded-full">{source.totalArticles}</span>
                )}
              </button>
              {i < STAGES.length - 1 && (
                <ArrowRight className={`w-3.5 h-3.5 mx-1.5 shrink-0 ${stage.active && STAGES[i + 1].active ? "text-dim" : "text-dim/20"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Panel */}
      <div className="flex-1 overflow-auto px-6 max-lg:px-4 py-5">
        {activeStep === "source" && (
          <SourcePanel
            sourceType={sourceType}
            setSourceType={setSourceType}
            sourceLang={sourceLang}
            setSourceLang={setSourceLang}
            sourceLabel={sourceLabel}
            setSourceLabel={setSourceLabel}
            sourceActive={sourceActive}
            setSourceActive={setSourceActive}
            config={config}
            setConfig={setConfig}
            health={source.health}
            saving={saving}
            onSave={() => {
              const newConfig = { ...config };
              saveSource({ type: sourceType, language: sourceLang, label: sourceLabel, isActive: sourceActive, config: newConfig });
            }}
          />
        )}
        {activeStep === "search" && apiSchema && (
          <SearchPanel
            apiSchema={apiSchema}
            sourceType={sourceType}
            config={config}
            setConfig={setConfig}
            saving={saving}
            onSave={() => saveSource({ config, type: sourceType })}
            projectId={projectId}
          />
        )}
        {activeStep === "fetch" && (
          <FetchPanel
            source={source}
            projectId={projectId}
            onRefresh={onRefresh}
          />
        )}
        {!["source", "search", "fetch"].includes(activeStep) && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Sparkles className="w-8 h-8 text-dim/30" />
            <span className="text-[13px] text-dim">Coming soon</span>
            <span className="text-[11px] text-dim/60 font-mono">This stage is not yet implemented.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SOURCE Panel ────────────────────────────────────────────────────────────

function SourcePanel({
  sourceType, setSourceType, sourceLang, setSourceLang,
  sourceLabel, setSourceLabel, sourceActive, setSourceActive,
  config, setConfig, health, saving, onSave,
}: {
  sourceType: string; setSourceType: (v: string) => void;
  sourceLang: string; setSourceLang: (v: string) => void;
  sourceLabel: string; setSourceLabel: (v: string) => void;
  sourceActive: boolean; setSourceActive: (v: boolean) => void;
  config: Record<string, unknown>; setConfig: (v: Record<string, unknown>) => void;
  health: SourceHealth; saving: boolean; onSave: () => void;
}) {
  const sourceConfig = (config.source || {}) as Record<string, unknown>;
  const setSourceConfig = (key: string, val: unknown) => {
    setConfig({ ...config, source: { ...sourceConfig, [key]: val } });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <SectionHeader title="Source Configuration" desc="Select the API and configure basic source settings." />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Workflow Name</label>
          <input value={sourceLabel} onChange={e => setSourceLabel(e.target.value)}
            className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">API Provider</label>
          <select value={sourceType} onChange={e => setSourceType(e.target.value)}
            className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all">
            {SOURCE_TYPES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Language</label>
          <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
            className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all">
            {LANG_OPTIONS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Status</label>
          <button onClick={() => setSourceActive(!sourceActive)}
            className={`w-full h-9 px-3 text-[12px] font-medium border rounded-lg transition-all ${sourceActive ? "bg-success/10 border-success/30 text-success" : "bg-zinc-600/10 border-zinc-600/30 text-zinc-400"}`}>
            {sourceActive ? "Active" : "Paused"}
          </button>
        </div>
      </div>

      <SectionHeader title="Budget Controls" desc="Limit how often and how much this source runs." />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Max fetches / day</label>
          <input type="number" min={0} value={(sourceConfig.maxPerDay as number) || 0}
            onChange={e => setSourceConfig("maxPerDay", parseInt(e.target.value) || 0)}
            className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all" />
          <span className="text-[10px] text-dim">0 = unlimited</span>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Cooldown (minutes)</label>
          <input type="number" min={0} value={(sourceConfig.cooldownMinutes as number) || 0}
            onChange={e => setSourceConfig("cooldownMinutes", parseInt(e.target.value) || 0)}
            className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all" />
          <span className="text-[10px] text-dim">Minimum minutes between fetches. 0 = no cooldown.</span>
        </div>
      </div>

      <SectionHeader title="Health" desc="Current status of this source." />

      <div className="grid grid-cols-4 gap-3">
        <HealthCard label="API Key" ok={health.keyConnected}
          text={health.keyConnected ? "Connected" : "Missing"} />
        <HealthCard label="Budget" ok={health.budgetMax === 0 || health.budgetUsed < health.budgetMax}
          text={health.budgetMax > 0 ? `${health.budgetUsed}/${health.budgetMax}` : "Unlimited"} />
        <HealthCard label="Cooldown" ok={health.cooldownOk}
          text={health.cooldownOk ? "Ready" : `Wait ${health.minutesSinceLast}m`} />
        <HealthCard label="Success Rate" ok={(health.successRate ?? 100) >= 50}
          text={health.successRate != null ? `${health.successRate}%` : "N/A"} />
      </div>

      <div className="pt-2">
        <button onClick={onSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue text-blue-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}
          Save Source Settings
        </button>
      </div>
    </div>
  );
}

function HealthCard({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className={`p-3 rounded-lg border ${ok ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {ok ? <ShieldCheck className="w-3 h-3 text-success" /> : <ShieldX className="w-3 h-3 text-destructive" />}
        <span className="text-[10px] font-mono text-dim uppercase">{label}</span>
      </div>
      <span className={`text-[12px] font-medium ${ok ? "text-success" : "text-destructive"}`}>{text}</span>
    </div>
  );
}

// ── SEARCH Panel ────────────────────────────────────────────────────────────

function SearchPanel({
  apiSchema, sourceType, config, setConfig, saving, onSave, projectId,
}: {
  apiSchema: APISchema; sourceType: string;
  config: Record<string, unknown>; setConfig: (v: Record<string, unknown>) => void;
  saving: boolean; onSave: () => void; projectId: string;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ passed: unknown[]; gated: unknown[]; total: number } | null>(null);

  const searchConfig = (config.search || {}) as Record<string, unknown>;
  const setSearchField = (key: string, val: unknown) => {
    setConfig({ ...config, search: { ...searchConfig, [key]: val } });
  };
  const setApiField = (key: string, val: unknown) => {
    setConfig({ ...config, [key]: val });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/article-sources/test-config", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type: sourceType, config }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "Test failed"); return; }
      setTestResult(d.articles || d);
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <SectionHeader
        title={`${apiSchema.label} — Search Parameters`}
        desc={apiSchema.docs ? (
          <span>Configure query parameters per <a href={apiSchema.docs} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline">API documentation</a>.</span>
        ) : "Configure query parameters for this source."}
      />

      {/* API-specific dynamic fields */}
      <div className="rounded-xl border border-border p-5 space-y-4 bg-background">
        <div className="text-[11px] font-mono text-dim uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-3 h-3" /> API Query Fields
        </div>
        <div className="grid grid-cols-2 gap-4">
          {apiSchema.fields.map(field => (
            <DynamicField
              key={field.key}
              field={field}
              value={config[field.key] as string | number | undefined}
              onChange={(val) => setApiField(field.key, val)}
            />
          ))}
        </div>
      </div>

      {/* Keyword Gate */}
      <div className="rounded-xl border border-border p-5 space-y-4 bg-background">
        <div className="text-[11px] font-mono text-dim uppercase tracking-wider flex items-center gap-2">
          <Search className="w-3 h-3" /> Keyword Gate
        </div>
        <div className="space-y-4">
          <TagInput
            label="Include keywords"
            help="Articles must contain at least one of these (in title or description)."
            tags={(searchConfig.includeKeywords as string[]) || []}
            onChange={(tags) => setSearchField("includeKeywords", tags)}
          />
          <TagInput
            label="Exclude keywords"
            help="Articles containing any of these will be rejected."
            tags={(searchConfig.excludeKeywords as string[]) || []}
            onChange={(tags) => setSearchField("excludeKeywords", tags)}
          />
          <TagInput
            label="Blocked domains"
            help="Reject articles from these domains (e.g. spam.com)."
            tags={(searchConfig.blockDomains as string[]) || []}
            onChange={(tags) => setSearchField("blockDomains", tags)}
          />
          <div className="max-w-xs space-y-1.5">
            <label className="text-[11px] font-mono text-dim uppercase tracking-wider">Min title length</label>
            <input type="number" min={0}
              value={(searchConfig.minTitleLength as number) || 0}
              onChange={e => setSearchField("minTitleLength", parseInt(e.target.value) || 0)}
              className="w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={onSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue text-blue-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}
          Save Search Config
        </button>
        <button onClick={handleTest} disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-[12px] font-medium hover:bg-surface/50 transition-colors disabled:opacity-50">
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Test Fetch
        </button>
      </div>

      {/* Test results */}
      {testResult && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-elevated/50 flex items-center gap-3 text-[11px] font-mono text-dim">
            <span className="text-success">Passed: {testResult.passed.length}</span>
            <span className="text-orange">Gated: {testResult.gated.length}</span>
            <span>Total: {testResult.total}</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
            {(testResult.passed as Array<{ title?: string; url?: string }>).map((a, i) => (
              <div key={i} className="px-4 py-2 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                <span className="text-[11px] text-foreground truncate flex-1" dir="auto">{a.title || "(no title)"}</span>
                {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3 text-dim" /></a>}
              </div>
            ))}
            {(testResult.gated as Array<{ title?: string; _gateReason?: string }>).map((a, i) => (
              <div key={`g-${i}`} className="px-4 py-2 flex items-center gap-2 opacity-50">
                <X className="w-3 h-3 text-destructive shrink-0" />
                <span className="text-[11px] text-foreground truncate flex-1" dir="auto">{a.title || "(no title)"}</span>
                <span className="text-[9px] font-mono text-dim shrink-0">{a._gateReason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FETCH Panel ─────────────────────────────────────────────────────────────

function FetchPanel({ source, projectId, onRefresh }: {
  source: WorkflowData; projectId: string; onRefresh: () => void;
}) {
  const [ingesting, setIngesting] = useState(false);
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);

  const fetchArticles = useCallback(() => {
    fetch(`/api/article-pipeline/${source.id}/articles`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: ArticleData[]) => setArticles(d))
      .catch(() => {})
      .finally(() => setLoadingArticles(false));
  }, [source.id]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const handleIngest = () => {
    setIngesting(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sourceId: source.id }),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => {
        const r = d.results?.[0];
        if (r?.error) toast.error(r.error);
        else toast.success(`Fetched ${r?.fetched || 0} → Inserted ${r?.inserted || 0} (${r?.dupes || 0} dupes, ${r?.gated || 0} gated)`);
        onRefresh();
        fetchArticles();
      })
      .catch(e => toast.error(e?.error || "Ingest failed"))
      .finally(() => setIngesting(false));
  };

  const handleForceIngest = () => {
    setIngesting(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sourceId: source.id, force: true }),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => {
        const r = d.results?.[0];
        if (r?.error) toast.error(r.error);
        else toast.success(`Force fetch: ${r?.fetched || 0} → ${r?.inserted || 0} inserted`);
        onRefresh();
        fetchArticles();
      })
      .catch(e => toast.error(e?.error || "Ingest failed"))
      .finally(() => setIngesting(false));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Fetch & Audit Log" desc="Run the fetch, view history, and inspect articles." />
        <div className="flex items-center gap-2">
          <button onClick={handleIngest} disabled={ingesting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue text-blue-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run Fetch
          </button>
          <button onClick={handleForceIngest} disabled={ingesting}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-foreground text-[11px] font-medium hover:bg-surface/50 transition-colors disabled:opacity-50">
            <Zap className="w-3 h-3" /> Force (skip budget)
          </button>
        </div>
      </div>

      {/* Audit Log */}
      {source.fetchLog.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-elevated/50 text-[10px] font-mono text-dim uppercase tracking-wider">
            Audit Log — Last {source.fetchLog.length} runs
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-elevated/30">
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Time</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Raw</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Gated</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Dupes</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Inserted</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Time (ms)</th>
                <th className="px-3 py-2 text-[9px] font-mono text-dim uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {source.fetchLog.map((entry, i) => (
                <tr key={i} className="border-t border-border/50 hover:bg-surface/30">
                  <td className="px-3 py-2 text-[10px] font-mono text-dim">{new Date(entry.time).toLocaleString()}</td>
                  <td className="px-3 py-2 text-[11px] font-mono">{entry.raw}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-orange">{entry.gated}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-dim">{entry.dupes}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-success">{entry.inserted}</td>
                  <td className="px-3 py-2 text-[10px] font-mono text-dim">{entry.ms}ms</td>
                  <td className="px-3 py-2">
                    {entry.error ? (
                      <span className="text-[10px] font-mono text-destructive truncate max-w-[200px] inline-block">{entry.error}</span>
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-success" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Articles list */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-elevated/50 flex items-center justify-between">
          <span className="text-[10px] font-mono text-dim uppercase tracking-wider">Articles ({articles.length})</span>
          <button onClick={fetchArticles} className="text-dim hover:text-sensor transition-colors">
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border/50">
          {loadingArticles ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-4 h-4 animate-spin text-dim" />
            </div>
          ) : articles.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[12px] text-dim font-mono">
              No articles yet. Click "Run Fetch" above.
            </div>
          ) : (
            articles.map(a => (
              <div key={a.id} className="px-4 py-2.5 flex items-center gap-2 hover:bg-surface/30 transition-colors">
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium ${stageStyle(a.stage)}`}>
                  {a.stage}
                </span>
                <span className="text-[11px] text-foreground truncate flex-1" dir="auto">
                  {a.title || "(no title)"}
                </span>
                {a.publishedAt && (
                  <span className="text-[9px] font-mono text-dim shrink-0">{new Date(a.publishedAt).toLocaleDateString()}</span>
                )}
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-dim hover:text-sensor transition-colors shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared components ───────────────────────────────────────────────────────

function DynamicField({ field, value, onChange }: {
  field: FieldDef; value: string | number | undefined; onChange: (v: string | number) => void;
}) {
  const inputClass = "w-full h-9 px-3 text-[12px] bg-elevated border border-border rounded-lg focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-all";

  return (
    <div className={`space-y-1.5 ${field.type === "text" || field.type === "url" ? "col-span-2" : ""}`}>
      <label className="text-[11px] font-mono text-dim uppercase tracking-wider flex items-center gap-1.5">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      {field.type === "select" ? (
        <select
          value={(value as string) || ""}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">— select —</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "number" ? (
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={value ?? ""}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          className={inputClass}
        />
      ) : (
        <input
          type={field.type === "date" ? "date" : "text"}
          value={(value as string) || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className={inputClass}
        />
      )}
      {field.help && <p className="text-[10px] text-dim leading-relaxed">{field.help}</p>}
    </div>
  );
}

function TagInput({ label, help, tags, onChange }: {
  label: string; help: string; tags: string[]; onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const val = input.trim().toLowerCase();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setInput("");
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono text-dim uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] px-3 py-2 bg-elevated border border-border rounded-lg">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue/10 text-blue text-[10px] font-mono rounded-full">
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-destructive transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
          className="flex-1 min-w-[100px] bg-transparent text-[11px] outline-none text-foreground placeholder:text-dim/40"
        />
      </div>
      <p className="text-[10px] text-dim">{help}</p>
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
      <p className="text-[11px] text-dim mt-0.5">{desc}</p>
    </div>
  );
}

function stageStyle(stage: string): string {
  const map: Record<string, string> = {
    clean: "bg-orange/15 text-orange",
    classify: "bg-blue/15 text-blue",
    rank_pool: "bg-purple/15 text-purple",
    ranked: "bg-success/15 text-success",
    done: "bg-emerald-400/15 text-emerald-400",
    failed: "bg-destructive/15 text-destructive",
  };
  return map[stage] || "bg-elevated text-dim";
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
