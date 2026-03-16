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
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from "@yoopta/marks";
import {
  SlashCommandMenu,
  FloatingToolbar,
  FloatingBlockActions,
  BlockOptions,
} from "@yoopta/ui";
import { DEFAULT_SCRIPT_VALUE } from "@/data/editorInitialValue";

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
];

const MARKS = [Bold, Italic, Underline, Strike, CodeMark, Highlight];

const EDITOR_STYLES = {
  width: "100%",
  minHeight: 200,
  paddingBottom: 60,
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);

  const editor = useMemo(
    () => createYooptaEditor({ plugins: PLUGINS as YooptaPlugin<unknown, unknown>[], marks: MARKS }),
    []
  );

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    const toSet =
      value && Object.keys(value).length > 0 ? value : DEFAULT_SCRIPT_VALUE;
    editor.withoutSavingHistory(() => {
      editor.setEditorValue(toSet);
    });
  }, [editor]);

  const handleChange = useCallback(
    (newValue: YooptaContentValue) => {
      onChange?.(newValue);
    },
    [onChange]
  );

  const handleSlashSelect = useCallback(
    (item: { id: string } | undefined) => {
      if (!item?.id) return;
      editor.toggleBlock(item.id, {
        preserveContent: true,
        focus: true,
        at: editor.path.current,
      });
    },
    [editor]
  );

  return (
    <div
      ref={containerRef}
      className="yoopta-editor-container min-h-[200px] overflow-visible"
    >
      <YooptaEditor
        editor={editor}
        style={EDITOR_STYLES}
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
            <SlashCommandMenu trigger="/" onSelect={handleSlashSelect} />
          </>
        )}
      </YooptaEditor>
    </div>
  );
}
