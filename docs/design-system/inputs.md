# Inputs & Forms

> Preview: open `preview.html#form-elements` in a browser

**Files:** `input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, `switch.tsx`, `form.tsx`

---

## Text Input

```tsx
<Input placeholder="Search..." value={value} onChange={e => setValue(e.target.value)} className="w-64" />
```

| Property | Value |
|----------|-------|
| Height | `h-10` |
| Padding | `px-3 py-2` |
| Background | `bg-background` |
| Border | `border-input` |
| Focus | `ring-2 ring-ring ring-offset-2` |
| Text | `text-foreground`, `text-sm` |
| Placeholder | `text-muted-foreground` |

## Textarea

Same styling as Input. `min-h-[80px]`, resizable.

## Select

```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-40">
    <SelectValue placeholder="Choose..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
  </SelectContent>
</Select>
```

## Checkbox

```tsx
<div className="flex items-center gap-2">
  <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} />
  <label htmlFor="terms" className="text-sm">Accept terms</label>
</div>
```

## Switch

```tsx
<div className="flex items-center gap-2">
  <Switch checked={enabled} onCheckedChange={setEnabled} />
  <label className="text-sm">Enable feature</label>
</div>
```

---

## Field Layout

### Standard Field

```tsx
<div className="space-y-1.5">
  <label className="text-[12px] font-medium text-sensor">Field Label</label>
  <Input placeholder="Enter value..." />
</div>
```

### Inline with Button

```tsx
<div className="flex gap-2">
  <Input className="flex-1" />
  <Button>Save</Button>
</div>
```

### Form Section

```tsx
<div className="space-y-4">
  <h3 className="text-[13px] font-semibold">Section Title</h3>
  <div className="space-y-3">{/* Fields */}</div>
  <div className="flex justify-end gap-2">
    <Button variant="outline">Cancel</Button>
    <Button>Save Changes</Button>
  </div>
</div>
```

---

## Validation

Currently uses **manual `useState`** + **`toast.error()`**. The shadcn Form component (react-hook-form + zod) is installed but not yet adopted.

### Current

```tsx
if (!value.trim()) { toast.error("Please enter a value"); return; }
```

### Field-Level Error

```tsx
<Input style={{ borderColor: "var(--destructive)" }} />
<p className="text-[11px] text-destructive mt-1">Invalid YouTube URL</p>
```

---

## Tokens Used

| Token | Usage |
|-------|-------|
| `--input` | Input background |
| `--ring` | Focus ring color |
| `--foreground` | Input text |
| `--muted-foreground` | Placeholder text |
| `--sensor` | Field labels |
| `--destructive` | Error borders and messages |
