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
import {
  Bold,
  Italic,
  Underline,
  Strike,
  CodeMark,
  Highlight,
} from "@yoopta/marks";
import { FloatingToolbar } from "@yoopta/ui/floating-toolbar";
import { FloatingBlockActions } from "@yoopta/ui/floating-block-actions";
import { SlashCommandMenu } from "@yoopta/ui/slash-command-menu";
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

const EDITOR_STYLE = {
  width: "100%" as const,
  paddingBottom: 200,
};

/**
 * Ref that stores the correct block type from each Item's onSelect callback.
 * The library's executeSelected has a race condition where it reads a stale
 * selectedIndex. We use the Item onSelect (fires first) to capture the correct
 * type, then the Root onSelect (fires second inside executeSelected) reads it.
 */
const pendingBlockRef = { current: "" };

const NOOP_ROOT_SELECT = () => {
  // Intentional no-op: prevents the library's default toggleBlock call inside
  // executeSelected, which would use the wrong item due to stale selectedIndex.
  // The actual insertion is handled by each Item's onSelect callback.
};

function areValuesEqual(
  a: YooptaContentValue | undefined | null,
  b: YooptaContentValue | undefined | null,
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
  const lastSyncedRef = useRef<YooptaContentValue | undefined>(undefined);

  const editor = useMemo(
    () => createYooptaEditor({ plugins: PLUGINS, marks: MARKS }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const toSet =
      value && Object.keys(value).length > 0 ? value : DEFAULT_SCRIPT_VALUE;
    if (areValuesEqual(lastSyncedRef.current, toSet)) return;
    lastSyncedRef.current = toSet;
    editor.withoutSavingHistory(() => {
      editor.setEditorValue(toSet);
    });
  }, [editor, value]);

  const handleChange = useCallback(
    (newValue: YooptaContentValue) => {
      lastSyncedRef.current = newValue;
      onChange?.(newValue);
    },
    [onChange],
  );

  return (
    <div className="script-editor-yoopta min-h-[800px] overflow-visible">
      <YooptaEditor
        editor={editor}
        style={EDITOR_STYLE}
        placeholder="Type / to open menu, or start typing..."
        onChange={handleChange}
        readOnly={readOnly}
        autoFocus
      >
        {!readOnly && (
          <>
            <FloatingToolbar />
            <FloatingBlockActions />
            <SlashCommandMenu trigger="/" onSelect={NOOP_ROOT_SELECT}>
              {({ items }) => (
                <SlashCommandMenu.Content>
                  <SlashCommandMenu.Input placeholder="Search blocks..." />
                  <SlashCommandMenu.Empty>
                    No blocks found
                  </SlashCommandMenu.Empty>
                  {items.map((item) => (
                    <SlashCommandMenu.Item
                      key={item.id}
                      value={item.id}
                      title={item.title}
                      description={item.description}
                      icon={item.icon}
                      onSelect={() => {
                        pendingBlockRef.current = item.id;
                        editor.toggleBlock(item.id, {
                          scope: "auto",
                          focus: true,
                          preserveContent: false,
                        });
                      }}
                    />
                  ))}
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
