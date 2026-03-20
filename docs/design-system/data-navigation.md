# Data Navigation

> Preview: open `preview.html#data-navigation` in a browser

**Files:** `breadcrumb.tsx`, `pagination.tsx`, `navigation-menu.tsx`, `calendar.tsx`
**Built with:** Radix primitives + Button variants + `cn()`

---

## Breadcrumb

Trail of navigation links showing current location.

```tsx
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage
} from "@/components/ui/breadcrumb";

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/channels">Channels</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>TechChannel</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

| Part | Class |
|------|-------|
| List | `flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground` |
| Link | `transition-colors hover:text-foreground` |
| Current page | `font-normal text-foreground` |
| Separator | Default `/` or custom icon, `[&>svg]:size-3.5` |
| Ellipsis | `flex h-9 w-9 items-center justify-center` |

---

## Pagination

Page navigation with prev/next and numbered links.

```tsx
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis
} from "@/components/ui/pagination";

<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
    <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
    <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
    <PaginationItem><PaginationEllipsis /></PaginationItem>
    <PaginationItem><PaginationNext href="#" /></PaginationItem>
  </PaginationContent>
</Pagination>
```

| Part | Class |
|------|-------|
| Container | `mx-auto flex w-full justify-center` |
| Content | `flex flex-row items-center gap-1` |
| Link | Uses `buttonVariants` — `variant="ghost"` or `variant="outline"` when active |
| Size | `size="icon"` → `h-9 w-9` |

---

## Navigation Menu

Horizontal nav with dropdown panels (desktop navigation).

```tsx
import {
  NavigationMenu, NavigationMenuList, NavigationMenuItem,
  NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink,
  navigationMenuTriggerStyle
} from "@/components/ui/navigation-menu";

<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuTrigger>Features</NavigationMenuTrigger>
      <NavigationMenuContent>
        {/* Rich dropdown content */}
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem>
      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
        Docs
      </NavigationMenuLink>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>
```

---

## Calendar

Date picker component based on `react-day-picker`.

```tsx
import { Calendar } from "@/components/ui/calendar";

const [date, setDate] = useState<Date | undefined>(new Date());

<Calendar mode="single" selected={date} onSelect={setDate} />
```

| Part | Token |
|------|-------|
| Day (default) | `bg-transparent` |
| Day (selected) | `bg-primary text-primary-foreground` |
| Day (today) | `bg-accent text-accent-foreground` |
| Outside days | `text-muted-foreground opacity-50` |
| Navigation | Uses `buttonVariants` from `button.tsx` |

---

## Tokens Used

| Token | Tailwind | Usage |
|-------|----------|-------|
| `--muted-foreground` | `text-muted-foreground` | Breadcrumb links, outside days |
| `--foreground` | `text-foreground` | Active breadcrumb, hover links |
| `--primary` | `bg-primary` | Selected calendar day, active pagination |
| `--accent` | `bg-accent` | Today highlight, nav menu focus |
| `--popover` | `bg-popover` | Nav menu dropdown, calendar popover |

---

## Rules

1. **Breadcrumbs for nested page hierarchy only.** Don't use for flat navigation.
2. **Pagination uses button variants.** Active page is `outline`, others `ghost`.
3. **Calendar is always wrapped in a Popover** for date-picker use cases.
4. **NavigationMenu for top-level site nav.** Don't use for in-page tabs (use filter pills).
