import type { YooptaContentValue } from "@yoopta/editor";

/** Minimal default for script editor (single empty paragraph). */
export const DEFAULT_SCRIPT_VALUE: YooptaContentValue = {
  "block-1": {
    id: "block-1",
    type: "Paragraph",
    value: [
      {
        id: "block-1-el",
        type: "paragraph",
        children: [{ text: "" }],
        props: { nodeType: "block" },
      },
    ],
    meta: { order: 0, depth: 0 },
  },
};

/** Build a single-paragraph Yoopta value from plain text (e.g. from brief.script). */
export function scriptTextToYooptaValue(text: string): YooptaContentValue {
  const blockId = "block-1";
  return {
    [blockId]: {
      id: blockId,
      type: "Paragraph",
      value: [
        {
          id: `${blockId}-el`,
          type: "paragraph",
          children: [{ text: text || "" }],
          props: { nodeType: "block" },
        },
      ],
      meta: { order: 0, depth: 0 },
    },
  };
}

/** Extract plain text from Yoopta value for export or backward compatibility. */
export function yooptaValueToScriptText(value: YooptaContentValue | undefined | null): string {
  if (!value || typeof value !== "object") return "";
  const blocks = Object.values(value)
    .filter((b): b is NonNullable<typeof b> => b != null && typeof b === "object")
    .sort((a, b) => (a.meta?.order ?? 0) - (b.meta?.order ?? 0));
  const lines: string[] = [];
  for (const block of blocks) {
    const elements = Array.isArray(block.value) ? block.value : [];
    for (const el of elements) {
      const children = Array.isArray(el?.children) ? el.children : [];
      const text = children
        .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text?: string }).text ?? "") : ""))
        .join("");
      if (text) lines.push(text);
    }
  }
  return lines.join("\n");
}
