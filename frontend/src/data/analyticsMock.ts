import avatarCh1 from "@/assets/avatars/ch1.jpg";
import avatarCh2 from "@/assets/avatars/ch2.jpg";
import avatarCh3 from "@/assets/avatars/ch3.jpg";
import avatarCh4 from "@/assets/avatars/ch4.jpg";
import avatarCh5 from "@/assets/avatars/ch5.jpg";
import avatarCh6 from "@/assets/avatars/ch6.jpg";

// Map channel names to avatar + id for linking
export const channelAvatarMap: Record<string, { avatar: string; id: string }> = {
  "SUL CASES": { avatar: avatarCh3, id: "ch3" },
  "VWAR": { avatar: avatarCh5, id: "ch5" },
  "Mannas": { avatar: avatarCh4, id: "ch4" },
  "Fares Ashour": { avatar: avatarCh1, id: "ch1" },
  "Badr Al-Alawi": { avatar: avatarCh2, id: "ch2" },
  "Your channels": { avatar: avatarCh6, id: "fun213" },
  "Walid Qasas": { avatar: avatarCh5, id: "saud" },
  "Abulsadiq": { avatar: avatarCh4, id: "funqa3e" },
  "Abu Talal": { avatar: avatarCh3, id: "ahmed" },
  "Mawtan": { avatar: avatarCh1, id: "khstudio" },
  "Fun Channel": { avatar: avatarCh6, id: "fun213" },
  "فن كوميدي": { avatar: avatarCh4, id: "funqa3e" },
  "قرية العجائب | بدر العلوي": { avatar: avatarCh2, id: "ch2" },
  "Abulsadiq - ابو الصادق": { avatar: avatarCh4, id: "funqa3e" },
  "في وار / VWAR": { avatar: avatarCh5, id: "ch5" },
  "وليد قصص": { avatar: avatarCh5, id: "saud" },
  "ابو طلال الحمراني الثانية": { avatar: avatarCh3, id: "ahmed" },
  "SUL CASES | قضايا سول": { avatar: avatarCh3, id: "ch3" },
  "منص بن سعيد": { avatar: avatarCh1, id: "ch1" },
  "موطن القصص": { avatar: avatarCh1, id: "khstudio" },
  "قناة فن الترفيه": { avatar: avatarCh6, id: "fun213" },
};

export const analyticsStats = {
  channels: { value: 11, owned: 2, competitors: 9 },
  subscribers: { value: "25.5M", yours: "67K", top: "6.6M", topLabel: "badr3 ▲" },
  totalViews: { value: "3.18B", yours: "6M", top: "992M", topLabel: "faresash ▲" },
  videosTracked: { value: "2,633", owned: 490, competitors: "2,143" },
  avgEngagement: { value: "5.00%", yours: "4.95%", top: "6.5%", topLabel: "sulp ▲" },
  uploadsPerMonth: { value: "18.4", yours: "13/mo", top: "31", topLabel: "badr3 ▲" },
};

export const fieldComparison = {
  engagementRank: { rank: 4, outOf: 11, note: "↑ Above 7 competitors" },
  subscriberRank: { rank: 11, outOf: 11, note: "→ Smallest — most room to grow" },
  yourEngagement: { value: "4.95%", marketAvg: "5.00%", note: "↑ Matching top-tier channels" },
  viewsGapVs1: { multiplier: "×99", topName: "badr3", topTotal: "864M", note: "→ Reach is the gap, not quality" },
};

export type FieldTab = "Subscribers" | "Engagement" | "Views" | "Upload rate";

export interface RankingEntry {
  rank: number;
  name: string;
  value: string;
  isYou?: boolean;
}

export const fieldRankings: Record<FieldTab, RankingEntry[]> = {
  Engagement: [
    { rank: 1, name: "SUL CASES", value: "6.59%" },
    { rank: 2, name: "VWAR", value: "5.62%" },
    { rank: 3, name: "Mannas", value: "5.59%" },
    { rank: 4, name: "Fares Ashour", value: "5.15%" },
    { rank: 5, name: "Badr Al-Alawi", value: "5.14%" },
    { rank: 6, name: "Your channels", value: "4.95%", isYou: true },
    { rank: 7, name: "Walid Qasas", value: "4.91%" },
    { rank: 8, name: "Abulsadiq", value: "4.81%" },
    { rank: 9, name: "Abu Talal", value: "3.86%" },
    { rank: 10, name: "Mawtan", value: "3.20%" },
  ],
  Subscribers: [
    { rank: 1, name: "قرية العجائب | بدر العلوي", value: "6.6M" },
    { rank: 2, name: "Abulsadiq - ابو الصادق", value: "5.8M" },
    { rank: 3, name: "Fares Ashour", value: "5.7M" },
    { rank: 4, name: "في وار / VWAR", value: "2.8M" },
    { rank: 5, name: "وليد قصص", value: "2.1M" },
    { rank: 6, name: "ابو طلال الحمراني الثانية", value: "784K" },
    { rank: 7, name: "SUL CASES | قضايا سول", value: "735K" },
    { rank: 8, name: "منص بن سعيد", value: "608K" },
    { rank: 9, name: "موطن القصص", value: "336K" },
    { rank: 10, name: "قناة فن الترفيه", value: "45K", isYou: true },
    { rank: 11, name: "فن كوميدي", value: "22K", isYou: true },
  ],
  Views: [
    { rank: 1, name: "Fares Ashour", value: "992.2M" },
    { rank: 2, name: "قرية العجائب | بدر العلوي", value: "863.7M" },
    { rank: 3, name: "Abulsadiq - ابو الصادق", value: "403.6M" },
    { rank: 4, name: "في وار / VWAR", value: "341.1M" },
    { rank: 5, name: "وليد قصص", value: "227.2M" },
    { rank: 6, name: "ابو طلال الحمراني الثانية", value: "154.4M" },
    { rank: 7, name: "SUL CASES | قضايا سول", value: "105.0M" },
    { rank: 8, name: "موطن القصص", value: "52.6M" },
    { rank: 9, name: "منص بن سعيد", value: "37.4M" },
    { rank: 10, name: "قناة فن الترفيه", value: "4.3M", isYou: true },
    { rank: 11, name: "فن كوميدي", value: "1.8M", isYou: true },
  ],
  "Upload rate": [
    { rank: 1, name: "VWAR", value: "9/mo" },
    { rank: 2, name: "Fares Ashour", value: "8/mo" },
    { rank: 3, name: "Fun Channel", value: "7/mo", isYou: true },
    { rank: 4, name: "Badr Al-Alawi", value: "5/mo" },
    { rank: 5, name: "فن كوميدي", value: "5/mo", isYou: true },
    { rank: 6, name: "SUL CASES", value: "4/mo" },
    { rank: 7, name: "Walid Qasas", value: "4/mo" },
    { rank: 8, name: "Abulsadiq", value: "3/mo" },
    { rank: 9, name: "Mannas", value: "3/mo" },
    { rank: 10, name: "Abu Talal", value: "2/mo" },
    { rank: 11, name: "Mawtan", value: "1/mo" },
  ],
};

export const benchmarkCategories = [
  {
    label: "SUBSCRIBERS",
    items: [
      { rank: 1, name: "قرية العجائب | بدر العلوي", value: "6.6M" },
      { rank: 2, name: "Abulsadiq - ابو الصادق", value: "5.8M" },
      { rank: 3, name: "Fares Ashour", value: "5.7M" },
      { rank: 4, name: "في وار / VWAR", value: "2.8M" },
      { rank: 5, name: "وليد قصص", value: "2.1M" },
      { rank: 6, name: "ابو طلال الحمراني الثانية", value: "784K" },
      { rank: 7, name: "SUL CASES | قضايا سول", value: "735K" },
      { rank: 8, name: "منص بن سعيد", value: "608K" },
      { rank: 9, name: "موطن القصص", value: "336K" },
      { rank: 10, name: "قناة فن الترفيه", value: "45K", isYou: true },
      { rank: 11, name: "فن كوميدي", value: "22K", isYou: true },
    ],
  },
  {
    label: "TOTAL VIDEO VIEWS",
    items: [
      { rank: 1, name: "Fares Ashour", value: "992.2M" },
      { rank: 2, name: "قرية العجائب | بدر العلوي", value: "863.7M" },
      { rank: 3, name: "Abulsadiq - ابو الصادق", value: "403.6M" },
      { rank: 4, name: "في وار / VWAR", value: "341.1M" },
      { rank: 5, name: "وليد قصص", value: "227.2M" },
      { rank: 6, name: "ابو طلال الحمراني الثانية", value: "154.4M" },
      { rank: 7, name: "SUL CASES | قضايا سول", value: "105.0M" },
      { rank: 8, name: "موطن القصص", value: "52.6M" },
      { rank: 9, name: "منص بن سعيد", value: "37.4M" },
      { rank: 10, name: "قناة فن الترفيه", value: "4.3M", isYou: true },
      { rank: 11, name: "فن كوميدي", value: "1.8M", isYou: true },
    ],
  },
  {
    label: "AVG ENGAGEMENT RATE",
    items: [
      { rank: 1, name: "SUL CASES | قضايا سول", value: "6.59%" },
      { rank: 2, name: "في وار / VWAR", value: "5.62%" },
      { rank: 3, name: "منص بن سعيد", value: "5.59%" },
      { rank: 4, name: "Fares Ashour", value: "5.15%" },
      { rank: 5, name: "قرية العجائب | بدر العلوي", value: "5.14%" },
      { rank: 6, name: "فن كوميدي", value: "5.10%", isYou: true },
      { rank: 7, name: "وليد قصص", value: "4.91%" },
      { rank: 8, name: "Abulsadiq - ابو الصادق", value: "4.81%" },
      { rank: 9, name: "قناة فن الترفيه", value: "4.80%", isYou: true },
      { rank: 10, name: "ابو طلال الحمراني الثانية", value: "3.86%" },
      { rank: 11, name: "موطن القصص", value: "3.20%" },
    ],
  },
];

export const topVideos = [
  { rank: 1, title: "مساجين محكومين بالإعدام ينفذون أخطر عم 6", channel: "قرية العجائب", views: "15.5M" },
  { rank: 2, title: "هروبا بعبقرية لا مثيل لها.. أضخم سرقة بن", channel: "قرية العجائب", views: "11.4M" },
  { rank: 3, title: "قناص بغداد الأسطوري (جوبا) الذي أباد 700", channel: "قرية العجائب", views: "11.3M" },
  { rank: 4, title: "اسرار خطيرة لم يكشفها أحد عن سجن صديبابا", channel: "Abulsadiq", views: "9.6M" },
  { rank: 5, title: "😁 غباء الشرطة الأمريكية مع المتسرية", channel: "موطن القصص", views: "9.3M" },
  { rank: 6, title: "نفذوا أذكى وأضخم عملية سرقة بنك في أمريك", channel: "قرية العجائب", views: "8.3M" },
  { rank: 7, title: "محاولات المخابرات تسميمه فقلب الطاولة عليه", channel: "قرية العجائب", views: "8.3M" },
  { rank: 8, title: "هروب إل تشابو الأسطوري من السجن", channel: "قرية العجائب", views: "8.3M" },
  { rank: 9, title: "آل كابون - أعظم زعماء عصابات المافيا في", channel: "قرية العجائب", views: "8.1M" },
  { rank: 10, title: "أعظم عملية هروب في التاريخ.. الهروب من س", channel: "قرية العجائب", views: "7.9M" },
];

export type InsightType = "EFFICIENCY" | "OPPORTUNITY" | "THREAT" | "MARKET" | "SIGNAL";

export interface Insight {
  type: InsightType;
  title: string;
  description: string;
}

export const keyInsights: Insight[] = [
  {
    type: "EFFICIENCY",
    title: "SUL CASES leads at 6.59% with only 735K subs — format over audience size",
    description: "They generate higher engagement than channels with 10× more subscribers. Documentary-style criminal cases, 7–15 min, high comment volume. Content depth is the driver — not upload frequency or subscriber count.",
  },
  {
    type: "OPPORTUNITY",
    title: "Fares Ashour published 14 videos in Sep 2025 — then dropped to 3 in March",
    description: "A massive surge drove 58M views that month, then output collapsed. Their 5.7M audience is still there and underserved. Consistent uploads from a smaller channel can capture the recommendation slots they are vacating.",
  },
  {
    type: "THREAT",
    title: "VWAR is the only channel accelerating — 4 videos/month in April, 9 in March",
    description: "5.62% engagement is #2 overall and upload rate is still climbing. Every other channel is flat or declining. Watch their content format closely — they are building momentum while the rest plateau.",
  },
  {
    type: "MARKET",
    title: "badr3 slowed from 7 videos/month to 3 — their top format is still unrivaled",
    description: "6.6M subscribers, 8–15M views per video average. Topic formula: crimes, heists, prison breaks — proven beyond doubt. Upload rate dropped 57% from April to March. Less output from the market leader creates space.",
  },
  {
    type: "SIGNAL",
    title: "Long-form Arabic investigative content dominates — every top-10 video is 10+ minutes",
    description: "All top-10 videos by views are Arabic, narrative-driven, crime or mystery genre. This is not a coincidence. The format that works in this competitive set is consistent: depth over breadth, story over reaction.",
  },
];

export const monthlyTrendData = {
  months: ["Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25", "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26"],
  yourChannels: [
    { name: "Fun Channel", data: [4, 3, 4, 7, 7, 7, 8, 7, 5, 6, 5, 7] },
    { name: "فن كوميدي", data: [7, 5, 5, 7, 6, 8, 7, 5, 6, 5, 5, 5] },
  ],
  competitors: [
    { name: "Badr Al-Alawi", data: [7, 6, 5, 5, 5, 4, 6, 5, 5, 4, 3, 3] },
    { name: "Abulsadiq", data: [5, 4, 4, 5, 5, 5, 5, 4, 4, 4, 3, 3] },
    { name: "Fares Ashour", data: [6, 5, 5, 8, 7, 14, 8, 5, 6, 5, 4, 3] },
    { name: "VWAR", data: [4, 4, 5, 7, 6, 6, 7, 6, 7, 7, 8, 9] },
    { name: "Walid Qasas", data: [5, 4, 4, 5, 5, 5, 5, 4, 5, 4, 4, 4] },
    { name: "Abu Talal", data: [3, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 2] },
    { name: "SUL CASES", data: [5, 5, 5, 5, 4, 5, 5, 4, 4, 4, 4, 4] },
    { name: "Mannas", data: [4, 3, 3, 4, 4, 4, 4, 3, 3, 3, 3, 3] },
    { name: "Mawtan", data: [2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1] },
  ],
};

export const channelAnalysis = {
  yourChannel: "Fun Channel (@fun213)",
  competitor: "قرية العجائب | Badr Al-Alawi",
  summary: "You are behind on most metrics — clear action plan below",
  winning: "1/4 metrics",
  metrics: [
    {
      label: "Avg views / video",
      tag: "Top priority",
      you: { name: "You (Fun Channel)", value: "14K" },
      them: { name: "Badr Al-Alawi", value: "3.1M" },
      gap: "×225 behind on reach",
      target: "Grow per-video reach (currently ×225 gap)",
    },
    {
      label: "Upload rate",
      tag: "Winning",
      tagColor: "success",
      you: { name: "You (Fun Channel)", value: "7/mo" },
      them: { name: "Badr Al-Alawi", value: "5/mo" },
      gap: "You lead by 2/mo",
      target: "Maintain current pace",
    },
    {
      label: "Engagement rate",
      tag: "After that",
      you: { name: "You (Fun Channel)", value: "4.80%" },
      them: { name: "Badr Al-Alawi", value: "5.14%" },
      gap: "×0.34% gap to close",
      target: "5.2% engagement",
    },
    {
      label: "Subscribers",
      tag: "Lagging metric",
      you: { name: "You (Fun Channel)", value: "45K" },
      them: { name: "Badr Al-Alawi", value: "6.6M" },
      gap: "6.6M subscriber gap",
      target: "50K subscribers",
    },
  ],
  actionPlan: [
    {
      number: 1,
      title: "Avg views / video",
      description: "Their per-video reach is ×224.8 larger — this is a subscriber base gap, not a content quality gap. Views will follow once your subscriber count grows. Focus on upload rate and engagement first.",
    },
    {
      number: 2,
      title: "Engagement rate",
      description: "Your engagement is 4.80% vs their 5.14% — a gap of 0.34%. Focus on strong hooks (first 30 seconds) and explicit calls to comment in your video.",
    },
    {
      number: 3,
      title: "Subscribers",
      description: "They have ×147 more subscribers. Subscribers are a lagging metric — they follow engagement and views, not the other way around. Focus on the levers above (uploads + engagement).",
    },
    {
      number: 4,
      title: "Already winning: Upload rate",
      description: "You upload 7/mo vs their 5/mo. You are already ahead on volume. Maintain this cadence — consistency compounds over months.",
      isWinning: true,
    },
  ],
};
