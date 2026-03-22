import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Clock,
  Users,
  ListOrdered,
  Image as ImageIcon,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { StoryResearch, ResearchBrief } from "./types";

export interface StoryDetailResearchProps {
  research: StoryResearch | undefined | null;
  researchOpen?: boolean;
  onResearchOpenChange?: (open: boolean) => void;
}

export function StoryDetailResearch({
  research,
  researchOpen: controlledOpen,
  onResearchOpenChange,
}: StoryDetailResearchProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onResearchOpenChange ?? setInternalOpen;

  const brief: ResearchBrief | undefined = research?.brief ?? research?.briefAr;
  const images = research?.images;
  const hasContent = !!(
    brief?.whatHappened ||
    brief?.howItHappened ||
    brief?.whatWasTheResult ||
    (brief?.keyFacts && brief.keyFacts.length > 0) ||
    (brief?.timeline && brief.timeline.length > 0) ||
    (brief?.mainCharacters && brief.mainCharacters.length > 0) ||
    brief?.suggestedHook ||
    (images && images.length > 0)
  );

  if (!research || !hasContent) return null;

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="w-full px-5 max-sm:px-3 py-3.5 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-[12px] text-primary font-semibold">Research Findings</span>
          {brief?.narrativeStrength != null && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {brief.narrativeStrength}/10
            </span>
          )}
        </div>
        {research.researchedAt && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {new Date(research.researchedAt).toLocaleDateString()}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-5 max-sm:px-3 pb-5 space-y-4">
          {/* Suggested Hook */}
          {brief?.suggestedHook && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Video Hook</span>
              </div>
              <p className="text-[14px] text-foreground font-medium leading-relaxed" dir="auto">
                &ldquo;{brief.suggestedHook}&rdquo;
              </p>
            </div>
          )}

          {/* Core Narrative */}
          {(brief?.whatHappened || brief?.howItHappened || brief?.whatWasTheResult) && (
            <div className="space-y-3">
              {brief?.whatHappened && (
                <div>
                  <div className="text-[10px] font-mono text-primary uppercase tracking-wider mb-1.5">What happened?</div>
                  <p className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.whatHappened}</p>
                </div>
              )}
              {brief?.howItHappened && (
                <div>
                  <div className="text-[10px] font-mono text-orange uppercase tracking-wider mb-1.5">How did it happen?</div>
                  <p className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.howItHappened}</p>
                </div>
              )}
              {brief?.whatWasTheResult && (
                <div>
                  <div className="text-[10px] font-mono text-success uppercase tracking-wider mb-1.5">What was the result?</div>
                  <p className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.whatWasTheResult}</p>
                </div>
              )}
            </div>
          )}

          {/* Key Facts */}
          {brief?.keyFacts && brief.keyFacts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ListOrdered className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Key Facts</span>
              </div>
              <div className="space-y-1.5">
                {brief.keyFacts.map((fact, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-card/50 border border-border">
                    <span className="text-[10px] font-mono text-purple-400 font-bold mt-0.5 shrink-0">{i + 1}</span>
                    <span className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{fact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {brief?.timeline && brief.timeline.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Timeline</span>
              </div>
              <div className="space-y-1.5">
                {brief.timeline.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-card/50 border border-border">
                    {entry.date && (
                      <span className="text-[10px] font-mono text-primary shrink-0 mt-0.5 min-w-[60px]">{entry.date}</span>
                    )}
                    <span className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{entry.event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Characters */}
          {brief?.mainCharacters && brief.mainCharacters.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Key People</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {brief.mainCharacters.map((char, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg bg-card/50 border border-border">
                    <span className="text-[12px] text-foreground font-medium" dir="auto">{char.name}</span>
                    {char.role && (
                      <span className="text-[11px] text-muted-foreground ml-1.5" dir="auto">— {char.role}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competition Insight */}
          {brief?.competitionInsight && (
            <div className="rounded-lg bg-orange/5 border border-orange/20 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="w-3 h-3 text-orange" />
                <span className="text-[10px] font-mono text-orange uppercase tracking-wider">Competition Insight</span>
              </div>
              <p className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{brief.competitionInsight}</p>
            </div>
          )}

          {/* Research Images */}
          {images && images.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ImageIcon className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Finding Images ({images.length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                {images.map((img, i) => (
                  <a
                    key={i}
                    href={img.original || img.link || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-lg border border-border overflow-hidden bg-card/50 hover:border-primary/40 transition-colors"
                  >
                    {(img.thumbnail || img.original) && (
                      <div className="aspect-video bg-black/5 overflow-hidden">
                        <img
                          src={img.thumbnail || img.original!}
                          alt={img.title || `Image ${i + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="px-2.5 py-2 space-y-0.5">
                      {img.title && (
                        <div className="text-[11px] text-foreground font-medium line-clamp-1" dir="auto">{img.title}</div>
                      )}
                      {img.source && (
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{img.source}</div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {research.relatedArticles && research.relatedArticles.length > 0 && (
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Sources</div>
              <div className="space-y-1">
                {research.relatedArticles.map((ra, i) => (
                  <a
                    key={i}
                    href={ra.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/50 border border-border hover:border-primary/30 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-foreground truncate" dir="auto">{ra.title}</div>
                      {ra.source && (
                        <div className="text-[10px] font-mono text-muted-foreground">{ra.source}</div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
