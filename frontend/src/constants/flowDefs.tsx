import { LucideIcon, FileText, Brain, Search, Languages, Sparkles, Download, LayoutTemplate, CheckCircle2, Target, ImageIcon, Youtube, Layers } from "lucide-react";

export interface FlowDef {
  id: string;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

/** Shared flow definitions for Pipeline dashboard and Article Inspector. */
export const FLOW_DEFS: FlowDef[] = [
  {
    id: "transcript",
    name: "Transcript",
    subtitle: "Fetch YouTube video transcript via API. YouTube-sourced articles start here.",
    icon: Youtube,
    color: "text-red-400",
    bgColor: "bg-red-400",
  },
  {
    id: "story_detect",
    name: "Story Detect",
    subtitle: "AI detects distinct stories in the transcript. May split into child articles.",
    icon: Layers,
    color: "text-red-400",
    bgColor: "bg-red-400",
  },
  {
    id: "imported",
    name: "Imported",
    subtitle: "Ingest from source. One action: get the article into the system.",
    icon: Download,
    color: "text-orange",
    bgColor: "bg-orange",
  },
  {
    id: "content",
    name: "Content",
    subtitle: "Check Apify → Firecrawl → HTML Fetch → Title+Desc (fallback). One goal: get usable article text.",
    icon: FileText,
    color: "text-primary",
    bgColor: "bg-primary",
  },
  {
    id: "classify",
    name: "Classify",
    subtitle: "Run classification (topic, tags, region, etc.). One action: understand what the article is about.",
    icon: Brain,
    color: "text-success",
    bgColor: "bg-success",
  },
  {
    id: "title_translate",
    name: "Title Translate",
    subtitle: "Lightweight Arabic translation of title + opening for scoring/niche match.",
    icon: Languages,
    color: "text-primary",
    bgColor: "bg-primary",
  },
  {
    id: "score",
    name: "Score",
    subtitle: "Competition match → AI scoring → Threshold gate. Filters low-scoring articles before expensive stages.",
    icon: Sparkles,
    color: "text-orange",
    bgColor: "bg-orange",
  },
  {
    id: "research",
    name: "Research",
    subtitle: "Decision (need research?) → Web Search → Background (Perplexity). One goal: gather external context.",
    icon: Search,
    color: "text-purple",
    bgColor: "bg-purple",
  },
  {
    id: "synthesis",
    name: "Synthesis",
    subtitle: "AI synthesis → Research complete. One goal: turn research into a structured brief (hook, narrative, facts).",
    icon: LayoutTemplate,
    color: "text-purple",
    bgColor: "bg-purple",
  },
  {
    id: "translated",
    name: "Translation",
    subtitle: "Full Arabic translation + story promotion. Only articles that passed the threshold reach here.",
    icon: Languages,
    color: "text-primary",
    bgColor: "bg-primary",
  },
  {
    id: "images",
    name: "Images",
    subtitle: "SerpAPI Google Images search. Downloads related images to the Stories gallery album.",
    icon: ImageIcon,
    color: "text-primary",
    bgColor: "bg-primary",
  },
  {
    id: "promote",
    name: "Promote",
    subtitle: "Create or link story. Happens automatically at the end of translation.",
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success",
  },
];

export function getFlowDef(flowId: string): FlowDef | undefined {
  return FLOW_DEFS.find((f) => f.id === flowId);
}
