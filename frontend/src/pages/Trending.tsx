import { useState, useEffect, useCallback } from "react";
import {
  Flame, Loader2, RefreshCw, ExternalLink, Clock, Eye, ThumbsUp,
  MessageSquare, ChevronDown, Calendar, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

interface SnapshotHistory {
  id: string;
  country: string;
  fetchedAt: string;
  totalVideos: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
];

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
  const [country, setCountry] = useState("SA");
  const [category, setCategory] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotMeta | null>(null);
  const [entries, setEntries] = useState<TrendingEntryData[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [history, setHistory] = useState<SnapshotHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadData = useCallback(async (c: string, cat: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ country: c });
      if (cat) params.set("category", cat);
      const res = await fetch(`/api/trending?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trending data");
      const data = await res.json();
      setSnapshot(data.snapshot);
      setEntries(data.entries || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async (c: string) => {
    try {
      const res = await fetch(`/api/trending/categories?country=${c}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {}
  }, []);

  const loadHistory = useCallback(async (c: string) => {
    try {
      const res = await fetch(`/api/trending/history?country=${c}&days=30`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.snapshots || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadData(country, category);
    loadCategories(country);
    loadHistory(country);
  }, [country, category, loadData, loadCategories, loadHistory]);

  const handleFetchNow = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/trending/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ country }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fetch failed");
      }
      toast.success("Trending data fetched!");
      loadData(country, category);
      loadCategories(country);
      loadHistory(country);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setFetching(false);
    }
  };

  const loadSnapshot = async (snapId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trending/snapshot/${snapId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSnapshot({ id: data.id, country: data.country, fetchedAt: data.fetchedAt, totalVideos: data.totalVideos });
      setEntries(data.entries || []);
      setCategory(null);
      setShowHistory(false);
    } catch {
      toast.error("Failed to load snapshot");
    } finally {
      setLoading(false);
    }
  };

  const countryObj = COUNTRIES.find((c) => c.code === country);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Trending Intelligence</h1>
            <p className="text-xs text-muted-foreground">Track what's trending on YouTube across regions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={country} onValueChange={(v) => { setCountry(v); setCategory(null); }}>
            <SelectTrigger className="w-[180px] h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="mr-1.5">{c.flag}</span> {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {/* Stats Row */}
      {snapshot && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(snapshot.fetchedAt).toLocaleString()}
          </span>
          <span>{snapshot.totalVideos} videos</span>
          <span>{countryObj?.flag} {countryObj?.name}</span>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Clock className="w-3.5 h-3.5" />
            History ({history.length})
            <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
          {history.map((h) => (
            <button
              key={h.id}
              onClick={() => loadSnapshot(h.id)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] flex items-center justify-between transition-colors ${
                snapshot?.id === h.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground"
              }`}
            >
              <span>{new Date(h.fetchedAt).toLocaleString()}</span>
              <span>{h.totalVideos} videos</span>
            </button>
          ))}
        </div>
      )}

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory(null)}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
              !category ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setCategory(cat.name)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                category === cat.name ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat.name} <span className="opacity-60">({cat.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <Skeleton className="w-28 h-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Flame className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-1">No trending data yet</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-sm">
            Click "Fetch Now" to get the latest trending videos for {countryObj?.name || country}.
          </p>
        </div>
      )}

      {/* Entries List */}
      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-start gap-3 p-3 bg-card border border-border rounded-xl hover:border-border/80 transition-colors"
            >
              {/* Rank */}
              <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-[13px] font-bold text-muted-foreground shrink-0">
                {entry.rank}
              </div>

              {/* Thumbnail */}
              {entry.thumbnailUrl ? (
                <a
                  href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 relative"
                >
                  <img
                    src={entry.thumbnailUrl}
                    alt={entry.title}
                    className="w-28 h-16 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                    {parseDuration(entry.duration)}
                  </span>
                </a>
              ) : (
                <div className="w-28 h-16 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5 text-muted-foreground/30" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <a
                  href={`https://www.youtube.com/watch?v=${entry.youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-foreground hover:text-primary line-clamp-2 transition-colors no-underline"
                >
                  {entry.title}
                </a>
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={`https://www.youtube.com/channel/${entry.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-primary no-underline transition-colors"
                  >
                    {entry.channelName}
                  </a>
                  {entry.categoryName && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {entry.categoryName}
                    </Badge>
                  )}
                  {entry.publishedAt && (
                    <span className="text-[10px] text-muted-foreground/70">{timeAgo(entry.publishedAt)}</span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {formatCount(entry.viewCount)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Views</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" />
                      {formatCount(entry.likeCount)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Likes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1">
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
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
