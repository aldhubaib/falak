import { useMemo } from "react";
import {
  CheckCircle, Star, Users, MapPin, Clock, Package, List, Sparkles, BookOpen, Loader2,
} from "lucide-react";
import type { StoryBrief } from "./types";

type FactSheet = NonNullable<StoryBrief["factSheet"]>;

const CATEGORY_LABELS: Record<string, string> = {
  background: "خلفية",
  motive: "الدافع",
  event: "الأحداث",
  evidence: "الأدلة",
  outcome: "النتيجة",
};

interface SelectionSummaryProps {
  factSheet: FactSheet;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: (mode: "curated" | "full") => void;
}

export function SelectionSummary({ factSheet, canGenerate, generating, onGenerate }: SelectionSummaryProps) {
  const stats = useMemo(() => {
    const chars = factSheet.characters.filter(c => !c.excluded);
    const locs = factSheet.locations.filter(l => !l.excluded);
    const timeRefs = (factSheet.timeReferences || []).filter(t => !t.excluded);
    const props = (factSheet.props || []).filter(p => !p.excluded);
    const timeline = factSheet.timeline.filter(t => !t.excluded);
    const facts = factSheet.facts.filter(f => !f.excluded);
    const pinned = facts.filter(f => f.pinned);

    const factsByCat: Record<string, typeof facts> = {};
    for (const f of facts) {
      (factsByCat[f.category] ||= []).push(f);
    }

    return { chars, locs, timeRefs, props, timeline, facts, pinned, factsByCat };
  }, [factSheet]);

  const totalSelected = stats.chars.length + stats.locs.length + stats.facts.length + stats.timeline.length;

  return (
    <div className="rounded-lg bg-card border-2 border-primary/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-primary/10 bg-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-primary" />
          <span className="text-[12px] font-semibold text-foreground">Selection Summary</span>
        </div>
        <span className="text-[10px] font-mono text-primary">
          {totalSelected} items selected
        </span>
      </div>

      {/* Stats grid */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBadge icon={Users} label="Characters" count={stats.chars.length} total={factSheet.characters.length} />
        <StatBadge icon={MapPin} label="Locations" count={stats.locs.length} total={factSheet.locations.length} />
        <StatBadge icon={List} label="Facts" count={stats.facts.length} total={factSheet.facts.length} />
        <StatBadge icon={Clock} label="Timeline" count={stats.timeline.length} total={factSheet.timeline.length} />
      </div>

      {/* Pinned highlight */}
      {stats.pinned.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400">
              {stats.pinned.length} pinned — extra depth
            </span>
          </div>
          <div className="space-y-1">
            {stats.pinned.map((f, i) => (
              <div key={i} className="text-[10px] text-foreground/80 leading-relaxed flex items-start gap-1.5" dir="auto">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 shrink-0 mt-0.5" />
                <span>{f.fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected facts compact list */}
      {Object.keys(stats.factsByCat).length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {Object.entries(stats.factsByCat).map(([cat, facts]) => (
            <div key={cat}>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                {CATEGORY_LABELS[cat] || cat} ({facts.length})
              </span>
              <div className="mt-0.5 space-y-0.5">
                {facts.map((f, i) => (
                  <div key={i} className="text-[10px] text-foreground/70 leading-relaxed flex items-start gap-1.5" dir="auto">
                    <span className="text-muted-foreground/40 shrink-0">•</span>
                    <span className={f.pinned ? "text-foreground font-medium" : ""}>{f.fact}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate buttons */}
      <div className="px-4 py-3 border-t border-primary/10 bg-primary/5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onGenerate("curated")}
          disabled={!canGenerate || generating || stats.facts.length === 0}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
            canGenerate && !generating && stats.facts.length > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Generate from Selected
        </button>
        <button
          type="button"
          onClick={() => onGenerate("full")}
          disabled={!canGenerate || generating}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[12px] font-medium border transition-colors ${
            canGenerate && !generating
              ? "border-border text-muted-foreground hover:text-foreground hover:bg-card"
              : "border-border/50 text-muted-foreground/30 cursor-not-allowed"
          }`}
          title="Generate from ALL facts (ignore selections)"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Full Draft
        </button>
      </div>
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
  count,
  total,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
}) {
  const allSelected = count === total;
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/30">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-[11px] font-mono font-medium ${allSelected ? "text-foreground" : "text-primary"}`}>
          {count}/{total}
        </div>
      </div>
    </div>
  );
}
