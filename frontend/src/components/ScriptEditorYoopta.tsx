import { useCallback, useEffect, useMemo, useRef } from "react";
import YooptaEditor, {
  createYooptaEditor,
  type YooptaContentValue,
  type YooptaPlugin,
} from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { HeadingOne, HeadingTwo, HeadingThree } from "@yoopta/headings";
import Blockquote from "@yoopta/blockquote";
import { NumberedList, BulletedList, TodoList } from "@yoopta/lists";
import Divider from "@yoopta/divider";
import Link from "@yoopta/link";
import { Code, CodeGroup } from "@yoopta/code";
import Callout from "@yoopta/callout";
import Accordion from "@yoopta/accordion";
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from "@yoopta/marks";
import Image from "@yoopta/image";
import Video from "@yoopta/video";
import File from "@yoopta/file";
import Embed from "@yoopta/embed";
import Table from "@yoopta/table";
import Tabs from "@yoopta/tabs";
import Steps from "@yoopta/steps";
import Carousel from "@yoopta/carousel";
import Mention from "@yoopta/mention";
import Emoji from "@yoopta/emoji";
import TableOfContents from "@yoopta/table-of-contents";
import { FloatingToolbar, FloatingBlockActions, BlockOptions, SlashCommandMenu } from "@yoopta/ui";
import { withCollaboration, RemoteCursors, useCollaboration } from "@yoopta/collaboration";
import type { CollaborationUser, CollaborationYooEditor } from "@yoopta/collaboration";
import {
  DEFAULT_SCRIPT_VALUE,
  scriptTextToYooptaValue,
  yooptaValueToScriptText,
} from "@/data/editorInitialValue";

function nameToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  h = Math.abs(h) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

const PLUGINS = [
  Paragraph,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  Blockquote,
  Callout,
  NumberedList,
  BulletedList,
  TodoList,
  Divider,
  Link,
  Code,
  CodeGroup,
  Image,
  Video,
  File,
  Embed,
  Table,
  Tabs,
  Steps,
  Carousel,
  Mention,
  Emoji,
  TableOfContents,
] as YooptaPlugin<unknown, unknown>[];

const MARKS = [Bold, Italic, Underline, Strike, CodeMark, Highlight];

function areYooptaValuesEqual(
  a: YooptaContentValue | undefined | null,
  b: YooptaContentValue | undefined | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return yooptaValueToScriptText(a) === yooptaValueToScriptText(b);
}

export interface CollaborationCurrentUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ScriptEditorYooptaProps {
  value?: YooptaContentValue;
  onChange?: (value: YooptaContentValue) => void;
  readOnly?: boolean;
  /** When set, enables live collaboration and reports connected users for avatar display. */
  roomId?: string;
  collaborationWsUrl?: string;
  currentUser?: CollaborationCurrentUser;
  onCollaboratorsChange?: (users: CollaborationUser[]) => void;
}

/** Reports connectedUsers to parent; must be rendered inside YooptaEditor with collaboration. */
function SyncCollaborators({ onCollaboratorsChange }: { onCollaboratorsChange?: (users: CollaborationUser[]) => void }) {
  const { connectedUsers } = useCollaboration();
  useEffect(() => {
    onCollaboratorsChange?.(connectedUsers);
  }, [connectedUsers, onCollaboratorsChange]);
  return null;
}

export function ScriptEditorYoopta({
  value,
  onChange,
  readOnly = false,
  roomId,
  collaborationWsUrl,
  currentUser,
  onCollaboratorsChange,
}: ScriptEditorYooptaProps) {
  const lastSyncedRef = useRef<YooptaContentValue | undefined>(undefined);
  const editorRef = useRef<ReturnType<typeof createYooptaEditor> | CollaborationYooEditor | null>(null);

  const collaborationEnabled = Boolean(roomId && collaborationWsUrl && currentUser);

  const editor = useMemo(() => {
    const base = createYooptaEditor({
      plugins: PLUGINS,
      marks: MARKS,
      readOnly,
    });
    if (!collaborationEnabled) {
      editorRef.current = base;
      return base;
    }
    const collab = withCollaboration(base, {
      url: collaborationWsUrl!,
      roomId: roomId!,
      user: {
        id: currentUser!.id,
        name: currentUser!.name,
        color: nameToColor(currentUser!.name),
        avatar: currentUser!.avatarUrl ?? undefined,
      },
    });
    editorRef.current = collab;
    return collab;
  }, [readOnly, collaborationEnabled, roomId, collaborationWsUrl, currentUser?.id, currentUser?.name, currentUser?.avatarUrl]);

  useEffect(() => {
    return () => {
      const ed = editorRef.current as CollaborationYooEditor | undefined;
      if (ed?.collaboration?.destroy) ed.collaboration.destroy();
    };
  }, []);

  useEffect(() => {
    const toSet = value && Object.keys(value).length > 0 ? value : DEFAULT_SCRIPT_VALUE;
    if (areYooptaValuesEqual(lastSyncedRef.current, toSet)) return;
    lastSyncedRef.current = toSet;
    editor.withoutSavingHistory(() => {
      editor.setEditorValue(toSet);
    });
  }, [editor, value]);

  const handleChange = useCallback(
    (newValue: YooptaContentValue) => {
      onChange?.(newValue);
    },
    [onChange]
  );

  return (
    <div
      className="script-editor-yoopta min-h-[200px] overflow-visible bg-background text-foreground"
      data-theme="dark"
      data-yoopta-theme="dark"
    >
      <YooptaEditor
        editor={editor}
        style={{ width: "100%", minHeight: 200, paddingBottom: 60, background: "transparent" }}
        placeholder="Type / to open commands…"
        onChange={handleChange}
        readOnly={readOnly}
      >
        {collaborationEnabled && (
          <>
            <SyncCollaborators onCollaboratorsChange={onCollaboratorsChange} />
            <RemoteCursors />
          </>
        )}
        {!readOnly && (
          <>
            <FloatingToolbar />
            <FloatingBlockActions>
              <BlockOptions />
            </FloatingBlockActions>
            <SlashCommandMenu />
          </>
        )}
      </YooptaEditor>
    </div>
  );
}
