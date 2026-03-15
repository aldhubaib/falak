import type { ApiStory, Stage } from "@/pages/Stories";

export type { ApiStory, Stage };

export interface ApiChannel {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  handle: string;
  avatarUrl: string | null;
  type: string;
}

export interface StoryWithLog extends ApiStory {
  log: {
    id: string;
    action: string;
    note: string | null;
    createdAt: string;
    user: { name: string | null; avatarUrl: string | null } | null;
  }[];
}

/** Brief JSON shape stored in DB */
export interface StoryBrief {
  suggestedTitle?: string;
  summary?: string;
  articleTitle?: string;
  articleContent?: string;
  openingHook?: string;
  hookStart?: string;
  hookEnd?: string;
  script?: string;
  scriptFormat?: "short" | "long";
  scriptRaw?: string;
  channelId?: string;
  youtubeTags?: string[];
  youtubeUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  gapWin?: boolean;
  producedFormats?: ("short" | "long")[];
}
