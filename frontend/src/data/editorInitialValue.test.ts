import { describe, it, expect } from "vitest";
import {
  scriptTextToYooptaValue,
  yooptaValueToScriptText,
  areYooptaValuesEqual,
  DEFAULT_SCRIPT_VALUE,
} from "./editorInitialValue";

describe("editorInitialValue", () => {
  describe("scriptTextToYooptaValue", () => {
    it("converts plain text to single paragraph block", () => {
      const result = scriptTextToYooptaValue("Hello world");
      expect(result["block-1"]).toBeDefined();
      expect(result["block-1"]?.type).toBe("Paragraph");
      const text = result["block-1"]?.value?.[0]?.children?.[0];
      expect(text).toEqual({ text: "Hello world" });
    });

    it("handles empty string", () => {
      const result = scriptTextToYooptaValue("");
      expect(result["block-1"]?.value?.[0]?.children?.[0]).toEqual({ text: "" });
    });
  });

  describe("yooptaValueToScriptText", () => {
    it("extracts text from Yoopta value", () => {
      const value = scriptTextToYooptaValue("Hello world");
      expect(yooptaValueToScriptText(value)).toBe("Hello world");
    });

    it("returns empty string for empty value", () => {
      expect(yooptaValueToScriptText(DEFAULT_SCRIPT_VALUE)).toBe("");
    });

    it("handles undefined and null", () => {
      expect(yooptaValueToScriptText(undefined)).toBe("");
      expect(yooptaValueToScriptText(null)).toBe("");
    });
  });

  describe("areYooptaValuesEqual", () => {
    it("returns true for same reference", () => {
      const v = scriptTextToYooptaValue("test");
      expect(areYooptaValuesEqual(v, v)).toBe(true);
    });

    it("returns true for same content", () => {
      const a = scriptTextToYooptaValue("hello");
      const b = scriptTextToYooptaValue("hello");
      expect(areYooptaValuesEqual(a, b)).toBe(true);
    });

    it("returns false for different content", () => {
      const a = scriptTextToYooptaValue("hello");
      const b = scriptTextToYooptaValue("world");
      expect(areYooptaValuesEqual(a, b)).toBe(false);
    });

    it("handles undefined/null", () => {
      expect(areYooptaValuesEqual(undefined, undefined)).toBe(true);
      expect(areYooptaValuesEqual(null, null)).toBe(true);
      expect(areYooptaValuesEqual(undefined, null)).toBe(true);
      expect(areYooptaValuesEqual(scriptTextToYooptaValue("x"), undefined)).toBe(false);
    });
  });
});
