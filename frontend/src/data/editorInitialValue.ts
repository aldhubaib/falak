import type { JSONContent } from "@tiptap/react";

export type TiptapContentValue = JSONContent;

export const DEFAULT_EDITOR_VALUE: TiptapContentValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function scriptTextToEditorValue(text: string): TiptapContentValue {
  if (!text) return DEFAULT_EDITOR_VALUE;

  const paragraphs = text.split("\n").map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : undefined,
  }));

  return { type: "doc", content: paragraphs };
}

export function editorValueToScriptText(
  value: TiptapContentValue | undefined | null,
): string {
  if (!value || typeof value !== "object") return "";

  const lines: string[] = [];

  function extractText(node: TiptapContentValue): void {
    if (node.type === "text" && typeof node.text === "string") {
      lines.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) {
      const childTexts: string[] = [];
      for (const child of node.content) {
        const before = lines.length;
        extractText(child);
        const added = lines.splice(before);
        childTexts.push(added.join(""));
      }
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "codeBlock" ||
        node.type === "listItem" ||
        node.type === "taskItem"
      ) {
        lines.push(childTexts.join(""));
      } else {
        lines.push(...childTexts);
      }
    }
  }

  extractText(value);
  return lines.filter((l) => l.length > 0).join("\n");
}
