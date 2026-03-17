import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { X, ExternalLink, Lock, Check, Loader2, Newspaper, Plus, Trash2, Power, TestTube2, Pencil, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiKeyDef {
  service: string;
  name: string;
  description: string;
  icon: "news";
  link?: string;
  linkLabel?: string;
  placeholder?: string;
  projectScoped?: boolean;
  bodyField?: string;
}

interface NewsProviderStats {
  today: number;
  todayOk: number;
  todayFail: number;
  allTime: number;
  allTimeOk: number;
  allTimeFail: number;
  successRate: number | null;
  dailyLimit: number;
  remaining: number;
}

// ── News key definitions ───────────────────────────────────────────────────

const NEWS_KEYS: ApiKeyDef[] = [
  {
    service: "newsapi",
    name: "NewsAPI",
    description: "150,000+ sources",
    icon: "news",
    placeholder: "your-newsapi-key...",
    link: "https://newsapi.org/register",
    linkLabel: "newsapi.org ↗",
    projectScoped: true,
    bodyField: "newsapiKey",
  },
  {
    service: "gnews",
    name: "GNews",
    description: "Google News aggregation",
    icon: "news",
    placeholder: "your-gnews-key...",
    link: "https://gnews.io",
    linkLabel: "gnews.io ↗",
    projectScoped: true,
    bodyField: "gnewsKey",
  },
  {
    service: "guardian",
    name: "The Guardian",
    description: "Investigative journalism",
    icon: "news",
    placeholder: "your-guardian-key...",
    link: "https://bonobo.capi.gutools.co.uk/register/developer",
    linkLabel: "guardian API ↗",
    projectScoped: true,
    bodyField: "guardianKey",
  },
  {
    service: "nyt",
    name: "New York Times",
    description: "Article Search + Top Stories",
    icon: "news",
    placeholder: "your-nyt-key...",
    link: "https://developer.nytimes.com/accounts/create",
    linkLabel: "developer.nytimes.com ↗",
    projectScoped: true,
    bodyField: "nytKey",
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function Source() {
  const { projectId } = useParams();

  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [clearing, setClearing] = useState<Record<string, boolean>>({});
  const [newsStats, setNewsStats] = useState<Record<string, NewsProviderStats>>({});

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/news-stats`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, NewsProviderStats> | null) => {
        if (d) setNewsStats(d);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/keys`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, boolean> | null) => {
        if (!d) return;
        setKeyStatus((prev) => ({
          ...prev,
          ...(d.hasNewsapiKey !== undefined && { newsapi: d.hasNewsapiKey }),
          ...(d.hasGnewsKey !== undefined && { gnews: d.hasGnewsKey }),
          ...(d.hasGuardianKey !== undefined && { guardian: d.hasGuardianKey }),
          ...(d.hasNytKey !== undefined && { nyt: d.hasNytKey }),
        }));
      })
      .catch(() => {});
  }, [projectId]);

  const handleSave = (service: string, name: string) => {
    const val = editing[service]?.trim();
    if (!val) { toast.error("Please enter a key value"); return; }
    setSaving((p) => ({ ...p, [service]: true }));

    const def = NEWS_KEYS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && projectId) {
      fetch(`/api/projects/${projectId}/keys`, {
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
    }
  };

  const handleClear = (service: string, name: string) => {
    setClearing((p) => ({ ...p, [service]: true }));

    const def = NEWS_KEYS.find((d) => d.service === service);
    if (def?.projectScoped && def.bodyField && projectId) {
      fetch(`/api/projects/${projectId}/keys`, {
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
    }
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
            className="flex-1 px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-dim font-mono cursor-pointer hover:border-blue/40 transition-colors"
          >
            ••••••••••••••••  (click to replace)
          </div>
        ) : (
          <input
            type="password"
            value={editing[def.service] || ""}
            onChange={(e) => setEditing((p) => ({ ...p, [def.service]: e.target.value }))}
            placeholder={def.placeholder || "Paste your API key..."}
            className="flex-1 px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
            autoFocus={isEd}
          />
        )}
        <button onClick={() => handleSave(def.service, def.name)} disabled={isSav}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-blue text-blue-foreground hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50">
          {isSav ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => handleClear(def.service, def.name)} disabled={isClr}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0 disabled:opacity-50">
          {isClr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  const newsConnected = NEWS_KEYS.filter((d) => !!keyStatus[d.service]).length;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Source</h1>
          <span className="text-[11px] text-dim font-mono">News APIs for story discovery and actor-based article sources</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">

          <div className="rounded-xl bg-background p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-1">STORY DISCOVERY</div>
                <p className="text-[12px] text-dim">Native news APIs are checked when you fetch stories. Article actors are configured below per source.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold ${newsConnected === NEWS_KEYS.length ? "bg-success/10 text-success" : newsConnected > 0 ? "bg-amber-500/10 text-amber-400" : "bg-muted text-dim"}`}>
                  <Newspaper className="w-3.5 h-3.5" />
                  {newsConnected}/{NEWS_KEYS.length} connected
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-3">
              {NEWS_KEYS.map((def) => {
                const isSet = !!keyStatus[def.service];
                const st = newsStats[def.service];
                const usedPct = st ? Math.min(100, Math.round((st.today / st.dailyLimit) * 100)) : 0;
                return (
                  <div key={def.service} className={`rounded-xl border p-4 transition-colors ${isSet ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Newspaper className={`w-4 h-4 ${isSet ? "text-emerald-400" : "text-dim"}`} />
                        <span className="text-[13px] font-semibold">{def.name}</span>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${isSet ? "bg-emerald-400" : "bg-zinc-600"}`} />
                    </div>
                    <p className="text-[11px] text-dim mb-2">{def.description}</p>

                    {isSet && st ? (
                      <div className="mb-3 space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-dim font-mono">Today</span>
                            <span className="text-[10px] font-mono text-foreground">{st.today} / {st.dailyLimit.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${usedPct > 80 ? "bg-amber-400" : usedPct > 95 ? "bg-red-400" : "bg-emerald-400"}`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-dim font-mono">{st.remaining.toLocaleString()} remaining</span>
                            {st.successRate !== null && (
                              <span className={`text-[9px] font-mono ${st.successRate >= 90 ? "text-emerald-400" : st.successRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                {st.successRate}% success
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-dim font-mono">{st.allTime.toLocaleString()} total calls</span>
                          {st.allTimeFail > 0 && (
                            <span className="text-[9px] text-red-400 font-mono">{st.allTimeFail} failed</span>
                          )}
                        </div>
                      </div>
                    ) : isSet ? (
                      <div className="mb-3">
                        <span className="text-[10px] text-dim font-mono">No calls yet</span>
                      </div>
                    ) : (
                      <div className="mb-3" />
                    )}

                    {renderSingleKey(def)}
                    {def.link && (
                      <a href={def.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue font-mono mt-2 hover:opacity-80 transition-opacity">
                        {def.linkLabel} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 mt-5 pt-4 border-t border-border">
              <Lock className="w-3.5 h-3.5 text-dim mt-0.5 shrink-0" />
              <p className="text-[11px] text-dim leading-relaxed">
                All keys are encrypted at rest using AES-256-GCM. Never returned to the browser — only decrypted server-side when making API calls.
              </p>
            </div>
          </div>

          {/* ── Article Sources (Brain v3) ────────────────────────────── */}
          <ArticleSourcesSection projectId={projectId!} />

        </div>
      </div>
    </div>
  );
}

// ── Types for Article Sources ───────────────────────────────────────────

interface ArticleSourceData {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  language: string;
  isActive: boolean;
  lastPolledAt: string | null;
  articleCount: number;
  stats: Record<string, number>;
  hasApiKey?: boolean;
}

const SOURCE_TYPES = [
  { value: "newsapi",     label: "NewsAPI",              format: "query",    configFields: [{ key: "q", label: "Search query", placeholder: 'crime AND (murder OR robbery) NOT fashion', maxLen: 500 }] },
  { value: "gnews",       label: "GNews Search",         format: "query",    configFields: [{ key: "q", label: "Search query", placeholder: 'crime AND murder', maxLen: 200 }] },
  { value: "gnews_top",   label: "GNews Top Headlines",  format: "category", categories: ["general","world","nation","business","technology","entertainment","sports","science","health"] },
  { value: "guardian",    label: "The Guardian",          format: "query",    configFields: [{ key: "q", label: "Search query", placeholder: 'crime murder robbery' }, { key: "section", label: "Section (optional)", placeholder: 'world', optional: true }] },
  { value: "nyt_search",  label: "NYT Article Search",   format: "lucene",   configFields: [{ key: "q", label: "Search query", placeholder: 'crime' }, { key: "fq", label: "Filter query (Lucene)", placeholder: 'section_name:("World")', optional: true }] },
  { value: "nyt_top",     label: "NYT Top Stories",      format: "section",  sections: ["arts","automobiles","books/review","business","fashion","food","health","home","insider","magazine","movies","nyregion","obituaries","opinion","politics","realestate","science","sports","sundayreview","technology","theater","t-magazine","travel","upshot","us","world"] },
  { value: "rss",         label: "RSS Feed",             format: "url",      configFields: [{ key: "url", label: "Feed URL", placeholder: 'https://aljazeera.net/feed/crime' }] },
  { value: "apify_actor", label: "Apify Actor",          format: "apify",    configFields: [
    { key: "actorId", label: "Actor ID", placeholder: "username/actor-name" },
    { key: "datasetId", label: "Dataset ID (optional)", placeholder: "Optional fixed dataset ID", optional: true },
    { key: "limit", label: "Items to sync", placeholder: "100", optional: true },
  ] },
] as const;

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

function ArticleSourcesSection({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<ArticleSourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<ArticleSourceData | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ url: string; title: string }[] | null>(null);

  const fetchSources = useCallback(() => {
    fetch(`/api/article-sources?projectId=${projectId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleToggle = (id: string, isActive: boolean) => {
    fetch(`/api/article-sources/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success(isActive ? "Source paused" : "Source activated"); fetchSources(); })
      .catch(() => toast.error("Failed to update"));
  };

  const handleDelete = (id: string, label: string) => {
    if (!confirm(`Delete "${label}" and all its articles?`)) return;
    fetch(`/api/article-sources/${id}`, { method: "DELETE", credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success("Source deleted"); fetchSources(); })
      .catch(() => toast.error("Failed to delete"));
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestResults(null);
    fetch(`/api/article-sources/${id}/test`, { method: "POST", credentials: "include" })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => { setTestResults(d.articles || []); toast.success(`${d.count} articles found`); })
      .catch((e) => { toast.error(e?.error || "Test failed"); setTestResults(null); })
      .finally(() => setTestingId(null));
  };

  const totalArticles = sources.reduce((sum, s) => sum + (s.articleCount || 0), 0);
  const activeCount = sources.filter(s => s.isActive).length;

  return (
    <div className="rounded-xl bg-background p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-1">ARTICLE SOURCES</div>
          <p className="text-[12px] text-dim">Configure native APIs, RSS feeds, or Apify actors for the Brain v3 pipeline. Apify tokens are saved per source.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-dim font-mono">{totalArticles} articles · {activeCount}/{sources.length} active</span>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue text-blue-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" /> Add Source
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-dim font-mono">
          No article sources configured. Add one to start the Brain v3 pipeline.
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => {
            const typeDef = SOURCE_TYPES.find(t => t.value === s.type);
            const lang = LANG_OPTIONS.find(l => l.value === s.language);
            return (
              <div key={s.id} className={`rounded-xl border p-4 transition-colors ${s.isActive ? "border-blue/30 bg-blue/[0.02]" : "border-border opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.isActive ? "bg-blue" : "bg-zinc-600"}`} />
                    <span className="text-[13px] font-semibold">{s.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{typeDef?.label || s.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{lang?.label || s.language}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleTest(s.id)} disabled={testingId === s.id}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-sensor hover:bg-elevated/60 transition-colors disabled:opacity-50" title="Test fetch">
                      {testingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setEditSource(s)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-sensor hover:bg-elevated/60 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggle(s.id, s.isActive)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${s.isActive ? "text-blue hover:bg-blue/10" : "text-dim hover:bg-elevated/60"}`} title={s.isActive ? "Pause" : "Activate"}>
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s.id, s.label)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Config display */}
                <div className="text-[11px] font-mono text-dim mb-2">
                  {Object.entries(s.config as Record<string, unknown>).map(([k, v]) => (
                    <span key={k} className="mr-3">{k}: <span className="text-foreground">{String(v)}</span></span>
                  ))}
                </div>
                {s.type === "apify_actor" && (
                  <div className="mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${s.hasApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                      {s.hasApiKey ? "Actor API token saved" : "Actor API token missing"}
                    </span>
                  </div>
                )}

                {/* Stage stats */}
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  {Object.entries(s.stats || {}).map(([stage, count]) => (
                    <span key={stage} className={`px-2 py-0.5 rounded-full ${stage === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-elevated text-dim'}`}>
                      {stage}: {count}
                    </span>
                  ))}
                  {Object.keys(s.stats || {}).length === 0 && <span className="text-dim">No articles yet</span>}
                  {s.lastPolledAt && <span className="text-dim ml-auto">Last poll: {new Date(s.lastPolledAt).toLocaleString()}</span>}
                </div>

                {/* Test results */}
                {testResults && testingId === null && s.id === sources.find(x => testResults.length >= 0)?.id && null}
              </div>
            );
          })}
        </div>
      )}

      {/* Test results panel */}
      {testResults && (
        <div className="mt-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-dim">TEST RESULTS ({testResults.length} articles)</span>
            <button onClick={() => setTestResults(null)} className="text-dim hover:text-sensor"><X className="w-3.5 h-3.5" /></button>
          </div>
          {testResults.length === 0 ? (
            <p className="text-[12px] text-dim">No articles returned. Check your query/config.</p>
          ) : (
            <div className="space-y-1.5">
              {testResults.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="text-dim font-mono shrink-0">{i + 1}.</span>
                  <span className="text-foreground truncate flex-1">{a.title || "(no title)"}</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue shrink-0"><ExternalLink className="w-3 h-3" /></a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Source Dialog */}
      <AddSourceDialog projectId={projectId} open={addOpen} onClose={() => setAddOpen(false)} onCreated={fetchSources} />

      {/* Edit Source Dialog */}
      {editSource && (
        <EditSourceDialog source={editSource} open={!!editSource} onClose={() => setEditSource(null)} onUpdated={fetchSources} />
      )}
    </div>
  );
}

// ── Add Source Dialog ──────────────────────────────────────────────────────

function AddSourceDialog({ projectId, open, onClose, onCreated }: { projectId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState("newsapi");
  const [label, setLabel] = useState("");
  const [language, setLanguage] = useState("en");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{ url: string; title: string }[] | null>(null);

  const typeDef = SOURCE_TYPES.find(t => t.value === type)!;

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setConfig({});
    setApiKey("");
    setTestResults(null);
  };

  const buildConfig = () => {
    if (typeDef.format === "category") return { category: config.category || typeDef.categories?.[0] || "general" };
    if (typeDef.format === "section") return { section: config.section || (typeDef as any).sections?.[0] || "world" };
    if (typeDef.format === "apify") {
      const limit = parseInt(config.limit || "", 10);
      return {
        actorId: config.actorId || "",
        ...(config.datasetId ? { datasetId: config.datasetId } : {}),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      };
    }
    const c: Record<string, string> = {};
    for (const f of (typeDef as any).configFields || []) {
      if (config[f.key]) c[f.key] = config[f.key];
    }
    return c;
  };

  const handleTest = () => {
    setTesting(true);
    setTestResults(null);
    fetch("/api/article-sources/test-config", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, type, config: buildConfig(), ...(type === "apify_actor" ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => { setTestResults(d.articles || []); toast.success(`${d.count} articles found`); })
      .catch((e) => toast.error(e?.error || "Test failed"))
      .finally(() => setTesting(false));
  };

  const handleSave = () => {
    const finalLabel = label.trim() || typeDef.label;
    setSaving(true);
    fetch("/api/article-sources", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, type, label: finalLabel, config: buildConfig(), language, ...(type === "apify_actor" ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source created"); onCreated(); onClose(); setLabel(""); setConfig({}); setApiKey(""); setTestResults(null); })
      .catch((e) => toast.error(e?.error || "Failed to create"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] bg-background border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add Article Source</DialogTitle>
          <DialogDescription className="text-[12px] text-dim">Configure a native news API, RSS feed, or Apify actor source.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Type selector */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Source Type</label>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_TYPES.map(t => (
                <button key={t.value} onClick={() => handleTypeChange(t.value)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${type === t.value ? "bg-blue text-blue-foreground" : "bg-elevated text-dim hover:text-sensor"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={`${typeDef.label} — Crime`}
              className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40" />
          </div>

          {/* Language */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Content Language</label>
            <div className="flex gap-1.5">
              {LANG_OPTIONS.map(l => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${language === l.value ? "bg-blue text-blue-foreground" : "bg-elevated text-dim hover:text-sensor"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Config fields — varies by type */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Configuration</label>
            {typeDef.format === "category" && (
              <select value={config.category || ""} onChange={(e) => setConfig({ category: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                <option value="">Select category...</option>
                {typeDef.categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {typeDef.format === "section" && (
              <select value={config.section || ""} onChange={(e) => setConfig({ section: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                <option value="">Select section...</option>
                {(typeDef as any).sections?.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {(typeDef.format === "query" || typeDef.format === "lucene" || typeDef.format === "url" || typeDef.format === "apify") && (
              <div className="space-y-2">
                {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean; maxLen?: number }) => (
                  <div key={f.key}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[10px] text-dim font-mono">{f.label}</span>
                      {f.optional && <span className="text-[9px] text-dim">(optional)</span>}
                      {f.maxLen && <span className="text-[9px] text-dim ml-auto">{(config[f.key] || "").length}/{f.maxLen}</span>}
                    </div>
                    <input type="text" value={config[f.key] || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40" />
                    {type === "apify_actor" && f.key === "actorId" && (
                      <p className="mt-1 text-[10px] text-dim">All Apify actors should return the standard Falak dataset fields: `url`, `title`, `description`, `content`, `publishedAt`, `language`.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {typeDef.format === "apify" && (
              <div className="mt-3">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-dim font-mono">Actor API Token</span>
                  <span className="text-[9px] text-destructive">*</span>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Apify token for this actor"
                  className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                />
                <p className="mt-1 text-[10px] text-dim">Saved on this source only, so each actor can use a different Apify account/token.</p>
              </div>
            )}
          </div>

          {/* Test results */}
          {testResults && (
            <div className="rounded-xl border border-border p-3 max-h-[150px] overflow-y-auto">
              <span className="text-[10px] font-mono text-dim mb-1.5 block">TEST: {testResults.length} articles</span>
              {testResults.length === 0 ? (
                <p className="text-[11px] text-dim">No results. Check your config.</p>
              ) : testResults.map((a, i) => (
                <div key={i} className="text-[11px] text-foreground truncate py-0.5">{i + 1}. {a.title || a.url}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
          <button onClick={handleTest} disabled={testing}
            className="px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <TestTube2 className="w-3.5 h-3.5 inline mr-1" />}
            Test
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Create Source
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Source Dialog ─────────────────────────────────────────────────────

function EditSourceDialog({ source, open, onClose, onUpdated }: { source: ArticleSourceData; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [label, setLabel] = useState(source.label);
  const [language, setLanguage] = useState(source.language);
  const [config, setConfig] = useState<Record<string, string>>(source.config as Record<string, string>);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const typeDef = SOURCE_TYPES.find(t => t.value === source.type)!;

  useEffect(() => {
    setLabel(source.label);
    setLanguage(source.language);
    setConfig(source.config as Record<string, string>);
    setApiKey("");
  }, [source]);

  const buildConfig = () => {
    if (typeDef.format === "category") return { category: config.category || "general" };
    if (typeDef.format === "section") return { section: config.section || "world" };
    if (typeDef.format === "apify") {
      const limit = parseInt((config.limit as string) || "", 10);
      return {
        actorId: (config.actorId as string) || "",
        ...((config.datasetId as string) ? { datasetId: config.datasetId as string } : {}),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      };
    }
    const c: Record<string, string> = {};
    for (const f of (typeDef as any).configFields || []) {
      if (config[f.key]) c[f.key] = config[f.key];
    }
    return c;
  };

  const handleSave = () => {
    setSaving(true);
    fetch(`/api/article-sources/${source.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), language, config: buildConfig(), ...(typeDef.format === "apify" && apiKey ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source updated"); onUpdated(); onClose(); })
      .catch((e) => toast.error(e?.error || "Failed to update"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] bg-background border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit Source: {source.label}</DialogTitle>
          <DialogDescription className="text-[12px] text-dim">Update source configuration. Type cannot be changed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{typeDef?.label || source.type}</span>
          </div>

          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40" />
          </div>

          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Content Language</label>
            <div className="flex gap-1.5">
              {LANG_OPTIONS.map(l => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${language === l.value ? "bg-blue text-blue-foreground" : "bg-elevated text-dim hover:text-sensor"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Configuration</label>
            {typeDef.format === "category" && (
              <select value={config.category as string || ""} onChange={(e) => setConfig({ category: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                {typeDef.categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {typeDef.format === "section" && (
              <select value={config.section as string || ""} onChange={(e) => setConfig({ section: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                {(typeDef as any).sections?.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {(typeDef.format === "query" || typeDef.format === "lucene" || typeDef.format === "url" || typeDef.format === "apify") && (
              <div className="space-y-2">
                {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean }) => (
                  <div key={f.key}>
                    <span className="text-[10px] text-dim font-mono mb-1 block">{f.label}</span>
                    <input type="text" value={(config[f.key] as string) || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40" />
                  </div>
                ))}
              </div>
            )}
            {typeDef.format === "apify" && (
              <div className="mt-3">
                <span className={`inline-flex mb-2 text-[10px] px-2 py-0.5 rounded-full font-mono ${source.hasApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {source.hasApiKey ? "Actor API token saved" : "Actor API token missing"}
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={source.hasApiKey ? "Leave blank to keep current token" : "Paste actor API token"}
                  className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Save Changes
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
