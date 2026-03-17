import { useState, useCallback, useEffect, useRef } from "react";
import { User, ChevronDown, Clock, Sparkles, Check, Loader2 } from "lucide-react";
import type { TiptapContentValue } from "@/data/editorInitialValue";
import type { ApiChannel } from "./types";
import { channelName } from "./StoryDetailChannelSelector";
import { ScriptEditorTiptap, type CollabUser } from "@/components/ScriptEditorTiptap";
import { scriptTextToEditorValue } from "@/data/editorInitialValue";

export interface StoryDetailScriptSectionProps {
  channels: ApiChannel[];
  selectedChannelId: string;
  onChannelSelect: (id: string) => void;
  scriptFormat: "short" | "long";
  onScriptFormatChange: (format: "short" | "long") => void;
  scriptDuration: number;
  onScriptDurationChange: (minutes: number) => void;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
  readOnly: boolean;
  /** Show Generate button + channel/format controls. False in filmed/publish/done. */
  showGenerateControls?: boolean;
  /** Tiptap value for Scripting / Filmed / Publish / Done. */
  scriptValue?: TiptapContentValue;
  onScriptChange?: (value: TiptapContentValue) => void;
  /** For live collaborators (avatars from Google sign-in). */
  storyId?: string;
  currentUser?: { id: string; name: string; avatarUrl: string | null } | null;
  collaborationWsUrl?: string;
  /** When true, show "Saving…" (auto-save in progress). */
  saving?: boolean;
  editorRef?: React.MutableRefObject<{ setContent: (v: TiptapContentValue) => void } | null>;
}

export function StoryDetailScriptSection({
  channels,
  selectedChannelId,
  onChannelSelect,
  scriptFormat,
  onScriptFormatChange,
  scriptDuration,
  onScriptDurationChange,
  canGenerate,
  generating,
  onGenerate,
  readOnly,
  showGenerateControls = true,
  scriptValue,
  onScriptChange,
  storyId,
  currentUser,
  collaborationWsUrl,
  saving = false,
  editorRef,
}: StoryDetailScriptSectionProps) {
  const [channelDropOpen, setChannelDropOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<{ id: string; name: string; avatar?: string; color?: string }[]>([]);
  const [durationInput, setDurationInput] = useState(() => String(scriptDuration));
  const userClearedRef = useRef(false);
  const selectedCh = channels.find((c) => c.id === selectedChannelId);

  // Sync duration input when format changes (parent sets new default)
  useEffect(() => {
    if (userClearedRef.current && scriptDuration === 0) {
      setDurationInput("");
      userClearedRef.current = false;
    } else {
      setDurationInput(String(scriptDuration));
    }
  }, [scriptDuration]);
  const value = scriptValue ?? scriptTextToEditorValue("");

  const roomId = storyId ? `script-${storyId}` : undefined;
  const onCollaboratorsChange = useCallback((users: CollabUser[]) => {
    setCollaborators(users.map((u) => ({ id: u.id, name: u.name, avatar: u.avatarUrl ?? undefined })));
  }, []);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] text-dim font-medium">Script</span>
        {saving && (
          <span className="flex items-center gap-1 text-[11px] text-dim font-normal">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        )}
      </div>
      <div className="rounded-xl bg-background border border-border overflow-visible">
        <div className="px-4 max-sm:px-3 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="inline-flex items-center bg-surface rounded-full border border-border flex-wrap">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => !readOnly && setChannelDropOpen(!channelDropOpen)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 hover:bg-elevated transition-colors rounded-l-full"
                >
                  {selectedCh ? (
                    selectedCh.avatarUrl ? (
                      <img
                        src={selectedCh.avatarUrl}
                        alt={channelName(selectedCh)}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                        {channelName(selectedCh).slice(0, 2)}
                      </div>
                    )
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-border/50 flex items-center justify-center">
                      <User className="w-3 h-3 text-dim" />
                    </div>
                  )}
                  {!readOnly && <ChevronDown className={`w-2.5 h-2.5 text-dim transition-transform ${channelDropOpen ? "rotate-180" : ""}`} />}
                </button>
                {channelDropOpen && !readOnly && (
                  <div className="absolute z-10 mt-2 left-0 w-64 rounded-xl bg-surface border border-border overflow-hidden shadow-lg">
                    {channels.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-dim text-center">
                        No channels added yet. Add your channels in the Channels page.
                      </div>
                    ) : (
                    channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onChannelSelect(c.id);
                          setChannelDropOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-elevated ${
                          selectedChannelId === c.id ? "bg-blue/10" : ""
                        }`}
                      >
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt={channelName(c)} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-elevated flex items-center justify-center text-[10px] font-mono text-dim uppercase">
                            {channelName(c).slice(0, 2)}
                          </div>
                        )}
                        <span className="flex-1 text-right font-medium">{channelName(c)}</span>
                        {selectedChannelId === c.id && <Check className="w-3.5 h-3.5 text-blue" />}
                      </button>
                    ))
                    )}
                  </div>
                )}
              </div>

              <span className="w-px h-4 bg-border" />

              <div className="flex items-center px-1">
                {(["short", "long"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      if (!readOnly) {
                        onScriptFormatChange(fmt);
                        onScriptDurationChange(fmt === "short" ? 3 : 40);
                      }
                    }}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap ${
                      scriptFormat === fmt
                        ? "bg-background text-foreground shadow-sm"
                        : "text-dim hover:text-sensor"
                    } ${readOnly ? "pointer-events-none" : ""}`}
                  >
                    {fmt === "short" ? "Short" : "Video"}
                  </button>
                ))}
              </div>

              <span className="w-px h-4 bg-border" />

              <div className="flex items-center gap-1 px-2.5 text-[11px] text-dim">
                <Clock className="w-3 h-3 shrink-0" />
                {readOnly ? (
                  <>
                    <span className="font-mono text-[11px]">{scriptDuration}</span>
                    <span className="font-mono text-[10px]">m</span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      step="0.1"
                      value={durationInput}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDurationInput(val);
                        if (val === "" || val === "-") {
                          userClearedRef.current = true;
                          onScriptDurationChange(0);
                          return;
                        }
                        const raw = parseFloat(val);
                        if (!Number.isNaN(raw) && raw >= 0) {
                          userClearedRef.current = false;
                          onScriptDurationChange(raw);
                        }
                      }}
                      onBlur={() => {
                        if (durationInput === "") {
                          setDurationInput(String(scriptDuration));
                        }
                      }}
                      className="w-12 bg-transparent font-mono text-[11px] text-foreground focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="font-mono text-[10px]">m</span>
                  </>
                )}
              </div>

              {showGenerateControls && !readOnly && (
                <>
                  <span className="w-px h-4 bg-border" />

                  <button
                    type="button"
                    onClick={() => canGenerate && !generating && onGenerate()}
                    disabled={!canGenerate}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap rounded-r-full ${
                      canGenerate ? "text-foreground hover:bg-elevated" : "text-dim/30 cursor-not-allowed"
                    }`}
                  >
                    {generating ? (
                      <span className="w-3 h-3 border border-dim border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Generate
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center -space-x-2 max-sm:hidden">
            {collaborators.length > 0 ? (
              <>
                {collaborators.slice(0, 5).map((u) => (
                  <div key={u.id} className="relative">
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="w-7 h-7 rounded-full object-cover border-2 border-background"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-mono text-dim"
                        style={{ backgroundColor: u.color ? `${u.color}33` : undefined }}
                        title={u.name}
                      >
                        {(u.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success border border-background" />
                  </div>
                ))}
                {collaborators.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-surface border-2 border-background flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                    +{collaborators.length - 5}
                  </div>
                )}
              </>
            ) : (
              <div className="w-7 h-7 rounded-full bg-surface border-2 border-background flex items-center justify-center text-[10px] text-muted-foreground">
                —
              </div>
            )}
          </div>
        </div>

        <div className="px-5 max-sm:px-3 py-4 overflow-visible bg-background">
          <ScriptEditorTiptap
            value={value}
            onChange={onScriptChange}
            readOnly={readOnly}
            roomId={roomId}
            currentUser={currentUser ?? undefined}
            onCollaboratorsChange={onCollaboratorsChange}
            editorRef={editorRef}
          />
        </div>
      </div>
    </section>
  );
}
