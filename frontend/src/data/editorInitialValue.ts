import type { YooptaContentValue } from "@yoopta/editor";

/** Minimal default for script editor (single paragraph). */
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
  const id = "script-root";
  return {
    [id]: {
      id,
      type: "Paragraph",
      value: [
        {
          id: `${id}-el`,
          type: "paragraph",
          children: [{ text: text || "" }],
          props: { nodeType: "block" },
        },
      ],
      meta: { order: 0, depth: 0 },
    },
  };
}
