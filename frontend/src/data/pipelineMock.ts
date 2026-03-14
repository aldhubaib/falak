export type PipelineStage = "import" | "transcribe" | "comments" | "analysis" | "failed";
export type PipelineItemStatus = "processing" | "waiting" | "queued" | "failed";

export interface PipelineItem {
  id: string;
  title: string;
  channelId: string;
  videoId?: string;
  status: PipelineItemStatus;
  statusDetail?: string;
  timeInStage?: string;
  retries: number;
  progress?: string; // e.g. "100 / 100"
  errorReason?: string;
}

export interface PipelineStageData {
  id: PipelineStage;
  number: number;
  label: string;
  subtitle: string;
  count: number;
  items: PipelineItem[];
  moreCount: number;
}

export interface PipelineStats {
  totalVideos: number;
  inPipeline: number;
  done: number;
  stages: {
    label: string;
    count: number;
    color: "orange" | "blue" | "purple" | "success" | "primary" | "destructive";
    active: number;
    remaining: number;
    eta?: string;
  }[];
  failed: { count: number; needsRetry: string; errors: string };
}

export const pipelineStats: PipelineStats = {
  totalVideos: 282,
  inPipeline: 227,
  done: 55,
  stages: [
    { label: "IMPORTED", count: 48, color: "orange", active: 3, remaining: 234, eta: "~4h 20m" },
    { label: "TRANSCRIBED", count: 62, color: "blue", active: 2, remaining: 220, eta: "~6h 10m" },
    { label: "COMMENTS", count: 71, color: "purple", active: 1, remaining: 211, eta: "~3h 45m" },
    { label: "ANALYZING", count: 38, color: "success", active: 1, remaining: 244, eta: "~8h 30m" },
  ],
  failed: { count: 8, needsRetry: "needs retry", errors: "8 errors" },
};

export const pipelineStages: PipelineStageData[] = [
  {
    id: "import",
    number: 1,
    label: "Import",
    subtitle: "YouTube metadata · API",
    count: 48,
    moreCount: 45,
    items: [
      { id: "pi1", title: "فيديو جديد في قناة بدر", channelId: "ch2", videoId: "v1", status: "processing", statusDetail: "Fetching...", timeInStage: "18m 23s", retries: 1 },
      { id: "pi2", title: "رحلة الجبال الشمالية", channelId: "ch2", videoId: "v3", status: "queued", timeInStage: "20m 10s", retries: 1 },
      { id: "pi3", title: "تجربة الطبيخ السعودي", channelId: "ch6", videoId: "v5", status: "queued", timeInStage: "20m 47s", retries: 1 },
    ],
  },
  {
    id: "transcribe",
    number: 2,
    label: "Transcribe",
    subtitle: "youtube-transcript.io",
    count: 62,
    moreCount: 59,
    items: [
      { id: "pt1", title: "أسرار قرية الأشباح", channelId: "ch2", videoId: "v2", status: "processing", statusDetail: "Processing...", timeInStage: "17m 16s", retries: 1 },
      { id: "pt2", title: "مغامرة في الصحراء", channelId: "ch2", videoId: "v4", status: "processing", statusDetail: "Processing...", timeInStage: "20m 01s", retries: 2 },
      { id: "pt3", title: "ليلة في الوادي المجهول", channelId: "ch3", videoId: "v7", status: "waiting", timeInStage: "34m 49s", retries: 3 },
    ],
  },
  {
    id: "comments",
    number: 3,
    label: "Comments",
    subtitle: "Top 100 · YouTube API",
    count: 71,
    moreCount: 68,
    items: [
      { id: "pc1", title: "استكشاف القلعة التاريخية", channelId: "ch2", videoId: "v1", status: "processing", timeInStage: "16m 53s", retries: 1 },
      { id: "pc2", title: "رحلة إلى الشمال", channelId: "ch5", videoId: "v3", status: "waiting", timeInStage: "22m 20s", retries: 1 },
      { id: "pc3", title: "تحدي الطبخ في البر", channelId: "ch6", videoId: "v6", status: "waiting", timeInStage: "38m 14s", retries: 2 },
    ],
  },
  {
    id: "analysis",
    number: 4,
    label: "AI Analysis",
    subtitle: "Haiku · Sonnet",
    count: 38,
    moreCount: 36,
    items: [
      { id: "pa1", title: "رحلة إلى قرية الأشباح", channelId: "ch2", videoId: "v2", status: "processing", statusDetail: "Part B · Sonnet", timeInStage: "21m 38s", retries: 2 },
      { id: "pa2", title: "اغرب مكان زرته", channelId: "ch2", videoId: "v8", status: "waiting", timeInStage: "25m 27s", retries: 1 },
    ],
  },
  {
    id: "failed",
    number: 0,
    label: "Failed",
    subtitle: "Transcript unavailable (5) · API quota (2) · Timeout (1)",
    count: 8,
    moreCount: 5,
    items: [
      { id: "pf1", title: "تحدي البقاء في المنزل المسكون", channelId: "ch2", videoId: "v4", status: "failed", errorReason: "API quota exceeded", timeInStage: "2h 14m", retries: 3 },
      { id: "pf2", title: "صوت غريب في المنطقة المهجورة", channelId: "ch2", videoId: "v6", status: "failed", errorReason: "Transcript unavailable", timeInStage: "45m", retries: 3 },
      { id: "pf3", title: "رحلة إلى الجزيرة الغامضة", channelId: "ch2", videoId: "v7", status: "failed", errorReason: "Transcript unavailable", timeInStage: "1h 02m", retries: 2 },
    ],
  },
];
