#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design-system');
const REGISTRY_PATH = path.join(DESIGN_DIR, 'registry.json');
const CSS_PATH = path.join(DESIGN_DIR, 'preview-framework.css');
const JS_PATH = path.join(DESIGN_DIR, 'preview-scripts.js');
const SECTIONS_DIR = path.join(DESIGN_DIR, 'sections');
const OUTPUT_PATH = path.join(DESIGN_DIR, 'preview.html');
const INDEX_CSS_PATH = path.join(ROOT, 'frontend', 'src', 'index.css');

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const frameworkCSS = fs.readFileSync(CSS_PATH, 'utf8');
const interactiveJS = fs.readFileSync(JS_PATH, 'utf8');

/**
 * Parse :root tokens from frontend/src/index.css.
 * The app stores raw HSL values (e.g. `--primary: 217 72% 56%;`).
 * The preview needs hsl() wrapped values for standalone CSS usage.
 */
function parseTokensFromCSS(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) throw new Error('No :root block found in ' + cssPath);

  const lines = [];
  const tokenCount = { total: 0 };
  for (const line of rootMatch[1].split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;/);
    if (!m) continue;
    const [, name, rawValue] = m;
    tokenCount.total++;

    // Raw HSL channel values like "217 72% 56%" or "0 0% 93%" → wrap with hsl()
    if (/^\d+\s+\d+%?\s+\d+%/.test(rawValue)) {
      lines.push(`    ${name}: hsl(${rawValue});`);
    } else {
      lines.push(`    ${name}: ${rawValue};`);
    }
  }
  return { css: `  :root {\n${lines.join('\n')}\n  }`, count: tokenCount.total };
}

function readSection(id) {
  const p = path.join(SECTIONS_DIR, `${id}.html`);
  if (!fs.existsSync(p)) {
    console.warn(`  ⚠ missing section: ${id}.html`);
    return `<p style="color:var(--destructive)">Missing section: ${id}</p>`;
  }
  return fs.readFileSync(p, 'utf8').trim();
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTabBar(tabs) {
  return tabs.map((t, i) => {
    const active = i === 0 ? ' active' : '';
    return `    <button class="tab-btn${active}" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`;
  }).join('\n');
}

function buildPanels(tabs, sections) {
  const byTab = {};
  for (const s of sections) {
    (byTab[s.tab] = byTab[s.tab] || []).push(s);
  }

  return tabs.map((tab, ti) => {
    const active = ti === 0 ? ' active' : '';

    if (tab.id === 'inventory') {
      return `  <div class="tab-panel${active}" id="tab-inventory">
    <div class="inv-toolbar">
      <input type="text" class="inv-search" id="invSearch" placeholder="Search by name, type, data-cid, section…">
      <div class="inv-counts" id="invCounts"></div>
    </div>
    <table class="inv-table" id="invTable">
      <thead>
        <tr>
          <th class="inv-th inv-th-preview">Preview</th>
          <th class="inv-th">Type</th>
          <th class="inv-th">data-cid</th>
          <th class="inv-th">Section</th>
          <th class="inv-th">Usage</th>
        </tr>
      </thead>
      <tbody id="invBody"></tbody>
    </table>
  </div><!-- /tab-inventory -->`;
    }

    const secs = byTab[tab.id] || [];
    let html = '';
    let lastGroup = null;
    let firstGroup = true;

    for (const s of secs) {
      if (s.group !== lastGroup) {
        html += `\n  <div class="group-heading${firstGroup ? ' group-heading-first' : ''}">\n`;
        html += `    <div class="group-heading-title">${s.group}</div>\n`;
        if (s.groupDesc) html += `    <div class="group-heading-desc">${s.groupDesc}</div>\n`;
        html += `  </div>\n`;
        lastGroup = s.group;
        firstGroup = false;
      }

      html += `\n  <div id="${s.id}" class="section">\n`;
      html += `    <div class="section-label">${s.label}</div>\n`;
      if (s.note) html += `    <div class="section-note">${s.note}</div>\n`;
      html += readSection(s.id) + '\n';
      html += `  </div>\n`;
    }

    return `  <div class="tab-panel${active}" id="tab-${tab.id}">\n${html}\n  </div><!-- /tab-${tab.id} -->`;
  }).join('\n\n');
}

/**
 * Scan frontend/src/pages/*.tsx and frontend/src/components/*.tsx to build
 * a mapping of token-name → [page names that use it].
 * Looks for both Tailwind classes (bg-primary, text-destructive, border-orange…)
 * and raw CSS variable references (--primary, var(--orange)…).
 */
function scanTokenUsage() {
  const PAGES_DIR = path.join(ROOT, 'frontend', 'src', 'pages');
  const COMPS_DIR = path.join(ROOT, 'frontend', 'src', 'components');

  const tokenNames = [
    'background', 'foreground', 'card', 'card-foreground', 'popover',
    'popover-foreground', 'primary', 'primary-foreground', 'secondary',
    'secondary-foreground', 'muted', 'muted-foreground', 'accent',
    'accent-foreground', 'destructive', 'destructive-foreground', 'success',
    'success-foreground', 'blue', 'blue-foreground', 'purple',
    'purple-foreground', 'orange', 'orange-foreground', 'border', 'input',
    'ring', 'elevated', 'hover', 'row-hover', 'sensor', 'dim', 'page-border',
    'sidebar-background', 'sidebar-foreground', 'sidebar-primary',
    'sidebar-accent', 'sidebar-border', 'sidebar-ring',
  ];

  const usage = {};
  tokenNames.forEach(t => { usage[t] = new Set(); });

  function scanFile(filePath, label) {
    if (!fs.existsSync(filePath)) return;
    const src = fs.readFileSync(filePath, 'utf8');
    for (const token of tokenNames) {
      const patterns = [
        new RegExp(`(?:bg|text|border|ring|from|to|via|outline|shadow|divide|accent|fill|stroke)-${token.replace(/-/g, '[-]')}(?![\\w-])`, 'i'),
        new RegExp(`--${token.replace(/-/g, '[-]')}(?![\\w])`, 'i'),
      ];
      if (patterns.some(p => p.test(src))) {
        usage[token].add(label);
      }
    }
  }

  function scanDir(dir, labelFn) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue;
      const full = path.join(dir, f);
      const label = labelFn(f);
      scanFile(full, label);
    }
  }

  scanDir(PAGES_DIR, f => f.replace(/\.tsx$/, ''));
  scanDir(COMPS_DIR, f => f.replace(/\.tsx$/, ''));

  const result = {};
  for (const [token, pages] of Object.entries(usage)) {
    if (pages.size) result[token] = [...pages].sort();
  }
  return result;
}

function buildComponentIndex(sections) {
  const index = {};
  for (const s of sections) {
    if (!s.components) continue;
    for (const [cid, meta] of Object.entries(s.components)) {
      index[cid] = { section: s.id, tab: s.tab, doc: s.doc || null, source: s.source || null, ...meta };
    }
  }
  return index;
}

function generate() {
  const { meta, tabs, sections } = registry;
  const componentIndex = buildComponentIndex(sections);
  const componentCount = Object.keys(componentIndex).length;
  const sectionCount = sections.length;

  const { css: tokenCSS, count: tokenCount } = parseTokensFromCSS(INDEX_CSS_PATH);
  const tokenUsage = scanTokenUsage();
  const usageTokenCount = Object.keys(tokenUsage).length;
  console.log(`Tokens: ${tokenCount} variables read from frontend/src/index.css`);
  console.log(`Usage: scanned codebase, ${usageTokenCount} tokens found in use`);
  console.log(`Registry: ${sectionCount} sections, ${componentCount} components`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${meta.title} — Preview</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${tokenCSS}

${frameworkCSS}
</style>
</head>
<body>

<!-- Editor bar (hidden until toggled) -->
<div class="editor-bar" id="editorBar">
  <div class="editor-bar-left">
    <div class="editor-bar-title">Editor Mode</div>
    <div class="editor-bar-hint">Click any color swatch to change it</div>
  </div>
  <div class="editor-bar-right">
    <span class="editor-bar-changes" id="changeCount"></span>
    <button class="editor-btn editor-btn-reset" onclick="resetColors()">Reset</button>
    <button class="editor-btn editor-btn-copy" onclick="copyChanges()">Copy Changes</button>
  </div>
</div>

<!-- Floating toggle button -->
<button class="editor-btn editor-btn-toggle" id="editorToggle" onclick="toggleEditor()">Edit Colors</button>

<div class="page">
  <h1 class="page-title">${meta.title}</h1>
  <p class="page-subtitle">${meta.subtitle}</p>

  <div class="tab-bar" id="tabBar">
${buildTabBar(tabs)}
  </div>

${buildPanels(tabs, sections)}

</div>

<script>
var __componentIndex = ${JSON.stringify(componentIndex)};
var __tokenUsage = ${JSON.stringify(tokenUsage)};
${interactiveJS}
</script>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`✓ Generated ${OUTPUT_PATH}`);
  console.log(`  ${html.split('\n').length} lines`);
}

generate();
