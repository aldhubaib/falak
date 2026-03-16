import { Component, type ReactNode } from "react";
import type { YooptaContentValue } from "@yoopta/editor";
import {
  scriptTextToYooptaValue,
  yooptaValueToScriptText,
} from "@/data/editorInitialValue";

interface ScriptEditorErrorBoundaryProps {
  value?: YooptaContentValue;
  onChange?: (value: YooptaContentValue) => void;
  readOnly?: boolean;
  children: ReactNode;
}

interface ScriptEditorErrorBoundaryState {
  hasError: boolean;
}

/** Error boundary for Yoopta editor. Falls back to plain textarea on crash. */
export class ScriptEditorErrorBoundary extends Component<
  ScriptEditorErrorBoundaryProps,
  ScriptEditorErrorBoundaryState
> {
  state: ScriptEditorErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      const { value, onChange, readOnly } = this.props;
      const text = yooptaValueToScriptText(value);
      return (
        <div className="yoopta-editor-container min-h-[200px] overflow-visible">
          <textarea
            className="w-full min-h-[200px] p-4 text-[14px] bg-background text-foreground border border-border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue/50"
            value={text}
            onChange={(e) =>
              !readOnly && onChange?.(scriptTextToYooptaValue(e.target.value))
            }
            readOnly={readOnly}
            placeholder="Type / to open commands…"
          />
          <p className="mt-2 text-[11px] text-dim">
            Editor fallback (rich editor failed to load)
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
