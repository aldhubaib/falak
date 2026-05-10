import { useMemo, useState } from "react";
import {
  Film, Check, ChevronDown, ChevronUp,
  Sparkles, BookOpen, Loader2, List,
} from "lucide-react";
import type { StoryBrief } from "./types";

type FactSheet = NonNullable<StoryBrief["factSheet"]>;

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
    const totalFacts = scenes.reduce((sum, s) => sum + (s.factIndices?.length || 0), 0);
    const includedFacts = included.reduce((sum, s) => sum + (s.factIndices?.length || 0), 0);
    return { included: included.length, total: scenes.length, includedFacts, totalFacts };
  }, [scenes]);

  const toggleScene = (sceneId: string) => {
    onChange({
      ...factSheet,
      scenes: scenes.map(s =>
        s.id === sceneId ? { ...s, excluded: !s.excluded } : s
      ),
    });
  };

  const selectAll = () => onChange({ ...factSheet, scenes: scenes.map(s => ({ ...s, excluded: false })) });
  const selectNone = () => onChange({ ...factSheet, scenes: scenes.map(s => ({ ...s, excluded: true })) });

  if (scenes.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-primary" />
            <span className="text-[12px] font-semibold text-foreground">Story Scenes</span>
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {stats.included}/{stats.total}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <button type="button" onClick={selectAll} className="text-muted-foreground hover:text-foreground transition-colors">
              Select all
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button type="button" onClick={selectNone} className="text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          </div>
        </div>

        {/* Scene cards */}
        <div className="divide-y divide-border">
          {scenes.map((scene, idx) => {
            const isExpanded = expandedScene === scene.id;
            const textPreview = scene.originalText?.slice(0, 120) || "";
            const hasMore = (scene.originalText?.length || 0) > 120;
            const factCount = scene.factIndices?.length || 0;

            return (
              <div
                key={scene.id}
                className={`transition-all ${scene.excluded ? "opacity-40" : ""}`}
              >
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => toggleScene(scene.id)}
                >
                  {/* Checkbox */}
                  <div
                    className={`mt-1 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                      scene.excluded
                        ? "border-border bg-muted/50"
                        : "border-primary bg-primary text-primary-foreground"
                    }`}
                  >
                    {!scene.excluded && <Check className="w-3 h-3" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{idx + 1}</span>
                      <span className="text-[12px] font-semibold text-foreground" dir="auto">
                        {scene.title}
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto shrink-0 flex items-center gap-1">
                        <List className="w-2.5 h-2.5" />
                        {factCount}
                      </span>
                    </div>

                    {/* Original text preview */}
                    <p
                      className={`text-[11px] leading-relaxed ${isExpanded ? "" : "line-clamp-2"} ${scene.excluded ? "text-muted-foreground/60" : "text-muted-foreground"}`}
                      dir="auto"
                    >
                      {isExpanded ? scene.originalText : textPreview}{!isExpanded && hasMore ? "…" : ""}
                    </p>
                  </div>

                  {/* Expand */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedScene(isExpanded ? null : scene.id);
                    }}
                    className="shrink-0 mt-1 p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                  >
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate bar */}
      <div className="flex items-center gap-2">
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
          {generating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5" />}
          Generate — {stats.included} scenes · {stats.includedFacts} facts
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
          title="Generate from ALL scenes"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Full
        </button>
      </div>
    </div>
  );
}
