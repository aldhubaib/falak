import type { YooptaContentValue } from "@yoopta/editor";

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

export function scriptTextToYooptaValue(text: string): YooptaContentValue {
  return {
    "block-1": {
      id: "block-1",
      type: "Paragraph",
      value: [
        {
          id: "block-1-el",
          type: "paragraph",
          children: [{ text: text || "" }],
          props: { nodeType: "block" },
        },
      ],
      meta: { order: 0, depth: 0 },
    },
  };
}

export function yooptaValueToScriptText(
  value: YooptaContentValue | undefined | null,
): string {
  if (!value || typeof value !== "object") return "";

  const blocks = Object.values(value)
    .filter(
      (b): b is NonNullable<typeof b> => b != null && typeof b === "object",
    )
    .sort((a, b) => (a.meta?.order ?? 0) - (b.meta?.order ?? 0));

  const lines: string[] = [];
  for (const block of blocks) {
    const elements = Array.isArray(block.value) ? block.value : [];
    for (const el of elements) {
      const children = Array.isArray(el?.children) ? el.children : [];
      const text = children
        .map((c) =>
          c && typeof c === "object" && "text" in c
            ? String((c as { text?: string }).text ?? "")
            : "",
        )
        .join("");
      if (text) lines.push(text);
    }
  }
  return lines.join("\n");
}
