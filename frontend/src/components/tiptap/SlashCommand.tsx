import { Extension } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { createRoot, type Root } from "react-dom/client";
import { SLASH_MENU_ITEMS } from "../ScriptEditorTiptap";

interface CommandItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function CommandList({
  items,
  command,
  refCb,
}: {
  items: CommandItem[];
  command: (item: CommandItem) => void;
  refCb: (ref: CommandListRef) => void;
}) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  React.useEffect(() => {
    refCb({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    });
  });

  if (items.length === 0) {
    return (
      <div className="slash-menu-empty">No results</div>
    );
  }

  return (
    <div className="slash-menu">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`slash-menu-item ${index === selectedIndex ? "is-selected" : ""}`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="slash-menu-item-icon">{item.icon}</span>
          <span className="slash-menu-item-content">
            <span className="slash-menu-item-title">{item.title}</span>
            <span className="slash-menu-item-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

import React from "react";

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props: item,
        }: {
          editor: Editor;
          range: Range;
          props: CommandItem;
        }) => {
          editor.chain().focus().deleteRange(range).run();
          item.command(editor);
        },
        items: ({ query }: { query: string }) => {
          return SLASH_MENU_ITEMS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          );
        },
        render: () => {
          let popup: TippyInstance | undefined;
          let root: Root | undefined;
          let component: CommandListRef | undefined;

          return {
            onStart: (props: {
              clientRect: (() => DOMRect | null) | null;
              items: CommandItem[];
              command: (item: CommandItem) => void;
              editor: Editor;
            }) => {
              const el = document.createElement("div");
              root = createRoot(el);

              root.render(
                <CommandList
                  items={props.items}
                  command={props.command}
                  refCb={(ref) => {
                    component = ref;
                  }}
                />,
              );

              const getReferenceClientRect = props.clientRect;

              popup = tippy(document.body, {
                getReferenceClientRect: getReferenceClientRect as () => DOMRect,
                appendTo: () => document.body,
                content: el,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                maxWidth: 320,
                arrow: false,
                theme: "slash-command",
              });
            },

            onUpdate: (props: {
              clientRect: (() => DOMRect | null) | null;
              items: CommandItem[];
              command: (item: CommandItem) => void;
            }) => {
              root?.render(
                <CommandList
                  items={props.items}
                  command={props.command}
                  refCb={(ref) => {
                    component = ref;
                  }}
                />,
              );

              if (props.clientRect) {
                popup?.setProps({
                  getReferenceClientRect:
                    props.clientRect as () => DOMRect,
                });
              }
            },

            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup?.destroy();
              setTimeout(() => root?.unmount(), 0);
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
