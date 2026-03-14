import avatarCh1 from "@/assets/avatars/ch1.jpg";
import avatarCh2 from "@/assets/avatars/ch2.jpg";
import avatarCh3 from "@/assets/avatars/ch3.jpg";
import avatarCh4 from "@/assets/avatars/ch4.jpg";
import avatarCh5 from "@/assets/avatars/ch5.jpg";
import avatarCh6 from "@/assets/avatars/ch6.jpg";
import thumbV1 from "@/assets/thumbnails/v1.jpg";
import thumbV2 from "@/assets/thumbnails/v2.jpg";
import thumbV3 from "@/assets/thumbnails/v3.jpg";
import thumbV4 from "@/assets/thumbnails/v4.jpg";
import thumbV5 from "@/assets/thumbnails/v5.jpg";
import thumbV6 from "@/assets/thumbnails/v6.jpg";
import thumbV7 from "@/assets/thumbnails/v7.jpg";
import thumbV8 from "@/assets/thumbnails/v8.jpg";

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

export const channels: Channel[] = [
  {
    id: "ch2",
    name: "قرية العجائب | بدر العلوي",
    handle: "@badr3",
    avatar: "ق",
    avatarImg: avatarCh2,
    type: "ours",
    subscribers: "6.6M",
    views: "863.7M",
    videos: "282",
    subscribersRaw: 6600000,
    viewsRaw: 863700000,
    videosRaw: 282,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Mar 2017",
    country: "SA",
    avgViews: "3.1M",
    engRate: "6.8%",
    topCategory: "Entertainment",
    growthSubs: "+3.1%",
    growthViews: "+7.2%",
    startHook: "أهلاً وسهلاً فيكم في قرية العجائب، أنا بدر العلوي...",
    endHook: "لا تنسوا الاشتراك وتفعيل الجرس عشان يوصلكم كل جديد!",
  },
  {
    id: "ch2",
    name: "قرية العجائب | بدر العلوي",
    handle: "@badr3",
    avatar: "ق",
    avatarImg: avatarCh2,
    type: "ours",
    subscribers: "6.6M",
    views: "863.7M",
    videos: "282",
    subscribersRaw: 6600000,
    viewsRaw: 863700000,
    videosRaw: 282,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Mar 2017",
    country: "SA",
    avgViews: "3.1M",
    engRate: "6.8%",
    topCategory: "Entertainment",
    growthSubs: "+3.1%",
    growthViews: "+7.2%",
    startHook: "أهلاً وسهلاً فيكم في قرية العجائب، أنا بدر العلوي...",
    endHook: "لا تنسوا الاشتراك وتفعيل الجرس عشان يوصلكم كل جديد!",
  },
  {
    id: "ch3",
    name: "طارق العلي",
    handle: "@tariq",
    avatar: "ط",
    avatarImg: avatarCh3,
    type: "ours",
    subscribers: "2.1M",
    views: "241.3M",
    videos: "198",
    subscribersRaw: 2100000,
    viewsRaw: 241300000,
    videosRaw: 198,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Jun 2018",
    country: "KW",
    avgViews: "1.2M",
    engRate: "5.5%",
    topCategory: "Comedy",
    growthSubs: "+1.8%",
    growthViews: "+3.9%",
    startHook: "مرحباً يا جماعة، أنا طارق العلي وعندي لكم قصة...",
    endHook: "شاركوني رأيكم في التعليقات وشوفوا الفيديو اللي فوق!",
  },
  {
    id: "ch4",
    name: "سارة الودعاني",
    handle: "@sarah_w",
    avatar: "س",
    avatarImg: avatarCh4,
    type: "competition",
    subscribers: "890K",
    views: "52.4M",
    videos: "87",
    subscribersRaw: 890000,
    viewsRaw: 52400000,
    videosRaw: 87,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Sep 2020",
    country: "SA",
    avgViews: "602K",
    engRate: "7.1%",
    topCategory: "Lifestyle",
    growthSubs: "+4.5%",
    growthViews: "+8.3%",
  },
  {
    id: "ch5",
    name: "عبدالرحمن المرشد",
    handle: "@amrshd",
    avatar: "ع",
    avatarImg: avatarCh5,
    type: "competition",
    subscribers: "1.3M",
    views: "98.7M",
    videos: "154",
    subscribersRaw: 1300000,
    viewsRaw: 98700000,
    videosRaw: 154,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Feb 2019",
    country: "SA",
    avgViews: "641K",
    engRate: "3.9%",
    topCategory: "Education",
    growthSubs: "+2.1%",
    growthViews: "+4.4%",
  },
  {
    id: "ch6",
    name: "نواف السالم",
    handle: "@nawaf_s",
    avatar: "ن",
    avatarImg: avatarCh6,
    type: "competition",
    subscribers: "445K",
    views: "18.2M",
    videos: "63",
    subscribersRaw: 445000,
    viewsRaw: 18200000,
    videosRaw: 63,
    lastSynced: "3/11/2026, 1:59 AM",
    active: true,
    joinedDate: "Nov 2021",
    country: "SA",
    avgViews: "289K",
    engRate: "5.2%",
    topCategory: "Tech",
    growthSubs: "+6.7%",
    growthViews: "+9.1%",
  },
];

export const videos: Video[] = [
  {
    id: "v1", channelId: "ch2",
    title: "كيف تبني مشروع ناجح من الصفر؟ | دليل شامل",
    type: "video", views: "1.2M", likes: "45K", comments: "2.3K",
    date: "2026-03-08", duration: "18:42", status: "done",
    viewsRaw: 1200000, likesRaw: 45000, commentsRaw: 2300, thumbnail: thumbV1,
    pipeline: [
      { name: "Transcription", status: "done", time: "2m 14s", retries: 1 },
      { name: "Translation", status: "done", time: "1m 32s", retries: 1 },
      { name: "Sentiment", status: "done", time: "3m 08s", retries: 2 },
      { name: "Topics", status: "done", time: "1m 45s", retries: 1 },
      { name: "Comments", status: "done", time: "4m 22s", retries: 1 },
      { name: "Viral Score", status: "done", time: "0m 58s", retries: 1 },
    ],
  },
  {
    id: "v2", channelId: "ch2",
    title: "أسرار النجاح على يوتيوب في 2026",
    type: "video", views: "890K", likes: "32K", comments: "1.8K",
    date: "2026-03-05", duration: "24:15", status: "done",
    viewsRaw: 890000, likesRaw: 32000, commentsRaw: 1800, thumbnail: thumbV2,
    pipeline: [
      { name: "Transcription", status: "done", time: "3m 01s", retries: 1 },
      { name: "Translation", status: "done", time: "2m 10s", retries: 1 },
      { name: "Sentiment", status: "done", time: "2m 44s", retries: 1 },
      { name: "Topics", status: "done", time: "1m 30s", retries: 1 },
      { name: "Comments", status: "done", time: "3m 55s", retries: 1 },
      { name: "Viral Score", status: "done", time: "1m 02s", retries: 1 },
    ],
  },
  {
    id: "v3", channelId: "ch2",
    title: "رحلتي إلى اليابان 🇯🇵",
    type: "video", views: "2.1M", likes: "78K", comments: "4.1K",
    date: "2026-03-01", duration: "32:08", status: "done",
    viewsRaw: 2100000, likesRaw: 78000, commentsRaw: 4100, thumbnail: thumbV3,
    pipeline: [
      { name: "Transcription", status: "done", time: "4m 22s" },
      { name: "Translation", status: "done", time: "3m 15s" },
      { name: "Sentiment", status: "done", time: "2m 58s" },
      { name: "Topics", status: "done", time: "1m 40s" },
      { name: "Comments", status: "done", time: "5m 10s" },
      { name: "Viral Score", status: "done", time: "1m 12s" },
    ],
  },
  {
    id: "v4", channelId: "ch2",
    title: "لحظة لا تنسى! 😱",
    type: "short", views: "5.4M", likes: "210K", comments: "8.9K",
    date: "2026-02-28", duration: "0:58", status: "analyzing",
    viewsRaw: 5400000, likesRaw: 210000, commentsRaw: 8900, thumbnail: thumbV4,
    pipeline: [
      { name: "Transcription", status: "done", time: "0m 32s", retries: 1 },
      { name: "Translation", status: "done", time: "0m 28s", retries: 1 },
      { name: "Sentiment", status: "done", time: "1m 05s", retries: 1 },
      { name: "Topics", status: "running", retries: 2 },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
  {
    id: "v5", channelId: "ch2",
    title: "تحدي الأكل الحار 🌶️ | ردة فعل صادمة",
    type: "short", views: "3.2M", likes: "145K", comments: "5.6K",
    date: "2026-02-25", duration: "0:45", status: "done",
    viewsRaw: 3200000, likesRaw: 145000, commentsRaw: 5600, thumbnail: thumbV5,
    pipeline: [
      { name: "Transcription", status: "done", time: "0m 28s" },
      { name: "Translation", status: "done", time: "0m 22s" },
      { name: "Sentiment", status: "done", time: "0m 55s" },
      { name: "Topics", status: "done", time: "0m 38s" },
      { name: "Comments", status: "done", time: "2m 44s" },
      { name: "Viral Score", status: "done", time: "0m 30s" },
    ],
  },
  {
    id: "v6", channelId: "ch2",
    title: "مقابلة حصرية مع أشهر يوتيوبر عربي",
    type: "video", views: "670K", likes: "28K", comments: "1.5K",
    date: "2026-02-20", duration: "45:30", status: "failed",
    viewsRaw: 670000, likesRaw: 28000, commentsRaw: 1500, thumbnail: thumbV6,
    pipeline: [
      { name: "Transcription", status: "done", time: "5m 12s", retries: 2 },
      { name: "Translation", status: "done", time: "3m 48s", retries: 1 },
      { name: "Sentiment", status: "failed", retries: 3 },
      { name: "Topics", status: "waiting" },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
  {
    id: "v7", channelId: "ch2",
    title: "أفضل 10 تطبيقات لازم تعرفها",
    type: "video", views: "445K", likes: "19K", comments: "980",
    date: "2026-02-15", duration: "15:22", status: "pending",
    viewsRaw: 445000, likesRaw: 19000, commentsRaw: 980, thumbnail: thumbV7,
    pipeline: [
      { name: "Transcription", status: "waiting" },
      { name: "Translation", status: "waiting" },
      { name: "Sentiment", status: "waiting" },
      { name: "Topics", status: "waiting" },
      { name: "Comments", status: "waiting" },
      { name: "Viral Score", status: "waiting" },
    ],
  },
  {
    id: "v8", channelId: "ch2",
    title: "يوم كامل مع عائلتي ❤️",
    type: "video", views: "920K", likes: "41K", comments: "2.1K",
    date: "2026-02-10", duration: "22:17", status: "done",
    viewsRaw: 920000, likesRaw: 41000, commentsRaw: 2100, thumbnail: thumbV8,
    pipeline: [
      { name: "Transcription", status: "done", time: "2m 48s" },
      { name: "Translation", status: "done", time: "1m 55s" },
      { name: "Sentiment", status: "done", time: "2m 30s" },
      { name: "Topics", status: "done", time: "1m 18s" },
      { name: "Comments", status: "done", time: "3m 40s" },
      { name: "Viral Score", status: "done", time: "0m 52s" },
    ],
  },
];

export const videoAnalysis = {
  transcript: [
    { time: "00:00", text: "ناس ما تقدر تنام بالليل والسبب اسرح السالفه بسنه 1955 كان في مجهول يتسلل داخل بيوت الناس اخر الليل الناس نايمه المدينه ساكته فجاه يدخل هذا الريان بهدوء من غرفه لي غرفه يدور عليه جديده الخوف انتشر بالمدينه وخلال تقييبه السنه قتل هذا الشخص 13 ضحيه واعتدى على عشرات" },
    { time: "00:30", text: "غير هولكن من ابشع جراينا يوم من الايام اقتحم بيت زوجين مسنين اطلق النار على الزوج واعتد على الزوجه وظلت الشرطه اشهر تحاول تلقى دليل واحد عن هالشخص وللاسف مو قاعد يخلي وراه اي اثر وطبعا عقب ارتكاب جرينته ينحاش ويختفي وما احد يعرف عنه شيء يوم من الايام وصل بلاغ حق الشرطه ان في" },
    { time: "00:55", text: "سياره مفقوده عمموا على هالبلاغ وعقب البحث لقوا السياره وعقب فحص هالسياره لقوا في بصمات داخل السياره وفعلا طلعوا هويه هذا الشخص عن طريق بصمته واسم هذا الشخص ريتشارد ريمريز وكانوا يسمونه لايت ستوكر واقب معروفه هويه الشخص الشرطه انه ممكن يكون ريتشارد هو المتسبذ بالجرايم" },
    { time: "01:21", text: "اللي قاعد تصير بلوس انجلس وفعلا عمموا على صورته بكل الجرايد وبيوم من الايام كان في شخص قاعد يتمشى بشوا شوارع لوس انجلس وشاف واحد يشبه روتشرد ركز طلع فعلا ريتشرد وبلش يصرخ هذا الشخص والناس قامت تلحد ريتشارد لان صادوه دقوا على الشرطه وشف واعتقلت ريتشارد ريمريز طبعا تم" },
    { time: "01:44", text: "الحكم على ريتشارد بالاعدام ولكن لم ينفذ حكم الاعدام وب3 مات ريتشاردت بسدب سرطان الدم الحين عرفت السالفه Yeah تابعنا السالفه ال جايه." },
  ],
  summary: "فيديو شامل يتناول خطوات بناء مشروع ناجح من الصفر، يغطي التخطيط والتنفيذ والتسويق. يقدم نصائح عملية مبنية على تجارب حقيقية مع أمثلة من السوق السعودي.",
  summaryEn: "A comprehensive video covering steps to build a successful project from scratch, including planning, execution, and marketing. Provides practical advice based on real experiences with examples from the Saudi market.",
  topics: ["ريادة الأعمال", "التسويق الرقمي", "إدارة المشاريع", "التجارة الإلكترونية"],
  keywords: ["مشروع", "نجاح", "تسويق", "خطة عمل", "ريادة"],
  sentiment: { positive: 72, negative: 8, neutral: 20 },
  emotions: [
    { name: "Inspiration", emoji: "✨", pct: 34 },
    { name: "Curiosity", emoji: "🤔", pct: 28 },
    { name: "Excitement", emoji: "🔥", pct: 22 },
    { name: "Trust", emoji: "🤝", pct: 16 },
  ],
  questions: [
    { text: "كم رأس المال المطلوب للبدء؟", count: 142 },
    { text: "هل تنصح بالشراكة أو العمل الفردي؟", count: 89 },
    { text: "ما أفضل منصة للتسويق؟", count: 67 },
  ],
  viral: {
    score: 8.4,
    shareability: "High",
    trending: true,
    hookStrength: 9.1,
    retentionDrop: "12%",
    avgWatchPct: "67%",
  },
  moments: [
    { time: "02:15", text: "لحظة الكشف عن استراتيجية التسويق المجانية" },
    { time: "08:42", text: "قصة الفشل الأولى وكيف تحولت لنجاح" },
    { time: "14:30", text: "النصيحة الذهبية لكل رائد أعمال مبتدئ" },
  ],
  contentIdeas: [
    { hook: "٥ أخطاء قاتلة يرتكبها رواد الأعمال الجدد", concept: "فيديو متابعة يركز على الأخطاء الشائعة المذكورة في التعليقات" },
    { hook: "تحدي بناء مشروع في ٣٠ يوم", concept: "سلسلة فيديوهات توثق رحلة بناء مشروع حقيقي خطوة بخطوة" },
  ],
  comments: [
    { author: "محمد الشمري", date: "Mar 8", text: "والله محتوى رائع، استفدت كثير من النقطة حق التسويق بدون ميزانية", likes: 234, sentiment: "positive" as const },
    { author: "نورة العتيبي", date: "Mar 8", text: "ليش ما تكلمت عن التجارة الإلكترونية بشكل أعمق؟ حسيت إنها مرت بسرعة", likes: 89, sentiment: "question" as const },
    { author: "فهد القحطاني", date: "Mar 9", text: "جربت الطريقة وفعلاً نجحت! شكراً منص 🔥", likes: 156, sentiment: "positive" as const },
  ],
  pipeline: [
    { name: "Transcription", status: "done" as const, time: "2m 14s" },
    { name: "Translation", status: "done" as const, time: "1m 32s" },
    { name: "Sentiment Analysis", status: "done" as const, time: "3m 08s" },
    { name: "Topic Extraction", status: "done" as const, time: "1m 45s" },
    { name: "Comment Analysis", status: "done" as const, time: "4m 22s" },
    { name: "Viral Scoring", status: "done" as const, time: "0m 58s" },
  ],
};
