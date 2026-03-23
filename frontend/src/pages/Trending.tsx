import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Flame, Loader2, RefreshCw, ExternalLink, Eye, ThumbsUp,
  MessageSquare, Globe, Check, BarChart3, TrendingUp, Users,
  Clock, Layers, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendingEntryData {
  id: string;
  rank: number;
  youtubeVideoId: string;
  title: string;
  channelName: string;
  channelId: string;
  categoryId: string | null;
  categoryName: string | null;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  duration: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  country: string;
  snapshotFetchedAt: string;
}

interface SnapshotMeta {
  id: string;
  country: string;
  fetchedAt: string;
  totalVideos: number;
}

interface CategoryInfo {
  name: string;
  count: number;
}

interface CountryData {
  country: string;
  snapshots: number;
  lastFetched: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ALL_COUNTRIES: Record<string, { name: string; flag: string; short: string }> = {
  SA: { name: "Saudi Arabia", flag: "🇸🇦", short: "KSA" },
  AE: { name: "UAE", flag: "🇦🇪", short: "UAE" },
  KW: { name: "Kuwait", flag: "🇰🇼", short: "KWT" },
  BH: { name: "Bahrain", flag: "🇧🇭", short: "BHR" },
  QA: { name: "Qatar", flag: "🇶🇦", short: "QAT" },
  OM: { name: "Oman", flag: "🇴🇲", short: "OMN" },
  US: { name: "United States", flag: "🇺🇸", short: "USA" },
};

const FETCH_COUNTRIES = ["SA", "AE", "KW", "BH", "QA", "OM", "US"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function parseCount(s: string | number): number {
  return typeof s === "string" ? parseInt(s, 10) || 0 : s;
}

function parseDuration(iso: string | null): string {
  if (!iso) return "--";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const s = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}

function parseDurationSecs(iso: string | null): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ value, label, color, sub }: {
  value: string; label: string; color?: string; sub: string;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-2xl font-semibold font-mono tracking-tight mb-0.5">
        <span className={color || ""}>{value}</span>
      </div>
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{label}</div>
      <div className="text-[11px] text-muted-foreground font-mono mt-2">{sub}</div>
    </div>
  );
}

// ─── Category Distribution ──────────────────────────────────────────────────

function CategoryDistribution({ entries }: { entries: TrendingEntryData[] }) {
  const catCounts = useMemo(() => {
    const map = new Map<string, { count: number; totalViews: number; totalLikes: number }>();
    for (const e of entries) {
      const cat = e.categoryName || "Other";
      const prev = map.get(cat) || { count: 0, totalViews: 0, totalLikes: 0 };
      map.set(cat, {
        count: prev.count + 1,
        totalViews: prev.totalViews + parseCount(e.viewCount),
        totalLikes: prev.totalLikes + parseCount(e.likeCount),
      });
    }
    return [...map.entries()]
      .map(([name, data]) => ({ name, ...data, avgViews: Math.round(data.totalViews / data.count) }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const maxCount = catCounts[0]?.count || 1;
  const total = entries.length;

  return (
    <div className="rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Layers className="w-4 h-4 text-purple" />
        <span className="text-[13px] font-semibold">Category Distribution</span>
        <span className="text-[11px] text-muted-foreground font-mono">— what content dominates trending</span>
      </div>
      <div className="px-5 pb-5 space-y-2">
        {catCounts.map((cat) => {
          const pct = total > 0 ? ((cat.count / total) * 100).toFixed(0) : "0";
          return (
            <div key={cat.name} className="flex items-center gap-3">
              <span className="text-[11px] font-mono w-28 text-muted-foreground truncate text-right">{cat.name}</span>
              <div className="flex-1 h-3 bg-card rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple/70 rounded-full transition-all"
                  style={{ width: `${(cat.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{cat.count}</span>
              <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
      {catCounts.length > 0 && (
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-purple font-medium">{catCounts[0].name}</span> dominates with {catCounts[0].count} videos ({((catCounts[0].count / total) * 100).toFixed(0)}% of trending).
            Avg views: {fmtNum(catCounts[0].avgViews)}.
            {catCounts.length > 1 && ` Followed by ${catCounts[1].name} (${catCounts[1].count}) and ${catCounts[2]?.name || "others"} (${catCounts[2]?.count || 0}).`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Country Breakdown ──────────────────────────────────────────────────────

function CountryBreakdown({ entries }: { entries: TrendingEntryData[] }) {
  const countryStats = useMemo(() => {
    const map = new Map<string, { count: number; totalViews: number; avgViews: number }>();
    for (const e of entries) {
      const prev = map.get(e.country) || { count: 0, totalViews: 0, avgViews: 0 };
      map.set(e.country, {
        count: prev.count + 1,
        totalViews: prev.totalViews + parseCount(e.viewCount),
        avgViews: 0,
      });
    }
    return [...map.entries()]
      .map(([code, data]) => ({
        code,
        ...data,
        avgViews: data.count > 0 ? Math.round(data.totalViews / data.count) : 0,
        ...ALL_COUNTRIES[code],
      }))
      .sort((a, b) => b.totalViews - a.totalViews);
  }, [entries]);

  const maxViews = countryStats[0]?.totalViews || 1;

  return (
    <div className="rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Globe className="w-4 h-4 text-primary" />
        <span className="text-[13px] font-semibold">Regional Breakdown</span>
        <span className="text-[11px] text-muted-foreground font-mono">— trending by country</span>
      </div>
      <div className="px-5 pb-5 space-y-2.5">
        {countryStats.map((c) => (
          <div key={c.code} className="flex items-center gap-3">
            <span className="text-base shrink-0">{c.flag}</span>
            <span className="text-[11px] font-mono w-8 text-muted-foreground">{c.short}</span>
            <div className="flex-1 h-3 bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all"
                style={{ width: `${(c.totalViews / maxViews) * 100}%` }}
              />
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] font-mono text-foreground">{fmtNum(c.totalViews)}</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-2">{c.count} videos</span>
            </div>
          </div>
        ))}
      </div>
      {countryStats.length > 1 && (
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            {countryStats[0].flag} <span className="text-foreground font-medium">{countryStats[0].name}</span> leads with {fmtNum(countryStats[0].totalViews)} total trending views.
            Avg views per trending video: {fmtNum(countryStats[0].avgViews)}.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Top Trending Channels ──────────────────────────────────────────────────

function TopChannels({ entries }: { entries: TrendingEntryData[] }) {
  const channelStats = useMemo(() => {
    const map = new Map<string, { name: string; channelId: string; count: number; totalViews: number; countries: Set<string>; bestRank: number }>();
    for (const e of entries) {
      const prev = map.get(e.channelId) || { name: e.channelName, channelId: e.channelId, count: 0, totalViews: 0, countries: new Set<string>(), bestRank: 999 };
      prev.count += 1;
      prev.totalViews += parseCount(e.viewCount);
      prev.countries.add(e.country);
      prev.bestRank = Math.min(prev.bestRank, e.rank);
      map.set(e.channelId, prev);
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [entries]);

  const maxCount = channelStats[0]?.count || 1;

  return (
    <div className="rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Users className="w-4 h-4 text-orange" />
        <span className="text-[13px] font-semibold">Top Trending Channels</span>
        <span className="text-[11px] text-muted-foreground font-mono">— who appears most on trending</span>
      </div>
      <div className="px-5 pb-4">
        {channelStats.map((ch, i) => (
          <div key={ch.channelId} className="flex items-center gap-3 py-2.5">
            <span className="text-[12px] font-mono w-6 text-right text-muted-foreground shrink-0">{i + 1}</span>
            <a
              href={`https://www.youtube.com/channel/${ch.channelId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium w-40 truncate hover:text-primary transition-colors no-underline"
            >
              {ch.name}
            </a>
            <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
              <div className="h-full bg-orange/60 rounded-full" style={{ width: `${(ch.count / maxCount) * 100}%` }} />
            </div>
            <span className="text-[11px] font-mono text-orange shrink-0">{ch.count} videos</span>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-16 text-right">{fmtNum(ch.totalViews)} views</span>
            <div className="flex gap-0.5 shrink-0">
              {[...ch.countries].map((c) => (
                <span key={c} className="text-[10px]" title={ALL_COUNTRIES[c]?.name}>{ALL_COUNTRIES[c]?.flag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {channelStats.length > 0 && (
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-orange font-medium">{channelStats[0].name}</span> dominates trending with {channelStats[0].count} videos
            across {channelStats[0].countries.size} region{channelStats[0].countries.size !== 1 ? "s" : ""}.
            Best rank: #{channelStats[0].bestRank}.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── View Performance Distribution ──────────────────────────────────────────

function ViewDistribution({ entries }: { entries: TrendingEntryData[] }) {
  const stats = useMemo(() => {
    const views = entries.map((e) => parseCount(e.viewCount)).sort((a, b) => a - b);
    if (views.length === 0) return null;
    const total = views.length;
    const sum = views.reduce((a, b) => a + b, 0);
    const mean = Math.round(sum / total);
    const median = views[Math.floor(total / 2)];
    const p10 = views[Math.floor(total * 0.1)];
    const p90 = views[Math.floor(total * 0.9)];
    const min = views[0];
    const max = views[total - 1];

    const buckets = [
      { label: "< 100K", min: 0, max: 100_000 },
      { label: "100K–500K", min: 100_000, max: 500_000 },
      { label: "500K–1M", min: 500_000, max: 1_000_000 },
      { label: "1M–5M", min: 1_000_000, max: 5_000_000 },
      { label: "5M–20M", min: 5_000_000, max: 20_000_000 },
      { label: "20M+", min: 20_000_000, max: Infinity },
    ].map((b) => ({
      label: b.label,
      count: views.filter((v) => v >= b.min && v < b.max).length,
    }));

    return { total, sum, mean, median, p10, p90, min, max, buckets };
  }, [entries]);

  if (!stats) return null;

  const maxBucket = Math.max(...stats.buckets.map((b) => b.count), 1);

  return (
    <div className="rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <BarChart3 className="w-4 h-4 text-success" />
        <span className="text-[13px] font-semibold">View Performance Distribution</span>
        <span className="text-[11px] text-muted-foreground font-mono">— how views spread across {stats.total} trending videos</span>
      </div>
      <div className="grid grid-cols-5 max-lg:grid-cols-3 gap-[1px] bg-border mx-5 mb-4 rounded-lg overflow-hidden">
        {[
          { label: "MEDIAN", value: stats.median, color: "text-primary" },
          { label: "MEAN", value: stats.mean, color: "text-purple" },
          { label: "P90", value: stats.p90, color: "text-success" },
          { label: "P10", value: stats.p10, color: "text-muted-foreground" },
          { label: "MAX", value: stats.max, color: "text-orange" },
        ].map((item) => (
          <div key={item.label} className="bg-card px-4 py-3">
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">{item.label}</div>
            <div className={`text-lg font-semibold font-mono ${item.color}`}>{fmtNum(item.value)}</div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-3">VIEW RANGE DISTRIBUTION</div>
        <div className="space-y-1.5">
          {stats.buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-[11px] font-mono w-24 text-muted-foreground text-right">{bucket.label}</span>
              <div className="flex-1 h-3 bg-card rounded-full overflow-hidden">
                <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${(bucket.count / maxBucket) * 100}%` }} />
              </div>
              <span className="text-[11px] font-mono w-8 text-muted-foreground">{bucket.count}</span>
              <span className="text-[10px] font-mono w-10 text-muted-foreground text-right">
                {stats.total > 0 ? `${((bucket.count / stats.total) * 100).toFixed(0)}%` : "0%"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          {stats.mean > stats.median * 2
            ? `Mean (${fmtNum(stats.mean)}) is ${(stats.mean / stats.median).toFixed(1)}× the median (${fmtNum(stats.median)}) — a few viral hits skew heavily. Median is the truer benchmark for trending.`
            : `Mean (${fmtNum(stats.mean)}) and median (${fmtNum(stats.median)}) are close — trending performance is fairly uniform.`}
          {" "}Top 10% of trending videos get {fmtNum(stats.p90)}+ views.
        </p>
      </div>
    </div>
  );
}

// ─── Key Insights ───────────────────────────────────────────────────────────

function buildInsights(entries: TrendingEntryData[]) {
  const insights: { type: string; color: string; title: string; description: string }[] = [];
  if (entries.length === 0) return insights;

  const totalViews = entries.reduce((s, e) => s + parseCount(e.viewCount), 0);
  const avgViews = Math.round(totalViews / entries.length);

  // Category dominance
  const catMap = new Map<string, number>();
  entries.forEach((e) => catMap.set(e.categoryName || "Other", (catMap.get(e.categoryName || "Other") || 0) + 1));
  const topCat = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const pct = ((topCat[1] / entries.length) * 100).toFixed(0);
    insights.push({
      type: "CATEGORY",
      color: "text-purple bg-purple/10",
      title: `${topCat[0]} dominates at ${pct}% of trending (${topCat[1]} videos)`,
      description: `If you're targeting trending, ${topCat[0]} content has the highest probability of appearing. Consider creating content in this category or studying what makes these videos trend.`,
    });
  }

  // Duration insight
  const durations = entries.map((e) => parseDurationSecs(e.duration)).filter((d) => d > 0);
  if (durations.length > 0) {
    const avgDur = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const shorts = durations.filter((d) => d <= 60).length;
    const medium = durations.filter((d) => d > 60 && d <= 600).length;
    const long = durations.filter((d) => d > 600).length;
    const avgMin = Math.floor(avgDur / 60);
    const avgSec = avgDur % 60;
    const dominant = shorts > medium && shorts > long ? "short-form (< 1 min)" : long > medium ? "long-form (10+ min)" : "medium-form (1–10 min)";
    insights.push({
      type: "FORMAT",
      color: "text-orange bg-orange/10",
      title: `Avg trending duration: ${avgMin}m ${avgSec}s — ${dominant} dominates`,
      description: `Short: ${shorts} · Medium: ${medium} · Long: ${long}. The trending algorithm favors ${dominant} content in these regions. Align your content length to maximize trending probability.`,
    });
  }

  // Multi-country trending
  const vidCountryMap = new Map<string, Set<string>>();
  entries.forEach((e) => {
    const prev = vidCountryMap.get(e.youtubeVideoId) || new Set();
    prev.add(e.country);
    vidCountryMap.set(e.youtubeVideoId, prev);
  });
  const multiCountryVids = [...vidCountryMap.entries()].filter(([, cs]) => cs.size > 1);
  if (multiCountryVids.length > 0) {
    const topMulti = multiCountryVids.sort((a, b) => b[1].size - a[1].size)[0];
    const vid = entries.find((e) => e.youtubeVideoId === topMulti[0]);
    insights.push({
      type: "VIRAL",
      color: "text-success bg-success/10",
      title: `${multiCountryVids.length} videos trending in multiple countries`,
      description: vid
        ? `"${vid.title}" by ${vid.channelName} is trending in ${topMulti[1].size} countries (${[...topMulti[1]].map((c) => ALL_COUNTRIES[c]?.flag || c).join(" ")}). Cross-regional appeal signals universal content.`
        : `${multiCountryVids.length} videos appear on trending in 2+ countries — these are universally appealing.`,
    });
  }

  // Top channel dominance
  const chMap = new Map<string, number>();
  entries.forEach((e) => chMap.set(e.channelName, (chMap.get(e.channelName) || 0) + 1));
  const topCh = [...chMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCh && topCh[1] > 2) {
    insights.push({
      type: "CHANNEL",
      color: "text-primary bg-primary/10",
      title: `${topCh[0]} leads with ${topCh[1]} trending videos`,
      description: `This channel owns ${((topCh[1] / entries.length) * 100).toFixed(0)}% of the trending page. Study their thumbnail style, titles, and publishing times to understand what's working.`,
    });
  }

  // Market summary
  const countries = new Set(entries.map((e) => e.country));
  insights.push({
    type: "MARKET",
    color: "text-success bg-success/10",
    title: `${entries.length} trending videos across ${countries.size} regions · ${fmtNum(totalViews)} total views`,
    description: `Average views per trending video: ${fmtNum(avgViews)}. ${catMap.size} categories represented. These numbers reflect what YouTube's algorithm is currently promoting — use them to calibrate your content strategy.`,
  });

  return insights;
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Trending() {
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [entries, setEntries] = useState<TrendingEntryData[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [availableCountries, setAvailableCountries] = useState<CountryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const countriesParam = selectedCountries.size > 0
    ? Array.from(selectedCountries).join(",")
    : undefined;

  useEffect(() => {
    fetch("/api/trending/countries", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { countries: [] })
      .then((data) => setAvailableCountries(data.countries || []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async (countriesStr: string | undefined, cat: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (countriesStr) params.set("countries", countriesStr);
      if (cat) params.set("category", cat);
      const res = await fetch(`/api/trending?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trending data");
      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setEntries(data.entries || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async (countriesStr: string | undefined) => {
    try {
      const params = new URLSearchParams();
      if (countriesStr) params.set("countries", countriesStr);
      const res = await fetch(`/api/trending/categories?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadData(countriesParam, category);
    loadCategories(countriesParam);
  }, [countriesParam, category, loadData, loadCategories]);

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setCategory(null);
  };

  const handleFetchNow = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/trending/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ countries: FETCH_COUNTRIES }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fetch failed");
      }
      const data = await res.json();
      const total = data.results?.reduce((s: number, r: { videos: number }) => s + r.videos, 0) || 0;
      toast.success(`Fetched ${total} trending videos from ${data.results?.length || 0} countries`);
      loadData(countriesParam, category);
      loadCategories(countriesParam);
      fetch("/api/trending/countries", { credentials: "include" })
        .then((r) => r.ok ? r.json() : { countries: [] })
        .then((d) => setAvailableCountries(d.countries || []))
        .catch(() => {});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setFetching(false);
    }
  };

  // Computed stats
  const totalViews = useMemo(() => entries.reduce((s, e) => s + parseCount(e.viewCount), 0), [entries]);
  const totalLikes = useMemo(() => entries.reduce((s, e) => s + parseCount(e.likeCount), 0), [entries]);
  const totalComments = useMemo(() => entries.reduce((s, e) => s + parseCount(e.commentCount), 0), [entries]);
  const countriesInView = useMemo(() => new Set(entries.map((e) => e.country)), [entries]);
  const avgViews = entries.length > 0 ? Math.round(totalViews / entries.length) : 0;
  const avgEngagement = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100) : 0;
  const topCategoryName = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e) => m.set(e.categoryName || "Other", (m.get(e.categoryName || "Other") || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [entries]);
  const insights = useMemo(() => buildInsights(entries), [entries]);

  // Loading state
  if (loading && entries.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
          <Flame className="w-4 h-4 text-orange-500 mr-2" />
          <h1 className="text-sm font-semibold">Trending Intelligence</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <Flame className="w-4 h-4 text-orange-500" />
          <h1 className="text-sm font-semibold">Trending Intelligence</h1>
          <span className="text-[11px] text-muted-foreground font-mono">
            {countriesInView.size} regions · {entries.length} videos
          </span>
          <button
            onClick={handleFetchNow}
            disabled={fetching}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Fetching…" : "Refresh"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Country filter */}
          <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
            <PopoverTrigger asChild>
              <button className={`px-3 py-1 text-[11px] font-mono rounded-full transition-colors border ${
                selectedCountries.size > 0
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground border-border hover:text-foreground"
              }`}>
                <Globe className="w-3 h-3 inline mr-1" />
                {selectedCountries.size === 0
                  ? "All regions"
                  : `${selectedCountries.size} region${selectedCountries.size > 1 ? "s" : ""}`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="end">
              <button
                onClick={() => { setSelectedCountries(new Set()); setCategory(null); }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors ${
                  selectedCountries.size === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="w-3.5 h-3.5 rounded border border-border flex items-center justify-center">
                  {selectedCountries.size === 0 && <Check className="w-2.5 h-2.5" />}
                </div>
                All regions
              </button>
              <div className="h-px bg-border my-1" />
              {Object.entries(ALL_COUNTRIES).map(([code, { name, flag }]) => {
                const active = selectedCountries.has(code);
                const hasData = availableCountries.some((c) => c.country === code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleCountry(code)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors ${
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}>
                      {active && <Check className="w-2.5 h-2.5" />}
                    </div>
                    {flag} {name}
                    {!hasData && <span className="ml-auto text-[9px] opacity-40">—</span>}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>

          {/* Category filter pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCategory(null)}
                className={`px-3 py-1 text-[11px] font-mono rounded-full transition-colors ${
                  !category ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {categories.slice(0, 5).map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setCategory(category === cat.name ? null : cat.name)}
                  className={`px-3 py-1 text-[11px] font-mono rounded-full transition-colors ${
                    category === cat.name ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Empty state ──────────────────────────────────────────── */}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <Flame className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">No trending data yet</h3>
            <p className="text-xs text-muted-foreground mb-5 max-w-xs">
              Click "Refresh" to pull the latest trending videos from GCC + US.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <>
            {/* ── Stat cards ───────────────────────────────────────── */}
            <div className="px-6 pt-5 max-lg:px-4 mb-5">
              <div className="grid grid-cols-6 max-lg:grid-cols-3 rounded-lg overflow-hidden gap-[1px] bg-border">
                <StatCard value={String(entries.length)} label="TRENDING VIDEOS" sub={`${countriesInView.size} regions combined`} />
                <StatCard value={fmtNum(totalViews)} label="TOTAL VIEWS" color="text-success" sub={`avg ${fmtNum(avgViews)} per video`} />
                <StatCard value={fmtNum(totalLikes)} label="TOTAL LIKES" color="text-primary" sub={`${avgEngagement.toFixed(2)}% engagement`} />
                <StatCard value={fmtNum(totalComments)} label="TOTAL COMMENTS" color="text-orange" sub={`${entries.length > 0 ? fmtNum(Math.round(totalComments / entries.length)) : "0"} avg/video`} />
                <StatCard value={topCategoryName} label="TOP CATEGORY" color="text-purple" sub="most trending videos" />
                <StatCard value={String(countriesInView.size)} label="REGIONS" sub={[...countriesInView].map((c) => ALL_COUNTRIES[c]?.flag || c).join(" ")} />
              </div>
            </div>

            {/* ── Active filters ────────────────────────────────────── */}
            {selectedCountries.size > 0 && (
              <div className="px-6 max-lg:px-4 mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mr-1">FILTERING:</span>
                {Array.from(selectedCountries).map((code) => (
                  <button
                    key={code}
                    onClick={() => toggleCountry(code)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {ALL_COUNTRIES[code]?.flag} {ALL_COUNTRIES[code]?.short || code}
                    <span className="ml-0.5 opacity-60">×</span>
                  </button>
                ))}
                <button onClick={() => { setSelectedCountries(new Set()); setCategory(null); }} className="text-[10px] text-muted-foreground hover:text-foreground font-mono ml-1">
                  Clear
                </button>
              </div>
            )}

            {/* ── Category Distribution + Country Breakdown ────────── */}
            <div className="px-6 max-lg:px-4 mb-5 grid grid-cols-2 max-lg:grid-cols-1 gap-5">
              <CategoryDistribution entries={entries} />
              <CountryBreakdown entries={entries} />
            </div>

            {/* ── Top Channels ─────────────────────────────────────── */}
            <div className="px-6 max-lg:px-4 mb-5">
              <TopChannels entries={entries} />
            </div>

            {/* ── View Distribution ────────────────────────────────── */}
            <div className="px-6 max-lg:px-4 mb-5">
              <ViewDistribution entries={entries} />
            </div>

            {/* ── Top Videos ───────────────────────────────────────── */}
            <div className="px-6 max-lg:px-4 mb-5">
              <div className="rounded-lg bg-card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-[13px] font-semibold">Top Trending Videos</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    sorted by views · all regions
                  </span>
                </div>
                {entries.slice(0, 50).map((entry, idx) => (
                  <a
                    key={entry.id}
                    href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 px-5 py-3 border-t border-border hover:bg-card/30 transition-colors no-underline"
                  >
                    <span className="text-[12px] font-mono w-6 text-right text-muted-foreground shrink-0">{idx + 1}</span>
                    {entry.thumbnailUrl ? (
                      <div className="relative shrink-0">
                        <img src={entry.thumbnailUrl} alt="" className="w-20 h-[45px] rounded-md object-cover" loading="lazy" />
                        <span className="absolute bottom-0.5 right-0.5 bg-black/75 text-white text-[8px] leading-tight px-0.5 rounded">
                          {parseDuration(entry.duration)}
                        </span>
                      </div>
                    ) : (
                      <div className="w-20 h-[45px] rounded-md bg-muted/20 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">{entry.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{entry.channelName}</span>
                        {entry.categoryName && (
                          <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5">{entry.categoryName}</Badge>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] cursor-default">{ALL_COUNTRIES[entry.country]?.flag}</span>
                          </TooltipTrigger>
                          <TooltipContent className="text-[10px]">#{entry.rank} in {ALL_COUNTRIES[entry.country]?.name}</TooltipContent>
                        </Tooltip>
                        {entry.publishedAt && <span className="text-[10px] text-muted-foreground/60">{timeAgo(entry.publishedAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                      <span className="flex items-center gap-0.5 tabular-nums"><Eye className="w-3 h-3" />{fmtNum(parseCount(entry.viewCount))}</span>
                      <span className="flex items-center gap-0.5 tabular-nums"><ThumbsUp className="w-3 h-3" />{fmtNum(parseCount(entry.likeCount))}</span>
                      <span className="flex items-center gap-0.5 tabular-nums"><MessageSquare className="w-3 h-3" />{fmtNum(parseCount(entry.commentCount))}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* ── Key Insights ─────────────────────────────────────── */}
            <div className="px-6 max-lg:px-4 mb-8">
              <div className="rounded-lg bg-card overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-3">
                  <Zap className="w-4 h-4 text-orange" />
                  <span className="text-[13px] font-semibold">Key Insights</span>
                  <span className="text-[11px] text-muted-foreground font-mono px-2 py-0.5 border border-border rounded-full">
                    derived from trending data
                  </span>
                </div>
                {insights.map((insight, i) => (
                  <div key={i} className="px-5 py-4 border-t border-border">
                    <div className="flex items-start gap-3">
                      <span className={`text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5 ${insight.color}`}>
                        {insight.type}
                      </span>
                      <div>
                        <p className="text-[13px] font-medium mb-1">{insight.title}</p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
