import { useState } from "react";
import {
  Users, MapPin, Clock, Package, PawPrint, List,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { StoryBrief } from "./types";

type FactSheet = NonNullable<StoryBrief["factSheet"]>;

const CATEGORY_LABELS: Record<string, string> = {
  background: "خلفية — Background",
  motive: "الدافع — Motive",
  event: "الأحداث — Events",
  evidence: "الأدلة — Evidence",
  outcome: "النتيجة — Outcome",
};

const CATEGORY_COLORS: Record<string, string> = {
  background: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  motive: "bg-orange/15 text-orange border-orange/20",
  event: "bg-primary/15 text-primary border-primary/20",
  evidence: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  outcome: "bg-success/15 text-success border-success/20",
};

const PRIORITY_BADGE: Record<string, string> = {
  core: "bg-primary/20 text-primary",
  supporting: "bg-muted text-muted-foreground",
  background: "bg-card text-muted-foreground/60",
};

function SectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      {open ? (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export function FactSheetPanel({ factSheet }: { factSheet: FactSheet }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    characters: true,
    locations: true,
    time: true,
    props: true,
    animals: true,
    timeline: false,
    facts: true,
  });

  const toggle = (key: string) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const factsByCategory = factSheet.facts.reduce<Record<string, FactSheet["facts"]>>(
    (acc, f) => {
      (acc[f.category] ||= []).push(f);
      return acc;
    },
    {}
  );

  const totalEntities =
    factSheet.characters.length +
    factSheet.locations.length +
    (factSheet.timeReferences?.length || 0) +
    (factSheet.props?.length || 0) +
    (factSheet.animals?.length || 0) +
    factSheet.facts.length;

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="w-3.5 h-3.5 text-primary" />
          <span className="text-[12px] font-semibold text-foreground">Fact Sheet</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {totalEntities} entities
        </span>
      </div>

      {/* Characters */}
      {factSheet.characters.length > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={Users}
            label="Characters"
            count={factSheet.characters.length}
            open={!!openSections.characters}
            onToggle={() => toggle("characters")}
          />
          {openSections.characters && (
            <div className="px-4 pb-3 space-y-2">
              {factSheet.characters.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 ${PRIORITY_BADGE[c.priority] || PRIORITY_BADGE.background}`}>
                    {c.priority}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[12px] font-medium text-foreground" dir="auto">{c.canonical}</span>
                    <span className="text-[11px] text-muted-foreground ml-1.5" dir="auto">— {c.role}</span>
                    {c.details && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed" dir="auto">{c.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Locations */}
      {factSheet.locations.length > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={MapPin}
            label="Locations"
            count={factSheet.locations.length}
            open={!!openSections.locations}
            onToggle={() => toggle("locations")}
          />
          {openSections.locations && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.locations.map((l, i) => (
                <div key={i} className="flex items-start gap-2">
                  {l.type && (
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full mt-0.5 shrink-0">
                      {l.type}
                    </span>
                  )}
                  <div className="min-w-0">
                    <span className="text-[12px] text-foreground" dir="auto">{l.name}</span>
                    {l.significance && (
                      <span className="text-[10px] text-muted-foreground/70 ml-1.5" dir="auto">— {l.significance}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time References */}
      {(factSheet.timeReferences?.length || 0) > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={Clock}
            label="Time References"
            count={factSheet.timeReferences!.length}
            open={!!openSections.time}
            onToggle={() => toggle("time")}
          />
          {openSections.time && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.timeReferences!.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="font-mono text-primary shrink-0" dir="auto">{t.reference}</span>
                  <span className="text-muted-foreground" dir="auto">— {t.context}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Props */}
      {(factSheet.props?.length || 0) > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={Package}
            label="Props & Objects"
            count={factSheet.props!.length}
            open={!!openSections.props}
            onToggle={() => toggle("props")}
          />
          {openSections.props && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.props!.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="font-medium text-foreground shrink-0" dir="auto">{p.item}</span>
                  <span className="text-muted-foreground" dir="auto">— {p.significance}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Animals */}
      {(factSheet.animals?.length || 0) > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={PawPrint}
            label="Animals"
            count={factSheet.animals!.length}
            open={!!openSections.animals}
            onToggle={() => toggle("animals")}
          />
          {openSections.animals && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.animals!.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="font-medium text-foreground shrink-0" dir="auto">{a.animal}</span>
                  <span className="text-muted-foreground" dir="auto">— {a.significance}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Facts by category */}
      {Object.entries(factsByCategory).map(([cat, facts]) => (
        <div key={cat} className="border-b border-border last:border-b-0">
          <SectionHeader
            icon={List}
            label={CATEGORY_LABELS[cat] || cat}
            count={facts.length}
            open={!!openSections[`facts_${cat}`] ?? true}
            onToggle={() => toggle(`facts_${cat}`)}
          />
          {(openSections[`facts_${cat}`] ?? true) && (
            <div className="px-4 pb-3 space-y-1.5">
              {facts
                .sort((a, b) => b.importance - a.importance)
                .map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 border ${CATEGORY_COLORS[cat] || "bg-muted text-muted-foreground border-border"}`}>
                      {f.importance}
                    </span>
                    <span className="text-[11px] text-foreground leading-relaxed" dir="auto">{f.fact}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}

      {/* Timeline (collapsed by default) */}
      {factSheet.timeline.length > 0 && (
        <div>
          <SectionHeader
            icon={Clock}
            label="Timeline"
            count={factSheet.timeline.length}
            open={!!openSections.timeline}
            onToggle={() => toggle("timeline")}
          />
          {openSections.timeline && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="font-mono text-muted-foreground shrink-0 w-5 text-right">{t.order + 1}.</span>
                  {t.date && <span className="font-mono text-primary shrink-0">[{t.date}]</span>}
                  <span className="text-foreground leading-relaxed" dir="auto">{t.event}</span>
                  {t.weight && t.weight !== "normal" && (
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted/50 px-1 rounded shrink-0">{t.weight}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
