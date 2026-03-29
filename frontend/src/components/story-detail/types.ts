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
  linkedArticleId?: string | null;
  writerId?: string | null;
  writerNotes?: string | null;
  scriptLong?: string | null;
  writer?: { id: string; name: string | null; avatarUrl: string | null } | null;
  log: {
    id: string;
    action: string;
    note: string | null;
    createdAt: string;
    user: { name: string | null; avatarUrl: string | null } | null;
  }[];
  rescoreLog?: Array<{
    at: string;
    trigger: string;
    confidence: number;
    before: { relevanceScore: number; viralScore: number; firstMoverScore: number; compositeScore: number };
    after: { relevanceScore: number; viralScore: number; firstMoverScore: number; compositeScore: number };
    factors: {
      freshness: number;
      provenViralBoost: number;
      competitionMatches: number;
      newCompetitorVideos: number;
      topCompetitor?: { channelName: string; title: string; viewCount: number; similarity: number } | null;
      ownChannelBoost: number;
      tagBoost: number;
      contentTypeBoost: number;
      regionBoost: number;
      aiViralMultiplier: number;
      adjustedFirstMover: number;
    };
  }>;
  lastRescoredAt?: string | null;
}

export interface ResearchBrief {
  whatHappened?: string;
  howItHappened?: string;
  whatWasTheResult?: string;
  keyFacts?: string[];
  timeline?: { date?: string; event?: string }[];
  mainCharacters?: { name?: string; role?: string }[];
  sources?: { title?: string; url?: string }[];
  competitionInsight?: string;
  suggestedHook?: string;
  narrativeStrength?: number;
}

export interface ResearchImage {
  thumbnail?: string | null;
  original?: string | null;
  title?: string | null;
  source?: string | null;
  link?: string | null;
}

export interface StoryResearch {
  brief?: ResearchBrief;
  briefAr?: ResearchBrief;
  relatedArticles?: { title?: string; url?: string; snippet?: string; source?: string }[];
  backgroundContext?: string;
  citations?: string[];
  researchedAt?: string;
  images?: ResearchImage[];
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
  channelId?: string;
  youtubeTags?: string[];
  subtitlesSRT?: string;
  youtubeUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  gapWin?: boolean;
  producedFormats?: ("short" | "long")[];
  videoFormat?: "short" | "long";
  youtubeDescription?: string;
  visibility?: "public" | "unlisted" | "private";
  videoR2Key?: string;
  videoR2Url?: string;
  videoFileName?: string;
  videoFileSize?: number;
  transcript?: string;
  transcriptSegments?: { text: string; start: number; end: number }[];
  research?: StoryResearch;
  videoThumbnailR2Url?: string;
  processingStatus?: "processing" | "done" | "error";
  processingStep?: "transcribing" | "generating" | "done";
  processingError?: string | null;
  suggestedPlaylist?: {
    playlistId: string;
    playlistName: string;
    hashtags: string[];
    youtubePlaylistId?: string | null;
    confidence: number;
    reason: string | null;
  };
}

export interface ScriptField {
  key: string;
  label: string;
  placeholder: string;
  type: "input" | "textarea";
}
