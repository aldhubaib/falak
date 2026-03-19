import { LucideIcon, FileText, Brain, Search, Languages, Sparkles } from "lucide-react";

export interface FlowDef {
  id: string;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

/** Shared mother-flow definitions for Pipeline dashboard and Article Inspector. */
export const FLOW_DEFS: FlowDef[] = [
  {
    id: "content",
    name: "Content Flow",
    subtitle: "How articles get their text",
    icon: FileText,
    color: "text-blue",
    bgColor: "bg-blue",
  },
  {
    id: "classify",
    name: "Classification",
    subtitle: "AI analysis in the original language",
    icon: Brain,
    color: "text-success",
    bgColor: "bg-success",
  },
  {
    id: "research",
    name: "Research Flow",
    subtitle: "Web search and enrichment",
    icon: Search,
    color: "text-purple",
    bgColor: "bg-purple",
  },
  {
    id: "translated",
    name: "Translation",
    subtitle: "Language detection and Arabic translation",
    icon: Languages,
    color: "text-blue",
    bgColor: "bg-blue",
  },
  {
    id: "scoring",
    name: "Score and Promotion",
    subtitle: "Arabic AI analysis and final decision",
    icon: Sparkles,
    color: "text-orange",
    bgColor: "bg-orange",
  },
];

export function getFlowDef(flowId: string): FlowDef | undefined {
  return FLOW_DEFS.find((f) => f.id === flowId);
}
