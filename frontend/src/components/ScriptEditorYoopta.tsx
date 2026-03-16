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
import Code from "@yoopta/code";
import Table from "@yoopta/table";
import Accordion from "@yoopta/accordion";
import Divider from "@yoopta/divider";
import Link from "@yoopta/link";
import Embed from "@yoopta/embed";
import Image from "@yoopta/image";
import Video from "@yoopta/video";
import File from "@yoopta/file";
import Steps from "@yoopta/steps";
import TableOfContents from "@yoopta/table-of-contents";
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from "@yoopta/marks";
import { applyTheme } from "@yoopta/themes-shadcn";
import {
  SlashCommandMenu,
  FloatingToolbar,
  FloatingBlockActions,
  BlockOptions,
} from "@yoopta/ui";
import { DEFAULT_SCRIPT_VALUE } from "@/data/editorInitialValue";

const YImage = Image.extend({
  options: {
    upload: async (file: globalThis.File) => ({
      id: file.name,
      src: URL.createObjectURL(file),
      alt: "uploaded",
      fit: "cover" as const,
      sizes: { width: file.size, height: file.size },
    }),
  },
});

const PLUGINS: unknown[] = [
  TableOfContents,
  File.extend({
    options: {
      upload: async (file: globalThis.File) => ({
        id: file.name,
        src: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        format: file.name.split(".").pop(),
      }),
    },
  }),
  Code.Code,
  Code.CodeGroup,
  Table,
  Accordion,
  Divider,
  Paragraph,
  HeadingOne.extend({
    elements: { "heading-one": { placeholder: "Heading 1" } },
  }),
  HeadingTwo,
  HeadingThree,
  Blockquote,
  Callout,
  Link,
  NumberedList,
  BulletedList,
  TodoList,
  Embed,
  YImage,
  Video.extend({
    options: {
      upload: async (file: globalThis.File) => ({
        id: file.name,
        src: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        format: file.name.split(".").pop(),
      }),
    },
  }),
  Steps.extend({
    elements: {
      "step-list-item-heading": { placeholder: "Step title" },
      "step-list-item-content": { placeholder: "Describe this step..." },
    },
  }),
];

const MARKS = [Bold, Italic, Underline, Strike, CodeMark, Highlight];

const EDITOR_STYLES = {
  width: "100%",
  paddingBottom: 60,
};

export interface ScriptEditorYooptaProps {
  value?: YooptaContentValue;
  onChange?: (value: YooptaContentValue) => void;
  readOnly?: boolean;
}

export function ScriptEditorYoopta({ value, onChange, readOnly = false }: ScriptEditorYooptaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef<YooptaContentValue | undefined>(value);

  const editor = useMemo(() => {
    return createYooptaEditor({
      plugins: applyTheme(PLUGINS) as unknown as YooptaPlugin<unknown, unknown>[],
      marks: MARKS,
    });
  }, []);

  useEffect(() => {
    const toSet = value && Object.keys(value).length > 0 ? value : DEFAULT_SCRIPT_VALUE;
    initialValueRef.current = toSet;
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

  const slashItems = useMemo(() => {
    return Object.entries(editor.plugins).map(([type, plugin]) => ({
      id: type,
      title: (plugin as { options?: { display?: { title?: string } } }).options?.display?.title ?? type,
      description: (plugin as { options?: { display?: { description?: string } } }).options?.display?.description,
      icon: (plugin as { options?: { display?: { icon?: unknown } } }).options?.display?.icon,
      keywords: [type, (plugin as { options?: { display?: { title?: string } } }).options?.display?.title].filter(Boolean) as string[],
    }));
  }, [editor]);

  const handleSlashSelect = useCallback(
    (item: { id: string }) => {
      editor.toggleBlock(item.id, {
        preserveContent: true,
        focus: true,
        at: editor.path.current,
      });
    },
    [editor]
  );

  return (
    <div ref={containerRef} className="yoopta-editor-container">
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
            <SlashCommandMenu items={slashItems} trigger="/" onSelect={handleSlashSelect} />
          </>
        )}
      </YooptaEditor>
    </div>
  );
}
