export interface Story {
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
  stage: "suggestion" | "liked" | "approved" | "filmed" | "publish" | "done";
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
  rank?: number;
  channelId?: string;
  producedFormats?: ("short" | "long")[];
}

export const storiesMock: Story[] = [
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
    aiAnalysis: "قصة حصرية لم يتناولها أي من المنافسين بعد. تتعلق بحادثة طبية خطيرة في المملكة العربية السعودية مع أبعاد قانونية وأخلاقية. الموضوع يجمع بين الإثارة والمعلومات الطبية والقانونية مما يجعله مثالياً للمحتوى الطويل.",
    suggestedTitle: "الطبيب القاتل — اعترافات صادمة تهز منظومة الرعاية الصحية",
    openingHook: "كيف يمكن أن يتحوّل الشخص الذي أقسم بإنقاذ حياتك... إلى من يُنهيها؟",
    endingHook: "هل تثق بطبيبك بعد الآن؟ اكتب في التعليقات.",
    script: [
      { time: "00:00", text: "أهلاً وسهلاً — اليوم نكشف قضية هزّت الوسط الطبي السعودي" },
      { time: "02:30", text: "التعريف بالضحايا الثلاثة — من هم ولماذا كانوا تحت رعاية هذا الطبيب؟" },
      { time: "08:15", text: "بداية الشك — كيف لاحظت عائلة الضحية الأولى أن شيئاً ما غير طبيعي؟" },
      { time: "14:40", text: "التحقيق الطبي — كيف كشف الطب الشرعي عن الجرعات المضاعفة في عينات الدم؟" },
      { time: "21:10", text: "الاعتراف — اللحظة التي أقرّ فيها الطبيب بكل شيء أمام المحقق" },
      { time: "28:55", text: "حكم المحكمة — العقوبة التي صدرت وردود فعل الأسر" },
    ],
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
    aiAnalysis: "قصة مشابهة لكنها تتعلق بمستشفى خاص مع عدد أكبر من الضحايا. الزاوية مختلفة وتركز على الإهمال المؤسسي.",
    suggestedTitle: "7 ضحايا في مستشفى واحد — كيف مرّ الأمر دون محاسبة؟",
    openingHook: "مستشفى خاص، طبيب موثوق، و7 مرضى لم يخرجوا أحياء...",
    endingHook: "شاركونا — هل تفضلون المستشفيات الحكومية أم الخاصة بعد هذه القصة؟",
    script: [
      { time: "00:00", text: "مقدمة صادمة — الأرقام التي لا يريدك أحد أن تعرفها" },
      { time: "03:00", text: "خلفية المستشفى — سمعة ممتازة وتقييمات عالية" },
      { time: "09:00", text: "الضحية الأولى — القصة التي فتحت التحقيق" },
      { time: "16:00", text: "كيف تم الكشف عن 6 حالات أخرى" },
      { time: "24:00", text: "المواجهة — الطبيب أمام لجنة التحقيق" },
    ],
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
    aiAnalysis: "قصة ذات انتشار عالي لكن بعض المنافسين بدأوا بتغطيتها. لا تزال هناك زوايا غير مستكشفة تتعلق بالتأثير على المستخدمين العرب تحديداً.",
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
    aiAnalysis: "اكتشاف أثري مذهل لم يغطه أي منافس. القصة تجمع بين الغموض التاريخي والفخر الوطني. مثالية لفيديو طويل مع رسومات توضيحية.",
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
    aiAnalysis: "خبر مالي كبير لكنه تمت تغطيته من عدة قنوات. يمكن تقديم زاوية فريدة تركز على مؤسس الشركة وقصته الشخصية.",
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
    aiAnalysis: "حدث تاريخي بالغ الأهمية. رغم التغطية الواسعة، هناك فرصة لتقديم محتوى حصري من زاوية إنسانية — قصة العائلة والتحضيرات.",
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
    aiAnalysis: "قصة بطولية حصرية مع عناصر إثارة قوية. لم يتناولها أي منافس بعد. مثالية لفيديو سردي طويل.",
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
    suggestedTitle: "من غرفة نوم إلى إمبراطورية — قصة لن تصدقها",
    openingHook: "هل تخيلت يوماً أن غرفة نومك يمكن أن تكون مقر شركة بمليون دولار؟",
    endingHook: "ما هو حلمك الذي لم تبدأ به بعد؟ شاركنا في التعليقات.",
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
    suggestedTitle: "اختفاء في نيوم — ماذا حدث للسياح الثلاثة؟",
    openingHook: "ثلاثة سياح دخلوا الصحراء... ولم يعد أي منهم.",
    endingHook: "هل تجرؤ على زيارة هذا المكان؟ اكتب رأيك.",
    producedFormats: ["long"],
  },
];
