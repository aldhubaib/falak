import { useState, useEffect, useCallback } from "react";
import {
  Flame, Loader2, RefreshCw, ExternalLink, Eye, ThumbsUp,
  MessageSquare, Calendar, Filter, Globe, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

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

const ALL_COUNTRIES: Record<string, { name: string; flag: string }> = {
  SA: { name: "Saudi Arabia", flag: "🇸🇦" },
  AE: { name: "UAE", flag: "🇦🇪" },
  KW: { name: "Kuwait", flag: "🇰🇼" },
  EG: { name: "Egypt", flag: "🇪🇬" },
  QA: { name: "Qatar", flag: "🇶🇦" },
  BH: { name: "Bahrain", flag: "🇧🇭" },
  OM: { name: "Oman", flag: "🇴🇲" },
  JO: { name: "Jordan", flag: "🇯🇴" },
  IQ: { name: "Iraq", flag: "🇮🇶" },
  US: { name: "United States", flag: "🇺🇸" },
  GB: { name: "United Kingdom", flag: "🇬🇧" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCount(n: string | number): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toLocaleString();
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

// ─── Component ──────────────────────────────────────────────────────────────

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

  // Load available countries on mount
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
      const fetchCountries = selectedCountries.size > 0
        ? Array.from(selectedCountries)
        : availableCountries.length > 0
          ? availableCountries.map((c) => c.country)
          : ["SA"];

      const res = await fetch("/api/trending/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ countries: fetchCountries }),
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
      // Refresh available countries
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

  const countriesInView = new Set(snapshots.map((s) => s.country));
  const latestFetch = snapshots.length > 0
    ? new Date(Math.max(...snapshots.map((s) => new Date(s.fetchedAt).getTime())))
    : null;
  const totalVideos = entries.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Trending Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCountries.size === 0
                ? "All regions combined"
                : `${selectedCountries.size} region${selectedCountries.size > 1 ? "s" : ""} selected`}
              {totalVideos > 0 && !loading && ` · ${totalVideos} videos`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Country multi-select */}
          <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
            <PopoverTrigger asChild>
              <button className="h-9 px-3 rounded-lg text-[13px] font-medium border border-border bg-card hover:bg-muted/50 flex items-center gap-1.5 transition-colors">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <Filter className="w-3 h-3 text-muted-foreground" />
                {selectedCountries.size === 0
                  ? "All Regions"
                  : `${selectedCountries.size} Region${selectedCountries.size > 1 ? "s" : ""}`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-0.5">
                <button
                  onClick={() => { setSelectedCountries(new Set()); setCategory(null); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    selectedCountries.size === 0
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="w-4 h-4 rounded border border-border flex items-center justify-center">
                    {selectedCountries.size === 0 && <Check className="w-3 h-3" />}
                  </div>
                  All Regions
                </button>
                <div className="h-px bg-border my-1" />
                {Object.entries(ALL_COUNTRIES).map(([code, { name, flag }]) => {
                  const active = selectedCountries.has(code);
                  const hasData = availableCountries.some((c) => c.country === code);
                  return (
                    <button
                      key={code}
                      onClick={() => toggleCountry(code)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}>
                        {active && <Check className="w-3 h-3" />}
                      </div>
                      <span className="mr-1">{flag}</span>
                      {name}
                      {!hasData && <span className="ml-auto text-[10px] opacity-40">no data</span>}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={handleFetchNow}
            disabled={fetching}
            className="h-9 px-3 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 transition-opacity"
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Fetch Now
          </button>
        </div>
      </div>

      {/* ── Active country pills ───────────────────────────────────── */}
      {selectedCountries.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground mr-1">Filtering:</span>
          {Array.from(selectedCountries).map((code) => {
            const c = ALL_COUNTRIES[code];
            return (
              <button
                key={code}
                onClick={() => toggleCountry(code)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {c?.flag} {c?.name || code}
                <span className="ml-0.5 text-[10px] opacity-60">×</span>
              </button>
            );
          })}
          <button
            onClick={() => { setSelectedCountries(new Set()); setCategory(null); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Stats bar ──────────────────────────────────────────────── */}
      {snapshots.length > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {latestFetch && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Last fetched {timeAgo(latestFetch.toISOString())}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {countriesInView.size} region{countriesInView.size !== 1 ? "s" : ""}:
            {" "}{Array.from(countriesInView).map((c) => ALL_COUNTRIES[c]?.flag || c).join(" ")}
          </span>
        </div>
      )}

      {/* ── Category Filters ───────────────────────────────────────── */}
      {categories.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              !category ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setCategory(category === cat.name ? null : cat.name)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                category === cat.name ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat.name} <span className="opacity-50">{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-card rounded-xl border border-border">
              <Skeleton className="w-7 h-7 rounded-md shrink-0" />
              <Skeleton className="w-24 h-[54px] rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────── */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
            <Flame className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">No trending data yet</h3>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">
            Click "Fetch Now" to pull the latest trending videos. You can add more countries afterwards.
          </p>
        </div>
      )}

      {/* ── Entries ────────────────────────────────────────────────── */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className="group flex items-start gap-2.5 p-2.5 bg-card border border-border rounded-xl hover:border-primary/20 transition-colors"
            >
              {/* Rank */}
              <div className="w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center text-[12px] font-bold text-muted-foreground shrink-0 tabular-nums">
                {idx + 1}
              </div>

              {/* Thumbnail */}
              <a
                href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 relative block"
              >
                {entry.thumbnailUrl ? (
                  <img
                    src={entry.thumbnailUrl}
                    alt=""
                    className="w-24 h-[54px] rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-24 h-[54px] rounded-lg bg-muted/20" />
                )}
                <span className="absolute bottom-0.5 right-0.5 bg-black/75 text-white text-[9px] leading-tight px-1 py-px rounded">
                  {parseDuration(entry.duration)}
                </span>
              </a>

              {/* Info */}
              <div className="flex-1 min-w-0 py-0.5">
                <a
                  href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-medium text-foreground hover:text-primary line-clamp-2 leading-snug transition-colors no-underline"
                >
                  {entry.title}
                </a>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <a
                    href={`https://www.youtube.com/channel/${entry.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-primary no-underline transition-colors"
                  >
                    {entry.channelName}
                  </a>
                  {entry.categoryName && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                      {entry.categoryName}
                    </Badge>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] cursor-default">
                        {ALL_COUNTRIES[entry.country]?.flag || entry.country}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-[11px]">
                      #{entry.rank} in {ALL_COUNTRIES[entry.country]?.name || entry.country}
                    </TooltipContent>
                  </Tooltip>
                  {entry.publishedAt && (
                    <span className="text-[10px] text-muted-foreground/60">{timeAgo(entry.publishedAt)}</span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground shrink-0 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <Eye className="w-3 h-3" />
                      {formatCount(entry.viewCount)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Views</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <ThumbsUp className="w-3 h-3" />
                      {formatCount(entry.likeCount)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Likes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <MessageSquare className="w-3 h-3" />
                      {formatCount(entry.commentCount)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Comments</TooltipContent>
                </Tooltip>
                <a
                  href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-primary" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
