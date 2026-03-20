export interface Channel {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  avatarImg: string;
  type: "ours" | "competition";
  subscribers: string;
  views: string;
  videos: string;
  subscribersRaw: number;
  viewsRaw: number;
  videosRaw: number;
  lastSynced: string;
  active: boolean;
  joinedDate: string;
  country: string;
  avgViews: string;
  engRate: string;
  topCategory: string;
  growthSubs: string;
  growthViews: string;
  startHook?: string;
  endHook?: string;
}

export const PIPELINE_STEPS = ["Transcription", "Translation", "Sentiment", "Topics", "Comments", "Viral Score"] as const;
export type PipelineStepName = typeof PIPELINE_STEPS[number];
export type PipelineStepStatus = "done" | "failed" | "running" | "waiting";

export interface PipelineStep {
  name: PipelineStepName;
  status: PipelineStepStatus;
  time?: string;
  retries?: number;
}

export interface Video {
  id: string;
  channelId: string;
  title: string;
  type: "video" | "short";
  views: string;
  likes: string;
  comments: string;
  date: string;
  duration: string;
  status: "done" | "failed" | "pending" | "analyzing";
  viewsRaw: number;
  likesRaw: number;
  commentsRaw: number;
  thumbnail?: string;
  youtubeId?: string;
  pipeline: PipelineStep[];
}
