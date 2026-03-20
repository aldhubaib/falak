# Menus

> Preview: open `preview.html#menus` in a browser

**Files:** `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx`, `command.tsx`
**Built with:** Radix Menu / cmdk + `cn()`

---

## Dropdown Menu

Triggered by a button click. Most common menu pattern.

```tsx
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm">Options</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem>Duplicate</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Context Menu

Triggered by right-click on the trigger area.

```tsx
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";

<ContextMenu>
  <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Copy</ContextMenuItem>
    <ContextMenuItem>Paste</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

---

## Menubar

Horizontal menu bar (File, Edit, View pattern).

```tsx
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";

<Menubar>
  <MenubarMenu>
    <MenubarTrigger>File</MenubarTrigger>
    <MenubarContent>
      <MenubarItem>New</MenubarItem>
      <MenubarItem>Save</MenubarItem>
    </MenubarContent>
  </MenubarMenu>
</Menubar>
```

---

## Command (Palette)

Search-driven command menu, powered by cmdk.

```tsx
import {
  Command, CommandInput, CommandList,
  CommandEmpty, CommandGroup, CommandItem
} from "@/components/ui/command";

<Command>
  <CommandInput placeholder="Search commands..." />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Actions">
      <CommandItem>Create Story</CommandItem>
      <CommandItem>Sync Channel</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

Use `CommandDialog` to show it inside a dialog overlay.

---

## Shared Anatomy

| Part | Class |
|------|-------|
| Content | `z-50 min-w-[8rem] rounded-md border bg-popover text-popover-foreground shadow-md` |
| Item | `flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm` |
| Item focus | `focus:bg-accent focus:text-accent-foreground` |
| Separator | `-mx-1 my-1 h-px bg-border` |
| Shortcut | `ml-auto text-xs tracking-widest text-muted-foreground` |
| Inset items | `pl-8` when `inset` prop is true |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--popover` | `bg-popover` | Menu content bg |
| `--popover-foreground` | `text-popover-foreground` | Menu text |
| `--accent` | `bg-accent` | Focused item bg |
| `--accent-foreground` | `text-accent-foreground` | Focused item text |
| `--border` | `bg-border` | Separators |
| `--muted-foreground` | `text-muted-foreground` | Shortcuts, labels |
| `--destructive` | `text-destructive` | Destructive items |

---

## Rules

1. **DropdownMenu for button-triggered menus.** ContextMenu for right-click.
2. **Destructive items** get `className="text-destructive"`.
3. **Use `inset` prop** on items/labels when some items have icons/checkboxes.
4. **Command for search-driven lists.** Wrap in `CommandDialog` for modal use.
5. **Keyboard shortcuts** use `DropdownMenuShortcut` / `CommandShortcut`.
6. **Always use `asChild` on triggers** wrapping custom buttons.
