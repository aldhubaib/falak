/** Mock data for Stories v2 — no API/DB. Same design as reference. */

export type Stage = "suggestion" | "liked" | "approved" | "filmed" | "publish" | "done";

export interface StoryV2 {
  id: string;
  title: string;
  source: string;
  sourceDate: string;
  relevance: number;
  virality: number;
  firstMover: number;
  totalScore: number;
  isFirstMover: boolean;
  isLate: boolean;
  stage: Stage;
  aiAnalysis?: string;
  suggestedTitle?: string;
  openingHook?: string;
  endingHook?: string;
  script?: { time: string; text: string }[];
  shortScript?: { time: string; text: string }[];
  youtubeUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  gapWin?: boolean;
  channelId?: string;
  producedFormats?: ("short" | "long")[];
}

export interface ChannelV2 {
  id: string;
  name: string;
  type: "ours" | "competition";
  /** Optional: URL or empty; UI can show initial if missing */
  avatarImg?: string;
}

export const storiesV2Mock: StoryV2[] = [
  {
    id: "s1",
    title: "طبيب سعودي يعترف بقتل 3 مرضى بجرعات مضاعفة — المحكمة تصدر حكمها",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-12",
    relevance: 96,
    virality: 94,
    firstMover: 99,
    totalScore: 96,
    isFirstMover: true,
    isLate: false,
    stage: "approved",
    aiAnalysis: "قصة حصرية لم يتناولها أي من المنافسين بعد. تتعلق بحادثة طبية خطيرة في المملكة العربية السعودية مع أبعاد قانونية وأخلاقية.",
    suggestedTitle: "الطبيب القاتل — اعترافات صادمة تهز منظومة الرعاية الصحية",
    openingHook: "كيف يمكن أن يتحوّل الشخص الذي أقسم بإنقاذ حياتك... إلى من يُنهيها؟",
    endingHook: "هل تثق بطبيبك بعد الآن؟ اكتب في التعليقات.",
  },
  {
    id: "s2",
    title: "حقيقة الطبيب الذي قتل 7 مرضى بجرعات مضاعفة في مستشفى خاص",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-09",
    relevance: 96,
    virality: 93,
    firstMover: 98,
    totalScore: 96,
    isFirstMover: true,
    isLate: false,
    stage: "approved",
    aiAnalysis: "قصة مشابهة تتعلق بمستشفى خاص مع عدد أكبر من الضحايا. الزاوية مختلفة وتركز على الإهمال المؤسسي.",
  },
  {
    id: "s3",
    title: "فضيحة تسريب بيانات 50 مليون مستخدم عربي من تطبيق مشهور",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-11",
    relevance: 92,
    virality: 97,
    firstMover: 85,
    totalScore: 91,
    isFirstMover: false,
    isLate: true,
    stage: "suggestion",
    aiAnalysis: "قصة ذات انتشار عالي. لا تزال هناك زوايا غير مستكشفة تتعلق بالتأثير على المستخدمين العرب.",
  },
  {
    id: "s4",
    title: "اكتشاف مدينة أثرية تحت الرمال في الربع الخالي عمرها 5000 سنة",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-12",
    relevance: 88,
    virality: 91,
    firstMover: 95,
    totalScore: 91,
    isFirstMover: true,
    isLate: false,
    stage: "liked",
    aiAnalysis: "اكتشاف أثري مذهل. القصة تجمع بين الغموض التاريخي والفخر الوطني.",
  },
  {
    id: "s5",
    title: "شركة سعودية ناشئة تحصل على أكبر تمويل في تاريخ المنطقة — 2 مليار دولار",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-10",
    relevance: 85,
    virality: 88,
    firstMover: 72,
    totalScore: 82,
    isFirstMover: false,
    isLate: true,
    stage: "suggestion",
    aiAnalysis: "خبر مالي كبير. يمكن تقديم زاوية فريدة تركز على مؤسس الشركة وقصته الشخصية.",
  },
  {
    id: "s6",
    title: "أول رائد فضاء عربي يسير في الفضاء — لحظات تاريخية من المحطة الدولية",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-08",
    relevance: 90,
    virality: 95,
    firstMover: 60,
    totalScore: 82,
    isFirstMover: false,
    isLate: true,
    stage: "liked",
    aiAnalysis: "حدث تاريخي بالغ الأهمية. فرصة لتقديم محتوى حصري من زاوية إنسانية.",
  },
  {
    id: "s7",
    title: "عملية إنقاذ مذهلة — غواصون سعوديون ينقذون 12 شخصاً من كهف تحت الماء",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-11",
    relevance: 94,
    virality: 96,
    firstMover: 92,
    totalScore: 94,
    isFirstMover: true,
    isLate: false,
    stage: "liked",
    aiAnalysis: "قصة بطولية حصرية مع عناصر إثارة قوية. مثالية لفيديو سردي طويل.",
  },
  {
    id: "s8",
    title: "كيف بنى شاب سعودي إمبراطورية تجارة إلكترونية من غرفته — قصة نجاح ملهمة",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-07",
    relevance: 80,
    virality: 85,
    firstMover: 45,
    totalScore: 70,
    isFirstMover: false,
    isLate: true,
    stage: "filmed",
    youtubeUrl: "",
    aiAnalysis: "قصة نجاح ملهمة تم تصويرها. بانتظار رفع الفيديو على يوتيوب.",
  },
  {
    id: "s9",
    title: "السر وراء اختفاء 3 سياح في صحراء نيوم — التحقيق الكامل",
    source: "Perplexity Sonar",
    sourceDate: "2026-03-05",
    relevance: 93,
    virality: 97,
    firstMover: 88,
    totalScore: 93,
    isFirstMover: true,
    isLate: false,
    stage: "done",
    youtubeUrl: "https://youtube.com/watch?v=abc123",
    views: 1400000,
    likes: 61000,
    comments: 9000,
    gapWin: true,
    producedFormats: ["long"],
  },
];

export const channelsV2Mock: ChannelV2[] = [
  { id: "ch1", name: "قناة النخبة", type: "ours" },
  { id: "ch2", name: "قرية العجائب | بدر العلوي", type: "ours" },
  { id: "ch3", name: "أخبار السعودية", type: "ours" },
];
