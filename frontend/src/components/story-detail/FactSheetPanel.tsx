import { useState, useMemo } from "react";
import {
  Users, MapPin, Clock, Package, PawPrint, List,
  ChevronDown, ChevronUp, Star, Eye, EyeOff,
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
  selectedCount,
  open,
  onToggle,
  editable,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  selectedCount?: number;
  open: boolean;
  onToggle: () => void;
  editable?: boolean;
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
          {editable && selectedCount != null ? `${selectedCount}/${count}` : count}
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

interface FactSheetPanelProps {
  factSheet: FactSheet;
  editable?: boolean;
  onChange?: (updated: FactSheet) => void;
}

export function FactSheetPanel({ factSheet, editable = false, onChange }: FactSheetPanelProps) {
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

  const factsByCategory = useMemo(() =>
    factSheet.facts.reduce<Record<string, FactSheet["facts"]>>(
      (acc, f) => {
        (acc[f.category] ||= []).push(f);
        return acc;
      },
      {}
    ), [factSheet.facts]);

  const totalFacts = factSheet.facts.length;
  const selectedFacts = factSheet.facts.filter(f => !f.excluded).length;
  const pinnedFacts = factSheet.facts.filter(f => f.pinned).length;

  const totalEntities =
    factSheet.characters.length +
    factSheet.locations.length +
    (factSheet.timeReferences?.length || 0) +
    (factSheet.props?.length || 0) +
    (factSheet.animals?.length || 0) +
    factSheet.facts.length;

  const toggleFactExcluded = (factIndex: number) => {
    if (!onChange) return;
    const updated = { ...factSheet, facts: factSheet.facts.map((f, i) =>
      i === factIndex ? { ...f, excluded: !f.excluded, pinned: !f.excluded ? false : f.pinned } : f
    )};
    onChange(updated);
  };

  const toggleFactPinned = (factIndex: number) => {
    if (!onChange) return;
    const updated = { ...factSheet, facts: factSheet.facts.map((f, i) =>
      i === factIndex ? { ...f, pinned: !f.pinned, excluded: false } : f
    )};
    onChange(updated);
  };

  const toggleCharExcluded = (idx: number) => {
    if (!onChange) return;
    const updated = { ...factSheet, characters: factSheet.characters.map((c, i) =>
      i === idx ? { ...c, excluded: !c.excluded } : c
    )};
    onChange(updated);
  };

  const toggleLocationExcluded = (idx: number) => {
    if (!onChange) return;
    const updated = { ...factSheet, locations: factSheet.locations.map((l, i) =>
      i === idx ? { ...l, excluded: !l.excluded } : l
    )};
    onChange(updated);
  };

  const toggleTimeRefExcluded = (idx: number) => {
    if (!onChange || !factSheet.timeReferences) return;
    const updated = { ...factSheet, timeReferences: factSheet.timeReferences.map((t, i) =>
      i === idx ? { ...t, excluded: !t.excluded } : t
    )};
    onChange(updated);
  };

  const togglePropExcluded = (idx: number) => {
    if (!onChange || !factSheet.props) return;
    const updated = { ...factSheet, props: factSheet.props.map((p, i) =>
      i === idx ? { ...p, excluded: !p.excluded } : p
    )};
    onChange(updated);
  };

  const toggleTimelineExcluded = (idx: number) => {
    if (!onChange) return;
    const updated = { ...factSheet, timeline: factSheet.timeline.map((t, i) =>
      i === idx ? { ...t, excluded: !t.excluded } : t
    )};
    onChange(updated);
  };

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="w-3.5 h-3.5 text-primary" />
          <span className="text-[12px] font-semibold text-foreground">Fact Sheet</span>
        </div>
        <div className="flex items-center gap-3">
          {editable && (
            <>
              <span className="text-[10px] font-mono text-primary">
                {selectedFacts}/{totalFacts} selected
              </span>
              {pinnedFacts > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                  {pinnedFacts} pinned
                </span>
              )}
            </>
          )}
          {!editable && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {totalEntities} entities
            </span>
          )}
        </div>
      </div>

      {editable && (
        <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> Click to include/exclude
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" /> Star = must keep with extra depth
          </span>
        </div>
      )}

      {/* Characters */}
      {factSheet.characters.length > 0 && (
        <div className="border-b border-border">
          <SectionHeader
            icon={Users}
            label="Characters"
            count={factSheet.characters.length}
            selectedCount={factSheet.characters.filter(c => !c.excluded).length}
            open={!!openSections.characters}
            onToggle={() => toggle("characters")}
            editable={editable}
          />
          {openSections.characters && (
            <div className="px-4 pb-3 space-y-2">
              {factSheet.characters.map((c, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 transition-opacity ${c.excluded ? "opacity-30" : ""} ${editable ? "cursor-pointer" : ""}`}
                  onClick={editable ? () => toggleCharExcluded(i) : undefined}
                >
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 ${PRIORITY_BADGE[c.priority] || PRIORITY_BADGE.background}`}>
                    {c.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] font-medium text-foreground" dir="auto">{c.canonical}</span>
                    <span className="text-[11px] text-muted-foreground ml-1.5" dir="auto">— {c.role}</span>
                    {c.details && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed" dir="auto">{c.details}</p>
                    )}
                  </div>
                  {editable && (
                    <span className="shrink-0 mt-0.5">
                      {c.excluded
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                    </span>
                  )}
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
            selectedCount={factSheet.locations.filter(l => !l.excluded).length}
            open={!!openSections.locations}
            onToggle={() => toggle("locations")}
            editable={editable}
          />
          {openSections.locations && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.locations.map((l, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 transition-opacity ${l.excluded ? "opacity-30" : ""} ${editable ? "cursor-pointer" : ""}`}
                  onClick={editable ? () => toggleLocationExcluded(i) : undefined}
                >
                  {l.type && (
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full mt-0.5 shrink-0">
                      {l.type}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] text-foreground" dir="auto">{l.name}</span>
                    {l.significance && (
                      <span className="text-[10px] text-muted-foreground/70 ml-1.5" dir="auto">— {l.significance}</span>
                    )}
                  </div>
                  {editable && (
                    <span className="shrink-0 mt-0.5">
                      {l.excluded
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                    </span>
                  )}
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
            selectedCount={factSheet.timeReferences!.filter(t => !t.excluded).length}
            open={!!openSections.time}
            onToggle={() => toggle("time")}
            editable={editable}
          />
          {openSections.time && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.timeReferences!.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-[11px] transition-opacity ${t.excluded ? "opacity-30" : ""} ${editable ? "cursor-pointer" : ""}`}
                  onClick={editable ? () => toggleTimeRefExcluded(i) : undefined}
                >
                  <span className="font-mono text-primary shrink-0" dir="auto">{t.reference}</span>
                  <span className="text-muted-foreground flex-1" dir="auto">— {t.context}</span>
                  {editable && (
                    <span className="shrink-0">
                      {t.excluded
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                    </span>
                  )}
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
            selectedCount={factSheet.props!.filter(p => !p.excluded).length}
            open={!!openSections.props}
            onToggle={() => toggle("props")}
            editable={editable}
          />
          {openSections.props && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.props!.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-[11px] transition-opacity ${p.excluded ? "opacity-30" : ""} ${editable ? "cursor-pointer" : ""}`}
                  onClick={editable ? () => togglePropExcluded(i) : undefined}
                >
                  <span className="font-medium text-foreground shrink-0" dir="auto">{p.item}</span>
                  <span className="text-muted-foreground flex-1" dir="auto">— {p.significance}</span>
                  {editable && (
                    <span className="shrink-0">
                      {p.excluded
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                    </span>
                  )}
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
      {Object.entries(factsByCategory).map(([cat, facts]) => {
        const sorted = [...facts].sort((a, b) => b.importance - a.importance);
        const selectedInCat = sorted.filter(f => !f.excluded).length;
        return (
          <div key={cat} className="border-b border-border last:border-b-0">
            <SectionHeader
              icon={List}
              label={CATEGORY_LABELS[cat] || cat}
              count={facts.length}
              selectedCount={selectedInCat}
              open={openSections[`facts_${cat}`] !== false}
              onToggle={() => toggle(`facts_${cat}`)}
              editable={editable}
            />
            {(openSections[`facts_${cat}`] !== false) && (
              <div className="px-4 pb-3 space-y-1.5">
                {sorted.map((f) => {
                  const globalIdx = factSheet.facts.indexOf(f);
                  return (
                    <div
                      key={globalIdx}
                      className={`flex items-start gap-2 group transition-opacity ${f.excluded ? "opacity-30" : ""}`}
                    >
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full mt-0.5 shrink-0 border ${CATEGORY_COLORS[cat] || "bg-muted text-muted-foreground border-border"}`}>
                        {f.importance}
                      </span>
                      <span
                        className={`text-[11px] leading-relaxed flex-1 ${editable ? "cursor-pointer" : ""} ${f.excluded ? "line-through text-muted-foreground" : "text-foreground"}`}
                        dir="auto"
                        onClick={editable ? () => toggleFactExcluded(globalIdx) : undefined}
                      >
                        {f.fact}
                      </span>
                      {editable && (
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFactPinned(globalIdx); }}
                            className="p-0.5"
                            title={f.pinned ? "Unpin" : "Pin as must-keep"}
                          >
                            <Star className={`w-3.5 h-3.5 transition-colors ${f.pinned ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-400/60"}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFactExcluded(globalIdx); }}
                            className="p-0.5"
                            title={f.excluded ? "Include" : "Exclude"}
                          >
                            {f.excluded
                              ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-foreground" />
                              : <Eye className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-foreground" />}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Timeline (collapsed by default) */}
      {factSheet.timeline.length > 0 && (
        <div>
          <SectionHeader
            icon={Clock}
            label="Timeline"
            count={factSheet.timeline.length}
            selectedCount={factSheet.timeline.filter(t => !t.excluded).length}
            open={!!openSections.timeline}
            onToggle={() => toggle("timeline")}
            editable={editable}
          />
          {openSections.timeline && (
            <div className="px-4 pb-3 space-y-1.5">
              {factSheet.timeline.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-[11px] transition-opacity ${t.excluded ? "opacity-30" : ""} ${editable ? "cursor-pointer" : ""}`}
                  onClick={editable ? () => toggleTimelineExcluded(i) : undefined}
                >
                  <span className="font-mono text-muted-foreground shrink-0 w-5 text-right">{t.order + 1}.</span>
                  {t.date && <span className="font-mono text-primary shrink-0">[{t.date}]</span>}
                  <span className={`leading-relaxed flex-1 ${t.excluded ? "line-through text-muted-foreground" : "text-foreground"}`} dir="auto">{t.event}</span>
                  {t.weight && t.weight !== "normal" && (
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted/50 px-1 rounded shrink-0">{t.weight}</span>
                  )}
                  {editable && (
                    <span className="shrink-0">
                      {t.excluded
                        ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                    </span>
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
