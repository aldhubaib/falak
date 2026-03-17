import type { TiptapContentValue } from "@/data/editorInitialValue";
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
  scriptDuration?: number;
  scriptRaw?: string;
  /** Tiptap editor content for script (Scripting / Filmed / Publish / Done). */
  scriptTiptap?: TiptapContentValue;
  channelId?: string;
  youtubeTags?: string[];
  subtitlesSRT?: string;
  youtubeUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  gapWin?: boolean;
  producedFormats?: ("short" | "long")[];
  /** Video format: "short" for YouTube Shorts, "long" for regular videos. Set at Scripting stage. */
  videoFormat?: "short" | "long";
  /** AI-generated YouTube description for the Publish stage. */
  youtubeDescription?: string;
  /** Publish visibility: public, unlisted, private, or scheduled. */
  visibility?: "public" | "unlisted" | "private";
}
