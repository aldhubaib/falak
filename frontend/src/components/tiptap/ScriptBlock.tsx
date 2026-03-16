import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

export type ScriptBlockType =
  | "title"
  | "hook"
  | "hookStart"
  | "script"
  | "hookEnd"
  | "hashtags";

const BLOCK_META: Record<ScriptBlockType, { label: string; color: string }> = {
  title:     { label: "العنوان",        color: "var(--script-block-title)" },
  hook:      { label: "الهوك",          color: "var(--script-block-hook)" },
  hookStart: { label: "مقدمة القناة",   color: "var(--script-block-hookStart)" },
  script:    { label: "السكربت",        color: "var(--script-block-script)" },
  hookEnd:   { label: "خاتمة القناة",   color: "var(--script-block-hookEnd)" },
  hashtags:  { label: "الهاشتاقات",     color: "var(--script-block-hashtags)" },
};

function ScriptBlockView({ node }: NodeViewProps) {
  const blockType = (node.attrs.blockType as ScriptBlockType) || "script";
  const meta = BLOCK_META[blockType] ?? BLOCK_META.script;

  return (
    <NodeViewWrapper
      className="script-block"
      data-block-type={blockType}
      style={{ "--sb-color": meta.color } as React.CSSProperties}
    >
      <div className="script-block-label" contentEditable={false}>
        <span className="script-block-label-dot" />
        <span>{meta.label}</span>
      </div>
      <NodeViewContent className="script-block-content" />
    </NodeViewWrapper>
  );
}

export const ScriptBlockExtension = Node.create({
  name: "scriptBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      blockType: {
        default: "script" as ScriptBlockType,
        parseHTML: (element) => element.getAttribute("data-block-type") || "script",
        renderHTML: (attributes) => ({ "data-block-type": attributes.blockType }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scriptBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "scriptBlock" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScriptBlockView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $anchor } = editor.state.selection;
        const parentNode = $anchor.node($anchor.depth - 1);
        if (parentNode?.type.name !== this.name) return false;
        const isAtStart = $anchor.parentOffset === 0;
        const isFirstChild = $anchor.index($anchor.depth - 1) === 0;
        const isEmpty = $anchor.parent.textContent === "";
        if (isAtStart && isFirstChild && isEmpty) {
          const grandparentChildCount = $anchor.node($anchor.depth - 2)?.childCount ?? 0;
          if (grandparentChildCount <= 1) return true;
        }
        return false;
      },
      Delete: ({ editor }) => {
        const { $anchor } = editor.state.selection;
        const parentNode = $anchor.node($anchor.depth - 1);
        if (parentNode?.type.name !== this.name) return false;
        const isAtEnd = $anchor.parentOffset === $anchor.parent.content.size;
        const isLastChild =
          $anchor.index($anchor.depth - 1) ===
          parentNode.childCount - 1;
        const isEmpty = $anchor.parent.textContent === "";
        if (isAtEnd && isLastChild && isEmpty) return true;
        return false;
      },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scriptBlock: {
      setScriptBlock: (blockType: ScriptBlockType) => ReturnType;
    };
  }
}
