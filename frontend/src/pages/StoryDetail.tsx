import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { scriptTextToYooptaValue } from "@/data/editorInitialValue";
import { useProjectPath } from "@/hooks/useProjectPath";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  Trophy, Eye, ThumbsUp, MessageSquare, Link2, ArrowLeft, Loader2,
  RefreshCw, ExternalLink, Pencil, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Stage } from "./Stories";
import type { StoryBrief, ApiChannel, StoryWithLog } from "@/components/story-detail";
import {
  StoryDetailTopBar,
  StoryDetailArticle,
  StoryDetailScriptSection,
  StoryDetailStagePassed,
  StoryDetailStageOmit,
} from "@/components/story-detail";
import type { ScriptField } from "@/components/story-detail";

const STAGES: { key: Stage; label: string }[] = [
  { key: "suggestion", label: "Suggestion" },
  { key: "liked", label: "Liked" },
  { key: "scripting", label: "Scripting" },
  { key: "filmed", label: "Filmed" },
  { key: "publish", label: "Publish" },
  { key: "done", label: "Done" },
  { key: "passed", label: "Passed" },
  { key: "omit", label: "Omitted" },
];

const STAGE_ORDER: Stage[] = ["suggestion", "liked", "scripting", "filmed", "publish", "done"];

/** Minimal mock so main content renders (design only). */
const MOCK_STORY: StoryWithLog = {
  id: "",
  headline: "",
  stage: "scripting",
  sourceUrl: null,
  sourceName: null,
  sourceDate: null,
  createdAt: "",
  relevanceScore: 0,
  viralScore: 0,
  firstMoverScore: 0,
  compositeScore: 0,
  coverageStatus: null,
  brief: null,
  log: [],
} as StoryWithLog;

export default function StoryDetail() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const currentUser = useCurrentUser();

  const collaborationWsUrl = useMemo(
    () =>
      (import.meta.env.VITE_WS_URL as string | undefined) ||
      `${typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"}://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:1234`,
    []
  );

  const [brief, setBrief] = useState<StoryBrief>({});
  const scriptValue = useMemo(
    () => brief.scriptYoopta ?? scriptTextToYooptaValue(brief.script ?? ""),
    [brief.scriptYoopta, brief.script]
  );

  // ── Constants (no logic; design only) ────────────────────────────────────
  const loading = false;
  const story: StoryWithLog | null = MOCK_STORY;
  const ourChannels: ApiChannel[] = [];
  const scriptFormat = brief.scriptFormat ?? "short";
  const activeStage: Stage = story?.stage ?? "scripting";
  const saving = false;
  const articleDisplayValue = "";
  const cleanupProgress = 0;
  const articleLoading = false;
  const articleError: string | null = null;
  const isWriterBoxRunning = false;
  const scriptDurationMinutes = 3;
  const youtubeInput = "";
  const editingYoutubeUrl = false;
  const generatingScript = false;
  const historyOpen = false;
  const articleOpen = true;
  const stageStories: { id: string }[] = [];
  const stageIndex = id ? stageStories.findIndex((s) => s.id === id) : -1;
  const prevStory = stageIndex > 0 ? stageStories[stageIndex - 1] : null;
  const nextStory = stageIndex >= 0 && stageIndex < stageStories.length - 1 ? stageStories[stageIndex + 1] : null;
  const showStageNav = stageStories.length > 1 && stageIndex >= 0;
  const stageOrderIdx = STAGE_ORDER.indexOf(activeStage);
  const nextStageKey: Stage | null = stageOrderIdx >= 0 && stageOrderIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageOrderIdx + 1]! : null;
  const nextStageLabel = nextStageKey ? STAGES.find((s) => s.key === nextStageKey)?.label ?? null : null;
  const relativeDate = story?.sourceDate || story?.createdAt
    ? formatDistanceToNow(new Date((story?.sourceDate || story?.createdAt) ?? ""), { addSuffix: true })
    : null;
  const fmt = (n?: number) =>
    !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
  const selectedChannel = brief.channelId ?? "";

  const SCRIPT_FIELDS: ScriptField[] = [
    { key: "suggestedTitle", label: "Suggested Title", placeholder: scriptFormat === "short" ? "عنوان الشورت المقترح..." : "عنوان الفيديو المقترح...", type: "input" },
    { key: "openingHook", label: "Opening Hook (first 10 sec)", placeholder: "الجملة الأولى التي تجذب المشاهد...", type: "input" },
    { key: "hookStart", label: "Branded Hook Start", placeholder: "e.g. أهلاً وسهلاً بكم في قناة...", type: "input" },
    { key: "script", label: "Script — with timestamps", placeholder: scriptFormat === "short" ? "00:00 هوك\n00:15 المحتوى..." : "00:00 مقدمة\n01:30 القصة تبدأ...", type: "textarea" },
    { key: "hookEnd", label: "Branded Hook End", placeholder: "e.g. لا تنسوا الاشتراك وتفعيل الجرس...", type: "input" },
  ];

  // Layout matches Lovabale (Test.tsx): flex min-h-screen, no outer card/padding
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <button onClick={() => navigate(projectPath("/stories"))} className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      </div>
    );
  }
  if (!story) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-auto min-h-[48px] flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4 max-sm:flex-wrap max-sm:gap-2 max-sm:py-2 max-sm:px-3">
          <button onClick={() => navigate(projectPath("/stories"))} className="flex items-center gap-1.5 text-[13px] text-dim cursor-pointer bg-transparent border-none font-sans hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">AI Intelligence</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] text-dim font-mono">Story not found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StoryDetailTopBar
          stageLabel={STAGES.find((s) => s.key === activeStage)?.label ?? ""}
          activeStage={activeStage}
          stages={STAGES}
          nextStageKey={nextStageKey}
          nextStageLabel={nextStageLabel}
          saving={saving}
          onBack={() => navigate(projectPath("/stories"))}
          onMoveToNextStage={() => {}}
          onPass={async () => {}}
          onOmit={async () => {}}
          onHistoryClick={() => {}}
          prevNext={showStageNav ? {
            currentIndex: stageIndex + 1,
            total: stageStories.length,
            onPrev: () => prevStory && navigate(projectPath(`/story/${(prevStory as { id: string }).id}`)),
            onNext: () => nextStory && navigate(projectPath(`/story/${(nextStory as { id: string }).id}`)),
            hasPrev: !!prevStory,
            hasNext: !!nextStory,
          } : undefined}
        />

        {/* Edit History modal */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => {}}>
            <div
              className="w-full max-w-lg rounded-xl bg-background border border-border overflow-hidden shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                <span className="text-[13px] font-medium">Edit History</span>
                <button type="button" onClick={() => {}} className="p-1.5 text-dim hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {Array.isArray(story.log) && story.log.length > 0 ? (
                  story.log.map((entry) => {
                    const actionLabel = entry.action === "stage_change" && entry.note
                      ? entry.note
                      : entry.action === "stage_change"
                        ? "Status changed"
                        : entry.action === "created"
                          ? "Created"
                          : entry.action === "script_edit"
                            ? "Edited script"
                            : entry.action
                    return (
                    <div key={entry.id} className="flex items-center justify-between px-5 py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-0.5 h-8 bg-blue/30 rounded-full shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sensor text-[11px]">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</span>
                          <span className="text-dim text-[11px]"> · {actionLabel}</span>
                          {entry.note && entry.action !== "stage_change" && <span className="font-mono text-[11px] text-dim ml-1">{entry.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sensor text-[12px] font-medium truncate max-w-[120px]">{entry.user?.name ?? "—"}</span>
                        {entry.user?.avatarUrl ? (
                          <img src={entry.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim">{entry.user?.name?.[0] ?? "?"}</div>
                        )}
                      </div>
                    </div>
                  )})
                ) : (
                  <div className="px-5 py-8 text-center text-dim text-[12px]">No edit history yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <div className="px-6 max-lg:px-4 max-sm:px-3 py-5 pb-16 space-y-5">
            <StoryDetailArticle
              storyId={id}
              sourceUrl={story.sourceUrl}
              articleContent={brief.articleContent}
              articleDisplayValue={articleDisplayValue}
              articleTitle={brief.articleTitle ?? story.headline ?? ""}
              cleanupProgress={cleanupProgress}
              articleLoading={articleLoading}
              articleError={articleError}
              actionsDisabled={isWriterBoxRunning}
              scores={{
                relevance: story.relevanceScore ?? 0,
                viral: story.viralScore ?? 0,
                firstMover: story.firstMoverScore ?? 0,
                total: story.compositeScore ?? 0,
              }}
              relativeDate={relativeDate}
              articleOpen={articleOpen}
              onArticleOpenChange={() => {}}
              onCleanup={async () => {}}
              onRefetch={async () => {}}
              onRetryFetch={async () => {}}
              onArticleChange={() => {}}
              onArticleTitleChange={() => {}}
              onArticleTitleBlur={() => {}}
            />

          {/* Stage-specific content */}
          <div className="space-y-5">

            {activeStage === "passed" && (
              <StoryDetailStagePassed onMoveBack={() => {}} />
            )}

            {activeStage === "omit" && (
              <StoryDetailStageOmit onMoveBack={() => {}} />
            )}

            {/* ── SCRIPTING / FILMED / PUBLISH / DONE (Yoopta script editor) ───────── */}
            {(activeStage === "scripting" || activeStage === "filmed" || activeStage === "publish" || activeStage === "done") && (
              <>
                <StoryDetailScriptSection
                  key={id}
                  channels={ourChannels}
                  selectedChannelId={selectedChannel}
                  onChannelSelect={() => {}}
                  scriptFormat={scriptFormat}
                  onScriptFormatChange={() => {}}
                  scriptDuration={scriptDurationMinutes}
                  onScriptDurationChange={() => {}}
                  canGenerate={false}
                  generating={generatingScript}
                  onGenerate={async () => {}}
                  readOnly={activeStage !== "scripting"}
                  scriptValue={scriptValue}
                  onScriptChange={(value) => setBrief((b) => ({ ...b, scriptYoopta: value }))}
                  storyId={id}
                  currentUser={currentUser}
                  collaborationWsUrl={collaborationWsUrl}
                />

                {activeStage === "publish" && (
                  <div className="rounded-xl bg-background p-5">
                    <p className="text-[12px] text-dim font-mono mb-4">
                      Final details to confirm before marking done.
                    </p>
                    <button
                      onClick={() => {}}
                      className="w-full px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                    >
                      Mark as Done
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── DONE ──────────────────────────────────────────────────── */}
            {activeStage === "done" && (
              <>
                {brief.gapWin && (
                  <div className="rounded-xl bg-success/10 border border-success/20 px-5 py-4 flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-success shrink-0" />
                    <div>
                      <div className="text-[14px] font-semibold text-success">Gap Win</div>
                      <div className="text-[12px] text-success/80">
                        You were first and the audience responded!
                      </div>
                    </div>
                  </div>
                )}

                {brief.producedFormats && brief.producedFormats.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-dim font-mono uppercase tracking-widest">
                      Produced
                    </span>
                    {brief.producedFormats.map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue"
                      >
                        {f === "short" ? "Short" : "Long Video"}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">
                    Video Performance
                  </div>
                  <div className="flex rounded-xl overflow-hidden">
                    {[
                      { icon: Eye,            val: brief.views,    label: "Views" },
                      { icon: ThumbsUp,       val: brief.likes,    label: "Likes" },
                      { icon: MessageSquare,  val: brief.comments, label: "Comments" },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="flex-1 px-4 py-3 bg-background border-r border-background last:border-r-0"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <m.icon className="w-3.5 h-3.5 text-dim" />
                          <span className="text-[10px] text-dim font-mono uppercase">
                            {m.label}
                          </span>
                        </div>
                        <div className="text-xl font-semibold font-mono tracking-tight">
                          {fmt(m.val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {brief.youtubeUrl && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        {scriptFormat === "short" ? "YouTube Short URL" : "YouTube Video URL"}
                      </label>
                      <div className="flex items-center gap-2">
                        {!editingYoutubeUrl && (
                          <>
                            <a
                              href={brief.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-blue hover:opacity-80 transition-opacity"
                            >
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                            <button
                              onClick={() => {}}
                              className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        {editingYoutubeUrl && (
                          <button
                            onClick={() => {}}
                            className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                    {editingYoutubeUrl ? (
                      <input
                        type="url"
                        value={youtubeInput}
                        onChange={() => {}}
                        className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                      />
                    ) : (
                      <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] font-mono text-sensor truncate">
                        {brief.youtubeUrl}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const produced = brief.producedFormats ?? [];
                  const canShort = !produced.includes("short");
                  const canLong = !produced.includes("long");
                  if (!canShort && !canLong) return null;
                  return (
                    <div className="rounded-xl bg-background p-5 space-y-3">
                      <div className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        Produce Another Format
                      </div>
                      <p className="text-[12px] text-dim leading-relaxed">
                        This story performed well. Produce it in another format to maximize reach.
                      </p>
                      <div className="flex gap-2">
                        {canShort && (
                          <button
                            onClick={() => {}}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Short
                          </button>
                        )}
                        {canLong && (
                          <button
                            onClick={() => {}}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Long Video
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
