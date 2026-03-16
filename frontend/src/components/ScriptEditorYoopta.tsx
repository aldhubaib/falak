import { useCallback, useEffect, useMemo, useRef } from "react";
import YooptaEditor, {
  createYooptaEditor,
  type YooptaContentValue,
  type YooptaPlugin,
} from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { HeadingOne, HeadingTwo, HeadingThree } from "@yoopta/headings";
import Blockquote from "@yoopta/blockquote";
import Callout from "@yoopta/callout";
import { NumberedList, BulletedList, TodoList } from "@yoopta/lists";
import Divider from "@yoopta/divider";
import Link from "@yoopta/link";
import { Code } from "@yoopta/code";
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from "@yoopta/marks";
import {
  FloatingToolbar,
  FloatingBlockActions,
  BlockOptions,
  SlashCommandMenu,
} from "@yoopta/ui";
import {
  DEFAULT_SCRIPT_VALUE,
  yooptaValueToScriptText,
} from "@/data/editorInitialValue";

const PLUGINS: YooptaPlugin<unknown, unknown>[] = [
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
  roomId?: string;
  collaborationWsUrl?: string;
  currentUser?: CollaborationCurrentUser;
  onCollaboratorsChange?: (users: unknown[]) => void;
}

export function ScriptEditorYoopta({
  value,
  onChange,
  readOnly = false,
}: ScriptEditorYooptaProps) {
  const initialValueRef = useRef(value);
  const lastSyncedRef = useRef<YooptaContentValue | undefined>(undefined);
  const mountedRef = useRef(false);

  const editor = useMemo(() => {
    const e = createYooptaEditor({ plugins: PLUGINS, marks: MARKS, readOnly });
    const toSet =
      initialValueRef.current && Object.keys(initialValueRef.current).length > 0
        ? initialValueRef.current
        : DEFAULT_SCRIPT_VALUE;
    lastSyncedRef.current = toSet;
    e.withoutSavingHistory(() => {
      e.setEditorValue(toSet);
    });
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const toSet =
      value && Object.keys(value).length > 0 ? value : DEFAULT_SCRIPT_VALUE;
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
    <div className="script-editor-yoopta min-h-[500px] overflow-visible">
      <YooptaEditor
        editor={editor}
        style={{ width: "100%", minHeight: 500, paddingBottom: 60 }}
        placeholder="Type / to open commands…"
        onChange={handleChange}
      >
        {!readOnly && (
          <>
            <FloatingToolbar />
            <FloatingBlockActions>
              <BlockOptions />
            </FloatingBlockActions>
            <SlashCommandMenu trigger="/">
              {({ items }) => (
                <SlashCommandMenu.Content>
                  <SlashCommandMenu.Input placeholder="Search blocks..." />
                  <SlashCommandMenu.List>
                    {items.map((item) => (
                      <SlashCommandMenu.Item
                        key={item.id}
                        value={item.id}
                        title={item.title}
                        description={item.description}
                        icon={item.icon}
                      />
                    ))}
                  </SlashCommandMenu.List>
                  <SlashCommandMenu.Empty>
                    No results found
                  </SlashCommandMenu.Empty>
                  <SlashCommandMenu.Footer />
                </SlashCommandMenu.Content>
              )}
            </SlashCommandMenu>
          </>
        )}
      </YooptaEditor>
    </div>
  );
}
