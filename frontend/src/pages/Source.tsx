import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { X, ExternalLink, Lock, Check, Loader2, Newspaper } from "lucide-react";
import { toast } from "sonner";

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
          <span className="text-[11px] text-dim font-mono">News API sources for story discovery</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">

          <div className="rounded-xl bg-background p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-1">STORY DISCOVERY</div>
                <p className="text-[12px] text-dim">News APIs queried in parallel when you fetch stories. More sources = better coverage.</p>
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

        </div>
      </div>
    </div>
  );
}
