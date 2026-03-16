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
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from "@yoopta/marks";
import { FloatingToolbar, FloatingBlockActions, BlockOptions, SlashCommandMenu } from "@yoopta/ui";
import {
  DEFAULT_SCRIPT_VALUE,
  scriptTextToYooptaValue,
  yooptaValueToScriptText,
} from "@/data/editorInitialValue";

const PLUGINS = [
  Paragraph,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  Blockquote,
  NumberedList,
  BulletedList,
  TodoList,
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

export interface ScriptEditorYooptaProps {
  value?: YooptaContentValue;
  onChange?: (value: YooptaContentValue) => void;
  readOnly?: boolean;
}

export function ScriptEditorYoopta({
  value,
  onChange,
  readOnly = false,
}: ScriptEditorYooptaProps) {
  const lastSyncedRef = useRef<YooptaContentValue | undefined>(undefined);

  const editor = useMemo(
    () =>
      createYooptaEditor({
        plugins: PLUGINS,
        marks: MARKS,
        readOnly,
      }),
    [readOnly]
  );

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
