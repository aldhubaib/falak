import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, Check, ExternalLink, Trophy, Eye, ThumbsUp, MessageSquare, Link2, XCircle, ArrowLeft, ArrowUpRight, ChevronDown, Sparkles, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { storiesMock, Story } from "@/data/storiesMock";
import { channels } from "@/data/mock";

type Stage = "suggestion" | "liked" | "approved" | "filmed" | "publish" | "done";

const stages: { key: Stage; label: string }[] = [
  { key: "suggestion", label: "AI Suggestion" },
  { key: "liked", label: "Liked" },
  { key: "approved", label: "Approved" },
  { key: "filmed", label: "Filmed" },
  { key: "publish", label: "Publish" },
  { key: "done", label: "Done" },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }}
      className="text-[11px] text-dim hover:text-sensor font-mono flex items-center gap-1 transition-colors shrink-0"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      Copy
    </button>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = label === "Relevance" ? "bg-purple" : label === "Virality" ? "bg-blue" : "bg-success";
  return (
    <div className="flex-1 px-5 py-4 bg-background border-r border-background last:border-r-0">
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold font-mono tracking-tight mt-1">{value}</div>
      <div className="h-1 bg-elevated rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function StoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>(storiesMock);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [scriptFormat, setScriptFormat] = useState<"short" | "long">("short");
  const [scriptOpen, setScriptOpen] = useState(true);
  const [scriptSaved, setScriptSaved] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [hookInput, setHookInput] = useState("");
  const [hookStartInput, setHookStartInput] = useState("");
  const [hookEndInput, setHookEndInput] = useState("");
  const [scriptInput, setScriptInput] = useState("");
  const [editingYoutubeUrl, setEditingYoutubeUrl] = useState(false);

  const story = stories.find((s) => s.id === id);
  const likedStories = stories.filter((s) => s.stage === "liked").sort((a, b) => b.totalScore - a.totalScore);

  if (!story) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="h-12 flex items-center px-6 border-b border-[#151619] shrink-0">
          <button onClick={() => navigate("/stories")} className="flex items-center gap-2 text-[13px] text-dim hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Stories
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] text-dim font-mono">Story not found</span>
        </div>
      </div>
    );
  }

  const activeStage = story.stage;

  const moveStory = (to: Stage) => {
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, stage: to } : s)));
    toast.success(`Moved to ${stages.find((s) => s.key === to)?.label}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/stories")} className="flex items-center gap-2 text-[13px] text-dim hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            AI Intelligence
          </button>
          <span className="text-[11px] text-dim font-mono">/</span>
          <span className="text-[13px] font-medium truncate max-w-[400px]">{story.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/15 text-primary">
            {stages.find((s) => s.key === activeStage)?.label}
          </span>
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        <div className="max-w-[900px] mx-auto px-6 max-lg:px-4 py-6 space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-right leading-relaxed">{story.title}</h1>
            <div className="text-[11px] text-dim font-mono mt-2">{story.source} · {story.sourceDate}</div>
          </div>

          {/* Scores row */}
          <div className="flex rounded-xl overflow-hidden">
            <ScoreBar label="Relevance" value={story.relevance} />
            <ScoreBar label="Virality" value={story.virality} />
            <ScoreBar label="First Mover" value={story.firstMover} />
            <div className="px-5 py-4 bg-background min-w-[120px]">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider">Total</div>
              <div className="text-2xl font-semibold font-mono tracking-tight mt-1">{story.totalScore}</div>
            </div>
          </div>

          {/* AI Analysis */}
          {story.aiAnalysis && (
            <div className="rounded-xl bg-background p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">AI Analysis</div>
                {story.isFirstMover ? (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success">1st</span>
                ) : story.isLate ? (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange">Late</span>
                ) : null}
              </div>
              <p className="text-[13px] text-sensor leading-relaxed text-right">{story.aiAnalysis}</p>
            </div>
          )}

          {/* Stage-specific content */}
          <div className="space-y-5">
            {/* SUGGESTION */}
            {activeStage === "suggestion" && (
              <>
                <div className="flex gap-2">
                  <button onClick={() => moveStory("liked")} className="flex-1 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity">
                    Save to Liked
                  </button>
                  <button onClick={() => { setStories((p) => p.filter((s) => s.id !== id)); navigate("/stories"); toast("Passed"); }} className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">
                    Pass
                  </button>
                </div>
              </>
            )}

            {/* LIKED */}
            {activeStage === "liked" && (
              <>
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Ranking</div>
                  <div className="text-[13px] font-semibold mb-3">
                    Ranked #{likedStories.findIndex((s) => s.id === id) + 1} of {likedStories.length} liked — Score {story.totalScore}
                  </div>
                  <div className="space-y-1">
                    {likedStories.map((s, i) => {
                      const isCurrent = s.id === id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (!isCurrent) navigate(`/story/${s.id}`);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] transition-colors group ${
                            isCurrent
                              ? "bg-[#0d0d10] text-foreground cursor-default"
                              : "text-dim hover:bg-[#0d0d10] cursor-pointer"
                          }`}
                        >
                          <span className="font-mono w-5">#{i + 1}</span>
                          {s.isFirstMover ? (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">1st</span>
                          ) : s.isLate ? (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange shrink-0">Late</span>
                          ) : null}
                          <span className="flex-1 truncate text-right transition-colors group-hover:text-foreground">{s.title}</span>
                          <span className="font-mono font-medium">{s.totalScore}</span>
                          {!isCurrent && (
                            <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Channel selector */}
                <div className="rounded-xl bg-background p-5">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Assign to Channel</div>
                  {(() => {
                    const ourChannels = channels.filter((c) => c.type === "ours").filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
                    const selected = ourChannels.find((c) => c.id === selectedChannel);
                    const [dropOpen, setDropOpen] = [channelDropOpen, setChannelDropOpen];
                    return (
                      <div className="relative">
                        <button
                          onClick={() => setDropOpen(!dropOpen)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 bg-surface border border-border rounded-full text-[13px] font-medium focus:outline-none focus:border-primary/40"
                        >
                          {selected ? (
                            <>
                              <img src={selected.avatarImg} alt={selected.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                              <span className="flex-1 text-right">{selected.name}</span>
                            </>
                          ) : (
                            <span className="flex-1 text-right text-dim">Select one of your channels…</span>
                          )}
                          <ChevronDown className={`w-4 h-4 text-dim shrink-0 transition-transform ${dropOpen ? "rotate-180" : ""}`} />
                        </button>
                        {dropOpen && (
                          <div className="absolute z-10 mt-1.5 w-full rounded-xl bg-elevated border border-border overflow-hidden shadow-lg">
                            {ourChannels.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => { setSelectedChannel(c.id); setDropOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-surface ${selectedChannel === c.id ? "bg-blue/10" : ""}`}
                              >
                                <img src={c.avatarImg} alt={c.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                                <span className="flex-1 text-right font-medium">{c.name}</span>
                                {selectedChannel === c.id && <Check className="w-3.5 h-3.5 text-blue shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Script Box — single box with format toggle */}
                <div className="rounded-xl bg-background overflow-hidden">
                  <button
                    onClick={() => setScriptOpen(!scriptOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-elevated/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
                      {scriptSaved && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">Saved</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toast("AI script generation coming soon…"); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-blue bg-blue/10 rounded-full hover:bg-blue/20 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate with AI
                      </button>
                      <ChevronDown className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {scriptOpen && (
                    <div className="px-5 pb-5 space-y-4">
                      {/* Format toggle */}
                      <div className="flex items-center gap-1 p-1 bg-surface rounded-full w-fit">
                        <button
                          onClick={() => { if (!scriptSaved) { setScriptFormat("short"); } }}
                          className={`px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors ${scriptFormat === "short" ? "bg-foreground/10 text-foreground" : "text-dim hover:text-sensor"}`}
                        >
                          Short (1–2 min)
                        </button>
                        <button
                          onClick={() => { if (!scriptSaved) { setScriptFormat("long"); } }}
                          className={`px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors ${scriptFormat === "long" ? "bg-foreground/10 text-foreground" : "text-dim hover:text-sensor"}`}
                        >
                          Video (20–40 min)
                        </button>
                      </div>

                      {([
                        { key: "title", label: "Suggested Title", value: titleInput, setter: setTitleInput, placeholder: scriptFormat === "short" ? "عنوان الشورت المقترح..." : "عنوان الفيديو المقترح...", type: "input" as const },
                        { key: "hook", label: "Opening Hook (first 10 sec)", value: hookInput, setter: setHookInput, placeholder: "الجملة الأولى التي تجذب المشاهد...", type: "input" as const },
                        { key: "hookStart", label: "Branded Hook Start", value: hookStartInput, setter: setHookStartInput, placeholder: "e.g. أهلاً وسهلاً بكم في قناة...", type: "input" as const },
                        { key: "script", label: "Script — with timestamps", value: scriptInput, setter: setScriptInput, placeholder: scriptFormat === "short" ? "00:00 هوك\n00:15 المحتوى..." : "00:00 مقدمة\n01:30 القصة تبدأ...", type: "textarea" as const },
                        { key: "hookEnd", label: "Branded Hook End", value: hookEndInput, setter: setHookEndInput, placeholder: "e.g. لا تنسوا الاشتراك وتفعيل الجرس...", type: "input" as const },
                      ]).map((field) => {
                        const isEditing = !scriptSaved || editingField === field.key;
                        return (
                          <div key={field.key}>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-[10px] text-dim font-mono uppercase tracking-wider">{field.label}</label>
                              {scriptSaved && editingField !== field.key && field.value && (
                                <button onClick={() => setEditingField(field.key)} className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors">
                                  <Pencil className="w-3 h-3" /> Edit
                                </button>
                              )}
                              {scriptSaved && editingField === field.key && (
                                <button onClick={() => { setEditingField(null); toast.success("Field updated"); }} className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors">Done</button>
                              )}
                            </div>
                            {isEditing ? (
                              field.type === "textarea" ? (
                                <textarea value={field.value} onChange={(e) => field.setter(e.target.value)} placeholder={field.placeholder} rows={scriptFormat === "short" ? 3 : 5} className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y" />
                              ) : (
                                <input type="text" value={field.value} onChange={(e) => field.setter(e.target.value)} placeholder={field.placeholder} className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 text-right" />
                              )
                            ) : (
                              <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] text-right min-h-[38px]">
                                {field.type === "textarea" ? <pre className="whitespace-pre-wrap font-mono text-[13px]">{field.value || <span className="text-dim">—</span>}</pre> : (field.value || <span className="text-dim">—</span>)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!scriptSaved && (
                        <button onClick={() => { setScriptSaved(true); setEditingField(null); toast.success("Script saved"); }} className="w-full py-2.5 text-[13px] font-semibold rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity">Save</button>
                      )}
                    </div>
                  )}
                </div>

                {(() => {
                  const hasContent = titleInput.trim() || hookInput.trim() || hookStartInput.trim() || scriptInput.trim() || hookEndInput.trim();
                  const canApprove = !!selectedChannel && !!hasContent;
                  return (
                    <div className="flex gap-2">
                      <button
                        disabled={!canApprove}
                        onClick={() => {
                          const parseScript = (raw: string) => raw.trim() ? raw.trim().split("\n").map((line) => {
                            const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/);
                            return match ? { time: match[1], text: match[2] } : { time: "", text: line };
                          }) : undefined;
                          const parsed = parseScript(scriptInput);
                          setStories((prev) => prev.map((s) => s.id === id ? {
                            ...s,
                            channelId: selectedChannel,
                            stage: "approved" as Stage,
                            ...(scriptFormat === "long" ? { script: parsed || s.script } : { shortScript: parsed }),
                          } : s));
                          toast.success(`Moved to ${stages.find((s) => s.key === "approved")?.label}`);
                        }}
                        className={`flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-full transition-opacity ${canApprove ? "bg-blue text-blue-foreground hover:opacity-90" : "bg-blue/30 text-blue-foreground/40 cursor-not-allowed"}`}
                      >
                        Approve
                      </button>
                      <button onClick={() => moveStory("suggestion")} className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">
                        Pass
                      </button>
                    </div>
                  );
                })()}
              </>
            )}

            {/* APPROVED / FILMED / PUBLISH — same layout as liked, fields already filled */}
            {(activeStage === "approved" || activeStage === "filmed" || activeStage === "publish") && (
              <>
                {story.channelId && (() => {
                  const ch = channels.find((c) => c.id === story.channelId);
                  return ch ? (
                    <div className="rounded-xl bg-background p-5 flex items-center gap-3">
                      <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Channel</div>
                      <button
                        onClick={() => navigate(`/channel/${ch.id}`)}
                        className="group relative flex items-center gap-2"
                      >
                        <img src={ch.avatarImg} alt={ch.name} className="w-8 h-8 rounded-full object-cover" />
                        <span className="absolute left-10 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-elevated text-[12px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {ch.name}
                        </span>
                      </button>
                    </div>
                  ) : null;
                })()}

                {/* Same script box — saved state */}
                <div className="rounded-xl bg-background overflow-hidden">
                  <button
                    onClick={() => setScriptOpen(!scriptOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-elevated/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue/15 text-blue">
                        {scriptFormat === "short" ? "Short" : "Video"}
                      </span>
                      {scriptSaved && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">Saved</span>}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`} />
                  </button>
                  {scriptOpen && (
                    <div className="px-5 pb-5 space-y-4">
                      {([
                        { key: "title", label: "Suggested Title", value: titleInput, setter: setTitleInput, type: "input" as const },
                        { key: "hook", label: "Opening Hook (first 10 sec)", value: hookInput, setter: setHookInput, type: "input" as const },
                        { key: "hookStart", label: "Branded Hook Start", value: hookStartInput, setter: setHookStartInput, type: "input" as const },
                        { key: "script", label: "Script — with timestamps", value: scriptInput, setter: setScriptInput, type: "textarea" as const },
                        { key: "hookEnd", label: "Branded Hook End", value: hookEndInput, setter: setHookEndInput, type: "input" as const },
                      ]).map((field) => {
                        const isEditing = editingField === field.key;
                        return (
                          <div key={field.key}>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-[10px] text-dim font-mono uppercase tracking-wider">{field.label}</label>
                              <div className="flex items-center gap-2">
                                {field.value && !isEditing && <CopyBtn text={field.value} />}
                                {!isEditing && field.value && (
                                  <button onClick={() => setEditingField(field.key)} className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors">
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                )}
                                {isEditing && (
                                  <button onClick={() => { setEditingField(null); toast.success("Field updated"); }} className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors">Done</button>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              field.type === "textarea" ? (
                                <textarea value={field.value} onChange={(e) => field.setter(e.target.value)} rows={scriptFormat === "short" ? 3 : 5} className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y" />
                              ) : (
                                <input type="text" value={field.value} onChange={(e) => field.setter(e.target.value)} className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 text-right" />
                              )
                            ) : (
                              <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] text-right min-h-[38px]">
                                {field.type === "textarea" ? <pre className="whitespace-pre-wrap font-mono text-[13px]">{field.value || <span className="text-dim">—</span>}</pre> : (field.value || <span className="text-dim">—</span>)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeStage === "approved" && (
                  <button onClick={() => moveStory("filmed")} className="w-full px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity">
                    + Mark as Filmed
                  </button>
                )}

                {activeStage === "filmed" && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">
                      {scriptFormat === "short" ? "Add YouTube Short URL" : "Add YouTube Video URL"}
                    </div>
                    <p className="text-[12px] text-dim leading-relaxed mb-4">
                      Paste the published {scriptFormat === "short" ? "short" : "video"} URL to record performance and check Brain coverage.
                    </p>
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                        <input
                          type="url"
                          value={youtubeInput}
                          onChange={(e) => setYoutubeInput(e.target.value)}
                          placeholder={scriptFormat === "short" ? "https://youtube.com/shorts/..." : "https://youtube.com/watch?v=..."}
                          className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-surface border border-border rounded-full text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (!youtubeInput.trim()) { toast.error("Please paste a YouTube URL"); return; }
                          const currentFormats = stories.find((st) => st.id === id)?.producedFormats || [];
                          const newFormat: "short" | "long" = scriptFormat;
                          const updatedFormats = currentFormats.includes(newFormat) ? currentFormats : [...currentFormats, newFormat];
                          setStories((prev) => prev.map((s) => s.id === id ? { ...s, youtubeUrl: youtubeInput.trim(), stage: "done" as Stage, views: 0, likes: 0, comments: 0, gapWin: false, producedFormats: updatedFormats } : s));
                          setYoutubeInput("");
                          toast.success("Moved to Done");
                        }}
                        className="px-5 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}

                {activeStage === "publish" && (
                  <div className="rounded-xl bg-background p-5">
                    <p className="text-[12px] text-dim font-mono mb-4">Final details to confirm before marking done.</p>
                    <button onClick={() => moveStory("done")} className="w-full px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity">
                      Mark as Done
                    </button>
                  </div>
                )}
              </>
            )}

            {/* DONE */}
            {activeStage === "done" && (
              <>
                {story.gapWin && (
                  <div className="rounded-xl bg-success/10 border border-success/20 px-5 py-4 flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-success shrink-0" />
                    <div>
                      <div className="text-[14px] font-semibold text-success">Gap Win</div>
                      <div className="text-[12px] text-success/80">You were first and the audience responded!</div>
                    </div>
                  </div>
                )}

                {/* Produced Formats badges */}
                {story.producedFormats && story.producedFormats.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Produced</span>
                    {story.producedFormats.map((f) => (
                      <span key={f} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue">
                        {f === "short" ? "Short" : "Long Video"}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-3">Video Performance</div>
                  <div className="flex rounded-xl overflow-hidden">
                    {[
                      { icon: Eye, val: story.views, label: "Views" },
                      { icon: ThumbsUp, val: story.likes, label: "Likes" },
                      { icon: MessageSquare, val: story.comments, label: "Comments" },
                    ].map((m) => {
                      const fmt = (n?: number) => !n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
                      return (
                        <div key={m.label} className="flex-1 px-4 py-3 bg-background border-r border-background last:border-r-0">
                          <div className="flex items-center gap-2 mb-1">
                            <m.icon className="w-3.5 h-3.5 text-dim" />
                            <span className="text-[10px] text-dim font-mono uppercase">{m.label}</span>
                          </div>
                          <div className="text-xl font-semibold font-mono tracking-tight">{fmt(m.val)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Original Scores</div>
                <div className="flex rounded-xl overflow-hidden">
                  <ScoreBar label="Relevance" value={story.relevance} />
                  <ScoreBar label="Virality" value={story.virality} />
                  <ScoreBar label="First Mover" value={story.firstMover} />
                </div>

                {story.youtubeUrl && (
                  <div className="rounded-xl bg-background p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-widest">
                        {scriptFormat === "short" ? "YouTube Short URL" : "YouTube Video URL"}
                      </label>
                      <div className="flex items-center gap-2">
                        {!editingYoutubeUrl && (
                          <>
                            <a href={story.youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue hover:opacity-80 transition-opacity">
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                            <button
                              onClick={() => { setYoutubeInput(story.youtubeUrl || ""); setEditingYoutubeUrl(true); }}
                              className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        {editingYoutubeUrl && (
                          <button onClick={() => {
                            if (!youtubeInput.trim()) { toast.error("URL cannot be empty"); return; }
                            setStories((prev) => prev.map((s) => s.id === id ? { ...s, youtubeUrl: youtubeInput.trim() } : s));
                            setEditingYoutubeUrl(false);
                            toast.success("URL updated");
                          }} className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors">Done</button>
                        )}
                      </div>
                    </div>
                    {editingYoutubeUrl ? (
                      <input
                        type="url"
                        value={youtubeInput}
                        onChange={(e) => setYoutubeInput(e.target.value)}
                        className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                      />
                    ) : (
                      <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] font-mono text-sensor truncate">
                        {story.youtubeUrl}
                      </div>
                    )}
                  </div>
                )}

                {/* Produce Again CTA */}
                {(() => {
                  const produced = story.producedFormats || [];
                  const canProduceShort = !produced.includes("short");
                  const canProduceLong = !produced.includes("long");
                  if (!canProduceShort && !canProduceLong) return null;
                  return (
                    <div className="rounded-xl bg-background p-5 space-y-3">
                      <div className="text-[10px] text-dim font-mono uppercase tracking-widest">Produce Another Format</div>
                      <p className="text-[12px] text-dim leading-relaxed">This story performed well. Produce it in another format to maximize reach.</p>
                      <div className="flex gap-2">
                        {canProduceShort && (
                          <button
                            onClick={() => {
                              setStories((prev) => prev.map((s) => s.id === id ? {
                                ...s,
                                stage: "approved" as Stage,
                                producedFormats: [...(s.producedFormats || [])],
                              } : s));
                              setScriptFormat("short");
                              setScriptOpen(true);
                              setScriptSaved(false);
                              setEditingField(null);
                              setTitleInput("");
                              setHookInput("");
                              setHookStartInput("");
                              setHookEndInput("");
                              setScriptInput("");
                              toast.success("Restarted pipeline for Short format");
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-blue text-blue-foreground rounded-full hover:opacity-90 transition-opacity"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Produce as Short
                          </button>
                        )}
                        {canProduceLong && (
                          <button
                            onClick={() => {
                              setStories((prev) => prev.map((s) => s.id === id ? {
                                ...s,
                                stage: "approved" as Stage,
                                producedFormats: [...(s.producedFormats || [])],
                              } : s));
                              setScriptFormat("long");
                              setScriptOpen(true);
                              setScriptSaved(false);
                              setEditingField(null);
                              setTitleInput("");
                              setHookInput("");
                              setHookStartInput("");
                              setHookEndInput("");
                              setScriptInput("");
                              toast.success("Restarted pipeline for Long Video format");
                            }}
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
