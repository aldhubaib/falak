import avatarCh2 from "@/assets/avatars/ch2.jpg";
import avatarCh3 from "@/assets/avatars/ch3.jpg";
import avatarCh4 from "@/assets/avatars/ch4.jpg";
import avatarCh5 from "@/assets/avatars/ch5.jpg";
import avatarCh6 from "@/assets/avatars/ch6.jpg";

export interface CompetitorStory {
  id: string;
  title: string;
  date: string;
  status: "taken" | "open";
  competitors: { name: string; avatar: string; color: string }[];
  totalViews: string;
}

export interface PublishedVideo {
  id: string;
  title: string;
  date: string;
  views: string;
  likes: string;
  comments: string;
  result: "gap_win" | "late";
  viewsRaw: number;
  type: "short" | "video";
  channelId: string;
  channelName: string;
  channelAvatar: string;
}

export interface CompetitorChannel {
  name: string;
  handle: string;
  color: string;
  enabled: boolean;
}

export const competitorStories: CompetitorStory[] = [
  {
    id: "cs1",
    title: "محكومون بالإعدام ينفذون اخطر عملية هروب من سجن تدمر",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" }],
    totalViews: "15.5M",
  },
  {
    id: "cs2",
    title: "هربوا بعبقرية — اضخم سرقة بنك في تاريخ امريكا اللاتينية",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" }],
    totalViews: "11.4M",
  },
  {
    id: "cs3",
    title: "قناص بغداد الأسطوري الذي ابار 700 مسلح خلال 10 سنوات",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" }],
    totalViews: "11.3M",
  },
  {
    id: "cs4",
    title: "اسرار سجن صهيبايا — اخطر سجن في العالم",
    date: "2026-03-01",
    status: "taken",
    competitors: [
      { name: "Abulsadiq", avatar: avatarCh5, color: "bg-purple" },
    ],
    totalViews: "9.6M",
  },
  {
    id: "cs5",
    title: "غباء الشرطة الأمريكية وعنصريتها مع المواطنين",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Walid Qasas", avatar: avatarCh4, color: "bg-orange" }],
    totalViews: "9.3M",
  },
  {
    id: "cs6",
    title: "اضخم عملية سرقة بنك في امريكا — التخطيط والتنفيذ",
    date: "2026-03-01",
    status: "taken",
    competitors: [
      { name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" },
      { name: "Abulsadiq", avatar: avatarCh5, color: "bg-purple" },
    ],
    totalViews: "8.3M",
  },
  {
    id: "cs7",
    title: "هروب ال تشابو الأسطوري من سجنين مختلفين",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" }],
    totalViews: "8.3M",
  },
  {
    id: "cs8",
    title: "آل كابون — صعود وسقوط اعظم زعيم مافيا في التاريخ",
    date: "2026-03-01",
    status: "taken",
    competitors: [
      { name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" },
      { name: "Walid Qasas", avatar: avatarCh4, color: "bg-orange" },
    ],
    totalViews: "8.1M",
  },
  {
    id: "cs9",
    title: "محاولات المخابرات الأمريكية تصفية كاسترو 638 مرة",
    date: "2026-03-01",
    status: "taken",
    competitors: [{ name: "Badr Al-Alawi", avatar: avatarCh2, color: "bg-blue" }],
    totalViews: "7.9M",
  },
  {
    id: "cs10",
    title: "سرقة متحف الايرميتاج — اكبر سرقة تحف في روسيا",
    date: "2026-03-01",
    status: "taken",
    competitors: [
      { name: "Abulsadiq", avatar: avatarCh5, color: "bg-purple" },
      { name: "Walid Qasas", avatar: avatarCh4, color: "bg-orange" },
    ],
    totalViews: "7.2M",
  },
];

export const untouchedStories: CompetitorStory[] = [
  {
    id: "us1",
    title: "قضية اغتصاب حدث في الرياض — الحكم 4 سنوات و400 جلدة",
    date: "2026-03-05",
    status: "open",
    competitors: [],
    totalViews: "",
  },
  {
    id: "us2",
    title: "اختفاء طفل في الطائف — التحقيق لا يزال مفتوحاً",
    date: "2026-03-05",
    status: "open",
    competitors: [],
    totalViews: "",
  },
];

export const publishedVideos: PublishedVideo[] = [
  {
    id: "pv1",
    title: "الحكم على شابين اغتصبا حدثاً بالسجن 4 سنوات و400 جلدة",
    date: "2026-03-02",
    views: "2.1M",
    likes: "89K",
    comments: "12K",
    result: "gap_win",
    viewsRaw: 2100000,
    type: "video",
    channelId: "ch2",
    channelName: "قرية العجائب",
    channelAvatar: avatarCh2,
  },
  {
    id: "pv2",
    title: "قضية اختفاء طفل في الطائف — التحقيق الكامل",
    date: "2026-02-20",
    views: "1.4M",
    likes: "61K",
    comments: "9K",
    result: "gap_win",
    viewsRaw: 1400000,
    type: "video",
    channelId: "ch2",
    channelName: "قرية العجائب",
    channelAvatar: avatarCh2,
  },
  {
    id: "pv3",
    title: "سرقة بنك في الرياض — 3 اشخاص واعترافات صادمة",
    date: "2026-02-10",
    views: "420K",
    likes: "14K",
    comments: "890",
    result: "late",
    viewsRaw: 420000,
    type: "short",
    channelId: "ch3",
    channelName: "طارق العلي",
    channelAvatar: avatarCh3,
  },
];

export const competitorChannels: CompetitorChannel[] = [
  { name: "Badr Al-Alawi", handle: "@badr3", color: "bg-blue", enabled: true },
  { name: "Abulsadiq", handle: "@abulsadiq", color: "bg-purple", enabled: true },
  { name: "Walid Qasas", handle: "@walid", color: "bg-orange", enabled: true },
  { name: "Abu Talal", handle: "@abutalal", color: "bg-destructive", enabled: true },
  { name: "SUL CASES", handle: "@sulcases", color: "bg-orange", enabled: true },
];

// Helper: count stories per competitor
export function getCompetitorActivity() {
  const activity: Record<string, number> = {};
  competitorStories.forEach((s) => {
    s.competitors.forEach((c) => {
      activity[c.name] = (activity[c.name] || 0) + 1;
    });
  });
  return Object.entries(activity)
    .map(([name, count]) => {
      const ch = competitorChannels.find((c) => c.name === name);
      return { name, count, color: ch?.color || "bg-dim" };
    })
    .sort((a, b) => b.count - a.count);
}

export const autoSearchQuery = `أعطني أبرز 8 قضايا وأخبار من الجريمة والقضايا الحقيقية في السعودية والخليج من آخر 7 أيام.

أولوية: ابحث عن تطورات جديدة في هذه القضايا الغير مغطاة:
• قضية اغتصاب حدث في الرياض —"... ال"
• اختفاء طفل في الطائف —"....التحقيق"

ابحث عن قصص مشابهة في النوع والشعور
لـ: "الحكم على شابين اغتصبا حدثاً..."
و"قضية اختفاء طفل في الطائف — ..."
(حققت أعلى مشاهدات لقناتنا).

تجنب تماماً أي قصص مشابهة لـ:
"محكومون بالإعدام ينفذون أ..."،
"هربوا بعبقرية – أضخم سرقة..."،
"قناص بغداد الأسطوري الذي..."،
"أسرار سجن صهيبايا – أخطر..."،
"غباء الشرطة الأمريكية وعن..." — هذه تم تصويرها بالفعل.

لكل قصة: العنوان، ملخص جملتين، رابط المصدر، وهل غطاها أحد من منافسينا (badr3, abulsadiq, walidq)؟`;
