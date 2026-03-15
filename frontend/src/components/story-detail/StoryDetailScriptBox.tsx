import { ChevronDown, Sparkles, Pencil, Loader2 } from "lucide-react";
import { CopyBtn } from "./CopyBtn";
import type { StoryBrief } from "./types";

export interface ScriptField {
  key: keyof StoryBrief;
  label: string;
  placeholder: string;
  type: "input" | "textarea";
}

const FORMAT_LABELS: Record<"short" | "long", string> = {
  short: "Short (up to 3 min)",
  long: "Video (3 min – unlimited)",
};

export interface StoryDetailScriptBoxProps {
  brief: StoryBrief;
  scriptSaved: boolean;
  scriptOpen: boolean;
  setScriptOpen: (v: boolean) => void;
  editingField: string | null;
  setEditingField: (v: string | null) => void;
  scriptFields: ScriptField[];
  scriptFormat: "short" | "long";
  onScriptFormatChange: (format: "short" | "long") => void;
  onSave: (b: StoryBrief) => Promise<void>;
  onFieldDone: (key: string) => void;
  onBriefChange: (key: keyof StoryBrief, val: string) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerateScript: () => Promise<void>;
  scriptViewMode?: "structured" | "full";
  onScriptViewModeChange?: (mode: "structured" | "full") => void;
}

export function StoryDetailScriptBox({
  brief,
  scriptSaved,
  scriptOpen,
  setScriptOpen,
  editingField,
  setEditingField,
  scriptFields,
  scriptFormat,
  onScriptFormatChange,
  onSave,
  onFieldDone,
  onBriefChange,
  canGenerate,
  generating,
  onGenerateScript,
  scriptViewMode = "structured",
  onScriptViewModeChange,
}: StoryDetailScriptBoxProps) {
  return (
    <div>
      <div className="text-[12px] text-dim font-medium mb-2">Script</div>
      <div className="rounded-xl bg-background border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setScriptOpen(!scriptOpen)}
        className="w-full flex items-center justify-between px-4 max-sm:px-3 py-3 border-b border-border hover:bg-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim font-mono uppercase tracking-widest">Script</span>
          {scriptSaved && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (canGenerate && !generating) await onGenerateScript();
            }}
            disabled={!canGenerate || generating}
            title={!canGenerate ? "Select a channel and ensure article content is loaded" : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-blue bg-blue/10 rounded-full hover:bg-blue/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate with AI
          </button>
          <ChevronDown
            className={`w-4 h-4 text-dim transition-transform ${scriptOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {scriptOpen && (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-surface rounded-full w-fit">
            {(["short", "long"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onScriptFormatChange(fmt)}
                className={`px-4 py-1.5 text-[11px] font-semibold rounded-full transition-colors ${
                  scriptFormat === fmt ? "bg-foreground/10 text-foreground" : "text-dim hover:text-sensor"
                }`}
              >
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>

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
                <textarea
                  readOnly
                  value={brief.scriptRaw ?? ""}
                  placeholder="Generate with AI to see the full output in one box."
                  rows={16}
                  className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim text-right leading-relaxed resize-y"
                />
              )}
            </div>
          ) : (
            <>
              {scriptFields.map((field) => {
                const val = (brief[field.key] as string) ?? "";
                const isEditing = !scriptSaved || editingField === field.key;
                return (
                  <div key={String(field.key)}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-dim font-mono uppercase tracking-wider">
                        {field.label}
                      </label>
                      {scriptSaved && editingField !== field.key && val && (
                        <button
                          type="button"
                          onClick={() => setEditingField(String(field.key))}
                          className="flex items-center gap-1 text-[10px] text-dim hover:text-sensor transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                      {scriptSaved && editingField === field.key && (
                        <button
                          type="button"
                          onClick={() => onFieldDone(String(field.key))}
                          className="text-[10px] text-blue hover:text-blue/80 font-medium transition-colors"
                        >
                          Done
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      field.type === "textarea" ? (
                        <textarea
                          value={val}
                          onChange={(e) => onBriefChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={scriptFormat === "short" ? 3 : 5}
                          className="w-full px-4 py-3 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40 text-right leading-relaxed resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => onBriefChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
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

              {!scriptSaved && (
                <button
                  type="button"
                  onClick={() => onSave(brief)}
                  className="w-full py-2.5 text-[13px] font-semibold rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
