import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyticsStats,
  fieldComparison,
  fieldRankings,
  topVideos,
  keyInsights,
  channelAnalysis,
  benchmarkCategories,
  monthlyTrendData,
  channelAvatarMap,
  type FieldTab,
  type InsightType,
} from "@/data/analyticsMock";
import { Star, Circle, CheckCircle, XCircle, ChevronDown, ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const periodTabs = ["30d", "90d", "12m"];
const fieldTabs: FieldTab[] = ["Subscribers", "Engagement", "Views", "Upload rate"];
const trendTabs = ["Videos", "Views", "Likes", "Subscribers"];

const insightColors: Record<InsightType, string> = {
  EFFICIENCY: "text-purple bg-purple/10",
  OPPORTUNITY: "text-orange bg-orange/10",
  THREAT: "text-destructive bg-destructive/10",
  MARKET: "text-success bg-success/10",
  SIGNAL: "text-orange bg-orange/10",
};

export default function Analytics() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("12m");
  const [fieldTab, setFieldTab] = useState<FieldTab>("Engagement");
  const [trendTab, setTrendTab] = useState("Videos");
  const s = analyticsStats;
  const fc = fieldComparison;
  const rankings = fieldRankings[fieldTab];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Analytics</h1>
          <span className="text-[11px] text-dim font-mono">9 channels tracked · Apr 2025 – Mar 2026</span>
        </div>
        <div className="flex items-center gap-0.5">
          {periodTabs.map((t) => (
            <button
              key={t}
              onClick={() => setPeriod(t)}
              className={`px-3 py-1 text-[11px] font-mono rounded-full transition-colors ${
                period === t ? "bg-surface text-foreground" : "text-dim hover:text-sensor"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Stats row */}
        <div className="px-6 pt-5 max-lg:px-4 mb-5">
          <div className="grid grid-cols-6 max-lg:grid-cols-3 rounded-xl overflow-hidden gap-[1px] bg-border">
            <StatCard value={s.channels.value.toString()} label="CHANNELS" sub={`${s.channels.owned} owned   ${s.channels.competitors} competitors`} />
            <StatCard value={s.subscribers.value} label="SUBSCRIBERS" color="text-success" topLabel={s.subscribers.topLabel} sub={`yours ${s.subscribers.yours}   ${s.subscribers.top} top`} />
            <StatCard value={s.totalViews.value} label="TOTAL VIEWS" color="text-purple" topLabel={s.totalViews.topLabel} sub={`yours ${s.totalViews.yours}   ${s.totalViews.top} top`} />
            <StatCard value={s.videosTracked.value} label="VIDEOS TRACKED" sub={`${s.videosTracked.owned} owned   ${s.videosTracked.competitors} competitors`} />
            <StatCard value={s.avgEngagement.value} label="AVG ENGAGEMENT" color="text-success" topLabel={s.avgEngagement.topLabel} sub={`yours ${s.avgEngagement.yours}   ${s.avgEngagement.top} top`} />
            <StatCard value={s.uploadsPerMonth.value} label="UPLOADS / MONTH" color="text-blue" topLabel={s.uploadsPerMonth.topLabel} sub={`yours ${s.uploadsPerMonth.yours}   ${s.uploadsPerMonth.top} top`} />
          </div>
        </div>

        {/* You vs the Field */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-orange" />
                <span className="text-[13px] font-semibold">You vs the Field</span>
                <span className="text-[11px] text-dim font-mono">— your 2 channels combined vs 7 competitors</span>
              </div>
              <div className="flex items-center gap-0.5">
                {fieldTabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFieldTab(t)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors border ${
                      fieldTab === t
                        ? "bg-surface text-foreground border-border"
                        : "bg-transparent text-dim border-transparent hover:text-sensor"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison cards */}
            <div className="grid grid-cols-4 max-lg:grid-cols-2 gap-[1px] bg-border mx-5 mb-4 rounded-xl overflow-hidden">
              <ComparisonCard label="ENGAGEMENT RANK" value={`#${fc.engagementRank.rank}`} sub={`out of ${fc.engagementRank.outOf} channels`} note={fc.engagementRank.note} noteColor="text-success" />
              <ComparisonCard label="SUBSCRIBER RANK" value={`#${fc.subscriberRank.rank}`} sub={`out of ${fc.subscriberRank.outOf} channels`} note={fc.subscriberRank.note} noteColor="text-orange" />
              <ComparisonCard label="YOUR ENGAGEMENT" value={fc.yourEngagement.value} sub={`market avg ${fc.yourEngagement.marketAvg}`} note={fc.yourEngagement.note} noteColor="text-success" />
              <ComparisonCard label="VIEWS GAP VS #1" value={fc.viewsGapVs1.multiplier} sub={`${fc.viewsGapVs1.topName} has ${fc.viewsGapVs1.topTotal} total`} note={fc.viewsGapVs1.note} noteColor="text-orange" />
            </div>

            {/* Rankings bar chart */}
            <div className="px-5 pb-5">
              {rankings.map((entry) => {
                return (
                  <div
                    key={entry.rank}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className={`w-6 text-right text-[12px] font-mono shrink-0 ${entry.isYou ? "text-blue" : "text-dim"}`}>
                      {entry.rank}
                    </span>
                    <ChannelAvatar name={entry.name} />
                    {entry.isYou && <span className="text-[10px] text-blue font-mono shrink-0">YOU</span>}
                    <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${entry.isYou ? "bg-blue" : "bg-dim/40"}`}
                        style={{ width: `${getBarWidth(entry, rankings)}%` }}
                      />
                    </div>
                    <span className={`text-[12px] font-mono shrink-0 w-16 text-right ${entry.isYou ? "text-blue" : "text-dim"}`}>
                      {entry.value}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Insight footer */}
            <div className="px-5 py-4 border-t border-border">
              <div className="flex items-start gap-2">
                <span className="text-blue mt-0.5">↑</span>
                <div>
                  <p className="text-[13px] font-medium">You are competitive on engagement — this is your foundation</p>
                  <p className="text-[12px] text-dim mt-1">
                    At 4.95% you sit in the top half of the field. SUL CASES leads at 6.59% — their format is documentary-style criminal cases with high comment volume. Your quality is there. The gap to close is reach, not quality.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Channel Analysis */}
        <div className="px-6 max-lg:px-4 mb-5">
          <ChannelAnalysisSection />
        </div>

        {/* Channel Benchmarks */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2">
              <Circle className="w-3.5 h-3.5 text-blue fill-blue" />
              <span className="text-[13px] font-semibold">Channel Benchmarks</span>
            </div>
            <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-[1px] bg-border">
              {benchmarkCategories.map((cat) => (
                <div key={cat.label} className="bg-background px-5 py-4">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">{cat.label}</div>
                  {cat.items.map((item) => {
                    return (
                      <div
                        key={item.rank}
                        className="flex items-center justify-between py-2 -mx-2 px-2 rounded-lg"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`text-[11px] font-mono w-5 text-right ${item.isYou ? "text-blue" : "text-dim"}`}>{item.rank}</span>
                          <ChannelAvatar name={item.name} size="sm" />
                        </div>
                        <span className={`text-[12px] font-mono ${item.isYou ? "text-blue" : "text-dim"}`}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold">Monthly Trend — Last 12 Months</span>
                <span className="text-[11px] text-blue font-mono px-2 py-0.5 border border-blue/30 rounded-full">— blue = your channels</span>
              </div>
              <div className="flex items-center gap-0.5">
                {trendTabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTrendTab(t)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors border ${
                      trendTab === t
                        ? "bg-surface text-foreground border-border"
                        : "bg-transparent text-dim border-transparent hover:text-sensor"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5">
              <SimpleTrendChart />
            </div>
          </div>
        </div>

        {/* Top Videos */}
        <div className="px-6 max-lg:px-4 mb-5">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Top Videos by Views</span>
              <span className="text-[11px] text-dim font-mono">across all tracked channels</span>
            </div>
            {topVideos.map((v) => (
              <div key={v.rank} className="group flex items-center gap-5 px-5 py-3.5 border-t border-border hover:bg-surface/30 transition-colors cursor-pointer">
                <span className="text-[12px] text-dim font-mono w-6 text-right shrink-0">{v.rank}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate group-hover:opacity-80 transition-opacity">{v.title}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <ChannelAvatar name={v.channel} size="sm" />
                <span className="text-[13px] font-mono text-dim shrink-0 w-16 text-right">{v.views}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Key Insights */}
        <div className="px-6 max-lg:px-4 mb-8">
          <div className="rounded-xl bg-background overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <span className="text-[13px] font-semibold">Key Insights</span>
              <span className="text-[11px] text-dim font-mono px-2 py-0.5 border border-border rounded-full">AI · based on real data</span>
            </div>
            {keyInsights.map((insight, i) => (
              <div key={i} className="px-5 py-4 border-t border-border">
                <div className="flex items-start gap-3">
                  <span className={`text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5 ${insightColors[insight.type]}`}>
                    {insight.type}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium mb-1">{insight.title}</p>
                    <p className="text-[12px] text-dim leading-relaxed">{insight.description}</p>
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

/* --- Sub-components --- */

function StatCard({ value, label, color, topLabel, sub }: { value: string; label: string; color?: string; topLabel?: string; sub: string }) {
  return (
    <div className="bg-background px-5 py-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className={`text-2xl font-semibold font-mono tracking-tight ${color || ""}`}>{value}</span>
        {topLabel && <span className="text-[10px] text-dim font-mono">{topLabel}</span>}
      </div>
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{label}</div>
      {topLabel && <div className="h-0.5 bg-blue rounded-full mt-2 mb-1 w-1/3" />}
      <div className="text-[11px] text-dim font-mono mt-2 whitespace-pre">{sub}</div>
    </div>
  );
}

function ComparisonCard({ label, value, sub, note, noteColor }: { label: string; value: string; sub: string; note: string; noteColor: string }) {
  return (
    <div className="bg-background px-5 py-4">
      <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight mb-1">{value}</div>
      <div className="text-[11px] text-dim font-mono mb-2">{sub}</div>
      <div className={`text-[11px] font-mono ${noteColor}`}>{note}</div>
    </div>
  );
}

function getChannelInfo(name: string): { avatar: string; id: string } | null {
  if (channelAvatarMap[name]) return channelAvatarMap[name];
  for (const [key, val] of Object.entries(channelAvatarMap)) {
    if (name.includes(key) || key.includes(name)) return val;
  }
  return null;
}

function getAvatarForDropdown(name: string) {
  return getChannelInfo(name)?.avatar ?? null;
}

function ChannelAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const navigate = useNavigate();
  const info = getChannelInfo(name);
  const px = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const fallbackPx = size === "sm" ? "w-5 h-5 text-[8px]" : "w-7 h-7 text-[10px]";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`shrink-0 cursor-pointer`}
          onClick={(e) => {
            e.stopPropagation();
            if (info) navigate(`/channel/${info.id}`);
          }}
        >
          {info ? (
            <img src={info.avatar} alt={name} className={`${px} rounded-full object-cover hover:ring-2 hover:ring-blue transition-all`} />
          ) : (
            <div className={`${fallbackPx} rounded-full bg-elevated flex items-center justify-center text-dim font-mono`}>
              {name[0]}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>{name}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function ChannelDropdown({ value, onChange, options, variant }: { value: string; onChange: (v: string) => void; options: string[]; variant: "you" | "competitor" }) {
  const [open, setOpen] = useState(false);
  const avatar = getAvatarForDropdown(value);
  const isYou = variant === "you";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 text-[11px] font-mono px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
          isYou ? "text-blue bg-blue/10 border border-blue/30 hover:bg-blue/20" : "text-dim bg-transparent border border-border hover:text-sensor"
        }`}
      >
        {avatar && <img src={avatar} alt="" className="w-4 h-4 rounded-full object-cover" />}
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[200px]">
            {options.map((ch) => {
              const chAvatar = getAvatarForDropdown(ch);
              return (
                <button
                  key={ch}
                  onClick={() => { onChange(ch); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono hover:bg-surface/50 transition-colors text-left ${ch === value ? (isYou ? "text-blue" : "text-foreground") : "text-dim"}`}
                >
                  {chAvatar ? (
                    <img src={chAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-elevated shrink-0" />
                  )}
                  <span>{ch}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ChannelAnalysisSection() {
  const ca = channelAnalysis;
  const [yourChannel, setYourChannel] = useState(ca.yourChannel);
  const [competitor, setCompetitor] = useState(ca.competitor);

  const ourChannels = ["Fun Channel (@fun213)", "فن كوميدي (@funqa3e)"];
  const competitorChannels = [
    "قرية العجائب | Badr Al-Alawi",
    "Fares Ashour",
    "VWAR",
    "SUL CASES",
    "Abulsadiq",
    "Walid Qasas",
    "Abu Talal",
    "Mannas",
    "Mawtan",
  ];

  return (
    <div className="rounded-xl bg-background overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold">Channel Analysis</span>
        <span className="text-[11px] font-mono text-dim">—</span>
        <ChannelDropdown value={yourChannel} onChange={setYourChannel} options={ourChannels} variant="you" />
        <span className="text-[11px] text-dim font-mono">vs</span>
        <ChannelDropdown value={competitor} onChange={setCompetitor} options={competitorChannels} variant="competitor" />
      </div>

      {/* Summary */}
      <div className="mx-5 mb-4 px-4 py-3 border border-border rounded-xl">
        <p className="text-[13px] font-medium">{ca.summary}</p>
        <p className="text-[11px] text-dim font-mono mt-1">Fun Channel vs Badr Al-Alawi · Winning {ca.winning}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {ca.metrics.map((m) => (
            <span key={m.label} className={`text-[10px] font-mono px-2 py-0.5 border rounded-full ${
              m.tagColor === "success" ? "text-success border-success/30" : "text-dim border-border"
            }`}>
              {m.tagColor === "success" ? "✓" : "↑"} {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Metric comparison table */}
      <div className="mx-5 mb-4 rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_120px_50px] gap-4 px-5 py-3 bg-surface/30 border-b border-border">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">METRIC</span>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={yourChannel} size="sm" />
            <span className="text-[10px] text-blue font-mono uppercase tracking-widest">You</span>
          </div>
          <div className="flex items-center gap-1.5 justify-end">
            <ChannelAvatar name={competitor} size="sm" />
            <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Competitor</span>
          </div>
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest text-right">STATUS</span>
        </div>
        {ca.metrics.map((m, i) => {
          const isWinning = m.tagColor === "success";
          return (
            <div key={m.label} className={`grid grid-cols-[1fr_100px_120px_50px] gap-4 px-5 py-3.5 items-center ${i < ca.metrics.length - 1 ? "border-b border-border" : ""}`}>
              <span className="text-[13px] font-medium">{m.label}</span>
              <span className={`text-[13px] font-mono font-semibold text-right ${isWinning ? "text-success" : "text-blue"}`}>{m.you.value}</span>
              <span className="text-[13px] font-mono text-dim text-right">{m.them.value}</span>
              <div className="flex justify-end">
                {isWinning ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Plan */}
      <div className="px-5 pb-5">
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">ACTION PLAN — IN ORDER OF IMPACT</div>
        <div className="space-y-2">
          {ca.actionPlan.map((a) => (
            <div key={a.number} className={`px-4 py-3 rounded-xl border ${a.isWinning ? "border-success/30" : "border-border"}`}>
              <div className="flex items-start gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                  a.isWinning ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
                }`}>
                  {a.isWinning ? "✓" : a.number}
                </span>
                <div>
                  <p className="text-[13px] font-semibold mb-1">{a.title}</p>
                  <p className="text-[12px] text-dim leading-relaxed">{a.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimpleTrendChart() {
  const data = monthlyTrendData;
  const maxVal = 20;
  const height = 280;
  const width = 900;
  const padding = { top: 20, right: 60, bottom: 50, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const getX = (i: number) => padding.left + (i / (data.months.length - 1)) * chartW;
  const getY = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

  const makePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[700px]" style={{ height: "280px" }}>
        {/* Y axis lines */}
        {[0, 5, 10, 15, 20].map((v) => (
          <g key={v}>
            <line x1={padding.left} y1={getY(v)} x2={width - padding.right} y2={getY(v)} stroke="hsl(var(--border))" strokeWidth="0.5" />
            <text x={padding.left - 8} y={getY(v) + 4} textAnchor="end" className="fill-dim text-[10px] font-mono">{v}</text>
          </g>
        ))}
        {/* X axis labels */}
        {data.months.map((m, i) => (
          <text key={m} x={getX(i)} y={height - 10} textAnchor="middle" className="fill-dim text-[10px] font-mono">{m}</text>
        ))}
        {/* Competitor lines */}
        {data.competitors.map((c) => (
          <path key={c.name} d={makePath(c.data)} fill="none" stroke="hsl(var(--dim))" strokeWidth="1" strokeOpacity="0.3" />
        ))}
        {/* Your channel lines */}
        {data.yourChannels.map((c) => (
          <g key={c.name}>
            <path d={makePath(c.data)} fill="none" stroke="hsl(var(--blue))" strokeWidth="2.5" />
            {c.data.map((v, i) => (
              <circle key={i} cx={getX(i)} cy={getY(v)} r="3" fill="hsl(var(--blue))" />
            ))}
          </g>
        ))}
        {/* YOU labels on right */}
        {data.yourChannels.map((c) => (
          <text key={c.name} x={width - padding.right + 8} y={getY(c.data[c.data.length - 1]) + 4} className="fill-blue text-[10px] font-mono font-semibold">YOU</text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="text-[10px] text-blue font-mono uppercase tracking-widest">YOUR CHANNELS</span>
        {data.yourChannels.map((c) => (
          <span key={c.name} className="flex items-center gap-1.5 text-[11px] font-mono">
            <span className="w-3 h-0.5 bg-blue rounded-full inline-block" />
            <ChannelAvatar name={c.name} size="sm" />
          </span>
        ))}
        <span className="text-[10px] text-dim font-mono uppercase tracking-widest ml-4">COMPETITORS</span>
        {data.competitors.map((c) => (
          <span key={c.name} className="flex items-center gap-1.5 text-[11px] font-mono text-dim">
            <span className="w-3 h-0.5 bg-dim/40 rounded-full inline-block" />
            <ChannelAvatar name={c.name} size="sm" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- Helpers --- */

function getBarWidth(entry: { value: string }, all: { value: string }[]) {
  const parseVal = (v: string) => {
    const num = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (v.includes("%")) return num;
    if (v.includes("M")) return num * 1000000;
    if (v.includes("K")) return num * 1000;
    if (v.includes("B")) return num * 1000000000;
    return num;
  };
  const max = Math.max(...all.map((e) => parseVal(e.value)));
  return max > 0 ? (parseVal(entry.value) / max) * 100 : 0;
}

function getMetricBarWidth(value: string, maxValue: string) {
  const parse = (v: string) => {
    const num = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (v.includes("M")) return num * 1000000;
    if (v.includes("K")) return num * 1000;
    return num;
  };
  const val = parse(value);
  const max = parse(maxValue);
  return max > 0 ? Math.min((val / max) * 100, 100) : 0;
}
