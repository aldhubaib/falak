import { useMemo } from "react";
import {
  Film, Check, X, Users, MapPin, List, ChevronDown, ChevronUp,
  Sparkles, BookOpen, Loader2,
} from "lucide-react";
import { useState } from "react";
import type { StoryBrief } from "./types";

type FactSheet = NonNullable<StoryBrief["factSheet"]>;
type Scene = NonNullable<FactSheet["scenes"]>[number];

interface SceneSelectorProps {
  factSheet: FactSheet;
  onChange: (updated: FactSheet) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: (mode: "curated" | "full") => void;
}

export function SceneSelector({ factSheet, onChange, canGenerate, generating, onGenerate }: SceneSelectorProps) {
  const scenes = factSheet.scenes || [];
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  const stats = useMemo(() => {
    const included = scenes.filter(s => !s.excluded);
    const excluded = scenes.filter(s => s.excluded);
    const includedFactCount = included.reduce((sum, s) => sum + (s.factIndices?.length || 0), 0);
    const totalFactCount = scenes.reduce((sum, s) => sum + (s.factIndices?.length || 0), 0);
    return { included: included.length, excluded: excluded.length, total: scenes.length, includedFactCount, totalFactCount };
  }, [scenes]);

  const toggleScene = (sceneId: string) => {
    const updated = {
      ...factSheet,
      scenes: scenes.map(s =>
        s.id === sceneId ? { ...s, excluded: !s.excluded } : s
      ),
    };
    onChange(updated);
  };

  const selectAll = () => {
    onChange({ ...factSheet, scenes: scenes.map(s => ({ ...s, excluded: false })) });
  };

  const selectNone = () => {
    onChange({ ...factSheet, scenes: scenes.map(s => ({ ...s, excluded: true })) });
  };

  if (scenes.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Scene list */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-primary" />
            <span className="text-[12px] font-semibold text-foreground">Story Scenes</span>
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {stats.included}/{stats.total} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Select all
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button
              type="button"
              onClick={selectNone}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {scenes.map((scene, idx) => {
            const isExpanded = expandedScene === scene.id;
            const sceneFacts = (scene.factIndices || [])
              .map(i => factSheet.facts[i])
              .filter(Boolean);
            const sceneTimeline = (scene.timelineIndices || [])
              .map(i => factSheet.timeline[i])
              .filter(Boolean);

            return (
              <div
                key={scene.id}
                className={`transition-colors ${scene.excluded ? "bg-muted/10" : "bg-card"}`}
              >
                {/* Scene header — click to toggle */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleScene(scene.id)}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                      scene.excluded
                        ? "border-border bg-muted/50 text-muted-foreground/30"
                        : "border-primary bg-primary text-primary-foreground"
                    }`}
                  >
                    {!scene.excluded && <Check className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{idx + 1}</span>
                      <span
                        className={`text-[13px] font-medium leading-snug ${scene.excluded ? "text-muted-foreground line-through" : "text-foreground"}`}
                        dir="auto"
                      >
                        {scene.title}
                      </span>
                    </div>
                    <p
                      className={`text-[11px] mt-0.5 leading-relaxed ${scene.excluded ? "text-muted-foreground/40" : "text-muted-foreground"}`}
                      dir="auto"
                    >
                      {scene.summary}
                    </p>

                    {/* Compact metadata */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {sceneFacts.length > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                          <List className="w-2.5 h-2.5" />
                          {sceneFacts.length} facts
                        </span>
                      )}
                      {(scene.characterNames?.length || 0) > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                          <Users className="w-2.5 h-2.5" />
                          {scene.characterNames.join("، ")}
                        </span>
                      )}
                      {(scene.locationNames?.length || 0) > 0 && (
                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                          <MapPin className="w-2.5 h-2.5" />
                          {scene.locationNames.join("، ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand/collapse */}
                  <button
                    type="button"
                    onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
                    className="shrink-0 mt-0.5 p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Expanded: show facts in this scene */}
                {isExpanded && (
                  <div className="px-4 pb-3 pl-12">
                    {sceneFacts.length > 0 && (
                      <div className="space-y-1 mb-2">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Facts</span>
                        {sceneFacts.map((f, i) => (
                          <div key={i} className="text-[10px] text-foreground/70 flex items-start gap-1.5" dir="auto">
                            <span className="text-muted-foreground/40 shrink-0">•</span>
                            <span>{f.fact}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {sceneTimeline.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Timeline</span>
                        {sceneTimeline.map((t, i) => (
                          <div key={i} className="text-[10px] text-foreground/70 flex items-start gap-1.5" dir="auto">
                            <span className="text-muted-foreground/40 shrink-0">{t.order + 1}.</span>
                            <span>{t.event}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate buttons */}
      <div className="rounded-lg bg-card border-2 border-primary/20 overflow-hidden">
        <div className="px-4 py-3 bg-primary/5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {stats.included} scenes selected — {stats.includedFactCount} facts
          </span>
        </div>
        <div className="px-4 py-3 bg-primary/5 border-t border-primary/10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerate("curated")}
            disabled={!canGenerate || generating || stats.included === 0}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
              canGenerate && !generating && stats.included > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate from Selected Scenes
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
            title="Generate from ALL scenes (ignore selections)"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Full
          </button>
        </div>
      </div>
    </div>
  );
}
