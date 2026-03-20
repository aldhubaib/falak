# Accordions & Collapsibles

> Preview: open `preview.html#accordions` in a browser

**Files:** `accordion.tsx`, `collapsible.tsx`
**Built with:** Radix Accordion / Collapsible + `cn()`

---

## Accordion

Multi-section expand/collapse. Can be `single` or `multiple` mode.

```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

<Accordion type="single" collapsible>
  <AccordionItem value="details">
    <AccordionTrigger>Video Details</AccordionTrigger>
    <AccordionContent>
      Metadata, tags, and description fields.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="transcript">
    <AccordionTrigger>Transcript</AccordionTrigger>
    <AccordionContent>
      Full transcript with timestamps.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

| Part | Class |
|------|-------|
| Item | `border-b` |
| Trigger | `flex flex-1 items-center justify-between py-4 font-medium hover:underline` |
| Chevron | `[&[data-state=open]>svg]:rotate-180` — auto-rotates |
| Content | `overflow-hidden text-sm` with `animate-accordion-down` / `animate-accordion-up` |

---

## Collapsible

Simpler toggle for a single section. Used in article panels, transcript sections.

```tsx
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

<Collapsible>
  <CollapsibleTrigger asChild>
    <button>Toggle</button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    Hidden content here.
  </CollapsibleContent>
</Collapsible>
```

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--border` | `border-b` | Item separator |
| `--foreground` | `text-foreground` | Trigger text |

---

## Rules

1. **Use Accordion for 2+ sections.** For a single toggle, use Collapsible.
2. **`collapsible` prop required** on single-type Accordion to allow all closed.
3. **ChevronDown icon auto-rotates.** Don't manually manage rotation state.
4. **Content animates.** Uses `animate-accordion-down` / `up` Tailwind keyframes.
