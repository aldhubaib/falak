import { ChevronDown, Pencil } from "lucide-react";
import { CopyBtn } from "./CopyBtn";
import type { StoryBrief } from "./types";
import type { ScriptField } from "./StoryDetailScriptBox";

export interface StoryDetailScriptBoxSavedProps {
  brief: StoryBrief;
  scriptOpen: boolean;
  setScriptOpen: (v: boolean) => void;
  editingField: string | null;
  setEditingField: (v: string | null) => void;
  scriptFields: ScriptField[];
  scriptDuration?: number;
  onFieldDone: (key: string) => void;
  onBriefChange: (key: keyof StoryBrief, val: string) => void;
  scriptViewMode?: "structured" | "full";
  onScriptViewModeChange?: (mode: "structured" | "full") => void;
}

export function StoryDetailScriptBoxSaved({
  brief,
  scriptOpen,
  setScriptOpen,
  editingField,
  setEditingField,
  scriptFields,
  scriptDuration,
  onFieldDone,
  onBriefChange,
  scriptViewMode = "structured",
  onScriptViewModeChange,
}: StoryDetailScriptBoxSavedProps) {
  return (
    <div className="rounded-xl bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setScriptOpen(!scriptOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
          {scriptDuration ? (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue/15 text-blue">
              {scriptDuration} min
            </span>
          ) : null}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">
            Saved
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`}
        />
      </button>
      {scriptOpen && (
        <div className="px-5 pb-5 space-y-4">
          {onScriptViewModeChange && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-dim font-mono uppercase tracking-wider">View</span>
              <div className="flex items-center gap-1 p-1 bg-surface rounded-full w-fit">
                {(["structured", "full"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onScriptViewModeChange(mode)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                      scriptViewMode === mode ? "bg-foreground/10 text-foreground" : "text-dim hover:text-sensor"
                    }`}
                  >
                    {mode === "structured" ? "Structured (fields)" : "Full script (one box)"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scriptViewMode === "full" ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-dim font-mono uppercase tracking-wider">
                  Full script (everything the AI wrote)
                </label>
                <div className="flex items-center gap-2">
                  {brief.scriptRaw && editingField !== "scriptRaw" && (
                    <CopyBtn text={brief.scriptRaw} />
                  )}
                  {editingField === "scriptRaw" ? (
                    <button
                      type="button"
                      onClick={() => onFieldDone("scriptRaw")}
                      className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingField("scriptRaw")}
                      className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
              </div>
              {editingField === "scriptRaw" ? (
                <textarea
                  value={brief.scriptRaw ?? ""}
                  onChange={(e) => onBriefChange("scriptRaw", e.target.value)}
                  placeholder="Generate with AI to see the full output in one box."
                  rows={16}
                  className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim text-right leading-relaxed resize-y focus:outline-none focus:border-blue/40"
                />
              ) : (
                <div className="rounded-xl bg-surface px-4 py-3 text-[13px] text-right min-h-[200px]">
                  <pre className="whitespace-pre-wrap font-mono text-[13px]">
                    {brief.scriptRaw || (
                      <span className="text-dim">No full script generated yet.</span>
                    )}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <>
              {scriptFields.map((field) => {
                const val = (brief[field.key] as string) ?? "";
                const isEditing = editingField === field.key;
                return (
                  <div key={String(field.key)}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-wider">
                        {field.label}
                      </label>
                      <div className="flex items-center gap-2">
                        {val && !isEditing && <CopyBtn text={val} />}
                        {!isEditing && val && (
                          <button
                            type="button"
                            onClick={() => setEditingField(String(field.key))}
                            className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onFieldDone(String(field.key))}
                            className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      field.type === "textarea" ? (
                        <textarea
                          value={val}
                          onChange={(e) => onBriefChange(field.key, e.target.value)}
                          rows={5}
                          className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => onBriefChange(field.key, e.target.value)}
                          className="w-full px-4 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40 text-right"
                        />
                      )
                    ) : (
                      <div className="rounded-xl bg-surface px-4 py-2.5 text-[13px] text-right min-h-[38px]">
                        {field.type === "textarea" ? (
                          <pre className="whitespace-pre-wrap font-mono text-[13px]">
                            {val || <span className="text-dim">—</span>}
                          </pre>
                        ) : (
                          val || <span className="text-dim">—</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
