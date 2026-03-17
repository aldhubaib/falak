import type { JSONContent } from "@tiptap/react";
import type { ScriptBlockType } from "@/components/tiptap/ScriptBlock";

export type TiptapContentValue = JSONContent;

export const DEFAULT_EDITOR_VALUE: TiptapContentValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const SCRIPT_BLOCK_ORDER: ScriptBlockType[] = [
  "title",
  "hook",
  "hookStart",
  "script",
  "hookEnd",
  "hashtags",
];

export interface ExtractedScriptBlocks {
  title: string;
  hook: string;
  hookStart: string;
  script: string;
  hookEnd: string;
  hashtags: string[];
}

function nodeToText(node: JSONContent): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === "text" && typeof child.text === "string") {
      parts.push(child.text);
    } else if (Array.isArray(child.content)) {
      parts.push(nodeToText(child));
      if (
        child.type === "paragraph" ||
        child.type === "heading" ||
        child.type === "blockquote" ||
        child.type === "codeBlock" ||
        child.type === "listItem" ||
        child.type === "taskItem"
      ) {
        parts.push("\n");
      }
    }
  }
  return parts.join("").replace(/\n+$/, "");
}

export function extractScriptBlocks(
  value: TiptapContentValue | undefined | null,
): ExtractedScriptBlocks {
  const result: ExtractedScriptBlocks = {
    title: "",
    hook: "",
    hookStart: "",
    script: "",
    hookEnd: "",
    hashtags: [],
  };
  if (!value?.content) return result;

  for (const node of value.content) {
    if (node.type !== "scriptBlock") continue;
    const blockType = node.attrs?.blockType as ScriptBlockType | undefined;
    if (!blockType) continue;
    const text = nodeToText(node).trim();
    if (blockType === "hashtags") {
      result.hashtags = text
        .split(/[\s,،]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean);
    } else if (blockType in result) {
      (result as Record<string, string>)[blockType] = text;
    }
  }
  return result;
}

function textToParagraphs(text: string): JSONContent[] {
  if (!text) return [{ type: "paragraph" }];
  return text.split("\n").map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : undefined,
  }));
}

function makeBlock(blockType: ScriptBlockType, text: string): JSONContent {
  return {
    type: "scriptBlock",
    attrs: { blockType },
    content: textToParagraphs(text),
  };
}

export function buildScriptBlocksJSON(fields: {
  title?: string;
  hook?: string;
  hookStart?: string;
  script?: string;
  hookEnd?: string;
  hashtags?: string[];
}): TiptapContentValue {
  const tags = (fields.hashtags ?? []).map((t) =>
    t.startsWith("#") ? t : `#${t}`
  );
  const hashtagParagraphs: JSONContent[] = tags.length
    ? tags.map((tag) => ({
        type: "paragraph" as const,
        content: [{ type: "text" as const, text: tag }],
      }))
    : [{ type: "paragraph" as const }];

  return {
    type: "doc",
    content: [
      makeBlock("title", fields.title ?? ""),
      makeBlock("hook", fields.hook ?? ""),
      makeBlock("hookStart", fields.hookStart ?? ""),
      makeBlock("script", fields.script ?? ""),
      makeBlock("hookEnd", fields.hookEnd ?? ""),
      {
        type: "scriptBlock",
        attrs: { blockType: "hashtags" },
        content: hashtagParagraphs,
      },
    ],
  };
}

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
