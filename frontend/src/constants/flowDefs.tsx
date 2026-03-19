import { LucideIcon, FileText, Brain, Search, Languages, Sparkles, Download, LayoutTemplate, CheckCircle2 } from "lucide-react";

export interface FlowDef {
  id: string;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

/** Shared flow definitions for Pipeline dashboard and Article Inspector. Eight stages. */
export const FLOW_DEFS: FlowDef[] = [
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
    color: "text-blue",
    bgColor: "bg-blue",
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
    subtitle: "Detect language → Translate content → Translate fields → Translate brief. One goal: move everything to Arabic.",
    icon: Languages,
    color: "text-blue",
    bgColor: "bg-blue",
  },
  {
    id: "score",
    name: "Score",
    subtitle: "Competition match → AI scoring → Final score. One goal: decide if we produce the story.",
    icon: Sparkles,
    color: "text-orange",
    bgColor: "bg-orange",
  },
  {
    id: "promote",
    name: "Promote",
    subtitle: "Create or link story. One action: create/link the story.",
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success",
  },
];

export function getFlowDef(flowId: string): FlowDef | undefined {
  return FLOW_DEFS.find((f) => f.id === flowId);
}
