import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const RTL_REGEX = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function detectDirection(text: string): "rtl" | "ltr" | null {
  if (!text || text.trim().length === 0) return null;
  return RTL_REGEX.test(text.charAt(0)) || RTL_REGEX.test(text.trim().charAt(0))
    ? "rtl"
    : "ltr";
}

const pluginKey = new PluginKey("textDirection");

/**
 * Auto-detects text direction per block based on its first strong character.
 * Also adds a `setTextDirection` command for manual override.
 */
export const TextDirection = Extension.create({
  name: "textDirection",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "codeBlock",
          "listItem",
          "taskItem",
          "bulletList",
          "orderedList",
          "taskList",
        ],
        attributes: {
          dir: {
            default: null,
            parseHTML: (el) => el.getAttribute("dir") || null,
            renderHTML: (attrs) => {
              if (!attrs.dir) return {};
              return { dir: attrs.dir };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction: "ltr" | "rtl") =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", { dir: direction })
            || commands.updateAttributes("heading", { dir: direction });
        },
      unsetTextDirection:
        () =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", { dir: null })
            || commands.updateAttributes("heading", { dir: null });
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => {
            const { doc } = state;
            const decorations: Decoration[] = [];

            doc.descendants((node, pos) => {
              if (!node.isBlock || node.isAtom) return;
              if (node.attrs.dir) return;

              const text = node.textContent;
              const dir = detectDirection(text);
              if (dir) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    dir,
                    style: dir === "rtl" ? "text-align: right" : "",
                  }),
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
