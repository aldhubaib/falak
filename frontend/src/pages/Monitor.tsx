import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { Circle, Pause, RotateCw, Search, ChevronDown, ArrowUpRight } from "lucide-react";
import { monitorHealth, monitorCadence, monitorQuota, monitorChannels } from "@/data/monitorMock";

const filterTabs = ["All", "Active", "Regular", "Slow", "Inactive"];

export default function Monitor() {
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [countdown, setCountdown] = useState(21);
  const q = monitorQuota;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 21 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const filtered = monitorChannels.filter((ch) => {
    if (search && !ch.name.includes(search) && !ch.handle.includes(search)) return false;
    if (activeFilter === "Active") return !ch.isStale;
    if (activeFilter === "Inactive") return ch.isStale;
    return true;
  });

  const counts: Record<string, number> = {
    All: monitorChannels.length,
    Active: 38,
    Regular: 7,
    Slow: 1,
    Inactive: 4,
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Monitor</h1>
          <span className="text-[11px] text-dim font-mono">
            {filtered.length} channels
          </span>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-[11px] font-medium">
            <Circle className="w-2 h-2 fill-current" />
            Running · {countdown}s
          </span>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
            <Pause className="w-3 h-3" />
            <span className="max-sm:hidden">Pause</span>
          </button>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
            <RotateCw className="w-3 h-3" />
            <span className="max-sm:hidden">Force run all</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Cards row */}
        <div className="px-6 pt-5 max-lg:px-4 grid grid-cols-2 max-md:grid-cols-1 gap-4 mb-5">
          {/* Channel Health */}
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-4 py-3">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Channel Health</div>
              <div className="grid grid-cols-5 max-sm:grid-cols-3 gap-3 max-sm:gap-y-3">
                {[
                  { val: monitorHealth.total, label: "TOTAL", color: "" },
                  { val: monitorHealth.healthy, label: "ACTIVE", color: "text-success" },
                  { val: monitorHealth.inactive, label: "REGULAR", color: "text-blue" },
                  { val: monitorHealth.gone, label: "SLOW", color: "text-orange" },
                  { val: 4, label: "INACTIVE", color: "text-destructive" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className={`text-xl font-semibold font-mono tracking-tight ${s.color}`}>{s.val}</div>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2.5">Check Cadence (Auto-learned)</div>
              {monitorCadence.map((c) => {
                const color = c.color;
                const dotColor = color === "success" ? "bg-success" : color === "blue" ? "bg-blue" : color === "orange" ? "bg-orange" : color === "destructive" ? "bg-destructive" : "";
                return (
                  <div key={c.label} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      {dotColor ? (
                        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                      ) : (
                        <span className="w-2" />
                      )}
                      <span className="text-[12px] text-sensor font-medium">{c.label}</span>
                      <span className="text-[11px] text-dim font-mono max-sm:hidden">{c.desc}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-dim">
                      <span>{c.channels} ch</span>
                      <span>{c.freq}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* API Quota */}
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3 max-sm:flex-wrap max-sm:gap-1">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">API Quota — Today</div>
                <span className="text-[11px] text-dim font-mono">Resets in {q.resetsIn}</span>
              </div>
              <div className="grid grid-cols-3 gap-0 mb-4">
                {[
                  { val: q.used.toLocaleString(), label: "USED", color: "text-orange" },
                  { val: q.remaining.toLocaleString(), label: "REMAINING", color: "text-success" },
                  { val: q.checksLeft, label: "CHECKS LEFT", color: "" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className={`text-xl font-semibold font-mono tracking-tight ${s.color}`}>{s.val}</div>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-dim font-mono">Total quota</span>
                <span className="text-[11px] text-dim font-mono">{q.used.toLocaleString()} / {q.total.toLocaleString()} {q.pct}%</span>
              </div>
              <div className="h-1.5 bg-elevated rounded-full overflow-hidden mb-2">
                <div className="h-full bg-success rounded-full" style={{ width: `${q.pct}%` }} />
              </div>
              <div className="flex items-center justify-between mb-4 max-sm:flex-wrap max-sm:gap-1">
                <span className="text-[10px] text-dim font-mono">{q.apiKeys} API keys · {q.unitsPerDay.toLocaleString()} units/day</span>
                <span className="text-[11px] text-success font-mono">✓ Sufficient for today</span>
              </div>
              <div className="flex items-center gap-6 max-sm:flex-wrap max-sm:gap-3">
                <div>
                  <span className="text-lg font-semibold font-mono tracking-tight">{q.checksToday}</span>
                  <span className="text-[10px] text-dim font-mono ml-2">checks today</span>
                </div>
                <div>
                  <span className="text-lg font-semibold font-mono tracking-tight">{q.queuedTomorrow}</span>
                  <span className="text-[10px] text-dim font-mono ml-2">queued tomorrow</span>
                </div>
                <span className="text-[11px] text-dim font-mono max-sm:w-full">~{q.unitsPerCheck} units per check</span>
              </div>
            </div>
          </div>
        </div>

        {/* Channel table */}
        <div className="px-6 pb-8 max-lg:px-4">
          {/* Filters + search */}
          <div className="flex items-center justify-between mb-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
            <div className="flex flex-wrap gap-1.5">
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors whitespace-nowrap border ${
                    activeFilter === tab
                      ? "bg-surface text-foreground border-border"
                      : "bg-transparent text-dim border-border/50 hover:text-sensor hover:border-border"
                  }`}
                >
                  {tab} <span className="text-[11px] opacity-60">({counts[tab]})</span>
                </button>
              ))}
            </div>
            <div className="relative max-sm:w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
              <input
                type="text"
                placeholder="Search channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-border/50 rounded-full text-sensor placeholder:text-dim focus:outline-none focus:border-border w-[180px] max-sm:w-full"
              />
            </div>
          </div>

          {/* Desktop Table */}
          <div className="rounded-xl border border-border overflow-hidden max-sm:hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_70px_90px_90px_90px_90px_80px_80px] px-4 py-2.5 bg-background border-b border-border">
              {["CHANNEL", "STATUS", "LAST CHECK", "NEW VIDEOS", "LAST VIDEO", "NEXT CHECK", "CADENCE", "OVERRIDE"].map((h) => (
                <span key={h} className="text-[10px] text-dim font-mono uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {/* Rows */}
            {filtered.map((ch) => (
              <div
                key={ch.id}
                onClick={() => navigate(projectPath(`/channel/${ch.id}`))}
                className="grid grid-cols-[1fr_70px_90px_90px_90px_90px_80px_80px] px-4 py-3 bg-background border-b border-border last:border-b-0 hover:bg-[#0d0d10] transition-colors cursor-pointer group items-center"
              >
                <div className="flex items-center gap-2.5">
                  <img src={ch.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-medium truncate">{ch.name}</span>
                      <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <span className="text-[11px] text-dim font-mono">{ch.handle}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    ch.status === "active" ? "bg-success" : ch.status === "regular" ? "bg-blue" : ch.status === "slow" ? "bg-orange" : "bg-destructive"
                  }`} />
                </div>
                <span className="text-[12px] text-dim font-mono">{ch.lastCheck}</span>
                <span className={`text-[12px] font-mono ${ch.newVideos ? "text-orange" : "text-dim"}`}>
                  {ch.newVideos || "—"}
                </span>
                <span className={`text-[12px] font-mono ${ch.isStale ? "text-orange" : "text-dim"}`}>
                  {ch.lastVideo}
                </span>
                <span className="text-[12px] text-dim font-mono">{ch.nextCheck}</span>
                <span className={`text-[12px] font-mono ${ch.cadenceType === "owned" ? "text-orange" : "text-dim"}`}>
                  {ch.cadence} {ch.cadenceType === "owned" ? "· owned" : "auto"}
                </span>
                <div>
                  {ch.override === "Auto" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-[11px] text-dim font-mono">
                      Auto <ChevronDown className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="text-[11px] text-dim font-mono">locked</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Card Layout */}
          <div className="sm:hidden space-y-2">
            {filtered.map((ch) => (
              <div
                key={ch.id}
                onClick={() => navigate(projectPath(`/channel/${ch.id}`))}
                className="rounded-xl bg-background p-4 cursor-pointer active:bg-[#0d0d10] transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img src={ch.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium truncate">{ch.name}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        ch.status === "active" ? "bg-success" : ch.status === "regular" ? "bg-blue" : ch.status === "slow" ? "bg-orange" : "bg-destructive"
                      }`} />
                    </div>
                    <span className="text-[11px] text-dim font-mono">{ch.handle}</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-dim shrink-0" />
                </div>
                <div className="grid grid-cols-3 gap-y-2.5 gap-x-4">
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Last check</div>
                    <div className="text-[12px] text-dim font-mono">{ch.lastCheck}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">New videos</div>
                    <div className={`text-[12px] font-mono ${ch.newVideos ? "text-orange" : "text-dim"}`}>{ch.newVideos || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Last video</div>
                    <div className={`text-[12px] font-mono ${ch.isStale ? "text-orange" : "text-dim"}`}>{ch.lastVideo}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Next check</div>
                    <div className="text-[12px] text-dim font-mono">{ch.nextCheck}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Cadence</div>
                    <div className={`text-[12px] font-mono ${ch.cadenceType === "owned" ? "text-orange" : "text-dim"}`}>{ch.cadence}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-dim font-mono uppercase tracking-wider">Override</div>
                    <div className="text-[11px] text-dim font-mono">{ch.override}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
