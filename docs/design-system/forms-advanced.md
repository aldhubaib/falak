# Forms — Advanced Controls

> Preview: open `preview.html#forms-advanced` in a browser

**Files:** `form.tsx`, `label.tsx`, `radio-group.tsx`, `slider.tsx`, `toggle.tsx`, `toggle-group.tsx`, `input-otp.tsx`
**Built with:** react-hook-form + Radix primitives + CVA + `cn()`

---

## Form + FormField

Wires react-hook-form to Radix form controls with auto error display.

```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";

<Form {...form}>
  <FormField
    control={form.control}
    name="channelName"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Channel Name</FormLabel>
        <FormControl>
          <Input placeholder="Enter name..." {...field} />
        </FormControl>
        <FormDescription>The display name for this channel.</FormDescription>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>
```

| Part | Class |
|------|-------|
| FormItem | `space-y-2` |
| FormLabel | `text-sm font-medium` (red when error) |
| FormDescription | `text-sm text-muted-foreground` |
| FormMessage | `text-sm font-medium text-destructive` |

---

## Label

Standalone label for inputs outside react-hook-form.

```tsx
import { Label } from "@/components/ui/label";

<Label htmlFor="email">Email</Label>
<Input id="email" />
```

| Property | Value |
|----------|-------|
| Base | `text-sm font-medium leading-none` |
| Disabled | `peer-disabled:cursor-not-allowed peer-disabled:opacity-70` |

---

## Radio Group

```tsx
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

<RadioGroup defaultValue="video">
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="video" id="video" />
    <Label htmlFor="video">Video</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="short" id="short" />
    <Label htmlFor="short">Short</Label>
  </div>
</RadioGroup>
```

| Part | Class |
|------|-------|
| Container | `grid gap-2` |
| Item | `aspect-square h-4 w-4 rounded-full border border-primary` |
| Indicator | `text-primary` (filled circle) |

---

## Slider

```tsx
import { Slider } from "@/components/ui/slider";

<Slider defaultValue={[50]} max={100} step={1} />
```

| Part | Class |
|------|-------|
| Root | `relative flex w-full touch-none select-none items-center` |
| Track | `h-2 w-full rounded-full bg-secondary` |
| Range | `bg-primary` (filled portion) |
| Thumb | `h-5 w-5 rounded-full border-2 border-primary bg-background` |

---

## Toggle & Toggle Group

Single toggle or grouped set of toggles.

```tsx
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

<Toggle aria-label="Bold">
  <Bold className="h-4 w-4" />
</Toggle>

<ToggleGroup type="single" defaultValue="video">
  <ToggleGroupItem value="video">Video</ToggleGroupItem>
  <ToggleGroupItem value="short">Short</ToggleGroupItem>
</ToggleGroup>
```

| Variant | Look |
|---------|------|
| `default` | Transparent, `hover:bg-muted`, active `bg-accent` |
| `outline` | Border, `hover:bg-accent` |

| Size | Dimensions |
|------|-----------|
| `default` | `h-10 px-3` |
| `sm` | `h-9 px-2.5` |
| `lg` | `h-11 px-5` |

---

## Input OTP

One-time-password input with individual digit slots.

```tsx
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";

<InputOTP maxLength={6}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
  </InputOTPGroup>
  <InputOTPSeparator />
  <InputOTPGroup>
    <InputOTPSlot index={3} />
    <InputOTPSlot index={4} />
    <InputOTPSlot index={5} />
  </InputOTPGroup>
</InputOTP>
```

| Part | Class |
|------|-------|
| Slot | `h-10 w-10 border-y border-r border-input` |
| Active | `ring-2 ring-ring` |
| Caret | `animate-caret-blink` |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--primary` | `bg-primary` / `border-primary` | Slider fill, radio indicator |
| `--secondary` | `bg-secondary` | Slider track |
| `--accent` | `bg-accent` | Active toggle |
| `--muted` | `bg-muted` | Toggle hover |
| `--destructive` | `text-destructive` | Form error messages |
| `--muted-foreground` | `text-muted-foreground` | Form descriptions |
| `--ring` | `ring-ring` | Focus rings |
| `--input` | `border-input` | OTP slot borders |

---

## Rules

1. **Use `Form` + `FormField` for validated forms.** Standalone `Label` only for simple cases.
2. **Radio groups need `Label` siblings** — not children of `RadioGroupItem`.
3. **Slider shows one thumb by default.** Pass an array for range.
4. **ToggleGroup `type="single"`** for exclusive selection, `"multiple"` for multi-select.
5. **Input OTP separator** goes between groups, not between individual slots.
