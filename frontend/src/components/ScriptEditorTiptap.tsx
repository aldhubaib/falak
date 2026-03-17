import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createMentionSuggestion, type MentionUser } from "./tiptap/MentionSuggestion";
import TextDirection from "tiptap-text-direction";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Highlighter,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Code2,
  Pilcrow,
  ImageIcon,
  Type,
  Zap,
  Play,
  FileText,
  Square,
  Hash,
} from "lucide-react";
import type { JSONContent, Editor } from "@tiptap/react";
import { SlashCommandExtension } from "./tiptap/SlashCommand";
import { ScriptBlockExtension, type ScriptBlockType } from "./tiptap/ScriptBlock";

export type TiptapContentValue = JSONContent;

const CURSOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80",
  "#22d3ee", "#818cf8", "#e879f9", "#fb7185",
];

function pickColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export interface CollabUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ScriptEditorTiptapProps {
  value?: TiptapContentValue;
  onChange?: (value: TiptapContentValue) => void;
  readOnly?: boolean;
  roomId?: string;
  currentUser?: CollabUser | null;
  onCollaboratorsChange?: (users: CollabUser[]) => void;
  editorRef?: React.MutableRefObject<{ setContent: (v: TiptapContentValue) => void } | null>;
}

function buildBaseExtensions(getMentionUsers: () => MentionUser[]) {
  return [
    Placeholder.configure({
      placeholder: "Type / to open menu, or start typing...",
    }),
    Underline,
    Highlight.configure({ multicolor: false }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "tiptap-link" },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: { class: "tiptap-image" },
    }),
    Mention.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          avatarUrl: { default: null, parseHTML: (el) => el.getAttribute("data-avatar-url"), renderHTML: (attrs) => attrs.avatarUrl ? { "data-avatar-url": attrs.avatarUrl } : {} },
        };
      },
      renderHTML({ node, HTMLAttributes }) {
        const label = node.attrs.label ?? node.attrs.id;
        const avatar = node.attrs.avatarUrl;
        const attrs = { ...HTMLAttributes, class: "tiptap-mention" };

        if (avatar) {
          return ["span", attrs, ["img", { src: avatar, class: "tiptap-mention-avatar" }], `@${label}`];
        }
        return ["span", attrs, `@${label}`];
      },
    }).configure({
      suggestion: createMentionSuggestion(getMentionUsers),
    }),
    TextDirection.configure({
      types: ["heading", "paragraph"],
    }),
    ScriptBlockExtension,
    SlashCommandExtension,
  ];
}

function FloatingToolbar({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const { from, to } = editor.state.selection;
      if (from === to || !editor.isFocused) {
        setPos(null);
        return;
      }
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const top = Math.min(start.top, end.top);
      const left = (start.left + end.left) / 2;
      setPos({ top: top - 50, left });
    };

    editor.on("selectionUpdate", update);
    editor.on("blur", () => setPos(null));
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  if (!pos) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("URL", prev ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  const btn = "p-1.5 rounded hover:bg-white/10 transition-colors";
  const active = "bg-white/20 text-white";

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-0.5 bg-[#1e1e2e] border border-white/10 rounded-lg px-1 py-0.5 shadow-xl"
      style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={`${btn} ${editor.isActive("bold") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btn} ${editor.isActive("italic") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btn} ${editor.isActive("underline") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
        <UnderlineIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btn} ${editor.isActive("strike") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <Strikethrough className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btn} ${editor.isActive("code") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
        <Code className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`${btn} ${editor.isActive("highlight") ? active : "text-white/70"}`} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
        <Highlighter className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-4 bg-white/20 mx-0.5" />
      <button type="button" className={`${btn} ${editor.isActive("link") ? active : "text-white/70"}`} onClick={setLink} title="Link">
        <LinkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export const SLASH_MENU_ITEMS: {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}[] = [
  {
    id: "paragraph",
    title: "Text",
    description: "Plain text paragraph",
    icon: <Pilcrow className="w-4 h-4" />,
    command: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: "heading1",
    title: "Heading 1",
    description: "Large heading",
    icon: <Heading1 className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "heading2",
    title: "Heading 2",
    description: "Medium heading",
    icon: <Heading2 className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    title: "Heading 3",
    description: "Small heading",
    icon: <Heading3 className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bulletList",
    title: "Bullet List",
    description: "Unordered list",
    icon: <List className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    title: "Numbered List",
    description: "Ordered list",
    icon: <ListOrdered className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "taskList",
    title: "To-do List",
    description: "Checklist with checkboxes",
    icon: <ListTodo className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "blockquote",
    title: "Quote",
    description: "Block quotation",
    icon: <Quote className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "codeBlock",
    title: "Code Block",
    description: "Fenced code block",
    icon: <Code2 className="w-4 h-4" />,
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    title: "Divider",
    description: "Horizontal rule",
    icon: <Minus className="w-4 h-4" />,
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "image",
    title: "Image",
    description: "Upload or paste image URL",
    icon: <ImageIcon className="w-4 h-4" />,
    command: (editor) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          editor.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
  {
    id: "scriptBlock-title",
    title: "Title Block",
    description: "Video title section",
    icon: <Type className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "title"),
  },
  {
    id: "scriptBlock-hook",
    title: "Hook Block",
    description: "Opening hook line",
    icon: <Zap className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "hook"),
  },
  {
    id: "scriptBlock-hookStart",
    title: "Branded Intro",
    description: "Channel branded intro",
    icon: <Play className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "hookStart"),
  },
  {
    id: "scriptBlock-script",
    title: "Script Block",
    description: "Main script body with timestamps",
    icon: <FileText className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "script"),
  },
  {
    id: "scriptBlock-hookEnd",
    title: "Branded Outro",
    description: "Channel branded outro",
    icon: <Square className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "hookEnd"),
  },
  {
    id: "scriptBlock-hashtags",
    title: "Hashtags Block",
    description: "YouTube tags and hashtags",
    icon: <Hash className="w-4 h-4" />,
    command: (e) => insertScriptBlock(e, "hashtags"),
  },
];

function insertScriptBlock(editor: Editor, blockType: ScriptBlockType) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "scriptBlock",
      attrs: { blockType },
      content: [{ type: "paragraph" }],
    })
    .run();
}

function getCollabWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/collab`;
}

export function ScriptEditorTiptap({
  value,
  onChange,
  readOnly = false,
  roomId,
  currentUser,
  onCollaboratorsChange,
  editorRef,
}: ScriptEditorTiptapProps) {
  const suppressNextUpdate = useRef(false);
  const isCollab = Boolean(roomId);
  const mentionUsersRef = useRef<MentionUser[]>([]);

  const ydoc = useMemo(() => (isCollab ? new Y.Doc() : null), [isCollab]);

  const provider = useMemo(() => {
    if (!ydoc || !roomId) return null;
    const wsUrl = getCollabWsUrl();
    const p = new WebsocketProvider(wsUrl, roomId, ydoc);
    return p;
  }, [ydoc, roomId]);

  useEffect(() => {
    if (!provider || !currentUser) return;
    const color = pickColor(currentUser.name);
    provider.awareness.setLocalStateField("user", {
      name: currentUser.name,
      color,
      avatarUrl: currentUser.avatarUrl ?? null,
    });
  }, [provider, currentUser]);

  useEffect(() => {
    if (!provider) return;
    const update = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const others: CollabUser[] = [];
      const allForMention: MentionUser[] = [];
      for (const [clientId, state] of states) {
        const u = (state as { user?: { name?: string; color?: string; avatarUrl?: string } }).user;
        if (!u?.name) continue;
        allForMention.push({ id: String(clientId), name: u.name, avatarUrl: u.avatarUrl });
        if (clientId !== provider.awareness.clientID) {
          others.push({ id: String(clientId), name: u.name, avatarUrl: u.avatarUrl });
        }
      }
      mentionUsersRef.current = allForMention;
      onCollaboratorsChange?.(others);
    };
    provider.awareness.on("change", update);
    update();
    return () => {
      provider.awareness.off("change", update);
    };
  }, [provider, onCollaboratorsChange]);

  useEffect(() => {
    return () => {
      provider?.disconnect();
      ydoc?.destroy();
    };
  }, [provider, ydoc]);

  const getMentionUsers = useMemo(
    () => () => mentionUsersRef.current,
    [],
  );

  const extensions = useMemo(() => {
    const base = buildBaseExtensions(getMentionUsers);

    if (ydoc && provider) {
      return [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: { HTMLAttributes: { class: "tiptap-code-block" } },
          blockquote: { HTMLAttributes: { class: "tiptap-blockquote" } },
          history: false,
        }),
        ...base,
        Collaboration.configure({ document: ydoc }),
        CollaborationCaret.configure({
          provider,
          user: currentUser
            ? { name: currentUser.name, color: pickColor(currentUser.name) }
            : { name: "Anonymous", color: "#888" },
        }),
      ];
    }

    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "tiptap-code-block" } },
        blockquote: { HTMLAttributes: { class: "tiptap-blockquote" } },
      }),
      ...base,
    ];
  }, [ydoc, provider, currentUser, getMentionUsers]);

  const editor = useEditor({
    extensions,
    content: !isCollab && value && Object.keys(value).length > 0 ? value : undefined,
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      if (suppressNextUpdate.current) {
        suppressNextUpdate.current = false;
        return;
      }
      onChange?.(e.getJSON());
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor outline-none min-h-[600px] pb-[200px]",
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || isCollab) return;
    if (!value || Object.keys(value).length === 0) return;

    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(value);
    if (current === incoming) return;

    suppressNextUpdate.current = true;
    editor.commands.setContent(value, false);
  }, [editor, value, isCollab]);

  useEffect(() => {
    if (!editorRef || !editor || editor.isDestroyed) return;
    editorRef.current = {
      setContent: (v: TiptapContentValue) => {
        suppressNextUpdate.current = true;
        editor.commands.setContent(v, false);
        onChange?.(editor.getJSON());
      },
    };
    return () => { editorRef.current = null; };
  }, [editor, editorRef, onChange]);

  if (!editor) return null;

  return (
    <div className="script-editor-tiptap min-h-[800px]">
      {!readOnly && <FloatingToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
