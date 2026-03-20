/* Tab switching */
function switchTab(id) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById('tab-' + id);
  var btn = document.querySelector('.tab-btn[data-tab="' + id + '"]');
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
  history.replaceState(null, '', '#' + id);
}
(function() {
  var hash = location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) switchTab(hash);
})();

var arrowSvg = '<svg class="sort-arrow" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2v6"/><path d="M2.5 4.5 5 2l2.5 2.5"/></svg>';
function sortCol(el) {
  var header = el.closest('.table-header');
  var wasSorted = el.classList.contains('sorted');
  header.querySelectorAll('.table-header-col').forEach(function(c) {
    c.classList.remove('sorted');
    var arrow = c.querySelector('.sort-arrow');
    if (arrow) arrow.remove();
  });
  el.classList.add('sorted');
  if (wasSorted) {
    var existing = el.querySelector('.sort-arrow');
    if (existing) { existing.classList.toggle('desc'); return; }
  }
  el.insertAdjacentHTML('beforeend', arrowSvg);
}

/* Color Editor */
(function() {
  var root = document.documentElement;
  var originalTokens = {};
  var currentChanges = {};

  function hslToHex(hslStr) {
    var tmp = document.createElement('div');
    tmp.style.color = hslStr;
    document.body.appendChild(tmp);
    var rgb = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    var m = rgb.match(/(\d+)/g);
    if (!m) return '#000000';
    return '#' + m.slice(0,3).map(function(v) {
      return ('0' + parseInt(v).toString(16)).slice(-2);
    }).join('');
  }

  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1,3), 16) / 255;
    var g = parseInt(hex.slice(3,5), 16) / 255;
    var b = parseInt(hex.slice(5,7), 16) / 255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return 'hsl(' + Math.round(h * 360) + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%)';
  }

  function captureOriginals() {
    var style = getComputedStyle(root);
    document.querySelectorAll('.swatch-var').forEach(function(el) {
      var name = el.textContent.trim();
      if (name.startsWith('--')) {
        var val = style.getPropertyValue(name).trim();
        if (val) originalTokens[name] = val;
      }
    });
    document.querySelectorAll('.surface-token').forEach(function(el) {
      var name = el.textContent.trim();
      if (name.startsWith('--')) {
        var val = style.getPropertyValue(name).trim();
        if (val) originalTokens[name] = val;
      }
    });
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
    var m = rgb.match(/[\d.]+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0,3).map(function(v) {
      var n = Math.round(parseFloat(v));
      return ('0' + Math.min(255, Math.max(0, n)).toString(16)).slice(-2);
    }).join('');
  }

  function injectSwatchPickers() {
    document.querySelectorAll('.swatch').forEach(function(swatch) {
      var varEl = swatch.querySelector('.swatch-var');
      if (!varEl) return;
      var tokenName = varEl.textContent.trim();
      if (!tokenName.startsWith('--')) return;

      var colorDiv = swatch.querySelector('.swatch-color');
      if (!colorDiv) return;

      var currentColor = getComputedStyle(colorDiv).backgroundColor;
      var hex = rgbToHex(currentColor);

      var wrapper = document.createElement('div');
      wrapper.className = 'swatch-picker';
      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.dataset.token = tokenName;
      input.addEventListener('input', function(e) {
        applyColor(tokenName, e.target.value, swatch);
      });
      wrapper.appendChild(input);
      colorDiv.appendChild(wrapper);
    });
  }

  function injectSurfacePickers() {
    document.querySelectorAll('.surface-block').forEach(function(block) {
      var tokenEl = block.querySelector('.surface-token');
      if (!tokenEl) return;
      var tokenName = tokenEl.textContent.trim();
      if (!tokenName.startsWith('--')) return;

      var currentColor = getComputedStyle(block).backgroundColor;
      var hex = rgbToHex(currentColor);

      var wrapper = document.createElement('div');
      wrapper.className = 'surface-picker';
      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.dataset.token = tokenName;
      input.addEventListener('input', function(e) {
        applyColor(tokenName, e.target.value, block);
      });
      wrapper.appendChild(input);
      block.appendChild(wrapper);
    });
  }

  function applyColor(tokenName, hexVal, element) {
    var hslVal = hexToHsl(hexVal);
    root.style.setProperty(tokenName, hslVal);
    currentChanges[tokenName] = hslVal;

    if (element) element.classList.add('changed');
    updateChangeCount();
  }

  function updateChangeCount() {
    var count = Object.keys(currentChanges).length;
    var el = document.getElementById('changeCount');
    if (el) el.textContent = count > 0 ? count + ' change' + (count > 1 ? 's' : '') : '';
  }

  window.toggleEditor = function() {
    var bar = document.getElementById('editorBar');
    var btn = document.getElementById('editorToggle');
    var active = document.body.classList.toggle('editor-active');
    bar.classList.toggle('active', active);
    btn.classList.toggle('active', active);
    btn.textContent = active ? 'Exit Editor' : 'Edit Colors';
  };

  window.resetColors = function() {
    Object.keys(originalTokens).forEach(function(name) {
      root.style.removeProperty(name);
    });
    currentChanges = {};
    document.querySelectorAll('.changed').forEach(function(el) {
      el.classList.remove('changed');
    });
    document.querySelectorAll('.swatch-picker input, .surface-picker input').forEach(function(input) {
      var token = input.dataset.token;
      if (token && originalTokens[token]) {
        input.value = hslToHex(originalTokens[token]);
      }
    });
    updateChangeCount();
  };

  window.copyChanges = function() {
    var count = Object.keys(currentChanges).length;
    if (count === 0) {
      alert('No changes to copy. Pick some colors first!');
      return;
    }
    var lines = Object.keys(currentChanges).map(function(name) {
      return name + ': ' + currentChanges[name] + ';';
    });
    var text = lines.join('\n');
    navigator.clipboard.writeText(text).then(function() {
      var btn = document.querySelector('.editor-btn-copy');
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.background = 'hsl(142 50% 45%)';
      setTimeout(function() {
        btn.textContent = orig;
        btn.style.background = '';
      }, 1500);
    });
  };

  captureOriginals();
  injectSwatchPickers();
  injectSurfacePickers();
})();

/* ── Inventory Table Builder ── */
(function() {
  var body = document.getElementById('invBody');
  if (!body) return;
  var index = window.__componentIndex || {};
  var rows = [];

  document.querySelectorAll('[data-cid]').forEach(function(el) {
    var cid = el.getAttribute('data-cid');
    var meta = index[cid] || {};
    var tag = el.tagName.toLowerCase();
    var cls = Array.from(el.classList);

    var type = 'element';
    if (cls.some(function(c) { return c.startsWith('badge'); }))        type = 'badge';
    else if (cls.some(function(c) { return c.startsWith('icon-btn'); })) type = 'icon-btn';
    else if (tag === 'button' || cls.some(function(c) { return c.startsWith('btn'); })) type = 'button';
    else if (cls.some(function(c) { return c.startsWith('swatch'); }))   type = 'swatch';
    else if (tag === 'input' || tag === 'textarea' || tag === 'select')  type = 'input';
    else if (cls.some(function(c) { return c.startsWith('alert'); }))    type = 'alert';
    else if (cls.some(function(c) { return c.startsWith('card'); }))     type = 'card';
    else if (cls.some(function(c) { return c.startsWith('toast'); }))    type = 'toast';
    else if (cls.some(function(c) { return /avatar|pill|progress|separator|stat/.test(c); })) type = cls[0];

    var section = el.closest('.section');
    var sectionId = section ? section.id : '—';
    var sectionLabel = meta.section || sectionId;

    rows.push({ el: el, cid: cid, type: type, section: sectionLabel, meta: meta });
  });

  function renderRows(filtered) {
    body.innerHTML = '';
    filtered.forEach(function(r) {
      var tr = document.createElement('tr');
      tr.className = 'inv-row';

      var tdPreview = document.createElement('td');
      tdPreview.className = 'inv-cell inv-cell-preview';
      var clone = r.el.cloneNode(true);
      clone.removeAttribute('data-cid');
      clone.style.pointerEvents = 'none';
      tdPreview.appendChild(clone);

      var tdType = document.createElement('td');
      tdType.className = 'inv-cell';
      tdType.innerHTML = '<span class="inv-type-badge">' + r.type + '</span>';

      var tdCid = document.createElement('td');
      tdCid.className = 'inv-cell inv-cell-mono';
      tdCid.textContent = r.cid;

      var tdSection = document.createElement('td');
      tdSection.className = 'inv-cell';
      tdSection.textContent = r.section;

      var tdState = document.createElement('td');
      tdState.className = 'inv-cell';
      tdState.innerHTML = '<span class="inv-state inv-state-normal">Normal</span>';

      var tdUsage = document.createElement('td');
      tdUsage.className = 'inv-cell';
      var tokens = (r.meta.tokens || []);
      if (tokens.length) {
        tdUsage.innerHTML = '<span class="inv-usage inv-usage-yes">Yes</span>' +
          '<span class="inv-tokens">' + tokens.join(', ') + '</span>';
      } else {
        tdUsage.innerHTML = '<span class="inv-usage inv-usage-none">—</span>';
      }

      tr.appendChild(tdPreview);
      tr.appendChild(tdType);
      tr.appendChild(tdCid);
      tr.appendChild(tdSection);
      tr.appendChild(tdState);
      tr.appendChild(tdUsage);
      body.appendChild(tr);
    });
    var counts = document.getElementById('invCounts');
    if (counts) counts.textContent = filtered.length + ' of ' + rows.length + ' components';
  }

  var search = document.getElementById('invSearch');
  if (search) {
    search.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      if (!q) { renderRows(rows); return; }
      renderRows(rows.filter(function(r) {
        return r.cid.toLowerCase().indexOf(q) !== -1 ||
               r.type.toLowerCase().indexOf(q) !== -1 ||
               r.section.toLowerCase().indexOf(q) !== -1 ||
               (r.meta.label || '').toLowerCase().indexOf(q) !== -1;
      }));
    });
  }

  renderRows(rows);
})();
