import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useCreateBlockNote, type PartialBlock } from "@blocknote/react";
import { BlockNoteView as MantineBlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { MantineProvider } from "@mantine/core";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface StoryLogEntry {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  user: { name: string | null; avatarUrl: string | null } | null;
}

export interface ScriptEditorProps {
  storyId: string;
  currentUser: { id: string; name: string; avatarUrl: string };
  initialScript: string;
  format: "short" | "long";
  log: StoryLogEntry[];
  readOnly?: boolean;
  onAutosave?: (scriptText: string) => Promise<void>;
}

// ─── Falak dark theme (BlockNote Theme shape) ───────────────────────────────

const falakTheme = {
  colors: {
    editor: { text: "#EDEDED", background: "#0F0F10" },
    menu: { text: "#EDEDED", background: "#121212" },
    tooltip: { text: "#EDEDED", background: "#121212" },
    hovered: { text: "#EDEDED", background: "#1A1A1A" },
    selected: { text: "#FFFFFF", background: "#7C6FCD" },
    disabled: { text: "#737373", background: "transparent" },
    shadow: "rgba(0,0,0,0.5)",
    border: "#181819",
    sideMenu: "#737373",
    highlights: {
      gray: { text: "#EDEDED", background: "#1A1A1A" },
      purple: { text: "#D4B3FF", background: "#221A3A" },
      blue: { text: "#B3DCFF", background: "#0F2A3A" },
      green: { text: "#B3FFD1", background: "#103A20" },
      red: { text: "#FFB3B3", background: "#3A1A1A" },
    },
  },
  borderRadius: 0,
  fontFamily: "Inter, system-ui, sans-serif",
} as const;

// ─── Helpers: plain text ↔ blocks ──────────────────────────────────────────

function scriptToBlocks(script: string): PartialBlock[] {
  const lines = (script || "").split("\n");
  if (lines.length === 0) return [{ type: "paragraph", content: "" }];
  return lines.map((line) => ({
    type: "paragraph" as const,
    content: line || "",
  }));
}

function blocksToScript(blocks: Block[]): string {
  return (blocks || []).map((b) => blockToPlainText(b)).join("\n");
}

function blockToPlainText(block: Block): string {
  const c = block.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((item: { text?: string }) => (item && "text" in item ? item.text || "" : "")).join("");
  }
  return "";
}

// User color for awareness (stable from name)
function nameToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  h = Math.abs(h) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ScriptEditor({
  storyId,
  currentUser,
  initialScript,
  format: _format,
  log,
  readOnly = false,
  onAutosave,
}: ScriptEditorProps) {
  const [historyOpen, setHistoryOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 640
  );
  const [keyboardPadding, setKeyboardPadding] = useState(0);
  const [awarenessUsers, setAwarenessUsers] = useState<Array<{ name: string; color: string }>>([]);
  const editorRef = useRef<ReturnType<typeof useCreateBlockNote> | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const seededRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const wsUrl = useMemo(() => {
    const base =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:1234`;
    return base.replace(/\/$/, "");
  }, []);

  const roomName = `script-${storyId}`;
  const fragmentName = "prosemirror";

  const ydoc = useMemo(() => new Y.Doc(), []);
  ydocRef.current = ydoc;

  const provider = useMemo(
    () =>
      new WebsocketProvider(wsUrl, roomName, ydoc, {
        connect: true,
      }),
    [wsUrl, roomName, ydoc]
  );
  providerRef.current = provider;

  const collaboration = useMemo(
    () => ({
      fragment: ydoc.getXmlFragment(fragmentName),
      provider,
      user: {
        name: currentUser.name || "Anonymous",
        color: nameToColor(currentUser.name || "user"),
      },
      showCursorLabels: "activity" as const,
    }),
    [ydoc, provider, currentUser.name]
  );

  useEffect(() => {
    const awareness = provider.awareness;
    const updateUsers = () => {
      const states = awareness.getStates();
      const users: Array<{ name: string; color: string }> = [];
      states.forEach((state: Record<string, unknown>) => {
        const user = state.user as { name?: string; color?: string } | undefined;
        if (user?.name) users.push({ name: user.name, color: user.color || "#7C6FCD" });
      });
      setAwarenessUsers(users);
    };
    awareness.on("change", updateUsers);
    updateUsers();
    return () => awareness.off("change", updateUsers);
  }, [provider]);

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
    };
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }, []);

  const editor = useCreateBlockNote({
    collaboration,
    uploadFile,
  });
  editorRef.current = editor;

  // Seed initial script when doc is empty (first load)
  useEffect(() => {
    if (seededRef.current || !initialScript?.trim()) return;
    const onSync = (synced: boolean) => {
      if (!synced || seededRef.current) return;
      try {
        const blocks = editor.document;
        const isEmpty =
          blocks.length === 0 ||
          (blocks.length === 1 && blockToPlainText(blocks[0]) === "" && !blocks[0].children?.length);
        if (isEmpty) {
          seededRef.current = true;
          const initialBlocks = scriptToBlocks(initialScript);
          if (initialBlocks.length > 0) {
            editor.replaceBlocks(blocks, initialBlocks);
          }
        }
      } catch {
        // ignore
      }
    };
    provider.on("sync", onSync);
    if (provider.synced) onSync(true);
    return () => provider.off("sync", onSync);
  }, [editor, initialScript, provider]);

  // Debounced autosave (2s)
  const handleChange = useCallback(() => {
    if (readOnly || !onAutosave) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      try {
        const blocks = editor.document;
        const text = blocksToScript(blocks);
        onAutosave(text);
      } catch {
        // ignore
      }
    }, 2000);
  }, [editor, readOnly, onAutosave]);

  useEffect(() => {
    const off = editor.onChange(handleChange);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      off();
    };
  }, [editor, handleChange]);

  // Visual viewport for mobile keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const padding = vv.height > 0 ? Math.max(0, vv.height - vv.offsetBottom) : 0;
      setKeyboardPadding(padding);
    };
    vv.addEventListener("resize", update);
    update();
    return () => vv.removeEventListener("resize", update);
  }, []);

  const lastScriptEdit = useMemo(() => {
    return (log ?? []).find((e) => e.action === "script_edit") || null;
  }, [log]);

  return (
    <div
      ref={wrapperRef}
      className="script-editor-wrapper w-full overflow-hidden"
      dir="rtl"
      style={{ paddingBottom: keyboardPadding }}
    >
      <MantineProvider theme={{ colorScheme: "dark" }}>
        {/* Last edited */}
        {lastScriptEdit && (
          <p className="text-[11px] text-dim mb-2 text-right">
            Last edited by {lastScriptEdit.user?.name ?? "Unknown"} ·{" "}
            {formatDistanceToNow(new Date(lastScriptEdit.createdAt), {
              addSuffix: true,
            })}
          </p>
        )}

        {/* Live collaborators */}
        {awarenessUsers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2 justify-end">
            <Users className="w-3.5 h-3.5 text-dim" />
            {awarenessUsers.map((u) => (
              <span
                key={u.name}
                className="text-[11px] px-2 py-0.5 rounded-full text-dim border border-border"
                style={{ borderLeftColor: u.color, borderLeftWidth: 3 }}
              >
                {u.name}
              </span>
            ))}
          </div>
        )}

        {/* BlockNote editor — min tap 44px via CSS class */}
        <div className="bn-editor-falak min-h-[120px] [&_.bn-block-content]:min-h-[44px] [&_button]:min-h-[44px] [&_button]:min-w-[44px]">
          <MantineBlockNoteView
            editor={editor}
            theme={falakTheme}
            editable={!readOnly}
            onChange={handleChange}
          />
        </div>

        {/* Edit history — collapsible, default open on desktop, closed on mobile */}
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 py-2 text-[10px] font-mono uppercase tracking-widest text-dim hover:text-sensor transition-colors"
          >
            Edit history
            {historyOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {historyOpen && (
            <ul className="space-y-2 max-h-[200px] overflow-y-auto mt-2">
              {(log ?? []).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 text-right py-1.5 border-b border-border/50 last:border-0"
                >
                  {entry.user?.avatarUrl ? (
                    <img
                      src={entry.user.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-elevated shrink-0 flex items-center justify-center text-[10px] font-mono text-dim">
                      {(entry.user?.name || "?").slice(0, 1)}
                    </div>
                  )}
                  <span className="text-[12px] text-foreground truncate flex-1">
                    {entry.user?.name ?? "Unknown"}
                  </span>
                  <span className="text-[11px] text-dim shrink-0">{entry.action}</span>
                  {entry.note && (
                    <span className="text-[11px] text-dim truncate max-w-[120px]" title={entry.note}>
                      {entry.note}
                    </span>
                  )}
                  <span className="text-[10px] text-dim shrink-0">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </MantineProvider>
    </div>
  );
}
