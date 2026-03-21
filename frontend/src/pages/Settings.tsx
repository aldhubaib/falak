import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { fmtDateTime } from "@/lib/utils";
import { X, ExternalLink, Lock, Bot, FileText, Cog, Check, Loader2, Newspaper, Brain, Activity, Search, Zap, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// ── Types ──────────────────────────────────────────────────────────────────

interface MultiKey { id: string; label: string; isActive: boolean; usageCount: number; lastUsedAt?: string | null }

interface ApiKeyDef {
  service: string;
  name: string;
  description: string;
  icon: "ai" | "data" | "search" | "transcript" | "news";
  link?: string;
  linkLabel?: string;
  multiKey?: boolean;
  multiKeyEndpoint?: string;
  placeholder?: string;
  projectScoped?: boolean;
  bodyField?: string;
  companionField?: {
    service: string;
    label: string;
    placeholder: string;
    description: string;
  };
}

interface UsageLog {
  id: string;
  time: string;
  apiName: string;
  apiIcon: "ai" | "data" | "search" | "transcript" | "news";
  action: string;
  tokens: number | null;
  status: "Pass" | "Fail";
}

// ── Static key definitions ─────────────────────────────────────────────────

const CORE_KEYS: ApiKeyDef[] = [
  {
    service: "anthropic",
    name: "Anthropic (Claude)",
    description: "Brain analysis, pipeline insights, story evaluation.",
    icon: "ai",
    placeholder: "sk-ant-api03-...",
  },
  {
    service: "youtube",
    name: "YouTube Data API v3",
    description: "Channel sync — video metadata, view counts, engagement. Add multiple keys for quota rotation.",
    icon: "data",
    multiKey: true,
    multiKeyEndpoint: "youtube-keys",
    placeholder: "AIza...",
  },
  {
    service: "transcript",
    name: "YouTube Transcript API",
    description: "Fetches video transcripts for Brain → Transcribe stage.",
    icon: "transcript",
    placeholder: "your-api-key",
    link: "https://youtube-transcript.io",
    linkLabel: "youtube-transcript.io ↗",
  },
  {
    service: "google_search",
    name: "Google Custom Search",
    description: "Web search for article research. Add multiple API keys for quota rotation (100 queries/day per key).",
    icon: "search",
    multiKey: true,
    multiKeyEndpoint: "google-search-keys",
    placeholder: "AIza...",
    link: "https://console.cloud.google.com/apis/credentials",
    linkLabel: "Google Cloud Console ↗",
    companionField: {
      service: "google_search_cx",
      label: "Search Engine CX ID",
      placeholder: "8189749b30ff64d36",
      description: "Programmable Search Engine identifier — shared across all API keys.",
    },
  },
];

const LEGACY_KEYS: ApiKeyDef[] = [
  {
    service: "firecrawl",
    name: "Firecrawl",
    description: "Scraping and article-content extraction.",
    icon: "data",
    placeholder: "fc-...",
    link: "https://www.firecrawl.dev/app",
    linkLabel: "firecrawl.dev ↗",
    projectScoped: true,
    bodyField: "firecrawlKey",
  },
  {
    service: "perplexity",
    name: "Perplexity Sonar",
    description: "Legacy — story search now uses news APIs.",
    icon: "search",
    placeholder: "pplx-...",
  },
];

const KEY_DEFS: ApiKeyDef[] = [...CORE_KEYS, ...LEGACY_KEYS];

// ── Helpers ────────────────────────────────────────────────────────────────

const iconMap = { ai: Bot, data: Cog, search: Search, transcript: FileText, news: Newspaper };
const iconColorMap = { ai: "text-purple", data: "text-muted-foreground", search: "text-primary", transcript: "text-orange", news: "text-emerald-400" };
const apiNameColorMap: Record<string, string> = {
  Anthropic: "text-purple", "YouTube Data": "text-muted-foreground",
  "YT Transcript": "text-orange", Perplexity: "text-primary", Firecrawl: "text-muted-foreground",
  "Google Search": "text-primary", NewsAPI: "text-emerald-400", GNews: "text-emerald-400", Guardian: "text-emerald-400", NYT: "text-emerald-400",
};

function mapService(api: string): { name: string; icon: "ai" | "data" | "search" | "transcript" | "news" } {
  if (api === "anthropic")    return { name: "Anthropic",     icon: "ai" };
  if (api === "youtube-data") return { name: "YouTube Data",  icon: "data" };
  if (api === "yttranscript") return { name: "YT Transcript", icon: "transcript" };
  if (api === "perplexity")   return { name: "Perplexity",    icon: "search" };
  if (api === "firecrawl")    return { name: "Firecrawl",     icon: "data" };
  if (api === "newsapi")      return { name: "NewsAPI",       icon: "news" };
  if (api === "gnews")        return { name: "GNews",         icon: "news" };
  if (api === "guardian")     return { name: "Guardian",      icon: "news" };
  if (api === "nyt")          return { name: "NYT",           icon: "news" };
  if (api === "google-search") return { name: "Google Search", icon: "search" };
  return { name: api, icon: "data" };
}

function Tip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">{label}</TooltipContent>
    </Tooltip>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { channelId } = useParams();

  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [multiKeys, setMultiKeys] = useState<Record<string, MultiKey[]>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState<Record<string, boolean>>({});
  const [newMultiLabel, setNewMultiLabel] = useState<Record<string, string>>({});
  const [newMultiValue, setNewMultiValue] = useState<Record<string, string>>({});
  const [addingMulti, setAddingMulti] = useState<Record<string, boolean>>({});
  const [removingMulti, setRemovingMulti] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail?: string; error?: string; ms?: number }>>({});

  const [embeddingKeySet, setEmbeddingKeySet] = useState(false);
  const [embeddingKeyInput, setEmbeddingKeyInput] = useState("");
  const [embeddingKeySaving, setEmbeddingKeySaving] = useState(false);
  const [embeddingKeyClearing, setEmbeddingKeyClearing] = useState(false);
  const [embeddingKeyEditing, setEmbeddingKeyEditing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<{
    lastStatsRefreshAt?: string | null;
    rescoreIntervalHours?: number;
    scoreProfile?: { totalOutcomes: number; totalDecisions: number; aiViralAccuracy: number; lastLearnedAt?: string | null } | null;
  }>({});

  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [usageCursor, setUsageCursor] = useState<string | null>(null);
  const [usageHasMore, setUsageHasMore] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageInitialLoaded, setUsageInitialLoaded] = useState(false);
  const usageScrollRef = useRef<HTMLDivElement>(null);
  const usageLoadingRef = useRef(false);
  const usageCursorRef = useRef<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchUsagePage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!channelId || usageLoadingRef.current) return;
    usageLoadingRef.current = true;
    setUsageLoading(true);
    try {
      const url = `/api/profiles/${channelId}/usage?limit=50${cursor ? `&cursor=${cursor}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      const data = await r.json();
      const rows: { id: string; ts: string; api: string; action: string; tokens: number | null; status: string }[] = data.rows ?? [];
      const mapped: UsageLog[] = rows.map((r) => {
        const { name, icon } = mapService(r.api || "");
        return { id: r.id, time: r.ts ? fmtDateTime(r.ts) : "—", apiName: name, apiIcon: icon, action: r.action || "—", tokens: r.tokens ?? null, status: r.status === "ok" ? "Pass" : "Fail" };
      });
      setUsageLogs((prev) => replace ? mapped : [...prev, ...mapped]);
      const nextCursor = data.nextCursor ?? null;
      setUsageCursor(nextCursor);
      usageCursorRef.current = nextCursor;
      setUsageHasMore(data.hasMore ?? false);
    } catch { /* silent */ } finally {
      usageLoadingRef.current = false;
      setUsageLoading(false);
      setUsageInitialLoaded(true);
    }
  }, [channelId]);

  useEffect(() => { if (channelId) fetchUsagePage(null, true); }, [channelId, fetchUsagePage]);

  useEffect(() => {
    const el = usageScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && !usageLoadingRef.current) fetchUsagePage(usageCursorRef.current, false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchUsagePage]);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { keys: { service: string; hasKey: boolean }[]; youtubeKeys: MultiKey[]; googleSearchKeys: MultiKey[] } | null) => {
        if (!d) return;
        const status: Record<string, boolean> = {};
        for (const k of d.keys) status[k.service] = k.hasKey;
        setKeyStatus(status);
        setMultiKeys({ youtube: d.youtubeKeys || [], google_search: d.googleSearchKeys || [] });
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/profiles/${channelId}/keys`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, boolean> | null) => {
        if (!d) return;
        setKeyStatus((prev) => ({ ...prev, ...(d.hasFirecrawlKey !== undefined && { firecrawl: d.hasFirecrawlKey }) }));
      }).catch(() => {});
    fetch(`/api/settings/embedding-status?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEmbeddingKeySet(!!d.hasEmbeddingKey);
        setEmbeddingStatus({ lastStatsRefreshAt: d.lastStatsRefreshAt, rescoreIntervalHours: d.rescoreIntervalHours, scoreProfile: d.scoreProfile });
      }).catch(() => {});
  }, [channelId]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSave = (service: string, name: string) => {
    const val = editing[service]?.trim();
    if (!val) { toast.error("Please enter a key value"); return; }
    setSaving((p) => ({ ...p, [service]: true }));
    const def = KEY_DEFS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && channelId) {
      fetch(`/api/profiles/${channelId}/keys`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [def.bodyField]: val }) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(() => { setKeyStatus((p) => ({ ...p, [service]: true })); setEditing((p) => { const n = { ...p }; delete n[service]; return n; }); toast.success(`${name} saved`); })
        .catch(() => toast.error("Failed to save key"))
        .finally(() => setSaving((p) => ({ ...p, [service]: false })));
      return;
    }
    fetch("/api/settings/keys", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service, key: val }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setKeyStatus((p) => ({ ...p, [service]: true })); setEditing((p) => { const n = { ...p }; delete n[service]; return n; }); toast.success(`${name} saved`); })
      .catch(() => toast.error("Failed to save key"))
      .finally(() => setSaving((p) => ({ ...p, [service]: false })));
  };

  const handleClear = (service: string, name: string) => {
    setClearing((p) => ({ ...p, [service]: true }));
    const def = KEY_DEFS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && channelId) {
      fetch(`/api/profiles/${channelId}/keys`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [def.bodyField]: null }) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(() => { setKeyStatus((p) => ({ ...p, [service]: false })); setEditing((p) => { const n = { ...p }; delete n[service]; return n; }); toast(`${name} cleared`); })
        .catch(() => toast.error("Failed to clear key"))
        .finally(() => setClearing((p) => ({ ...p, [service]: false })));
      return;
    }
    fetch(`/api/settings/keys/${service}`, { method: "DELETE", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setKeyStatus((p) => ({ ...p, [service]: false })); setEditing((p) => { const n = { ...p }; delete n[service]; return n; }); toast(`${name} cleared`); })
      .catch(() => toast.error("Failed to clear key"))
      .finally(() => setClearing((p) => ({ ...p, [service]: false })));
  };

  const handleSaveEmbeddingKey = () => {
    const val = embeddingKeyInput.trim();
    if (!val || !channelId) { toast.error("Please enter your OpenAI API key"); return; }
    setEmbeddingKeySaving(true);
    fetch("/api/settings/embedding-key", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId, key: val }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setEmbeddingKeySet(true); setEmbeddingKeyInput(""); setEmbeddingKeyEditing(false); toast.success("Embedding key saved"); })
      .catch(() => toast.error("Failed to save embedding key"))
      .finally(() => setEmbeddingKeySaving(false));
  };

  const handleClearEmbeddingKey = () => {
    if (!channelId) return;
    setEmbeddingKeyClearing(true);
    fetch("/api/settings/embedding-key", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { setEmbeddingKeySet(false); setEmbeddingKeyEditing(false); toast("Embedding key cleared"); })
      .catch(() => toast.error("Failed to clear key"))
      .finally(() => setEmbeddingKeyClearing(false));
  };

  const handleAddMulti = (service: string, endpoint: string, serviceName: string) => {
    const label = (newMultiLabel[service] || "").trim();
    const value = (newMultiValue[service] || "").trim();
    if (!value) { toast.error("Please enter the API key"); return; }
    setAddingMulti((p) => ({ ...p, [service]: true }));
    fetch(`/api/settings/${endpoint}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: value, label: label || undefined }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((k: MultiKey) => {
        setMultiKeys((p) => ({ ...p, [service]: [...(p[service] || []), k] }));
        setKeyStatus((p) => ({ ...p, [service]: true }));
        setNewMultiLabel((p) => ({ ...p, [service]: "" }));
        setNewMultiValue((p) => ({ ...p, [service]: "" }));
        setShowAddForm((p) => ({ ...p, [service]: false }));
        toast.success(`${serviceName} key added`);
      })
      .catch(() => toast.error("Failed to add key"))
      .finally(() => setAddingMulti((p) => ({ ...p, [service]: false })));
  };

  const handleRemoveMulti = (service: string, endpoint: string, id: string, serviceName: string) => {
    setRemovingMulti((p) => ({ ...p, [id]: true }));
    fetch(`/api/settings/${endpoint}/${id}`, { method: "DELETE", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setMultiKeys((p) => {
          const next = (p[service] || []).filter((k) => k.id !== id);
          setKeyStatus((ks) => ({ ...ks, [service]: next.length > 0 }));
          return { ...p, [service]: next };
        });
        toast(`${serviceName} key removed`);
      })
      .catch(() => toast.error("Failed to remove key"))
      .finally(() => setRemovingMulti((p) => ({ ...p, [id]: false })));
  };

  const handleTestKey = (service: string, keyId?: string) => {
    const stateKey = keyId || service;
    setTesting((p) => ({ ...p, [stateKey]: true }));
    setTestResult((p) => { const n = { ...p }; delete n[stateKey]; return n; });
    fetch("/api/settings/test-key", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service, keyId }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { ok: boolean; detail?: string; error?: string; ms?: number }) => {
        setTestResult((p) => ({ ...p, [stateKey]: d }));
        if (d.ok) toast.success(`Test passed${d.ms ? ` (${d.ms}ms)` : ""}`);
        else toast.error(d.error || "Test failed");
      })
      .catch(() => { setTestResult((p) => ({ ...p, [stateKey]: { ok: false, error: "Request failed" } })); toast.error("Test request failed"); })
      .finally(() => setTesting((p) => ({ ...p, [stateKey]: false })));
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const StatusDot = ({ active }: { active: boolean }) => (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
      ● {active ? "SET" : "EMPTY"}
    </span>
  );

  const IconBtn = ({ tip, onClick, disabled, variant = "default", children }: { tip: string; onClick: () => void; disabled?: boolean; variant?: "default" | "save" | "danger" | "test"; children: React.ReactNode }) => {
    const styles = {
      default: "border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
      save: "bg-primary text-primary-foreground hover:opacity-90",
      danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
      test: "border border-border text-muted-foreground hover:text-primary hover:border-primary/40",
    };
    return (
      <Tip label={tip}>
        <button type="button" onClick={onClick} disabled={disabled}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]}`}>
          {children}
        </button>
      </Tip>
    );
  };

  const TestResult = ({ service }: { service: string }) => {
    const result = testResult[service];
    if (!result) return null;
    return (
      <span className={`text-[11px] font-mono ${result.ok ? "text-success" : "text-destructive"}`}>
        {result.ok ? `✓ ${result.detail || "OK"}` : `✗ ${result.error || "Failed"}`}
        {result.ms ? ` · ${result.ms}ms` : ""}
      </span>
    );
  };

  // ── Single key card ────────────────────────────────────────────────────

  const renderKeyCard = (def: ApiKeyDef) => {
    const isSet = !!keyStatus[def.service];
    const isEd = editing[def.service] !== undefined;
    const Icon = iconMap[def.icon];
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-muted ${iconColorMap[def.icon]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13px] font-semibold leading-tight">{def.name}</div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{def.description}</div>
            </div>
          </div>
          <StatusDot active={isSet} />
        </div>

        <div className="flex items-center gap-1.5">
          {isSet && !isEd ? (
            <div onClick={() => setEditing((p) => ({ ...p, [def.service]: "" }))}
              className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-muted-foreground font-mono flex items-center cursor-pointer hover:border-foreground/20 transition-colors">
              ••••••••••••••••
            </div>
          ) : (
            <input type="password" value={editing[def.service] || ""} onChange={(e) => setEditing((p) => ({ ...p, [def.service]: e.target.value }))}
              placeholder={def.placeholder || "Paste API key..."} autoFocus={isEd}
              className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
          )}
          <IconBtn tip="Save" onClick={() => handleSave(def.service, def.name)} disabled={saving[def.service]} variant="save">
            {saving[def.service] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </IconBtn>
          <IconBtn tip="Remove" onClick={() => handleClear(def.service, def.name)} disabled={clearing[def.service]} variant="danger">
            {clearing[def.service] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </IconBtn>
          <IconBtn tip="Test connection" onClick={() => handleTestKey(def.service)} disabled={!isSet || testing[def.service]} variant="test">
            {testing[def.service] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          </IconBtn>
        </div>

        <div className="flex items-center justify-between min-h-[18px]">
          <TestResult service={def.service} />
          {def.link && (
            <a href={def.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary font-mono hover:opacity-80 transition-opacity ml-auto">
              {def.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    );
  };

  // ── Multi-key card ─────────────────────────────────────────────────────

  const renderMultiKeyCard = (def: ApiKeyDef) => {
    const keys = multiKeys[def.service] || [];
    const isSet = keys.length > 0;
    const Icon = iconMap[def.icon];
    const endpoint = def.multiKeyEndpoint || "";
    const formOpen = showAddForm[def.service] || false;

    return (
      <div className="space-y-3">
        {/* Service header card */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-muted ${iconColorMap[def.icon]}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold leading-tight">{def.name}</div>
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{def.description}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSet && <span className="text-[10px] font-mono text-success">{keys.length} key{keys.length !== 1 ? "s" : ""}</span>}
              <StatusDot active={isSet} />
            </div>
          </div>

          {def.link && (
            <div className="flex justify-end">
              <a href={def.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary font-mono hover:opacity-80 transition-opacity">
                {def.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          )}
        </div>

        {/* Each existing key as its own card */}
        {keys.map((k) => (
          <div key={k.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-muted ${iconColorMap[def.icon]} shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-tight">{def.name} — {k.label}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-muted-foreground">••••••••••••</span>
                    {k.usageCount > 0 && <span className="text-[10px] text-muted-foreground font-mono">{k.usageCount.toLocaleString()} calls</span>}
                  </div>
                </div>
              </div>
              <IconBtn tip="Test this key" onClick={() => handleTestKey(def.service, k.id)} disabled={testing[k.id]} variant="test">
                {testing[k.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              </IconBtn>
              <IconBtn tip="Remove key" onClick={() => handleRemoveMulti(def.service, endpoint, k.id, def.name)} disabled={removingMulti[k.id]} variant="danger">
                {removingMulti[k.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </IconBtn>
            </div>
            <TestResult service={k.id} />
          </div>
        ))}

        {/* Add new key card */}
        {formOpen ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 space-y-3">
            <div className="text-[12px] font-medium text-muted-foreground">New key</div>
            <div className="flex items-center gap-1.5">
              <input type="text" placeholder="Label (e.g. Key 2)" value={newMultiLabel[def.service] || ""} onChange={(e) => setNewMultiLabel((p) => ({ ...p, [def.service]: e.target.value }))}
                className="w-32 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
              <input type="text" placeholder={def.placeholder || "Paste key..."} value={newMultiValue[def.service] || ""} onChange={(e) => setNewMultiValue((p) => ({ ...p, [def.service]: e.target.value }))} autoFocus
                className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
              <IconBtn tip="Save key" onClick={() => handleAddMulti(def.service, endpoint, def.name)} disabled={addingMulti[def.service]} variant="save">
                {addingMulti[def.service] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </IconBtn>
              <IconBtn tip="Cancel" onClick={() => { setShowAddForm((p) => ({ ...p, [def.service]: false })); setNewMultiLabel((p) => ({ ...p, [def.service]: "" })); setNewMultiValue((p) => ({ ...p, [def.service]: "" })); }} variant="danger">
                <X className="w-3.5 h-3.5" />
              </IconBtn>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAddForm((p) => ({ ...p, [def.service]: true }))}
            className="w-full h-11 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add key
          </button>
        )}

        {/* Companion field as its own card (e.g. CX ID) */}
        {def.companionField && (() => {
          const cs = def.companionField.service;
          const csSet = !!keyStatus[cs];
          const csEd = editing[cs] !== undefined;
          return (
            <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold leading-tight">{def.companionField.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{def.companionField.description}</div>
                  </div>
                </div>
                <StatusDot active={csSet} />
              </div>
              <div className="flex items-center gap-1.5">
                {csSet && !csEd ? (
                  <div onClick={() => setEditing((p) => ({ ...p, [cs]: "" }))}
                    className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-muted-foreground font-mono flex items-center cursor-pointer hover:border-foreground/20 transition-colors">
                    ••••••••••••••••
                  </div>
                ) : (
                  <input type="text" value={editing[cs] || ""} onChange={(e) => setEditing((p) => ({ ...p, [cs]: e.target.value }))}
                    placeholder={def.companionField.placeholder} autoFocus={csEd}
                    className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
                )}
                <IconBtn tip="Save" onClick={() => handleSave(cs, def.companionField!.label)} disabled={saving[cs]} variant="save">
                  {saving[cs] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                </IconBtn>
                <IconBtn tip="Remove" onClick={() => handleClear(cs, def.companionField!.label)} disabled={clearing[cs]} variant="danger">
                  {clearing[cs] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </IconBtn>
                <IconBtn tip="Test CX ID" onClick={() => handleTestKey(cs)} disabled={!csSet || testing[cs]} variant="test">
                  {testing[cs] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                </IconBtn>
              </div>
              <TestResult service={cs} />
            </div>
          );
        })()}
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Settings</h1>
            <span className="text-[11px] text-muted-foreground font-mono">API keys & integrations</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 pt-6 pb-10 max-lg:px-4 space-y-8">

            {/* ── Section: Core Services ─────────────────────────────────── */}
            <section>
              <div className="mb-4">
                <h2 className="text-[13px] font-semibold">Core Services</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Required for pipeline, analysis, and channel sync.</p>
              </div>
              <div className="space-y-3">
                {CORE_KEYS.map((def) => def.multiKey ? renderMultiKeyCard(def) : renderKeyCard(def))}
              </div>
            </section>

            {/* ── Section: Vector Intelligence ───────────────────────────── */}
            <section>
              <div className="mb-4">
                <h2 className="text-[13px] font-semibold">Vector Intelligence</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Semantic search, competition matching, and self-learning score adjustments.</p>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-purple">
                      <Brain className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold leading-tight">OpenAI Embeddings</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">text-embedding-3-small (1536d) — vectors for similarity search via pgvector.</div>
                    </div>
                  </div>
                  <StatusDot active={embeddingKeySet} />
                </div>

                <div className="flex items-center gap-1.5">
                  {embeddingKeySet && !embeddingKeyEditing ? (
                    <div onClick={() => setEmbeddingKeyEditing(true)}
                      className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-muted-foreground font-mono flex items-center cursor-pointer hover:border-foreground/20 transition-colors">
                      ••••••••••••••••
                    </div>
                  ) : (
                    <input type="password" value={embeddingKeyInput} onChange={(e) => setEmbeddingKeyInput(e.target.value)}
                      placeholder="sk-..." autoFocus={embeddingKeyEditing}
                      className="flex-1 h-9 px-3 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-purple/40" />
                  )}
                  <IconBtn tip="Save" onClick={handleSaveEmbeddingKey} disabled={embeddingKeySaving} variant="save">
                    {embeddingKeySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </IconBtn>
                  <IconBtn tip="Remove" onClick={handleClearEmbeddingKey} disabled={embeddingKeyClearing} variant="danger">
                    {embeddingKeyClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </IconBtn>
                  <IconBtn tip="Test connection" onClick={() => handleTestKey("embedding")} disabled={!embeddingKeySet || testing["embedding"]} variant="test">
                    {testing["embedding"] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  </IconBtn>
                </div>

                <div className="flex items-center justify-between min-h-[18px]">
                  <TestResult service="embedding" />
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-purple font-mono hover:opacity-80 transition-opacity ml-auto">
                    platform.openai.com ↗ <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                {embeddingKeySet && embeddingStatus.scoreProfile && (
                  <div className="pt-3 border-t border-border/50">
                    <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-2">INTELLIGENCE STATUS</div>
                    <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
                      {[
                        { label: "Decisions", value: embeddingStatus.scoreProfile.totalDecisions },
                        { label: "Outcomes", value: embeddingStatus.scoreProfile.totalOutcomes },
                        { label: "AI Accuracy", value: `${(embeddingStatus.scoreProfile.aiViralAccuracy * 100).toFixed(0)}%` },
                        { label: "Re-score", value: `${embeddingStatus.rescoreIntervalHours ?? 24}h` },
                        { label: "Stats Refresh", value: embeddingStatus.lastStatsRefreshAt ? fmtDateTime(embeddingStatus.lastStatsRefreshAt) : "Never" },
                        { label: "Last Learning", value: embeddingStatus.scoreProfile.lastLearnedAt ? fmtDateTime(embeddingStatus.scoreProfile.lastLearnedAt) : "Never" },
                      ].map((s) => (
                        <div key={s.label} className="px-2.5 py-2 bg-muted/50 rounded-lg">
                          <div className="text-[9px] text-muted-foreground font-mono uppercase">{s.label}</div>
                          <div className="text-[12px] font-mono text-foreground mt-0.5">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section: Legacy / Scraping ─────────────────────────────── */}
            <section>
              <div className="mb-4">
                <h2 className="text-[13px] font-semibold">Scraping & Legacy</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Optional project-scoped keys for scraping or older integrations.</p>
              </div>
              <div className="space-y-3">
                {LEGACY_KEYS.map((def) => renderKeyCard(def))}
              </div>
              <div className="flex items-start gap-2 mt-4 px-1">
                <Lock className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  All keys encrypted at rest (AES-256-GCM). Never returned to the browser.
                </p>
              </div>
            </section>

            {/* ── Section: Usage Dashboard ───────────────────────────────── */}
            <section>
              <div className="mb-4">
                <h2 className="text-[13px] font-semibold">Usage Dashboard</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Recent API calls for this project.</p>
              </div>

              {usageInitialLoaded && usageLogs.length === 0 ? (
                <EmptyState icon={Activity} title="No API calls recorded yet" />
              ) : (
                <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                  {/* Desktop table */}
                  <div className="max-sm:hidden">
                    <div className="grid grid-cols-[180px_130px_1fr_100px_80px] px-4 py-2.5 border-b border-border bg-muted/30">
                      {["TIME", "API", "ACTION", "TOKENS", "STATUS"].map((h) => (
                        <span key={h} className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">{h}</span>
                      ))}
                    </div>
                    <div ref={usageScrollRef} className="overflow-y-auto" style={{ maxHeight: 440 }}>
                      {usageLogs.map((log, i) => {
                        const LogIcon = iconMap[log.apiIcon];
                        const nameColor = apiNameColorMap[log.apiName] || "text-muted-foreground";
                        return (
                          <div key={log.id} className={`grid grid-cols-[180px_130px_1fr_100px_80px] px-4 py-2.5 items-center ${i < usageLogs.length - 1 ? "border-b border-border/50" : ""}`}>
                            <span className="text-[11px] text-muted-foreground font-mono">{log.time}</span>
                            <div className="flex items-center gap-1.5">
                              <LogIcon className={`w-3.5 h-3.5 ${iconColorMap[log.apiIcon]}`} />
                              <span className={`text-[11px] font-medium ${nameColor}`}>{log.apiName}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground font-mono truncate pr-2">{log.action}</span>
                            <span className="text-[11px] text-muted-foreground font-mono text-right pr-3">{log.tokens !== null ? log.tokens.toLocaleString() : "—"}</span>
                            <div className="flex justify-end">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${log.status === "Pass" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                                ● {log.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {usageLoading && (
                        <div className="flex items-center justify-center py-4 border-t border-border/50">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-0 divide-y divide-border/50 overflow-y-auto" style={{ maxHeight: 440 }}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && usageHasMore && !usageLoading) fetchUsagePage(usageCursor, false);
                    }}>
                    {usageLogs.map((log) => {
                      const LogIcon = iconMap[log.apiIcon];
                      const nameColor = apiNameColorMap[log.apiName] || "text-muted-foreground";
                      return (
                        <div key={log.id} className="p-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <LogIcon className={`w-3 h-3 ${iconColorMap[log.apiIcon]}`} />
                              <span className={`text-[11px] font-medium ${nameColor}`}>{log.apiName}</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${log.status === "Pass" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                              ● {log.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{log.time} · {log.action} · {log.tokens !== null ? `${log.tokens.toLocaleString()} tok` : "—"}</div>
                        </div>
                      );
                    })}
                    {usageLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
