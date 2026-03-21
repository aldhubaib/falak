import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { fmtDateTime } from "@/lib/utils";
import { X, ExternalLink, Lock, Bot, Globe, FileText, Cog, Check, Loader2, Newspaper, Brain, Activity } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

// ── Types ──────────────────────────────────────────────────────────────────

interface YTKey { id: string; label: string; isActive: boolean; usageCount: number; lastUsedAt?: string | null }

interface ApiKeyDef {
  service: string;         // matches backend service string
  name: string;
  description: string;
  icon: "ai" | "data" | "search" | "transcript" | "news";
  link?: string;
  linkLabel?: string;
  multiKey?: boolean;
  placeholder?: string;
  projectScoped?: boolean;
  bodyField?: string;
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

// ── Static key definitions (metadata only, no values) ─────────────────────

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
    description: "Legacy — story search now uses news APIs. Keep if you have existing integrations.",
    icon: "search",
    placeholder: "pplx-...",
  },
];

const KEY_DEFS: ApiKeyDef[] = [...CORE_KEYS, ...LEGACY_KEYS];

// ── Helpers ────────────────────────────────────────────────────────────────

const iconMap = { ai: Bot, data: Cog, search: Globe, transcript: FileText, news: Newspaper };
const iconColorMap = { ai: "text-purple", data: "text-muted-foreground", search: "text-primary", transcript: "text-orange", news: "text-emerald-400" };
const apiNameColorMap: Record<string, string> = {
  Anthropic: "text-purple", "YouTube Data": "text-muted-foreground",
  "YT Transcript": "text-orange", Perplexity: "text-primary", Firecrawl: "text-muted-foreground",
  NewsAPI: "text-emerald-400", GNews: "text-emerald-400", Guardian: "text-emerald-400", NYT: "text-emerald-400",
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
  return { name: api, icon: "data" };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Settings() {
  const { channelId } = useParams();

  // Which services have a key set (from GET /api/settings)
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  // YouTube multi-keys from DB
  const [ytKeys, setYtKeys] = useState<YTKey[]>([]);
  // Inline edit state for single keys
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState<Record<string, boolean>>({});
  // New YouTube key form
  const [newYtLabel, setNewYtLabel] = useState("");
  const [newYtValue, setNewYtValue] = useState("");
  const [addingYt, setAddingYt] = useState(false);
  const [removingYt, setRemovingYt] = useState<Record<string, boolean>>({});
  // Embedding key (project-scoped, for vector intelligence)
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

  // Usage logs — paginated (50 per page, infinite scroll)
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [usageCursor, setUsageCursor] = useState<string | null>(null);
  const [usageHasMore, setUsageHasMore] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageInitialLoaded, setUsageInitialLoaded] = useState(false);
  const usageScrollRef = useRef<HTMLDivElement>(null);
  const usageLoadingRef = useRef(false);
  const usageCursorRef = useRef<string | null>(null);

  const fetchUsagePage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!channelId || usageLoadingRef.current) return;
    usageLoadingRef.current = true;
    setUsageLoading(true);
    try {
      const url = `/api/profiles/${channelId}/usage?limit=50${cursor ? `&cursor=${cursor}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      const data = await r.json();
      const rows: { id: string; ts: string; api: string; action: string; tokens: number | null; status: string }[] =
        data.rows ?? [];
      const mapped: UsageLog[] = rows.map((r) => {
        const { name, icon } = mapService(r.api || "");
        return {
          id: r.id,
          time: r.ts ? fmtDateTime(r.ts) : "—",
          apiName: name, apiIcon: icon,
          action: r.action || "—",
          tokens: r.tokens ?? null,
          status: r.status === "ok" ? "Pass" : "Fail",
        };
      });
      setUsageLogs((prev) => replace ? mapped : [...prev, ...mapped]);
      const nextCursor = data.nextCursor ?? null;
      setUsageCursor(nextCursor);
      usageCursorRef.current = nextCursor;
      setUsageHasMore(data.hasMore ?? false);
    } catch {
      // silent
    } finally {
      usageLoadingRef.current = false;
      setUsageLoading(false);
      setUsageInitialLoaded(true);
    }
  }, [channelId]);

  // Initial load
  useEffect(() => {
    if (channelId) fetchUsagePage(null, true);
  }, [channelId, fetchUsagePage]);

  // Infinite scroll: when user hits bottom of the 500px container, load next page
  useEffect(() => {
    const el = usageScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && !usageLoadingRef.current) {
        fetchUsagePage(usageCursorRef.current, false);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [fetchUsagePage]);

  // Load key status + YouTube keys (global /api/settings) and project keys (for firecrawl)
  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { keys: { service: string; hasKey: boolean }[]; youtubeKeys: YTKey[] } | null) => {
        if (!d) return;
        const status: Record<string, boolean> = {};
        for (const k of d.keys) status[k.service] = k.hasKey;
        setKeyStatus(status);
        setYtKeys(d.youtubeKeys || []);
      })
      .catch(() => {});
  }, []);

  // Merge channel-scoped key status when channelId is set
  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/profiles/${channelId}/keys`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, boolean> | null) => {
        if (!d) return;
        setKeyStatus((prev) => ({
          ...prev,
          ...(d.hasFirecrawlKey !== undefined && { firecrawl: d.hasFirecrawlKey }),
        }));
      })
      .catch(() => {});
    // Fetch embedding intelligence status
    fetch(`/api/settings/embedding-status?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEmbeddingKeySet(!!d.hasEmbeddingKey);
        setEmbeddingStatus({
          lastStatsRefreshAt: d.lastStatsRefreshAt,
          rescoreIntervalHours: d.rescoreIntervalHours,
          scoreProfile: d.scoreProfile,
        });
      })
      .catch(() => {});
  }, [channelId]);

  // Save single key (project-scoped for services with bodyField, else global /api/settings/keys)
  const handleSave = (service: string, name: string) => {
    const val = editing[service]?.trim();
    if (!val) { toast.error("Please enter a key value"); return; }
    setSaving((p) => ({ ...p, [service]: true }));

    const def = KEY_DEFS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && channelId) {
      fetch(`/api/profiles/${channelId}/keys`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [def.bodyField]: val }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(() => {
          setKeyStatus((p) => ({ ...p, [service]: true }));
          setEditing((p) => { const n = { ...p }; delete n[service]; return n; });
          toast.success(`${name} key saved`);
        })
        .catch(() => toast.error("Failed to save key"))
        .finally(() => setSaving((p) => ({ ...p, [service]: false })));
      return;
    }

    fetch("/api/settings/keys", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, key: val }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setKeyStatus((p) => ({ ...p, [service]: true }));
        setEditing((p) => { const n = { ...p }; delete n[service]; return n; });
        toast.success(`${name} key saved`);
      })
      .catch(() => toast.error("Failed to save key"))
      .finally(() => setSaving((p) => ({ ...p, [service]: false })));
  };

  // Clear single key (project-scoped for services with bodyField, else global DELETE)
  const handleClear = (service: string, name: string) => {
    setClearing((p) => ({ ...p, [service]: true }));

    const def = KEY_DEFS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && channelId) {
      fetch(`/api/profiles/${channelId}/keys`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [def.bodyField]: null }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(() => {
          setKeyStatus((p) => ({ ...p, [service]: false }));
          setEditing((p) => { const n = { ...p }; delete n[service]; return n; });
          toast(`${name} key cleared`);
        })
        .catch(() => toast.error("Failed to clear key"))
        .finally(() => setClearing((p) => ({ ...p, [service]: false })));
      return;
    }

    fetch(`/api/settings/keys/${service}`, { method: "DELETE", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setKeyStatus((p) => ({ ...p, [service]: false }));
        setEditing((p) => { const n = { ...p }; delete n[service]; return n; });
        toast(`${name} key cleared`);
      })
      .catch(() => toast.error("Failed to clear key"))
      .finally(() => setClearing((p) => ({ ...p, [service]: false })));
  };

  // Save embedding key (project-scoped)
  const handleSaveEmbeddingKey = () => {
    const val = embeddingKeyInput.trim();
    if (!val || !channelId) { toast.error("Please enter your OpenAI API key"); return; }
    setEmbeddingKeySaving(true);
    fetch("/api/settings/embedding-key", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, key: val }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setEmbeddingKeySet(true);
        setEmbeddingKeyInput("");
        setEmbeddingKeyEditing(false);
        toast.success("OpenAI embedding key saved — vector intelligence active");
      })
      .catch(() => toast.error("Failed to save embedding key"))
      .finally(() => setEmbeddingKeySaving(false));
  };

  const handleClearEmbeddingKey = () => {
    if (!channelId) return;
    setEmbeddingKeyClearing(true);
    fetch("/api/settings/embedding-key", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setEmbeddingKeySet(false);
        setEmbeddingKeyEditing(false);
        toast("Embedding key cleared");
      })
      .catch(() => toast.error("Failed to clear key"))
      .finally(() => setEmbeddingKeyClearing(false));
  };

  // Add YouTube key
  const handleAddYt = () => {
    const label = newYtLabel.trim();
    const value = newYtValue.trim();
    if (!value) { toast.error("Please enter the API key"); return; }
    setAddingYt(true);
    fetch("/api/settings/youtube-keys", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: value, label: label || undefined }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((k: YTKey) => {
        setYtKeys((p) => [...p, k]);
        setKeyStatus((p) => ({ ...p, youtube: true }));
        setNewYtLabel(""); setNewYtValue("");
        toast.success("YouTube key added");
      })
      .catch(() => toast.error("Failed to add key"))
      .finally(() => setAddingYt(false));
  };

  // Remove YouTube key
  const handleRemoveYt = (id: string) => {
    setRemovingYt((p) => ({ ...p, [id]: true }));
    fetch(`/api/settings/youtube-keys/${id}`, { method: "DELETE", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setYtKeys((p) => {
          const next = p.filter((k) => k.id !== id);
          setKeyStatus((ks) => ({ ...ks, youtube: next.length > 0 }));
          return next;
        });
        toast("YouTube key removed");
      })
      .catch(() => toast.error("Failed to remove key"))
      .finally(() => setRemovingYt((p) => ({ ...p, [id]: false })));
  };

  const renderSingleKey = (def: ApiKeyDef) => {
    const isSet = !!keyStatus[def.service];
    const isEd = editing[def.service] !== undefined;
    const isSav = saving[def.service];
    const isClr = clearing[def.service];
    return (
      <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
        {isSet && !isEd ? (
          <div
            onClick={() => setEditing((p) => ({ ...p, [def.service]: "" }))}
            className="flex-1 px-4 py-2.5 text-[13px] bg-card border border-border rounded-lg text-muted-foreground font-mono cursor-pointer hover:border-primary/40 transition-colors"
          >
            ••••••••••••••••  (click to replace)
          </div>
        ) : (
          <input
            type="password"
            value={editing[def.service] || ""}
            onChange={(e) => setEditing((p) => ({ ...p, [def.service]: e.target.value }))}
            placeholder={def.placeholder || "Paste your API key..."}
            className="flex-1 px-4 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
            autoFocus={isEd}
          />
        )}
        <button onClick={() => handleSave(def.service, def.name)} disabled={isSav}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50">
          {isSav ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => handleClear(def.service, def.name)} disabled={isClr}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0 disabled:opacity-50">
          {isClr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <span className="text-[11px] text-muted-foreground font-mono">API keys and usage monitoring</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">

          {/* ── Section 1: Core Services ───────────────────────────────────── */}
          <div className="rounded-lg bg-card p-5">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">CORE SERVICES</div>
            <p className="text-[12px] text-muted-foreground mb-5">Required for pipeline, analysis, and channel sync.</p>

            <div className="space-y-5">
              {CORE_KEYS.map((def, idx) => {
                const isSet = def.multiKey ? ytKeys.length > 0 : !!keyStatus[def.service];
                const Icon = iconMap[def.icon];
                return (
                  <div key={def.service}>
                    <div className="flex items-center gap-2.5 mb-1">
                      <Icon className={`w-4 h-4 ${iconColorMap[def.icon]}`} />
                      <span className="text-[13px] font-semibold">{def.name}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${isSet ? "bg-success/10 text-success" : "bg-card text-muted-foreground"}`}>
                        ● {isSet ? "SET" : "EMPTY"}
                      </span>
                      {def.multiKey && ytKeys.length > 0 && (
                        <span className="text-[10px] font-mono text-success">{ytKeys.length} key{ytKeys.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2.5">{def.description}</p>

                    {def.multiKey ? (
                      <div className="space-y-2 mb-1">
                        {ytKeys.map((k) => (
                          <div key={k.id} className="flex items-center justify-between px-4 py-2 bg-card rounded-lg">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[12px] font-medium">{k.label}</span>
                              {k.usageCount > 0 && <span className="text-[10px] text-muted-foreground font-mono">{k.usageCount.toLocaleString()} calls</span>}
                            </div>
                            <button onClick={() => handleRemoveYt(k.id)} disabled={removingYt[k.id]}
                              className="w-6 h-6 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50">
                              {removingYt[k.id] ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2.5 max-sm:flex-col max-sm:items-stretch">
                          <input type="text" placeholder="Label (e.g. Key 2)" value={newYtLabel} onChange={(e) => setNewYtLabel(e.target.value)}
                            className="w-[160px] max-sm:w-full px-3.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
                          <input type="text" placeholder={def.placeholder || "AIza..."} value={newYtValue} onChange={(e) => setNewYtValue(e.target.value)}
                            className="flex-1 max-sm:w-full px-3.5 py-2 text-[12px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40" />
                          <button onClick={handleAddYt} disabled={addingYt}
                            className="px-4 py-2 text-[12px] font-semibold bg-primary text-primary-foreground rounded-full hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5">
                            {addingYt && <Loader2 className="w-3 h-3 animate-spin" />} Add Key
                          </button>
                        </div>
                      </div>
                    ) : (
                      renderSingleKey(def)
                    )}

                    {def.link && (
                      <a href={def.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary font-mono mt-2 hover:opacity-80 transition-opacity">
                        {def.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}

                    {idx < CORE_KEYS.length - 1 && <div className="border-b border-border mt-5" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Section 2: Vector Intelligence ───────────────────────────── */}
          <div className="rounded-lg bg-card p-5">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">VECTOR INTELLIGENCE</div>
            <p className="text-[12px] text-muted-foreground mb-5">Powers semantic search, competition matching, and self-learning score adjustments.</p>

            <div className="flex items-center gap-2.5 mb-1">
              <Brain className="w-4 h-4 text-purple" />
              <span className="text-[13px] font-semibold">OpenAI Embeddings</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${embeddingKeySet ? "bg-success/10 text-success" : "bg-card text-muted-foreground"}`}>
                ● {embeddingKeySet ? "ACTIVE" : "NOT SET"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2.5">
              text-embedding-3-small (1536d) — generates vector representations for stories and competition videos. Enables semantic similarity search via pgvector.
            </p>

            <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              {embeddingKeySet && !embeddingKeyEditing ? (
                <div
                  onClick={() => setEmbeddingKeyEditing(true)}
                  className="flex-1 px-4 py-2.5 text-[13px] bg-card border border-border rounded-lg text-muted-foreground font-mono cursor-pointer hover:border-purple/40 transition-colors"
                >
                  ••••••••••••••••  (click to replace)
                </div>
              ) : (
                <input
                  type="password"
                  value={embeddingKeyInput}
                  onChange={(e) => setEmbeddingKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 px-4 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-purple/40"
                  autoFocus={embeddingKeyEditing}
                />
              )}
              <button onClick={handleSaveEmbeddingKey} disabled={embeddingKeySaving}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-purple text-white hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50">
                {embeddingKeySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleClearEmbeddingKey} disabled={embeddingKeyClearing}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0 disabled:opacity-50">
                {embeddingKeyClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              </button>
            </div>

            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-purple font-mono mt-2 hover:opacity-80 transition-opacity">
              platform.openai.com/api-keys ↗ <ExternalLink className="w-2.5 h-2.5" />
            </a>

            {embeddingKeySet && (
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-2">INTELLIGENCE STATUS</div>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  <div className="px-3 py-2.5 bg-card rounded-lg">
                    <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Last Stats Refresh</div>
                    <div className="text-[12px] font-mono text-foreground">
                      {embeddingStatus.lastStatsRefreshAt ? fmtDateTime(embeddingStatus.lastStatsRefreshAt) : "Never"}
                    </div>
                  </div>
                  <div className="px-3 py-2.5 bg-card rounded-lg">
                    <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Auto Re-score Interval</div>
                    <div className="text-[12px] font-mono text-foreground">{embeddingStatus.rescoreIntervalHours ?? 24}h</div>
                  </div>
                  {embeddingStatus.scoreProfile && (
                    <>
                      <div className="px-3 py-2.5 bg-card rounded-lg">
                        <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Decisions Learned</div>
                        <div className="text-[12px] font-mono text-foreground">{embeddingStatus.scoreProfile.totalDecisions}</div>
                      </div>
                      <div className="px-3 py-2.5 bg-card rounded-lg">
                        <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Outcomes Tracked</div>
                        <div className="text-[12px] font-mono text-foreground">{embeddingStatus.scoreProfile.totalOutcomes}</div>
                      </div>
                      <div className="px-3 py-2.5 bg-card rounded-lg">
                        <div className="text-[10px] text-muted-foreground font-mono mb-0.5">AI Viral Accuracy</div>
                        <div className="text-[12px] font-mono text-foreground">{(embeddingStatus.scoreProfile.aiViralAccuracy * 100).toFixed(0)}%</div>
                      </div>
                      <div className="px-3 py-2.5 bg-card rounded-lg">
                        <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Last Learning</div>
                        <div className="text-[12px] font-mono text-foreground">
                          {embeddingStatus.scoreProfile.lastLearnedAt ? fmtDateTime(embeddingStatus.scoreProfile.lastLearnedAt) : "Never"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Legacy / Scraping ───────────────────────────────── */}
          <div className="rounded-lg bg-card p-5">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">SCRAPING & LEGACY</div>
            <p className="text-[12px] text-muted-foreground mb-5">Optional project-scoped keys for scraping or older integrations.</p>

            <div className="space-y-5">
              {LEGACY_KEYS.map((def, idx) => {
                const isSet = !!keyStatus[def.service];
                const Icon = iconMap[def.icon];
                return (
                  <div key={def.service}>
                    <div className="flex items-center gap-2.5 mb-1">
                      <Icon className={`w-4 h-4 ${iconColorMap[def.icon]}`} />
                      <span className="text-[13px] font-semibold">{def.name}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${isSet ? "bg-success/10 text-success" : "bg-card text-muted-foreground"}`}>
                        ● {isSet ? "SET" : "EMPTY"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2.5">{def.description}</p>
                    {renderSingleKey(def)}
                    {def.link && (
                      <a href={def.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary font-mono mt-2 hover:opacity-80 transition-opacity">
                        {def.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {idx < LEGACY_KEYS.length - 1 && <div className="border-b border-border mt-5" />}
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 mt-5 pt-4 border-t border-border">
              <Lock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                All keys are encrypted at rest using AES-256-GCM. Never returned to the browser — only decrypted server-side when making API calls.
              </p>
            </div>
          </div>

          {/* ── Section 4: Usage Dashboard ─────────────────────────────────── */}
          <div className="rounded-lg bg-card p-5">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-4">USAGE DASHBOARD</div>

            {usageInitialLoaded && usageLogs.length === 0 ? (
              <EmptyState icon={Activity} title="No API calls recorded yet for this project" />
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden max-sm:hidden">
                  <div className="grid grid-cols-[200px_140px_1fr_120px_100px] px-4 py-2.5 bg-card/20 border-b border-border sticky top-0 z-10">
                    {["TIME", "API NAME", "ACTION", "TOKENS / UNITS", "STATUS"].map((h) => (
                      <span key={h} className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  <div ref={usageScrollRef} className="overflow-y-auto" style={{ maxHeight: 500 }}
                    onScroll={() => {
                      const el = usageScrollRef.current;
                      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80 && usageHasMore && !usageLoading) fetchUsagePage(usageCursor, false);
                    }}>
                    {usageLogs.map((log, i) => {
                      const LogIcon = iconMap[log.apiIcon];
                      const nameColor = apiNameColorMap[log.apiName] || "text-muted-foreground";
                      return (
                        <div key={log.id} className={`grid grid-cols-[200px_140px_1fr_120px_100px] px-4 py-3 items-center ${i < usageLogs.length - 1 ? "border-b border-border" : ""}`}>
                          <span className="text-[12px] text-muted-foreground font-mono">{log.time}</span>
                          <div className="flex items-center gap-2">
                            <LogIcon className={`w-4 h-4 ${iconColorMap[log.apiIcon]}`} />
                            <span className={`text-[12px] font-medium ${nameColor}`}>{log.apiName}</span>
                          </div>
                          <span className="text-[12px] text-muted-foreground font-mono">{log.action}</span>
                          <span className="text-[12px] text-muted-foreground font-mono text-right pr-4">{log.tokens !== null ? log.tokens.toLocaleString() : "—"}</span>
                          <div className="flex items-center justify-end">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full ${log.status === "Pass" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                              ● {log.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {usageLoading && (
                      <div className="flex items-center justify-center py-4 border-t border-border">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!usageLoading && usageHasMore && (
                      <div className="flex items-center justify-center py-3 border-t border-border">
                        <span className="text-[11px] text-muted-foreground font-mono">Scroll down to load more</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="sm:hidden space-y-2 overflow-y-auto" style={{ maxHeight: 500 }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && usageHasMore && !usageLoading) fetchUsagePage(usageCursor, false);
                  }}>
                  {usageLogs.map((log) => {
                    const LogIcon = iconMap[log.apiIcon];
                    const nameColor = apiNameColorMap[log.apiName] || "text-muted-foreground";
                    return (
                      <div key={log.id} className="rounded-lg border border-border p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <LogIcon className={`w-3.5 h-3.5 ${iconColorMap[log.apiIcon]}`} />
                            <span className={`text-[12px] font-medium ${nameColor}`}>{log.apiName}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${log.status === "Pass" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                            ● {log.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1.5">
                          <div>
                            <div className="text-[9px] text-muted-foreground font-mono uppercase">Time</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{log.time}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground font-mono uppercase">Action</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{log.action}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground font-mono uppercase">Tokens</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{log.tokens !== null ? log.tokens.toLocaleString() : "—"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {usageLoading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
