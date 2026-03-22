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
  Download,
  BookOpen,
  X,
} from "lucide-react";
import type { StoryResearch, ResearchBrief, ResearchImage } from "./types";

export interface StoryDetailResearchProps {
  research: StoryResearch | undefined | null;
  researchOpen?: boolean;
  onResearchOpenChange?: (open: boolean) => void;
}

function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ResearchImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const img = images[idx];
  const src = img?.original || img?.thumbnail || "";

  const downloadImage = async () => {
    if (!src) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = blob.type.includes("png") ? ".png" : blob.type.includes("webp") ? ".webp" : ".jpg";
      a.download = `research-image-${idx + 1}${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(src, "_blank");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/70 text-[12px] font-mono">
            {idx + 1} / {images.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[12px] font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              تحميل
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <img
          src={src}
          alt={img?.title || ""}
          className="w-full max-h-[75vh] object-contain rounded-lg"
        />

        {img?.title && (
          <p className="text-white/60 text-[12px] text-center mt-3" dir="auto">{img.title}</p>
        )}

        {images.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setIdx((i) => (i > 0 ? i - 1 : images.length - 1))}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition-colors"
            >
              ←
            </button>
            <button
              onClick={() => setIdx((i) => (i < images.length - 1 ? i + 1 : 0))}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryDetailResearch({
  research,
  researchOpen: controlledOpen,
  onResearchOpenChange,
}: StoryDetailResearchProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onResearchOpenChange ?? setInternalOpen;
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const brief: ResearchBrief | undefined = research?.briefAr ?? research?.brief;
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

  const downloadSingleImage = async (img: ResearchImage, index: number) => {
    const src = img.original || img.thumbnail;
    if (!src) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = blob.type.includes("png") ? ".png" : blob.type.includes("webp") ? ".webp" : ".jpg";
      a.download = `research-image-${index + 1}${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(src, "_blank");
    }
  };

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="w-full px-6 max-sm:px-4 py-4 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-[13px] text-primary font-semibold">ملخص البحث</span>
          {brief?.narrativeStrength != null && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              قوة السرد {brief.narrativeStrength}/10
            </span>
          )}
        </div>
        {research.researchedAt && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {new Date(research.researchedAt).toLocaleDateString("ar-SA")}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-6 max-sm:px-4 pb-8" dir="rtl">
          <article className="max-w-none space-y-8">

            {/* ── Hook ── */}
            {brief?.suggestedHook && (
              <div className="relative py-6 px-5 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/15">
                <Sparkles className="absolute top-4 left-4 w-5 h-5 text-primary/40" />
                <p className="text-[16px] sm:text-[18px] font-semibold text-foreground leading-[1.9] pr-1">
                  &ldquo;{brief.suggestedHook}&rdquo;
                </p>
                <span className="block mt-2 text-[11px] font-mono text-primary/60 tracking-wider">
                  فكرة الفيديو المقترحة
                </span>
              </div>
            )}

            {/* ── Core Narrative ── */}
            {(brief?.whatHappened || brief?.howItHappened || brief?.whatWasTheResult) && (
              <section className="space-y-5">
                <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider border-b border-border/60 pb-2">
                  السرد الأساسي
                </h2>

                {brief?.whatHappened && (
                  <div>
                    <h3 className="text-[12px] font-bold text-primary mb-2">ماذا حدث؟</h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">{brief.whatHappened}</p>
                  </div>
                )}

                {brief?.howItHappened && (
                  <div>
                    <h3 className="text-[12px] font-bold text-orange mb-2">كيف حدث ذلك؟</h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">{brief.howItHappened}</p>
                  </div>
                )}

                {brief?.whatWasTheResult && (
                  <div>
                    <h3 className="text-[12px] font-bold text-success mb-2">ما كانت النتيجة؟</h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">{brief.whatWasTheResult}</p>
                  </div>
                )}
              </section>
            )}

            {/* ── Key Facts ── */}
            {brief?.keyFacts && brief.keyFacts.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ListOrdered className="w-4 h-4 text-purple-400" />
                  <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider">
                    الحقائق الرئيسية
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {brief.keyFacts.map((fact, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-4 py-3 rounded-lg bg-background/50 border border-border/60"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 text-[11px] font-bold font-mono shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-[13px] text-foreground/85 leading-[1.9] flex-1">{fact}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Timeline ── */}
            {brief?.timeline && brief.timeline.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider">
                    التسلسل الزمني
                  </h2>
                </div>
                <div className="relative pr-4">
                  <div className="absolute top-0 bottom-0 right-0 w-px bg-border/60" />
                  <div className="space-y-4">
                    {brief.timeline.map((entry, i) => (
                      <div key={i} className="relative flex items-start gap-4">
                        <div className="absolute right-[-7px] top-2 w-3.5 h-3.5 rounded-full bg-primary/20 border-2 border-primary/50" />
                        <div className="flex-1 mr-4">
                          {entry.date && (
                            <span className="text-[11px] font-mono text-primary font-semibold block mb-1">
                              {entry.date}
                            </span>
                          )}
                          <p className="text-[13px] text-foreground/85 leading-[1.8]">{entry.event}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Key People ── */}
            {brief?.mainCharacters && brief.mainCharacters.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider">
                    الشخصيات الرئيسية
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  {brief.mainCharacters.map((char, i) => (
                    <div
                      key={i}
                      className="px-4 py-3 rounded-lg bg-background/50 border border-border/60"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary shrink-0">
                          {(char.name || "?")[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-foreground truncate">{char.name}</div>
                          {char.role && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{char.role}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Competition Insight ── */}
            {brief?.competitionInsight && (
              <section className="rounded-xl bg-orange/5 border border-orange/15 px-5 py-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Lightbulb className="w-4 h-4 text-orange" />
                  <h2 className="text-[11px] font-mono text-orange tracking-wider">
                    تحليل المنافسة
                  </h2>
                </div>
                <p className="text-[13px] text-foreground/85 leading-[1.9]">{brief.competitionInsight}</p>
              </section>
            )}

            {/* ── Research Images ── */}
            {images && images.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider">
                      صور البحث ({images.length})
                    </h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="group relative rounded-lg border border-border/60 overflow-hidden bg-background/50"
                    >
                      {(img.thumbnail || img.original) && (
                        <button
                          type="button"
                          onClick={() => setLightboxIdx(i)}
                          className="block w-full aspect-video bg-black/5 overflow-hidden cursor-pointer"
                        >
                          <img
                            src={img.thumbnail || img.original!}
                            alt={img.title || `صورة ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </button>
                      )}
                      <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {img.title && (
                            <div className="text-[11px] text-foreground font-medium line-clamp-1">{img.title}</div>
                          )}
                          {img.source && (
                            <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{img.source}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadSingleImage(img, i)}
                          className="shrink-0 p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="تحميل الصورة"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Sources ── */}
            {research.relatedArticles && research.relatedArticles.length > 0 && (
              <section>
                <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider mb-3 border-t border-border/40 pt-5">
                  المصادر
                </h2>
                <div className="space-y-1.5">
                  {research.relatedArticles.map((ra, i) => (
                    <a
                      key={i}
                      href={ra.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-background/50 transition-colors group"
                      dir="ltr"
                    >
                      <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-foreground/80 truncate group-hover:text-primary transition-colors">
                          {ra.title || ra.url}
                        </div>
                        {ra.source && (
                          <div className="text-[10px] font-mono text-muted-foreground">{ra.source}</div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </article>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && images && images.length > 0 && (
        <ImageLightbox
          images={images}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
