#!/usr/bin/env node
/**
 * DLS Audit — scans frontend source for design-system violations
 * and generates docs/design-system/audit.html
 *
 * Usage: node scripts/audit-dls.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend', 'src');
const OUT = path.join(ROOT, 'docs', 'design-system', 'audit.html');

const SCAN_DIRS = ['components', 'pages'];
const EXTENSIONS = ['.tsx', '.ts'];

// ── Acceptable exceptions ──────────────────────────────────────────────
const IGNORE_FILES = new Set(['chart.tsx']);
const BRAND_COLORS = /#4285F4|#34A853|#FBBC05|#EA4335|#00d68a/i;
const SVG_DATA_URL = /fill='%23/;

// ── Rules ──────────────────────────────────────────────────────────────
const rules = [
  {
    id: 'hardcoded-hex',
    label: 'Hardcoded hex color',
    desc: 'Use token classes (bg-primary, text-foreground, border-border) instead of raw hex.',
    severity: 'high',
    test(line, file) {
      if (IGNORE_FILES.has(path.basename(file))) return null;
      if (BRAND_COLORS.test(line)) return null;
      if (SVG_DATA_URL.test(line)) return null;
      if (/import\s/.test(line)) return null;
      if (/\/\//.test(line.split('#')[0]) && line.indexOf('#') > line.indexOf('//')) return null;
      const m = line.match(/(?:bg|text|border|ring|from|to|via|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/);
      if (m) return m[0];
      const m2 = line.match(/(?:color|background|borderColor|backgroundColor)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/);
      if (m2) return m2[0];
      return null;
    },
  },
  {
    id: 'hardcoded-rgba',
    label: 'Hardcoded rgba() / rgb()',
    desc: 'Use hsl(var(--token)) or Tailwind opacity modifiers instead of raw rgb/rgba.',
    severity: 'medium',
    test(line, file) {
      if (IGNORE_FILES.has(path.basename(file))) return null;
      if (/shadow|boxShadow|drop-shadow|backdrop-blur/.test(line)) return null;
      if (/import\s/.test(line)) return null;
      const m = line.match(/(?:bg|text|border|from|to)-\[rgba?\([^)]+\)\]/);
      if (m) return m[0];
      return null;
    },
  },
  {
    id: 'window-confirm',
    label: 'window.confirm() / window.alert()',
    desc: 'Use AlertDialog for destructive confirmations, Dialog for non-destructive.',
    severity: 'high',
    test(line) {
      const m = line.match(/window\.(confirm|alert)\s*\(/);
      return m ? m[0] : null;
    },
  },
  {
    id: 'native-title',
    label: 'Native title="" attribute',
    desc: 'Use the shadcn Tooltip component instead of native title.',
    severity: 'medium',
    test(line) {
      if (/svg|meta|head|<title>|<\/title>/.test(line)) return null;
      const m = line.match(/\btitle=["'][^"']+["']/);
      if (m && !/DialogTitle|AlertDialogTitle|CardTitle/.test(line)) return m[0];
      return null;
    },
  },
  {
    id: 'inline-border-radius',
    label: 'Inline borderRadius style',
    desc: 'Use Tailwind rounded-* classes instead of inline borderRadius.',
    severity: 'low',
    test(line) {
      const m = line.match(/borderRadius\s*:\s*['"]?[\d]+/);
      return m ? m[0] : null;
    },
  },
  {
    id: 'inline-font-size',
    label: 'Inline fontSize style',
    desc: 'Use the type scale (text-[13px], text-sm, etc.) instead of inline fontSize.',
    severity: 'low',
    test(line) {
      const m = line.match(/fontSize\s*:\s*['"]?[\d]+/);
      return m ? m[0] : null;
    },
  },
  {
    id: 'hr-tag',
    label: '<hr> tag',
    desc: 'Use the Separator component from @/components/ui/separator.',
    severity: 'low',
    test(line) {
      const m = line.match(/<hr\s*\/?>/);
      return m ? m[0] : null;
    },
  },
  {
    id: 'non-lucide-icon',
    label: 'Non-Lucide icon import',
    desc: 'Use Lucide icons only (import from lucide-react).',
    severity: 'medium',
    test(line) {
      if (/from\s+['"](@heroicons|react-icons|@mui\/icons|@fortawesome)/.test(line)) {
        return line.trim();
      }
      return null;
    },
  },
  {
    id: 'non-shadcn-lib',
    label: 'Non-shadcn component library import',
    desc: 'Use shadcn/ui primitives. No @mui, @chakra, @mantine, or antd.',
    severity: 'high',
    test(line) {
      if (/from\s+['"](@mui|@chakra-ui|@mantine|antd)/.test(line)) {
        return line.trim();
      }
      return null;
    },
  },
  {
    id: 'cn-missing',
    label: 'className string concatenation',
    desc: 'Use cn() from @/lib/utils for className composition, not template literals or +.',
    severity: 'low',
    test(line) {
      const m = line.match(/className=\{`[^`]*\$\{/);
      return m ? 'template literal className' : null;
    },
  },
];

// ── Scanner ────────────────────────────────────────────────────────────
function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function scan() {
  const findings = [];
  for (const scanDir of SCAN_DIRS) {
    const dir = path.join(FRONTEND, scanDir);
    if (!fs.existsSync(dir)) continue;
    for (const file of collectFiles(dir)) {
      const rel = path.relative(ROOT, file);
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const rule of rules) {
          const match = rule.test(line, file);
          if (match) {
            findings.push({
              rule: rule.id,
              label: rule.label,
              desc: rule.desc,
              severity: rule.severity,
              file: rel,
              line: i + 1,
              match: typeof match === 'string' ? match : '',
              code: line.trim().slice(0, 120),
            });
          }
        }
      }
    }
  }
  return findings;
}

// ── HTML Generator ─────────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateHTML(findings) {
  const byRule = {};
  for (const f of findings) {
    (byRule[f.rule] = byRule[f.rule] || []).push(f);
  }

  const bySeverity = { high: [], medium: [], low: [] };
  for (const rule of rules) {
    const items = byRule[rule.id] || [];
    bySeverity[rule.severity].push({ rule, items });
  }

  const total = findings.length;
  const high = findings.filter(f => f.severity === 'high').length;
  const medium = findings.filter(f => f.severity === 'medium').length;
  const low = findings.filter(f => f.severity === 'low').length;
  const clean = rules.filter(r => !(byRule[r.id] || []).length).length;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Falak DLS — Audit Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --background: hsl(240 4% 6%); --foreground: hsl(0 0% 93%); --card: hsl(240 4% 6%);
    --primary: hsl(217 72% 56%); --destructive: hsl(0 72% 51%);
    --success: hsl(142 50% 45%); --orange: hsl(25 90% 55%);
    --border: hsl(228 8% 9%); --sensor: hsl(0 0% 60%); --dim: hsl(0 0% 40%);
    --secondary: hsl(0 0% 10%); --elevated: hsl(0 0% 13%); --hover: hsl(0 0% 10%);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--background); color: var(--foreground); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; line-height: 1.5; }
  .page { max-width: 1100px; margin: 0 auto; padding: 48px 32px 80px; }
  .page-title { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 4px; }
  .page-subtitle { color: var(--sensor); font-size: 14px; margin-bottom: 8px; }
  .timestamp { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--dim); margin-bottom: 32px; }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .summary { display: flex; gap: 12px; margin-bottom: 40px; flex-wrap: wrap; }
  .summary-card { flex: 1; min-width: 120px; padding: 16px 20px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); }
  .summary-value { font-size: 28px; font-weight: 700; margin-bottom: 2px; }
  .summary-label { font-size: 10px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; color: var(--dim); }

  .severity-group { margin-bottom: 48px; }
  .severity-title { font-size: 16px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
  .severity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .rule-block { margin-bottom: 24px; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; background: var(--card); }
  .rule-header { padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: background 0.15s; }
  .rule-header:hover { background: var(--secondary); }
  .rule-name { font-size: 14px; font-weight: 600; }
  .rule-desc { font-size: 12px; color: var(--dim); margin-top: 2px; }
  .rule-count { font-size: 12px; font-family: 'JetBrains Mono', monospace; padding: 2px 10px; border-radius: 9999px; border: 1px solid var(--border); flex-shrink: 0; }
  .rule-pass { color: var(--success); border-color: currentColor; }
  .rule-fail { color: var(--destructive); border-color: currentColor; }
  .rule-warn { color: var(--orange); border-color: currentColor; }

  .rule-body { display: none; border-top: 1px solid var(--border); }
  .rule-block.open .rule-body { display: block; }
  .finding-row { display: grid; grid-template-columns: minmax(200px, 1fr) 60px 1fr; padding: 8px 20px; border-bottom: 1px solid var(--border); font-size: 12px; gap: 12px; align-items: start; }
  .finding-row:last-child { border-bottom: none; }
  .finding-file { font-family: 'JetBrains Mono', monospace; color: var(--sensor); word-break: break-all; }
  .finding-line { font-family: 'JetBrains Mono', monospace; color: var(--dim); text-align: center; }
  .finding-code { font-family: 'JetBrains Mono', monospace; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .finding-match { background: hsl(0 72% 51% / 0.15); color: var(--destructive); padding: 0 4px; border-radius: 3px; }

  .clean-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .clean-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; border: 1px solid var(--border); font-size: 12px; color: var(--success); }
  .clean-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
</style>
</head>
<body>
<div class="page">
  <h1 class="page-title">DLS Audit Report</h1>
  <p class="page-subtitle">Automated scan of the codebase against the Design Language System</p>
  <p class="timestamp">Generated: ${ts} · <a href="preview.html">← Back to DLS Preview</a></p>

  <div class="summary">
    <div class="summary-card">
      <div class="summary-value">${total}</div>
      <div class="summary-label">Total Findings</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color: var(--destructive)">${high}</div>
      <div class="summary-label">High</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color: var(--orange)">${medium}</div>
      <div class="summary-label">Medium</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color: var(--dim)">${low}</div>
      <div class="summary-label">Low</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color: var(--success)">${clean}/${rules.length}</div>
      <div class="summary-label">Rules Passing</div>
    </div>
  </div>
`;

  if (clean > 0) {
    html += `  <div style="margin-bottom: 40px;">
    <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--success);">Passing Rules</div>
    <div class="clean-list">
`;
    for (const rule of rules) {
      if (!(byRule[rule.id] || []).length) {
        html += `      <div class="clean-badge"><span class="clean-dot"></span>${esc(rule.label)}</div>\n`;
      }
    }
    html += `    </div>\n  </div>\n`;
  }

  for (const [severity, color, label] of [['high', 'var(--destructive)', 'High Severity'], ['medium', 'var(--orange)', 'Medium Severity'], ['low', 'var(--dim)', 'Low Severity']]) {
    const groups = bySeverity[severity].filter(g => g.items.length > 0);
    if (!groups.length) continue;

    html += `\n  <div class="severity-group">
    <div class="severity-title"><span class="severity-dot" style="background: ${color}"></span>${label}</div>\n`;

    for (const { rule, items } of groups) {
      const countClass = severity === 'high' ? 'rule-fail' : severity === 'medium' ? 'rule-warn' : '';
      html += `    <div class="rule-block" onclick="this.classList.toggle('open')">
      <div class="rule-header">
        <div>
          <div class="rule-name">${esc(rule.label)}</div>
          <div class="rule-desc">${esc(rule.desc)}</div>
        </div>
        <span class="rule-count ${countClass}">${items.length}</span>
      </div>
      <div class="rule-body">\n`;
      for (const item of items) {
        html += `        <div class="finding-row">
          <span class="finding-file">${esc(item.file)}</span>
          <span class="finding-line">:${item.line}</span>
          <span class="finding-code">${item.match ? `<span class="finding-match">${esc(item.match)}</span> ` : ''}${esc(item.code)}</span>
        </div>\n`;
      }
      html += `      </div>\n    </div>\n`;
    }
    html += `  </div>\n`;
  }

  html += `</div>\n</body>\n</html>`;
  return html;
}

// ── Main ───────────────────────────────────────────────────────────────
const findings = scan();
const html = generateHTML(findings);
fs.writeFileSync(OUT, html);

const high = findings.filter(f => f.severity === 'high').length;
const medium = findings.filter(f => f.severity === 'medium').length;
const low = findings.filter(f => f.severity === 'low').length;

console.log(`DLS Audit complete → ${OUT}`);
console.log(`  ${findings.length} findings: ${high} high, ${medium} medium, ${low} low`);
console.log(`  Open: docs/design-system/audit.html`);
