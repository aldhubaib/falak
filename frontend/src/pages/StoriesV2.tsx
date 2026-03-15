import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { ArrowUpRight } from "lucide-react";
import { storiesV2Mock, type StoryV2, type Stage } from "@/data/storiesV2Mock";

const STAGES: { key: Stage; label: string; color: string; pillClass: string }[] = [
  { key: "suggestion", label: "AI Suggestion", color: "text-orange", pillClass: "bg-orange/15 text-orange" },
  { key: "liked", label: "Liked", color: "text-blue", pillClass: "bg-blue/15 text-blue" },
  { key: "approved", label: "Approved", color: "text-purple", pillClass: "bg-purple/15 text-purple" },
  { key: "filmed", label: "Filmed", color: "text-success", pillClass: "bg-success/15 text-success" },
  { key: "publish", label: "Publish", color: "text-primary", pillClass: "bg-primary/15 text-primary" },
  { key: "done", label: "Done", color: "text-foreground", pillClass: "bg-foreground/15 text-foreground" },
];

function MiniScores({ story }: { story: StoryV2 }) {
  const items = [
    { val: story.relevance, bar: "bg-purple" },
    { val: story.virality, bar: "bg-blue" },
    { val: story.firstMover, bar: "bg-success" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="w-5 h-1 bg-elevated rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.val}%` }} />
          </div>
          <span className={`text-[10px] font-mono font-medium ${i === 0 ? "text-purple" : i === 1 ? "text-blue" : "text-success"}`}>{s.val}</span>
        </div>
      ))}
    </div>
  );
}

export default function StoriesV2() {
  const navigate = useNavigate();
  const projectPath = useProjectPath();
  const [stories] = useState<StoryV2[]>(storiesV2Mock);
  const [activeStage, setActiveStage] = useState<Stage>("suggestion");

  const stageStories = stories.filter((s) => s.stage === activeStage);
  const stageStoriesSorted = [...stageStories].sort((a, b) => b.totalScore - a.totalScore);
  const totalStories = stories.length;
  const firstMoverCount = stories.filter((s) => s.isFirstMover).length;
  const firstMoverPct = totalStories ? Math.round((firstMoverCount / totalStories) * 100) : 0;

  return (
    <div className="flex flex-col min-h-screen bg-surface p-3 max-sm:p-0">
      <div className="flex flex-col flex-1 bg-background rounded-xl max-sm:rounded-none overflow-hidden">
        {/* Top bar — same design as Stories */}
        <div className="flex items-center justify-between px-6 max-sm:px-3 border-b border-[#151619] shrink-0 max-lg:px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">AI Intelligence</h1>
            <span className="text-[11px] text-dim font-mono max-sm:hidden">
              Stories v2 — mock only (no API)
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Stats row */}
          <div className="px-6 max-lg:px-4 mb-5 pt-5">
            <div className="flex rounded-xl overflow-hidden flex-wrap">
              {STAGES.map((s) => {
                const count = stories.filter((st) => st.stage === s.key).length;
                return (
                  <div
                    key={s.key}
                    className="flex-1 min-w-[80px] px-5 py-4 bg-background border-r border-background last:border-r-0"
                  >
                    <div className={`text-2xl font-semibold font-mono tracking-tight ${s.color}`}>{count}</div>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">{s.label}</div>
                  </div>
                );
              })}
              <div className="px-5 py-4 bg-background min-w-[100px]">
                <div className="text-2xl font-semibold font-mono tracking-tight text-success">{firstMoverPct}%</div>
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">First Mover</div>
              </div>
            </div>
          </div>

          {/* Stage filter pills */}
          <div className="px-6 max-lg:px-4 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              {STAGES.map((s) => {
                const count = stories.filter((st) => st.stage === s.key).length;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveStage(s.key)}
                    className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                      activeStage === s.key
                        ? "bg-foreground/10 text-foreground border border-foreground/20"
                        : "text-dim border border-border hover:text-foreground hover:border-foreground/20"
                    }`}
                  >
                    {s.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Story list */}
          <div className="px-6 max-lg:px-4 pb-8">
            <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 300px)" }}>
              <div className="px-4 py-3 bg-background shrink-0 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[13px] font-semibold">
                  {STAGES.find((s) => s.key === activeStage)?.label} ({stageStories.length})
                </span>
              </div>
              <div className="flex-1 overflow-auto bg-background">
                {stageStoriesSorted.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-[12px] text-dim font-mono">
                    No stories in this stage
                  </div>
                ) : (
                  stageStoriesSorted.map((story) => {
                    const stageInfo = STAGES.find((s) => s.key === story.stage);
                    return (
                      <button
                        key={story.id}
                        onClick={() => navigate(projectPath(`/stories-v2/story/${story.id}`))}
                        className="w-full px-4 py-3.5 border-t border-border text-right hover:bg-[#0d0d10] transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            {stageInfo && (
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${stageInfo.pillClass}`}>
                                {stageInfo.label}
                              </span>
                            )}
                            {story.isFirstMover && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">1st</span>
                            )}
                            {story.isLate && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange">Late</span>
                            )}
                          </div>
                          <span className="link text-[13px] font-medium leading-snug flex-1 min-w-0 flex items-center justify-end gap-1.5">
                            <span className="truncate">{story.title}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </div>
                        <div className="text-[10px] text-dim font-mono mb-2">{story.source} · {story.sourceDate}</div>
                        <div className="flex items-center justify-between gap-3">
                          <MiniScores story={story} />
                          <span className="text-[12px] font-mono font-bold shrink-0 ml-auto">{story.totalScore}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
