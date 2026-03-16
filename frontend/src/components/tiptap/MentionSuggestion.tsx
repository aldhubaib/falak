import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export interface MentionUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef<
  MentionListRef,
  { items: MentionUser[]; command: (item: MentionUser) => void }
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
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
  }));

  if (items.length === 0) {
    return <div className="mention-menu-empty">No users found</div>;
  }

  return (
    <div className="mention-menu">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`mention-menu-item ${index === selectedIndex ? "is-selected" : ""}`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.avatarUrl ? (
            <img
              src={item.avatarUrl}
              alt={item.name}
              className="mention-menu-avatar"
            />
          ) : (
            <span className="mention-menu-avatar-placeholder">
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="mention-menu-name">{item.name}</span>
        </button>
      ))}
    </div>
  );
});
MentionList.displayName = "MentionList";

export function createMentionSuggestion(
  getUsers: () => MentionUser[],
): Omit<SuggestionOptions<MentionUser>, "editor"> {
  return {
    items: ({ query }) => {
      return getUsers()
        .filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);
    },
    render: () => {
      let popup: TippyInstance | undefined;
      let root: Root | undefined;
      let component: MentionListRef | undefined;

      return {
        onStart: (props: SuggestionProps<MentionUser>) => {
          const el = document.createElement("div");
          root = createRoot(el);
          root.render(
            <MentionList
              ref={(ref) => {
                if (ref) component = ref;
              }}
              items={props.items}
              command={props.command}
            />,
          );

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: el,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            maxWidth: 280,
            arrow: false,
            theme: "mention-menu",
          });
        },

        onUpdate: (props: SuggestionProps<MentionUser>) => {
          root?.render(
            <MentionList
              ref={(ref) => {
                if (ref) component = ref;
              }}
              items={props.items}
              command={props.command}
            />,
          );
          if (props.clientRect) {
            popup?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props: SuggestionKeyDownProps) => {
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
  };
}
