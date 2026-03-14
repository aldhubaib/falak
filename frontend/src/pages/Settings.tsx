import { useState } from "react";
import { X, ExternalLink, Lock, Bot, Globe, FileText, Cog, Check } from "lucide-react";
import { toast } from "sonner";

interface SingleApiKey {
  id: string;
  name: string;
  description: string;
  value: string;
  icon: "ai" | "data" | "search" | "transcript";
  link?: string;
  linkLabel?: string;
  multiKey?: false;
}

interface MultiApiKey {
  id: string;
  name: string;
  description: string;
  icon: "ai" | "data" | "search" | "transcript";
  link?: string;
  linkLabel?: string;
  multiKey: true;
  keys: { label: string; value: string }[];
}

type ApiKey = SingleApiKey | MultiApiKey;

interface UsageLog {
  time: string;
  apiName: string;
  apiIcon: "ai" | "data" | "search" | "transcript";
  action: string;
  tokens: number | null;
  status: "Pass" | "Fail";
}

const iconMap = {
  ai: Bot,
  data: Cog,
  search: Globe,
  transcript: FileText,
};

const iconColorMap = {
  ai: "text-purple",
  data: "text-dim",
  search: "text-blue",
  transcript: "text-orange",
};

const apiNameColorMap: Record<string, string> = {
  "Anthropic (Claude)": "text-purple",
  "YouTube Data API v3": "text-dim",
  "Perplexity Sonar": "text-blue",
  "YouTube Transcript API": "text-orange",
  Anthropic: "text-purple",
  "youtube-data": "text-dim",
};

const mask = (v: string) => {
  if (v.length <= 4) return "••••••••••••";
  const visible = Math.min(v.length > 10 ? 6 : 3, v.length);
  return v.slice(0, visible) + "•••••••••";
};

const initialApiKeys: ApiKey[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Used by Brain to analyze video transcripts and generate insights (Pipeline → Analyzing stage). Also used for Stories AI evaluation.",
    value: "sk-ant-api03-a5g•••••••••",
    icon: "ai",
  },
  {
    id: "youtube",
    name: "YouTube Data API v3",
    description: "Used for syncing Channels — fetches video metadata, view counts, likes, comment counts, and channel info. Add multiple keys to increase quota.",
    icon: "data",
    multiKey: true,
    keys: [{ label: "Falak 001", value: "AIzaSyDB•••••••••" }],
  },
  {
    id: "perplexity",
    name: "Perplexity Sonar",
    description: "Used in Stories → Fetch step to search the web for fresh news and untouched story angles.",
    value: "pplx-pvxsFgPMrsH•••••••••",
    icon: "search",
  },
  {
    id: "transcript",
    name: "YouTube Transcript API",
    description: "Fetches full transcripts of YouTube videos. Used in Brain → Transcribe stage (Pipeline) to extract competitor video content.",
    value: "69ab4321836ca456•••••••••",
    icon: "transcript",
    link: "https://youtube-transcript.io",
    linkLabel: "youtube-transcript.io ↗",
  },
];

const usageLogs: UsageLog[] = [
  { time: "3/13/2026, 11:19:23 PM", apiName: "Anthropic", apiIcon: "ai", action: "hook-scoring", tokens: 398, status: "Pass" },
  { time: "3/13/2026, 11:19:22 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-insights", tokens: 1371, status: "Pass" },
  { time: "3/13/2026, 11:19:15 PM", apiName: "Anthropic", apiIcon: "ai", action: "hook-scoring", tokens: 390, status: "Pass" },
  { time: "3/13/2026, 11:19:15 PM", apiName: "Anthropic", apiIcon: "ai", action: "hook-scoring", tokens: 396, status: "Pass" },
  { time: "3/13/2026, 11:19:14 PM", apiName: "Anthropic", apiIcon: "ai", action: "comment-sentiment", tokens: 591, status: "Pass" },
  { time: "3/13/2026, 11:19:14 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-insights", tokens: 1540, status: "Pass" },
  { time: "3/13/2026, 11:19:13 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-insights", tokens: 1522, status: "Pass" },
  { time: "3/13/2026, 11:19:01 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-classify", tokens: 1447, status: "Pass" },
  { time: "3/13/2026, 11:19:01 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-classify", tokens: 1290, status: "Pass" },
  { time: "3/13/2026, 11:19:01 PM", apiName: "Anthropic", apiIcon: "ai", action: "analysis-classify", tokens: 1298, status: "Pass" },
  { time: "3/13/2026, 11:18:59 PM", apiName: "youtube-data", apiIcon: "data", action: "commentThreads", tokens: null, status: "Pass" },
  { time: "3/13/2026, 11:18:58 PM", apiName: "youtube-data", apiIcon: "data", action: "commentThreads", tokens: null, status: "Pass" },
];

export default function Settings() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(initialApiKeys);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [newKeyLabels, setNewKeyLabels] = useState<Record<string, string>>({});
  const [newKeyValues, setNewKeyValues] = useState<Record<string, string>>({});

  const handleSave = (id: string) => {
    const val = editingValues[id];
    if (!val || !val.trim()) {
      toast.error("Please enter a key value");
      return;
    }
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id && !k.multiKey ? { ...k, value: mask(val.trim()) } : k))
    );
    setEditingValues((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    toast.success(`${apiKeys.find((k) => k.id === id)?.name} key saved`);
  };

  const handleClear = (id: string) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id && !k.multiKey ? { ...k, value: "" } : k))
    );
    setEditingValues((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    toast("Key cleared");
  };

  const handleAddKey = (id: string) => {
    const label = newKeyLabels[id]?.trim();
    const value = newKeyValues[id]?.trim();
    if (!label || !value) {
      toast.error("Please fill in both label and key value");
      return;
    }
    setApiKeys((prev) =>
      prev.map((k) =>
        k.id === id && k.multiKey
          ? { ...k, keys: [...k.keys, { label, value: mask(value) }] }
          : k
      )
    );
    setNewKeyLabels((prev) => ({ ...prev, [id]: "" }));
    setNewKeyValues((prev) => ({ ...prev, [id]: "" }));
    toast.success("Key added");
  };

  const handleRemoveKey = (apiId: string, keyIndex: number) => {
    setApiKeys((prev) =>
      prev.map((k) =>
        k.id === apiId && k.multiKey
          ? { ...k, keys: k.keys.filter((_, i) => i !== keyIndex) }
          : k
      )
    );
    toast("Key removed");
  };

  const getStatus = (api: ApiKey) => {
    if (api.multiKey) return api.keys.length > 0;
    return !!(api as SingleApiKey).value;
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <span className="text-[11px] text-dim font-mono">API keys and usage monitoring — admin only</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">
          {/* API Keys Section */}
          <div className="rounded-xl bg-background p-5">
            <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">API KEYS — THIS PROJECT</div>
            <p className="text-[13px] text-dim leading-relaxed mb-6">
              🔑 These keys are saved for <strong className="text-foreground">this project only</strong> and are not shared with other projects. Each project has its own isolated set of API credentials tied to your own accounts and cloud projects.
            </p>

            <div className="space-y-6">
              {apiKeys.map((api) => {
                const isSet = getStatus(api);
                return (
                  <div key={api.id}>
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="text-[14px] font-semibold">{api.name}</span>
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${isSet ? "bg-success/10 text-success" : "bg-muted text-dim"}`}>
                        ● {isSet ? "SET" : "EMPTY"}
                      </span>
                      {api.multiKey && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">
                          ● {api.keys.length} KEY{api.keys.length !== 1 ? "S" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-dim leading-relaxed mb-3">{api.description}</p>

                    {/* Multi-key */}
                    {api.multiKey && (
                      <div className="space-y-2 mb-3">
                        {api.keys.map((k, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-surface rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[11px] text-dim font-mono">{i + 1}.</span>
                              <span className="text-[13px] font-medium">{k.label}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[12px] text-dim font-mono">{k.value}</span>
                              <button
                                onClick={() => handleRemoveKey(api.id, i)}
                                className="w-7 h-7 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
                          <input
                            type="text"
                            placeholder="Label (e.g. Key 2)"
                            value={newKeyLabels[api.id] || ""}
                            onChange={(e) => setNewKeyLabels((p) => ({ ...p, [api.id]: e.target.value }))}
                            className="w-[180px] max-sm:w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40"
                          />
                          <input
                            type="text"
                            placeholder="AIza..."
                            value={newKeyValues[api.id] || ""}
                            onChange={(e) => setNewKeyValues((p) => ({ ...p, [api.id]: e.target.value }))}
                            className="flex-1 max-sm:w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40"
                          />
                          <button
                            onClick={() => handleAddKey(api.id)}
                            className="px-5 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
                          >
                            Add Key
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Single key */}
                    {!api.multiKey && (() => {
                      const storedValue = (api as SingleApiKey).value;
                      const isEditing = editingValues[api.id] !== undefined;
                      const hasKey = !!storedValue;
                      return (
                        <div className="flex items-center gap-2.5 max-sm:flex-col max-sm:items-stretch">
                          {hasKey && !isEditing ? (
                            <div
                              onClick={() => setEditingValues((p) => ({ ...p, [api.id]: "" }))}
                              className="flex-1 px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-dim font-mono cursor-pointer hover:border-blue/40 transition-colors"
                            >
                              {storedValue}
                            </div>
                          ) : (
                            <input
                              type="password"
                              value={editingValues[api.id] || ""}
                              onChange={(e) => setEditingValues((p) => ({ ...p, [api.id]: e.target.value }))}
                              placeholder="Paste your API key..."
                              className="flex-1 px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                              autoFocus={isEditing}
                            />
                          )}
                          <button
                            onClick={() => handleSave(api.id)}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-blue text-blue-foreground hover:opacity-90 transition-opacity shrink-0"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleClear(api.id)}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })()}

                    {api.link && (
                      <a href={api.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-blue font-mono mt-2 hover:opacity-80 transition-opacity">
                        {api.linkLabel}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {api.id !== apiKeys[apiKeys.length - 1].id && <div className="border-b border-border mt-6" />}
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 mt-6 pt-5 border-t border-border">
              <Lock className="w-3.5 h-3.5 text-dim mt-0.5 shrink-0" />
              <p className="text-[11px] text-dim leading-relaxed">
                Keys are encrypted at rest using AES-256-GCM. They are never returned to the browser and are only decrypted server-side when making API calls.
              </p>
            </div>
          </div>

          {/* Usage Dashboard */}
          <div className="rounded-xl bg-background p-5">
            <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-4">USAGE DASHBOARD</div>

            <div className="rounded-xl border border-border overflow-hidden max-sm:hidden">
              <div className="grid grid-cols-[200px_140px_1fr_120px_100px] px-4 py-2.5 bg-surface/20 border-b border-border">
                {["TIME", "API NAME", "ACTION", "TOKENS / UNITS", "STATUS"].map((h) => (
                  <span key={h} className="text-[10px] text-dim font-mono uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {usageLogs.map((log, i) => {
                const LogIcon = iconMap[log.apiIcon];
                const nameColor = apiNameColorMap[log.apiName] || "text-dim";
                return (
                  <div key={i} className={`grid grid-cols-[200px_140px_1fr_120px_100px] px-4 py-3 items-center ${i < usageLogs.length - 1 ? "border-b border-border" : ""}`}>
                    <span className="text-[12px] text-dim font-mono">{log.time}</span>
                    <div className="flex items-center gap-2">
                      <LogIcon className={`w-4 h-4 ${iconColorMap[log.apiIcon]}`} />
                      <span className={`text-[12px] font-medium ${nameColor}`}>{log.apiName}</span>
                    </div>
                    <span className="text-[12px] text-dim font-mono">{log.action}</span>
                    <span className="text-[12px] text-dim font-mono text-right pr-4">{log.tokens !== null ? log.tokens.toLocaleString() : "—"}</span>
                    <div className="flex items-center justify-end">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full ${log.status === "Pass" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                        ● {log.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sm:hidden space-y-2">
              {usageLogs.map((log, i) => {
                const LogIcon = iconMap[log.apiIcon];
                const nameColor = apiNameColorMap[log.apiName] || "text-dim";
                return (
                  <div key={i} className="rounded-xl border border-border p-3.5">
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
                        <div className="text-[9px] text-dim font-mono uppercase">Time</div>
                        <div className="text-[11px] text-dim font-mono">{log.time}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-dim font-mono uppercase">Action</div>
                        <div className="text-[11px] text-dim font-mono">{log.action}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-dim font-mono uppercase">Tokens</div>
                        <div className="text-[11px] text-dim font-mono">{log.tokens !== null ? log.tokens.toLocaleString() : "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
