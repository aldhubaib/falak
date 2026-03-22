import { useState, useEffect, useCallback } from "react";
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
  Languages,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import type { StoryResearch, ResearchBrief, ResearchImage } from "./types";

export interface StoryDetailResearchProps {
  research: StoryResearch | undefined | null;
  researchOpen?: boolean;
  onResearchOpenChange?: (open: boolean) => void;
  storyId?: string;
  onDataRefresh?: () => void;
}

function downloadImageFile(src: string, index: number) {
  return fetch(src, { mode: "cors" })
    .then((res) => res.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = blob.type.includes("png")
        ? ".png"
        : blob.type.includes("webp")
          ? ".webp"
          : ".jpg";
      a.download = `research-image-${index + 1}${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(src, "_blank"));
}

/* ── Carousel / Lightbox ── */

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

  const goPrev = useCallback(
    () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1)),
    [images.length],
  );
  const goNext = useCallback(
    () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0)),
    [images.length],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goNext();
      else if (e.key === "ArrowRight") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full mx-4 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="w-full flex items-center justify-between mb-4 px-1">
          <span className="text-white/50 text-[13px] font-mono tabular-nums">
            {idx + 1} / {images.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadImageFile(src, idx)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              تحميل
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image + navigation arrows */}
        <div className="relative w-full flex items-center justify-center">
          {images.length > 1 && (
            <button
              onClick={goPrev}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <img
            src={src}
            alt={img?.title || ""}
            className="max-w-full max-h-[78vh] object-contain rounded-xl"
          />

          {images.length > 1 && (
            <button
              onClick={goNext}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all backdrop-blur-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Caption */}
        {(img?.title || img?.source) && (
          <div className="mt-4 text-center max-w-xl">
            {img?.title && (
              <p className="text-white/70 text-[13px] leading-relaxed" dir="auto">
                {img.title}
              </p>
            )}
            {img?.source && (
              <p className="text-white/40 text-[11px] font-mono mt-1">{img.source}</p>
            )}
          </div>
        )}

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="flex items-center gap-1.5 mt-5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === idx ? "bg-white scale-125" : "bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Collage Grid ── */

function ImageCollageGrid({
  images,
  onImageClick,
}: {
  images: ResearchImage[];
  onImageClick: (index: number) => void;
}) {
  const MAX_VISIBLE = 5;
  const visible = images.slice(0, MAX_VISIBLE);
  const remaining = images.length - MAX_VISIBLE;

  const getSrc = (img: ResearchImage) => img.thumbnail || img.original || "";

  const renderCell = (
    img: ResearchImage,
    index: number,
    className: string,
    isOverlayTarget = false,
  ) => (
    <button
      key={index}
      type="button"
      onClick={() => onImageClick(index)}
      className={`group relative overflow-hidden bg-black/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <img
        src={getSrc(img)}
        alt={img.title || `صورة ${index + 1}`}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute bottom-0 inset-x-0 p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {img.title && (
              <p className="text-white text-[11px] font-medium line-clamp-1 drop-shadow-sm">
                {img.title}
              </p>
            )}
            {img.source && (
              <p className="text-white/60 text-[10px] font-mono mt-0.5">{img.source}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                const s = getSrc(img);
                if (s) downloadImageFile(s, index);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  const s = getSrc(img);
                  if (s) downloadImageFile(s, index);
                }
              }}
              className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors backdrop-blur-sm"
            >
              <Download className="w-3 h-3" />
            </span>
            <span className="p-1.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              <ZoomIn className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* "+N" remaining overlay */}
      {isOverlayTarget && remaining > 0 && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <span className="text-white text-4xl font-bold drop-shadow-lg">
            +{remaining}
          </span>
        </div>
      )}
    </button>
  );

  if (visible.length === 1) {
    return (
      <div className="rounded-xl overflow-hidden border border-border/60">
        {renderCell(visible[0], 0, "w-full aspect-video")}
      </div>
    );
  }

  if (visible.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-border/60 h-[220px] max-sm:h-[160px]">
        {renderCell(visible[0], 0, "")}
        {renderCell(visible[1], 1, "")}
      </div>
    );
  }

  if (visible.length === 3) {
    return (
      <div className="grid grid-cols-[1.2fr_1fr] gap-1 rounded-xl overflow-hidden border border-border/60 h-[280px] max-sm:h-[200px]">
        {renderCell(visible[0], 0, "row-span-2")}
        <div className="grid grid-rows-2 gap-1">
          {renderCell(visible[1], 1, "")}
          {renderCell(visible[2], 2, "", true)}
        </div>
      </div>
    );
  }

  if (visible.length === 4) {
    return (
      <div className="grid grid-cols-[1.2fr_1fr] gap-1 rounded-xl overflow-hidden border border-border/60 h-[300px] max-sm:h-[220px]">
        {renderCell(visible[0], 0, "row-span-2")}
        <div className="grid grid-rows-2 gap-1">
          {renderCell(visible[1], 1, "")}
          <div className="grid grid-cols-2 gap-1">
            {renderCell(visible[2], 2, "")}
            {renderCell(visible[3], 3, "", true)}
          </div>
        </div>
      </div>
    );
  }

  // 5+ images
  return (
    <div className="grid grid-cols-[1.2fr_1fr] gap-1 rounded-xl overflow-hidden border border-border/60 h-[320px] max-sm:h-[240px]">
      {renderCell(visible[0], 0, "row-span-2")}
      <div className="grid grid-rows-2 gap-1">
        <div className="grid grid-cols-2 gap-1">
          {renderCell(visible[1], 1, "")}
          {renderCell(visible[2], 2, "")}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {renderCell(visible[3], 3, "")}
          {renderCell(visible[4], 4, "", true)}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export function StoryDetailResearch({
  research,
  researchOpen: controlledOpen,
  onResearchOpenChange,
  storyId,
  onDataRefresh,
}: StoryDetailResearchProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onResearchOpenChange ?? setInternalOpen;
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [retranslating, setRetranslating] = useState(false);

  const brief: ResearchBrief | undefined = research?.briefAr ?? research?.brief;
  const images = research?.images;
  const isShowingEnglish = !research?.briefAr && !!research?.brief;

  const handleRetranslate = async () => {
    if (!storyId || retranslating) return;
    setRetranslating(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/retranslate-research`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Translation failed");
      }
      onDataRefresh?.();
    } catch (e: unknown) {
      console.error("Retranslate failed:", e);
    } finally {
      setRetranslating(false);
    }
  };

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
            {new Date(research.researchedAt).toLocaleDateString("en-US")}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-6 max-sm:px-4 pb-8" dir="rtl">
          {isShowingEnglish && storyId && (
            <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg bg-orange/5 border border-orange/20">
              <span className="text-[12px] text-orange">البحث معروض بالإنجليزية — اضغط لترجمته للعربية</span>
              <button
                type="button"
                onClick={handleRetranslate}
                disabled={retranslating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange/10 hover:bg-orange/20 text-orange text-[11px] font-semibold transition-colors disabled:opacity-50"
              >
                {retranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                {retranslating ? "جاري الترجمة..." : "ترجمة"}
              </button>
            </div>
          )}
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

            {/* ── Research Images (collage, right after hook) ── */}
            {images && images.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider">
                    صور البحث ({images.length})
                  </h2>
                </div>
                <ImageCollageGrid
                  images={images}
                  onImageClick={(i) => setLightboxIdx(i)}
                />
              </section>
            )}

            {/* ── Core Narrative ── */}
            {(brief?.whatHappened ||
              brief?.howItHappened ||
              brief?.whatWasTheResult) && (
              <section className="space-y-5">
                <h2 className="text-[11px] font-mono text-muted-foreground tracking-wider border-b border-border/60 pb-2">
                  السرد الأساسي
                </h2>

                {brief?.whatHappened && (
                  <div>
                    <h3 className="text-[12px] font-bold text-primary mb-2">ماذا حدث؟</h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">
                      {brief.whatHappened}
                    </p>
                  </div>
                )}

                {brief?.howItHappened && (
                  <div>
                    <h3 className="text-[12px] font-bold text-orange mb-2">
                      كيف حدث ذلك؟
                    </h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">
                      {brief.howItHappened}
                    </p>
                  </div>
                )}

                {brief?.whatWasTheResult && (
                  <div>
                    <h3 className="text-[12px] font-bold text-success mb-2">
                      ما كانت النتيجة؟
                    </h3>
                    <p className="text-[14px] text-foreground/90 leading-[2]">
                      {brief.whatWasTheResult}
                    </p>
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
                      <p className="text-[13px] text-foreground/85 leading-[1.9] flex-1">
                        {fact}
                      </p>
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
                          <p className="text-[13px] text-foreground/85 leading-[1.8]">
                            {entry.event}
                          </p>
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
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {char.name}
                          </div>
                          {char.role && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {char.role}
                            </div>
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
                <p className="text-[13px] text-foreground/85 leading-[1.9]">
                  {brief.competitionInsight}
                </p>
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
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {ra.source}
                          </div>
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
