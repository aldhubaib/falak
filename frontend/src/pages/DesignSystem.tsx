import { useState } from "react";
import {
  Trash2,
  Plus,
  Settings,
  Search,
  MoreHorizontal,
  ChevronRight,
  Home,
  BarChart3,
  Users,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TABS = [
  "Foundation",
  "Actions",
  "Forms & Input",
  "Badges",
  "Data Display",
  "Layout",
] as const;

type Tab = (typeof TABS)[number];

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-xs uppercase tracking-wider text-dim border-b border-border pb-2 mb-4">
      {children}
    </div>
  );
}

function ComponentLabel({ children }: { children: string }) {
  return (
    <span className="block mt-2 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

const COLOR_TOKENS = [
  { id: "--background", label: "background" },
  { id: "--foreground", label: "foreground" },
  { id: "--card", label: "card" },
  { id: "--border", label: "border" },
  { id: "--success", label: "success" },
  { id: "--blue", label: "blue" },
  { id: "--purple", label: "purple" },
  { id: "--orange", label: "orange" },
  { id: "--destructive", label: "destructive" },
  { id: "--dim", label: "dim" },
  { id: "--muted", label: "muted" },
  { id: "--elevated", label: "elevated" },
  { id: "--secondary", label: "secondary" },
  { id: "--primary", label: "primary" },
  { id: "--popover", label: "popover" },
  { id: "--input", label: "input" },
  { id: "--ring", label: "ring" },
  { id: "--row-hover", label: "row-hover" },
  { id: "--sensor", label: "sensor" },
  { id: "--muted-foreground", label: "muted-foreground" },
];

const RADIUS_TOKENS = [
  { tw: "rounded-sm", label: "--radius-sm", px: "2px" },
  { tw: "rounded-md", label: "--radius-md", px: "6px" },
  { tw: "rounded-lg", label: "--radius-lg", px: "8px" },
  { tw: "rounded-xl", label: "--radius-xl", px: "12px" },
  { tw: "rounded-2xl", label: "--radius-2xl", px: "16px" },
  { tw: "rounded-full", label: "--radius-full", px: "pill" },
];

const TYPO_TOKENS = [
  { cls: "text-2xs", id: "--text-2xs", px: "9px" },
  { cls: "text-xs", id: "--text-xs", px: "10px" },
  { cls: "text-sm", id: "--text-sm", px: "11px" },
  { cls: "text-base", id: "--text-base", px: "12px" },
  { cls: "text-md", id: "--text-md", px: "13px" },
  { cls: "text-lg", id: "--text-lg", px: "14px" },
  { cls: "text-xl", id: "--text-xl", px: "15px" },
  { cls: "text-2xl", id: "--text-2xl", px: "18px" },
  { cls: "text-3xl", id: "--text-3xl", px: "22px" },
];

function FoundationTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionLabel>Color Tokens</SectionLabel>
        <div className="grid grid-cols-5 gap-3">
          {COLOR_TOKENS.map((t) => (
            <div key={t.id} className="flex flex-col items-center gap-1.5">
              <div
                className="w-10 h-10 rounded-lg border border-border"
                style={{ background: `hsl(var(${t.id}))` }}
              />
              <span className="font-mono text-[10px] text-muted-foreground text-center leading-tight">
                {t.id}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Radius Scale</SectionLabel>
        <div className="flex items-end gap-4">
          {RADIUS_TOKENS.map((r) => (
            <div key={r.tw} className="flex flex-col items-center gap-2">
              <div
                className={`w-12 h-12 bg-primary ${r.tw}`}
              />
              <span className="font-mono text-[10px] text-muted-foreground text-center leading-tight">
                {r.label}
              </span>
              <span className="font-mono text-[9px] text-dim">{r.px}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Typography Scale</SectionLabel>
        <div className="space-y-3">
          {TYPO_TOKENS.map((t) => (
            <div key={t.cls} className="flex items-baseline gap-4">
              <span className="w-24 font-mono text-[10px] text-muted-foreground shrink-0">
                {t.id} · {t.px}
              </span>
              <span className={t.cls}>
                The quick brown fox jumps over the lazy dog
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActionsTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionLabel>Button Variants</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <ComponentLabel>{"<Button variant={...} /> — components/ui/button"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Button Sizes</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon"><Plus className="h-4 w-4" /></Button>
        </div>
        <ComponentLabel>{"<Button size={...} />"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Icon Buttons</SectionLabel>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" className="rounded-full h-8 w-8">
            <Search className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="rounded-full h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="rounded-full h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="destructive" className="rounded-full h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="rounded-full h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ComponentLabel>{"<Button size=\"icon\" className=\"rounded-full\" />"}</ComponentLabel>
      </section>
    </div>
  );
}

function FormsTab() {
  return (
    <div className="space-y-10 max-w-md">
      <section>
        <SectionLabel>Input</SectionLabel>
        <div className="space-y-2">
          <Label htmlFor="demo-input">Channel URL</Label>
          <Input id="demo-input" placeholder="https://youtube.com/@channel" />
        </div>
        <ComponentLabel>{"<Input /> — components/ui/input"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Textarea</SectionLabel>
        <div className="space-y-2">
          <Label htmlFor="demo-textarea">Description</Label>
          <Textarea id="demo-textarea" placeholder="Enter a description…" />
        </div>
        <ComponentLabel>{"<Textarea /> — components/ui/textarea"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Select</SectionLabel>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Choose status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ComponentLabel>{"<Select> — components/ui/select"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Checkbox</SectionLabel>
        <div className="flex items-center gap-2">
          <Checkbox id="demo-check" />
          <Label htmlFor="demo-check">Include subtitles</Label>
        </div>
        <ComponentLabel>{"<Checkbox /> — components/ui/checkbox"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Switch</SectionLabel>
        <div className="flex items-center gap-3">
          <Switch id="demo-switch" />
          <Label htmlFor="demo-switch">Auto-refresh pipeline</Label>
        </div>
        <ComponentLabel>{"<Switch /> — components/ui/switch"}</ComponentLabel>
      </section>
    </div>
  );
}

const BADGE_VARIANTS: Array<{
  label: string;
  className: string;
}> = [
  { label: "Default", className: "" },
  { label: "Success", className: "bg-success/15 text-success border-success/20" },
  { label: "Blue", className: "bg-blue/15 text-blue border-blue/20" },
  { label: "Orange", className: "bg-orange/15 text-orange border-orange/20" },
  { label: "Purple", className: "bg-purple/15 text-purple border-purple/20" },
  { label: "Destructive", className: "bg-destructive/15 text-destructive border-destructive/20" },
  { label: "Dim", className: "bg-dim/15 text-dim border-dim/20" },
];

function BadgesTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionLabel>Badge — Full Size</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <ComponentLabel>{"<Badge variant={...} /> — components/ui/badge"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>App Color Badges</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((b) => (
            <Badge key={b.label} variant="outline" className={b.className}>
              {b.label}
            </Badge>
          ))}
        </div>
        <ComponentLabel>{"<Badge variant=\"outline\" className=\"bg-{color}/15 ...\" />"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Small Badges (text-[9px])</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((b) => (
            <Badge
              key={b.label}
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${b.className}`}
            >
              {b.label}
            </Badge>
          ))}
        </div>
        <ComponentLabel>{"<Badge className=\"text-[9px] px-1.5 py-0\" />"}</ComponentLabel>
      </section>
    </div>
  );
}

function DataDisplayTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionLabel>Table (Pipeline / Monitor Style)</SectionLabel>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 border-border">
                <TableHead>Channel</TableHead>
                <TableHead>Videos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { ch: "MrBeast", vids: 842, status: "Active", score: 98 },
                { ch: "MKBHD", vids: 1620, status: "Active", score: 94 },
                { ch: "Veritasium", vids: 230, status: "Paused", score: 87 },
              ].map((r) => (
                <TableRow key={r.ch} className="hover:bg-row-hover border-border">
                  <TableCell className="font-medium">{r.ch}</TableCell>
                  <TableCell>{r.vids}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        r.status === "Active"
                          ? "bg-success/15 text-success border-success/20"
                          : "bg-orange/15 text-orange border-orange/20"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ComponentLabel>{"<Table> — components/ui/table"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Card</SectionLabel>
        <Card className="max-w-sm rounded-xl border-border">
          <CardHeader>
            <CardTitle className="text-base">Channel Insights</CardTitle>
            <CardDescription>Last 30 days performance summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-semibold">1,247</div>
                <div className="text-xs text-muted-foreground">Total views</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-success">+12%</div>
                <div className="text-xs text-muted-foreground">Growth</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <ComponentLabel>{"<Card> — components/ui/card"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Stat Row (Inline Pattern)</SectionLabel>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue/15 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-blue" />
            </div>
            <div>
              <div className="text-sm font-medium">Videos Analyzed</div>
              <div className="text-xs text-muted-foreground">This week</div>
            </div>
          </div>
          <div className="text-xl font-semibold font-mono">342</div>
        </div>
        <ComponentLabel>{"Stat row — inline pattern (no dedicated component)"}</ComponentLabel>
      </section>
    </div>
  );
}

function LayoutTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionLabel>Sidebar + Page Layout</SectionLabel>
        <div className="rounded-xl border border-border overflow-hidden h-[360px] flex">
          {/* Sidebar mock */}
          <div className="w-48 bg-sidebar-background border-r border-sidebar-border p-3 flex flex-col gap-1 shrink-0">
            <div className="text-xs font-semibold text-sidebar-foreground mb-3 px-2">Falak</div>
            {[
              { icon: Home, label: "Home", active: false },
              { icon: BarChart3, label: "Pipeline", active: true },
              { icon: Users, label: "Competitors", active: false },
              { icon: FileText, label: "Stories", active: false },
              { icon: Settings, label: "Settings", active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${
                  item.active
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-secondary/50"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </div>
            ))}
          </div>

          {/* Main content area */}
          <div className="flex-1 bg-background flex flex-col">
            <div className="border-b border-border px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Home</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground">Pipeline</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2">
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 p-5">
              <div className="text-lg font-semibold mb-4">Pipeline</div>
              <div className="grid grid-cols-3 gap-3">
                {["Queued", "Processing", "Done"].map((s) => (
                  <div
                    key={s}
                    className="rounded-xl border border-border bg-card p-3 h-20 flex items-end"
                  >
                    <span className="text-xs text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <ComponentLabel>{"Sidebar (bg-sidebar-*) + AppLayout pattern"}</ComponentLabel>
      </section>

      <section>
        <SectionLabel>Page Header Pattern</SectionLabel>
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Article Pipeline</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                3 articles queued · 12 published
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Filter
              </Button>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Article
              </Button>
            </div>
          </div>
          <div className="h-px bg-border" />
        </div>
        <ComponentLabel>{"Page header — flex justify-between pattern"}</ComponentLabel>
      </section>
    </div>
  );
}

const TAB_CONTENT: Record<Tab, () => JSX.Element> = {
  Foundation: FoundationTab,
  Actions: ActionsTab,
  "Forms & Input": FormsTab,
  Badges: BadgesTab,
  "Data Display": DataDisplayTab,
  Layout: LayoutTab,
};

export default function DesignSystem() {
  const [activeTab, setActiveTab] = useState<Tab>("Foundation");
  const Content = TAB_CONTENT[activeTab];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-12">
          <span className="text-sm font-semibold tracking-tight">
            Falak DLS
          </span>
          <span className="font-mono text-[10px] text-dim">
            /design-system
          </span>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Content />
      </div>
    </div>
  );
}
