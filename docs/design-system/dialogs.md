# Dialogs & Overlays

> Preview: open `preview.html#dialog` in a browser

**Files:** `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `drawer.tsx`

---

## Dialog (Non-Destructive)

Use for settings, info, pickers — anything that isn't irreversible.

```tsx
<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

| Property | Value |
|----------|-------|
| Overlay | `bg-black/80` |
| Content | `rounded-xl`, `p-6` |
| Max width | `sm:max-w-[425px]` |

---

## AlertDialog (Destructive)

Use for **delete, remove, irreversible actions**. Always.

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive" size="sm">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this channel?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently remove the channel and all its data.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Sheet (Side Panel)

Slide-in from any edge. Variants: `top`, `bottom`, `left`, `right`.

Use for side panels, mobile navigation, detail overlays.

---

## Drawer (Bottom Sheet)

Vaul-based bottom sheet. Use for mobile-first bottom drawers.

---

## Rules

1. **Never use `window.confirm()`.** Always use AlertDialog or Dialog.
2. **Destructive = AlertDialog.** Non-destructive = Dialog.
3. **Title is a question**: "Delete this channel?", "Discard changes?"
4. **Description explains consequences**: "This will permanently remove…"
5. **Cancel on the left**, action on the right.
6. **Destructive action button** gets `bg-destructive text-destructive-foreground`.
