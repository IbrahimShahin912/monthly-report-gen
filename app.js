(() => {
  'use strict';

  // library/charts.js → window.CHART_LIBRARY holds every chart the sidebar offers (type, heading,
  // default rows). This file is the engine: document state, rendering, editor, export.
  // The live report is an editable document (see State): the user adds pages and charts themselves.
  const LIBRARY_SOURCE = Array.isArray(window.CHART_LIBRARY) ? window.CHART_LIBRARY : [];

  // v4: the report starts empty. The older stores are left in place, not deleted.
  const STORE_KEY = 'monthly-report:v4';
  const EMPTY_CELL = '#e6e6e3';
  // PNG export size: 4:5 portrait with a 2048px long edge — Facebook's HD size. Hardcoded on purpose.
  const EXPORT_SIZE = { width: 1638, height: 2048 };

  // Council brand palette, sampled from the logo. Chart rows take colours by name (library `colors`).
  const COLORS = { deep: '#2f6e7e', mid: '#62a3bf', light: '#a9d3df', ink: '#1e4d59', teal: '#3f8193', pale: '#d9ecf1' };
  // Text colours for heading/text boxes (the mini toolbar's swatches): the brand palette plus near-black
  // and white. Stored by name, so only these can ever be used.
  const TEXT_COLORS = { ink: '#1e4d59', deep: '#2f6e7e', teal: '#3f8193', mid: '#62a3bf', dark: '#17323a', white: '#ffffff' };
  // Since the Word-style colour menu (2026-11-25) a text box's colour is any #rrggbb; the names above are
  // still read (boxes saved before it). Returns '' for anything else.
  const textColor = (v) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : (TEXT_COLORS[v] || ''));
  const DEFAULT_PALETTE = ['deep', 'teal', 'mid', 'light'];


  const CHART_TYPES = {
    money: 'Money breakdown',
    progress: 'Budget used',
    bars: 'Bar chart',
    tiles: 'Stat tiles',
    cards: 'Number cards',
    grid: 'Card grid',
    list: 'Number list',
    text: 'Heading',
  };
  const isMoney = (chart) => chart.type === 'money' || chart.type === 'progress';

  /*
   * Chart position and size, set on the page Canva-style (drag a chart to move it, drag its handles
   * to resize it). chart.box = { x, y, w, h } in page px, measured from the top-left of the card's
   * inner area. A page where no chart has a box lays its charts out automatically (stacked, fitted
   * by fitCard). The first move or resize on a page pins every chart where it currently sits, so
   * nothing jumps. A chart's content scales (--k) to fill its box.
   */
  const BOX_MIN_W = 120;
  const TEXT_SIZE_MIN = 4;
  const TEXT_SIZE_MAX = 400;
  // A−/A+ step through these, like Word's size list (page px; the PNG is 1.365× this).
  const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 108, 120, 144, 168, 200, 240, 288, 340, 400];
  const BOX_MIN_H = 27; // one grid step (was 80; small text boxes need less — charts can't shrink past their content anyway)
  // Snapping grid, page px. The card's inner width (972) is 36 steps, so halves and thirds land on it.
  const GRID = 27;
  function boxOf(box) {
    const n = ['x', 'y', 'w', 'h'].map((k) => Number(box?.[k]));
    if (!n.every(Number.isFinite)) return undefined;
    const [x, y, w, h] = n.map(Math.round);
    if (x < 0 || y < 0 || w < BOX_MIN_W || h < BOX_MIN_H || x + w > 1200 || y + h > 1500) return undefined;
    return { x, y, w, h };
  }
  const withBox = (target, box) => {
    const b = boxOf(box);
    if (b) target.box = b;
    else delete target.box;
    return target;
  };

  let uidN = 0;
  const uid = () => `x${Date.now().toString(36)}${(uidN += 1).toString(36)}`;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Escapes Dhivehi text but wraps digit runs (e.g. a year) in .num so they render in Poppins, not Faruma's digits.
  // The run includes the Arabic comma (، U+060C) so amounts like "35،000" stay one left-to-right unit in RTL text.
  const mixed = (s) => String(s ?? '').split(/(\d[\d.,،]*\d|\d)/)
    .map((part, i) => (i % 2 ? `<span class="num">${esc(part)}</span>` : esc(part))).join('');
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#999999');
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  // Typed text is saved with runs of spaces collapsed: while editing the browser shows every space
  // (a double space looked like a gap on the page) but the PNG collapses them, so the two differed.
  const oneSpace = (text) => String(text).replace(/ {2,}/g, ' ');
  const pct = (share) => `${(share * 100).toFixed(1)}%`;
  // Stat numbers: single digits get a leading zero (09, 06) for an even column of figures.
  const pad = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? `0${n}` : count(n));
  const pageNo = (index) => String(index + 1).padStart(2, '0');
  /*
   * Rows with no label and no amount are empty slots. They are hidden in the PNG, but shown while
   * editing — otherwise "+ Add row" would add a row with nothing on the page to type into.
   * renderReport() sets editMode; it is false only while rendering for the export.
   */
  let editMode = true;
  const isFilled = (i) => String(i.label ?? '').trim() || Number(i.value);
  const visibleItems = (items) => (editMode ? items : items.filter(isFilled));

  // Row colour comes from the chart's palette by row position, so added rows get the next brand colour.
  function rowColor(chart, i) {
    const list = Array.isArray(chart.colors) && chart.colors.length ? chart.colors : DEFAULT_PALETTE;
    const name = list[i % list.length];
    return COLORS[name] || safeColor(name);
  }

  /* ---------- State: the report document ---------- */
  /*
   * The whole report is one editable document, saved under STORE_KEY:
   *
   *   { v: 4, period: { y, m },
   *     pages: [ { id,
   *                charts: [ { id, type, heading, box?: { x, y, w, h }, style?, totalLabel?, cols?, subheading?,
   *                            colors?, rows: [ { label, value } ] } ] } ] }
   *
   * A new browser starts with ONE BLANK PAGE (the user asked for this): library/charts.js is only the
   * chart library the sidebar offers, never pre-made pages.
   */

  /*
   * Optional row icons (inline SVG, stroke-drawn, coloured by CSS). A row with an icon is drawn as a
   * stat panel by the grid chart (the "houses" figures above the municipal cards). Add new icons here.
   */
  const ICONS = {
    // A house with a person inside — "people live here".
    'house-person': '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><circle cx="12" cy="12.6" r="2.1"/><path d="M8.4 20c0-2.1 1.6-3.7 3.6-3.7s3.6 1.6 3.6 3.7"/>',
    // Two houses — "all plots".
    houses: '<path d="M9.5 8.5l5.5-4.5 6.5 5.3V20H15"/><path d="M2.5 20v-6.7L7.8 9l5.2 4.3V20z"/><path d="M6.3 20v-3.4h3V20"/><path d="M1.5 20h21"/>',
    // A road narrowing into the distance, dashed centre line — road complaints.
    road: '<path d="M9 3L4 21"/><path d="M15 3l5 18"/><path d="M12 4.5v2M12 10.5v2.5M12 17v3"/>',
    // A group of three people — population total.
    people: '<circle cx="12" cy="7.5" r="3"/><path d="M6.5 20c0-3.2 2.5-5.6 5.5-5.6s5.5 2.4 5.5 5.6"/><circle cx="5.2" cy="9.6" r="2.2"/><path d="M1.5 19c0-2.4 1.5-4.2 3.7-4.4"/><circle cx="18.8" cy="9.6" r="2.2"/><path d="M22.5 19c0-2.4-1.5-4.2-3.7-4.4"/>',
    // A man in a collar and tie — male population.
    man: '<circle cx="12" cy="7" r="3.6"/><path d="M4.5 21c0-4.3 3.3-7.3 7.5-7.3s7.5 3 7.5 7.3"/><path d="M12 13.7l-1.3 1.8 1.3 4.5 1.3-4.5z"/>',
    // A woman with shoulder-length hair — female population.
    woman: '<path d="M8.2 11.5c-.9-4.9.6-8 3.8-8s4.7 3.1 3.8 8"/><circle cx="12" cy="8.3" r="3.2"/><path d="M4.5 21c0-4.3 3.3-7.3 7.5-7.3s7.5 3 7.5 7.3"/><path d="M9.6 14.2L12 17l2.4-2.8"/>',
    // A sheikh: a solid wrapped turban (its wrap lines drawn in the tile colour), pointed beard, robe —
    // religious teaching programmes.
    sheikh: '<path fill="currentColor" stroke="none" d="M6.3 8.8C5.6 4.6 8.4 1.6 12 1.6s6.4 3 5.7 7.2c-1.7.6-3.7.9-5.7.9s-4-.3-5.7-.9z"/><path d="M7.6 4.6c2.8 1.5 6 1.5 8.8 0M6.9 6.9c3.3 1.4 6.9 1.4 10.2 0" style="stroke: var(--c); stroke-width: 1"/><path d="M8.8 10c.3 1.4 1.6 2.4 3.2 2.4s2.9-1 3.2-2.4"/><path fill="currentColor" stroke="none" d="M9 11.5c.3 3.6 1.5 6 3 7 1.5-1 2.7-3.4 3-7-.9.9-1.9 1.3-3 1.3s-2.1-.4-3-1.3z"/><path d="M4.4 21.6c.3-3.2 2.1-5.3 4.6-6.2M19.6 21.6c-.3-3.2-2.1-5.3-4.6-6.2"/>',
    // Two open hands raised side by side, palms forward — dua / religious lessons.
    dua: '<path d="M11 19.6H8.7C5.9 19.6 4 17.5 4 14.7V8.4a1.2 1.2 0 0 1 2.4 0v3.2"/><path d="M6.4 11.2V5.6a1.2 1.2 0 0 1 2.4 0v5.6"/><path d="M8.8 11V6.4a1.1 1.1 0 0 1 2.2 0v13.2"/><path d="M13 19.6h2.3c2.8 0 4.7-2.1 4.7-4.9V8.4a1.2 1.2 0 0 0-2.4 0v3.2"/><path d="M17.6 11.2V5.6a1.2 1.2 0 0 0-2.4 0v5.6"/><path d="M15.2 11V6.4a1.1 1.1 0 0 0-2.2 0v13.2"/>',
    // A waste bin — rubbish complaints.
    bin: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 10.5v6.5M14 10.5v6.5"/>',
  };
  // Picture icons (assets/icon-images.js: PNG line drawings as data URLs) sit beside the SVG ones;
  // CSS (.icon-img) turns them white on the icon tile. Data URLs, so the PNG export never fetches them.
  const ICON_IMAGES = window.ICON_IMAGES || {};
  const iconOf = (name) => (typeof name === 'string' && (ICONS[name] || ICON_IMAGES[name]) ? name : undefined);
  const iconSVG = (name) => (ICONS[name]
    ? `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`
    : `<img class="icon-img" src="${ICON_IMAGES[name]}" alt="">`);
  const rowOf = (label, value, icon) => {
    const row = { label: String(label ?? ''), value: Number(value) || 0 };
    if (iconOf(icon)) row.icon = icon;
    return row;
  };
  const cleanRows = (rows) => rows.map((r) => rowOf(r?.label, r?.value, r?.icon));
  // Library rows: [label, number] or [label, number, icon].
  const templateRows = (chart) => (chart.rows || []).map(([label, value, icon]) => rowOf(label, value, icon));

  // A library chart → a document chart (a fresh copy with its own id).
  function chartFromTemplate(chart) {
    const out = {
      id: uid(),
      type: CHART_TYPES[chart.type] ? chart.type : 'cards',
      heading: String(chart.heading ?? ''),
      rows: templateRows(chart),
    };
    ['style', 'totalLabel', 'cols', 'subheading', 'colors'].forEach((key) => {
      if (chart[key] !== undefined) out[key] = chart[key];
    });
    return withBox(out, chart.box);
  }

  /*
   * Chart library (library/charts.js): each chart is inserted with its content already filled in
   * (labels, numbers, colours) and listed by its Dhivehi heading. Charts without a heading carry a
   * `name` instead — no invented Dhivehi. Entries without a unique key are skipped.
   */
  const CHART_LIBRARY = LIBRARY_SOURCE
    .filter((chart, i, all) => chart && typeof chart.key === 'string' && chart.key
      && all.findIndex((c) => c && c.key === chart.key) === i)
    .map((chart) => ({
      key: chart.key,
      // Optional heading in the sidebar (`group`), e.g. the budget charts sit together.
      group: String(chart.group || ''),
      name: String(chart.heading || chart.name || chart.key),
      type: chart.type,
      // src remembers which library chart this copy came from, so the sidebar can show it as in use.
      copy: () => ({ ...chartFromTemplate(chart), src: chart.key }),
    }));

  const blankPage = () => ({ id: uid(), charts: [] });
  // Pages aren't named (the user removed the name field): a page is labelled by its first chart.
  const pageLabel = (page) => page?.charts.map((c) => c.heading).find((h) => h && h.trim()) || '';

  // Anything read back from storage is rebuilt field by field, so a half-written or hand-edited
  // document can't break the app.
  function sanitizeChart(chart) {
    const out = {
      id: String(chart?.id || uid()),
      type: CHART_TYPES[chart?.type] ? chart.type : 'cards',
      heading: String(chart?.heading ?? ''),
      rows: Array.isArray(chart?.rows) ? cleanRows(chart.rows) : [],
    };
    if (typeof chart?.style === 'string') out.style = chart.style;
    if (typeof chart?.totalLabel === 'string') out.totalLabel = chart.totalLabel;
    if (Number(chart?.cols)) out.cols = Number(chart.cols);
    if (typeof chart?.subheading === 'string') out.subheading = chart.subheading;
    if (Array.isArray(chart?.colors)) out.colors = chart.colors.map(String);
    if (typeof chart?.src === 'string') out.src = chart.src;
    // Heading/text box formatting (mini toolbar).
    if (textColor(chart?.color)) out.color = textColor(chart.color);
    if (chart?.bold === true) out.bold = true;
    if (chart?.align === 'center' || chart?.align === 'left') out.align = chart.align;
    const fs = Number(chart?.fontSize);
    if (fs >= TEXT_SIZE_MIN && fs <= TEXT_SIZE_MAX) out.fontSize = Math.round(fs * 10) / 10;
    // Formatted text (per-word colour/bold/size, line breaks). Cleaned again whenever it is drawn.
    if (typeof chart?.html === 'string' && chart.html.length <= 50000) out.html = chart.html;
    withBox(out, chart?.box);
    return out;
  }

  /*
   * Formatted text in heading/text boxes (2026-11-25, user: colour a selected word, not the whole box;
   * Shift/Ctrl + Enter for a new line). The box is contenteditable="true", and what it holds is rebuilt by
   * richHTML() keeping only: text, <br>, and <span style> with colour, bold/normal weight, px size, italic,
   * underline. Block elements (pasted <div>/<p>) become line breaks; everything else is reduced to its
   * text. `digits` wraps digit runs in .num (Poppins) for drawing; existing .num spans are unwrapped first.
   */
  /*
   * Latin text inside a right-to-left box (2026-11-25, user: a pasted https://gazette.mv/iulaan/409718
   * showed as "409718/https://gazette.mv/iulaan"). The RTL box ordered the address's pieces right to left,
   * and mixed() pulled the number out on its own. A run of ASCII text with at least one Latin letter —
   * a web address, an email, English words with their numbers — is kept whole as one LTR, isolated
   * span in Poppins (Faruma draws Latin full stops like "·"). Dhivehi and plain numbers go through mixed().
   * The span carries no inline style, so richHTML() drops it again when the box is saved.
   */
  const LATIN_RUN = /[\x21-\x7E]*[A-Za-z][\x21-\x7E]*(?: +[\x21-\x7E]*[A-Za-z0-9][\x21-\x7E]*)*/g;
  function mixedText(s) {
    let out = '';
    let last = 0;
    for (const m of s.matchAll(LATIN_RUN)) {
      out += `${mixed(s.slice(last, m.index))}<span class="ltr">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + mixed(s.slice(last));
  }

  const SAFE_COLOR =/^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\))$/i;
  function richHTML(root, digits) {
    let out = '';
    root.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out += digits ? mixedText(n.data) : esc(n.data);
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') {
        out += '<br>';
        return;
      }
      // Bullet lists ("Add list" boxes): the list tags themselves, no attributes.
      if (tag === 'UL' || tag === 'OL' || tag === 'LI') {
        const t = tag.toLowerCase();
        out += `<${t}>${richHTML(n, digits)}</${t}>`;
        return;
      }
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'IMG'].includes(tag)) return;
      const inner = richHTML(n, digits);
      const st = n.style || {};
      const css = [];
      const color = (st.color || (tag === 'FONT' ? n.getAttribute('color') || '' : '')).trim();
      if (color && SAFE_COLOR.test(color)) css.push(`color:${color}`);
      const fw = st.fontWeight;
      if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || Number(fw) >= 600) css.push('font-weight:700');
      else if (fw === 'normal' || (fw && Number(fw) <= 500)) css.push('font-weight:400');
      const px = parseFloat(st.fontSize);
      if (/px$/.test(st.fontSize || '') && px >= TEXT_SIZE_MIN && px <= TEXT_SIZE_MAX) css.push(`font-size:${Math.round(px * 10) / 10}px`);
      if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') css.push('font-style:italic');
      if (tag === 'U' || /underline/.test(st.textDecorationLine || st.textDecoration || '')) css.push('text-decoration:underline');
      const body = css.length ? `<span style="${css.join(';')}">${inner}</span>` : inner;
      out += (tag === 'DIV' || tag === 'P') && out ? `<br>${body}` : body;
    });
    return out;
  }
  const parseRich = (html) => {
    const tpl = document.createElement('template'); // inert: nothing in it runs or loads
    tpl.innerHTML = html;
    return tpl.content;
  };
  const renderRich = (html) => richHTML(parseRich(html), true);
  // Box-wide formatting from the toolbar: drop that property from every span, so the whole box follows it.
  function stripRich(html, prop) {
    const root = parseRich(html);
    root.querySelectorAll('[style]').forEach((el) => el.style.removeProperty(prop));
    return richHTML(root, false);
  }
  const plainOf = (node) => (node.innerText || node.textContent || '').replace(/ /g, ' ');

  const sanitizePage = (page) => ({
    id: String(page?.id || uid()),
    charts: (Array.isArray(page?.charts) ? page.charts : []).map(sanitizeChart),
  });

  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null; // unreadable → start a new report
    }
  };

  /*
   * The report's month and year (shown in the header, one for the whole report): { y, m }, m = 0–11.
   * Defaults to the current month. MONTHS: September is the user's spelling ("ސެޕްޓެމްބަރ 2026"); the
   * other eleven follow the same style and are awaiting the user's confirmation.
   */
  const MONTHS = ['ޖެނުއަރީ', 'ފެބްރުއަރީ', 'މާރޗް', 'އޭޕްރިލް', 'މެއި', 'ޖޫން',
    'ޖުލައި', 'އޯގަސްޓް', 'ސެޕްޓެމްބަރ', 'އޮކްޓޯބަރ', 'ނޮވެމްބަރ', 'ޑިސެމްބަރ'];
  function periodOf(p) {
    const now = new Date();
    const y = Math.round(Number(p?.y));
    const m = Math.round(Number(p?.m));
    return {
      y: y >= 2000 && y <= 2100 ? y : now.getFullYear(),
      m: m >= 0 && m <= 11 ? m : now.getMonth(),
    };
  }
  const periodText = (p) => `${MONTHS[p.m]} ${p.y}`;

  function load() {
    const saved = read(STORE_KEY);
    if (saved && Array.isArray(saved.pages)) {
      return { v: 4, period: periodOf(saved.period), pages: saved.pages.map(sanitizePage) };
    }
    // First run on this browser: one blank page, ready for charts from the library.
    return { v: 4, period: periodOf(), pages: [blankPage()] };
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked — the page keeps working, it just won't remember.
    }
  }

  let state = load();

  // Current page: its id in the URL hash, so reloads keep the page (unknown hashes open the first page).
  function pageFromHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    return state.pages.find((p) => p.id === hash) || state.pages[0];
  }
  let current = pageFromHash();
  const pageIndex = () => state.pages.indexOf(current);

  // A page's charts with row colours filled in (rows carry their colour to the renderers).
  function pageView(page) {
    return (page?.charts || []).map((chart) => ({
      ...chart,
      // r = the row's index in the document, kept through filtering so preview edits can address it.
      items: chart.rows.map((row, i) => ({ ...row, r: i, color: rowColor(chart, i) })),
    }));
  }

  /* ---------- Chart helpers ---------- */

  function textOn(hex) {
    const n = parseInt(safeColor(hex).slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#1d1d1d' : '#ffffff';
  }

  function withShares(items) {
    const list = items.map((i) => ({ ...i, value: Number(i.value) || 0, color: safeColor(i.color) }));
    const total = list.reduce((sum, i) => sum + i.value, 0);
    list.forEach((i) => { i.share = total ? i.value / total : 0; });
    return { total, items: list };
  }

  const positive = (items) => visibleItems(items).map((i) => ({ ...i, value: Math.max(0, Number(i.value) || 0), color: safeColor(i.color) }));
  // Charts with no rows at all still draw the dashed placeholder instead of an empty frame.
  const hasContent = (items) => items.some(isFilled);

  // Largest-remainder rounding so the 100 cells always add up exactly.
  function waffleCells(items, total) {
    if (!total) return Array(100).fill(EMPTY_CELL);
    const raw = items.map((i) => i.share * 100);
    const counts = raw.map(Math.floor);
    let left = 100 - counts.reduce((a, b) => a + b, 0);
    raw.map((r, idx) => [r - counts[idx], idx])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, idx]) => { if (left > 0) { counts[idx]++; left--; } });
    return counts.flatMap((n, idx) => Array(n).fill(items[idx].color));
  }

  /* ---------- Report rendering ---------- */

  /*
   * Report header (2026-09-19, user request): hardcoded, the same width as the chart card — the council
   * logo on the right, then the council name (the user's wording, verbatim). Not editable, on every page.
   * The logo file has a white margin; .rh-logo crops to the mark (mark measured at x 40–287, y 51–352 of 327×430; see .rh-logo in styles.css for the crop).
   */
  const COUNCIL_NAME = 'ތިލަދުންމަތީ އުތުރުބުރީ ހއ. ދިއްދޫ ކައުންސިލްގެ އިދާރާ';
  const headerHTML = () => `
    <header class="rhead" dir="rtl">
      <div class="rh-logo"><img src="${window.COUNCIL_LOGO || 'assets/council-logo.png'}" alt=""></div>
      <div class="rh-name tn">${mixed(COUNCIL_NAME)}</div>
      <!-- Month + year (left end). Clickable while editing: opens the month picker (bindPeriodPicker). -->
      <div class="rh-date tn"${editMode ? ' role="button" tabindex="0" title="Choose the month"' : ''}>
        ${editMode ? '<svg class="rh-cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' : ''}
        <span>${mixed(periodText(state.period))}</span>
      </div>
    </header>`;

  /*
   * Report footer (2026-11-25, user request: "add this footer but in the current style"): the council's
   * contact line from the user's image — phone, email, Facebook page — as a glass bar matching the header,
   * in the page's bottom margin. Hardcoded and not editable, like the header. Latin text, so LTR + Poppins.
   */
  const COUNCIL_CONTACTS = [
    { icon: 'phone', text: '+960 6500019' },
    { icon: 'mail', text: 'info@hadhidhoo.gov.mv' },
    { icon: 'facebook', text: 'Secretariat of Dhidhdhoo Council, North Thiladhunmathi' },
  ];
  const FOOT_ICONS = {
    phone: '<path d="M7.2 3.5h2.6l1.3 3.4-1.7 1.2a10.5 10.5 0 0 0 5.5 5.5l1.2-1.7 3.4 1.3v2.6a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 5.2 5.7a2 2 0 0 1 2-2.2z" fill="currentColor"/>',
    mail: '<rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    facebook: '<path d="M13.4 20v-6.6h2.3l.4-2.7h-2.7V9c0-.8.3-1.3 1.4-1.3h1.4V5.3a18 18 0 0 0-2.1-.1c-2.1 0-3.5 1.3-3.5 3.6v1.9H8.3v2.7h2.3V20z" fill="currentColor"/>',
  };
  const footerHTML = () => `
    <footer class="rfoot" dir="ltr">${COUNCIL_CONTACTS.map((c) => `
      <span class="rf-item"><span class="rf-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${FOOT_ICONS[c.icon]}</svg></span>${esc(c.text)}</span>`).join('')}
    </footer>`;

  /*
   * Editable text in the preview. Every field the user can type into carries data-e with its address
   * in the document: "<chart>:<row>:label" / ":value", or "<chart>:heading" / ":totalLabel" / ":subheading".
   * renderReport() turns those into contenteditable (never when rendering for the PNG), and
   * bindPreview() writes what was typed back into the document.
   */
  const ed = (path) => ` data-e="${path}"`;
  // An empty heading still needs something to click on, so .is-empty gives it a hint box.
  const headingHTML = (chart, c) => `<div class="sec-head"><div class="sec-title tn${chart.heading ? '' : ' is-empty'}"${ed(`${c}:heading`)}>${mixed(chart.heading)}</div></div>`;

  const legend = (items, c) => `
    <div class="legend">${items.map((i) => `
      <div class="row">
        <i class="dot" style="background:${i.color}"></i>
        <span class="lbl tn"${ed(`${c}:${i.r}:label`)}>${esc(i.label)}</span>
        <span class="val num"${ed(`${c}:${i.r}:value`)}>${money(i.value)}</span>
        <span class="pct num">${pct(i.share)}</span>
      </div>`).join('')}
    </div>`;

  // Money breakdown styles.
  const MONEY_STYLES = {
    stacked: ({ items }, c) => `
      <div class="stack">${items.filter((i) => i.value > 0).map((i) => `
        <div class="seg" style="flex:${i.share} 1 0;background:${i.color};color:${textOn(i.color)}">
          <span class="num">${i.share >= 0.07 ? pct(i.share) : ''}</span>
        </div>`).join('')}
      </div>
      ${legend(items, c)}`,

    bars: ({ items }, c) => `
      <div class="bars">${items.map((i) => `
        <div>
          <div class="bar-top">
            <span class="lbl tn"${ed(`${c}:${i.r}:label`)}>${esc(i.label)}</span>
            <span class="meta"><span class="val num"${ed(`${c}:${i.r}:value`)}>${money(i.value)}</span><span class="pct num">${pct(i.share)}</span></span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${(i.share * 100).toFixed(2)}%;background:${i.color}"></div></div>
        </div>`).join('')}
      </div>`,

    waffle: ({ items, total }, c) => `
      <div class="waffle-wrap">
        ${legend(items, c)}
        <div class="waffle">${waffleCells(items, total).map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      </div>`,
  };

  // One renderer per chart type (see the list at the top of library/charts.js).
  const CHARTS = {
    money: (chart, c) => {
      const data = withShares(visibleItems(chart.items));
      const style = MONEY_STYLES[chart.style] || MONEY_STYLES.stacked;
      return `
        <section class="sec" dir="rtl">
          <div class="sec-head">
            <div class="sec-title tn${chart.heading ? '' : ' is-empty'}"${ed(`${c}:heading`)}>${mixed(chart.heading)}</div>
            <div class="sec-total"><span class="tn${chart.totalLabel ? '' : ' is-empty'}"${ed(`${c}:totalLabel`)}>${esc(chart.totalLabel ?? '')}</span><span class="num">${money(data.total)}</span></div>
          </div>
          ${style(data, c)}
        </section>`;
    },

    // Row 1 = total, row 2 = used. Big percentage beside a thick bar filled to the used share (capped at 100%;
    // the percentage can exceed 100), then two stat panels — used (right) and total (left). Kept roomy (user request).
    progress: (chart, c) => {
      const [whole = {}, part = {}] = chart.items;
      const total = Math.max(0, Number(whole.value) || 0);
      const used = Math.max(0, Number(part.value) || 0);
      const ratio = total ? Math.min(1, used / total) : 0;
      const stat = (item, amount, color) => `
        <div class="prog-stat">
          <div class="prog-stat-head"><i class="prog-swatch" style="background:${color}"></i><span class="lbl tn"${ed(`${c}:${item.r ?? 0}:label`)}>${mixed(item.label)}</span></div>
          <div class="prog-val num"${ed(`${c}:${item.r ?? 0}:value`)}>${money(amount)}</div>
        </div>`;
      return `
        <section class="sec" dir="rtl">
          ${headingHTML(chart, c)}
          <div class="prog">
            <div class="prog-meter">
              <div class="prog-pct num">${total ? Math.round((used / total) * 100) : 0}%</div>
              <div class="prog-track" style="background:${COLORS.pale}">
                <div class="prog-fill" style="width:${(ratio * 100).toFixed(2)}%;background:${COLORS.deep}"></div>
              </div>
            </div>
            <div class="prog-stats">${stat(part, used, COLORS.deep)}${stat(whole, total, COLORS.pale)}</div>
          </div>
        </section>`;
    },

    // Horizontal bars scaled to the largest value in the chart; the count sits just past the bar end.
    bars: (chart, c) => {
      const items = positive(chart.items);
      if (!hasContent(items)) return '';
      const max = Math.max(0, ...items.map((i) => i.value));
      return `
        <section class="sec" dir="rtl">
          ${headingHTML(chart, c)}
          <div class="cbars">${items.map((i) => `
            <div class="cbar-row">
              <span class="lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</span>
              <div class="cbar-track">
                <div class="cbar-fill" style="width:calc((100% - 80px) * ${max ? (i.value / max).toFixed(4) : 0});background:${i.color}"></div>
                <span class="val num"${ed(`${c}:${i.r}:value`)}>${count(i.value)}</span>
              </div>
            </div>`).join('')}
          </div>
        </section>`;
    },

    // Stat tiles with a thin bar against the largest value. cols: 2, or auto (up to 3 across, 2 if more).
    tiles: (chart, c) => {
      const items = positive(chart.items);
      if (!hasContent(items)) return '';
      const max = Math.max(0, ...items.map((i) => i.value));
      const share = (v) => (max ? ((v / max) * 100).toFixed(2) : 0);
      const cols = chart.cols || (items.length > 3 ? 2 : items.length);
      return `
        <section class="tiles" dir="rtl">
          ${headingHTML(chart, c)}
          <div class="tile-grid cols-${cols}">${items.map((i, n) => `
            <div class="tile${cols === 2 && items.length % 2 && n === items.length - 1 ? ' wide' : ''}" style="--c:${i.color}">
              <div class="tile-top">
                <div class="lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</div>
                <div class="tile-num num"${ed(`${c}:${i.r}:value`)}>${pad(i.value)}</div>
              </div>
              <div class="tile-bar"><i style="width:${share(i.value)}%"></i></div>
            </div>`).join('')}
          </div>
        </section>`;
    },

    // One raised card per row — label right, number left in a tinted panel.
    cards: (chart, c) => {
      const items = positive(chart.items);
      if (!hasContent(items)) return '';
      return `
        <section class="sec nsec" dir="rtl">
          ${headingHTML(chart, c)}
          <div class="nlist">${items.map((i) => `
            <div class="nrow${i.icon ? ' has-icon' : ''}" style="--c:${i.color}">
              ${i.icon ? `<div class="nrow-icon">${iconSVG(i.icon)}</div>` : ''}
              <div class="nrow-lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</div>
              <div class="nrow-num num"${ed(`${c}:${i.r}:value`)}>${pad(i.value)}</div>
            </div>`).join('')}
          </div>
        </section>`;
    },

    // One panel, one line per row — large label right, number chip left. For pages with many rows,
    // where cards would shrink the labels too far to read (user found the building grid hard to read).
    list: (chart, c) => {
      const items = positive(chart.items);
      if (!hasContent(items)) return '';
      return `
        <section class="sec lsec" dir="rtl">
          ${headingHTML(chart, c)}
          <div class="llist">${items.map((i) => `
            <div class="lrow" style="--c:${i.color}">
              <div class="lrow-lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</div>
              <div class="lrow-num num"${ed(`${c}:${i.r}:value`)}>${pad(i.value)}</div>
            </div>`).join('')}
          </div>
        </section>`;
    },

    // Cards side by side (cols 2 or 3, read right to left): number on top, label below; optional subheading.
    // Rows with an icon are drawn first, as stat panels (icon tile + big number + label) between the
    // heading and the subheading; the rest are the cards.
    grid: (chart, c) => {
      const all = positive(chart.items);
      if (!hasContent(all)) return '';
      const stats = all.filter((i) => i.icon);
      const items = all.filter((i) => !i.icon);
      return `
        <section class="sec nsec${items.length ? '' : ' only-stats'}" dir="rtl">
          ${headingHTML(chart, c)}
          ${stats.length ? `<div class="nstats${stats.length >= 3 ? ' cols-3' : ''}">${stats.map((i) => `
            <div class="nstat" style="--c:${i.color}">
              <div class="nstat-icon">${iconSVG(i.icon)}</div>
              <div class="nstat-text">
                <div class="nstat-num num"${ed(`${c}:${i.r}:value`)}>${count(i.value)}</div>
                <div class="nstat-lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</div>
              </div>
            </div>`).join('')}
          </div>` : ''}
          ${chart.subheading !== undefined && (editMode || chart.subheading.trim()) ? `<div class="nsub tn${chart.subheading ? '' : ' is-empty'}"${ed(`${c}:subheading`)}>${mixed(chart.subheading)}</div>` : ''}
          ${items.length ? `<div class="ngrid${chart.cols === 2 ? ' cols-2' : ''}">${items.map((i) => `
            <div class="ncard" style="--c:${i.color}">
              <div class="ncard-num num"${ed(`${c}:${i.r}:value`)}>${pad(i.value)}</div>
              <div class="ncard-lbl tn"${ed(`${c}:${i.r}:label`)}>${mixed(i.label)}</div>
            </div>`).join('')}
          </div>` : ''}
        </section>`;
    },

    // A heading text box (2026-11-25, user request): just its text, typed on the page. It moves and resizes
    // like a chart; the text scales to fill its box (fitBox) and wraps. Left out of the PNG when empty.
    text: (chart, c) => {
      const has = chart.heading.trim();
      if (!has && !editMode) return '';
      return `
        <section class="sec tsec" dir="rtl">
          <div class="tbox tn${smallText(chart) ? ' tbox-body' : ''}${chart.style === 'list' ? ' tbox-list' : ''}${has ? '' : ' is-empty'}"${textStyle(chart)}${ed(`${c}:heading`)}>${typeof chart.html === 'string' ? renderRich(chart.html) : mixed(chart.heading)}</div>
        </section>`;
    },
  };

  /*
   * Heading/text box font size (2026-11-25, user: "it should be like in MS Word"): an explicit size in page
   * px, any value from TEXT_SIZE_MIN to TEXT_SIZE_MAX, set from the toolbar. It no longer follows the box:
   * resizing the box changes its shape and where the text wraps, and the box grows to fit its text.
   */
  // "Add text" (body) and "Add list" boxes use the smaller body text; headings the large one.
  const smallText = (chart) => chart.style === 'body' || chart.style === 'list';
  const textSize = (chart) => chart.fontSize || (smallText(chart) ? 28 : 46);

  // Inline style for a heading/text box's toolbar formatting (size, colour, bold, alignment).
  function textStyle(chart) {
    // (No fontSize = a box from before sizes existed: the CSS base size applies until layoutText() sets one.)
    const css = chart.fontSize ? [`font-size:${chart.fontSize}px`] : [];
    if (textColor(chart.color)) css.push(`color:${textColor(chart.color)}`);
    if (chart.bold) css.push('font-weight:700');
    if (chart.align) css.push(`text-align:${chart.align}`);
    return css.length ? ` style="${css.join(';')}"` : '';
  }

  // Picks the largest chart sizing (CSS var --k) that fits the card: light pages grow up to 1.3× to fill it,
  // busy pages shrink. Returns false if the charts still overflow at the smallest step.
  const FIT_STEPS = [1.3, 1.2, 1.1, 1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6, 0.55];

  // A chart in a box: the largest --k whose content fits the box's height (and doesn't run wider
  // than it). Returns false if even the smallest --k overflows.
  const BOX_K = [0.3, 3];
  function fitBox(sec, h) {
    sec.style.height = 'auto';
    const fits = (k) => {
      sec.style.setProperty('--k', k);
      return sec.offsetHeight <= h + 0.5 && sec.scrollWidth <= sec.clientWidth + 1;
    };
    let [lo, hi] = BOX_K;
    const ok = fits(lo);
    if (ok) {
      for (let i = 0; i < 10; i += 1) {
        const k = (lo + hi) / 2;
        if (fits(k)) lo = k;
        else hi = k;
      }
    }
    sec.style.setProperty('--k', lo);
    sec.style.height = `${h}px`;
    return ok;
  }

  // The card's inner area (inside border and padding), in page px — the space boxes are measured in.
  function cardInner(card) {
    const cs = getComputedStyle(card);
    const l = parseFloat(cs.paddingLeft);
    const t = parseFloat(cs.paddingTop);
    return {
      l, t,
      w: card.clientWidth - l - parseFloat(cs.paddingRight),
      h: card.clientHeight - t - parseFloat(cs.paddingBottom),
    };
  }

  const snap = (v) => Math.round(v / GRID) * GRID;

  // A chart added to a page that is already laid out by hand goes below the lowest chart,
  // full width, or at the top if there's no room left.
  function placeNew(inner) {
    const bottom = Math.max(0, ...current.charts.filter((c) => c.box).map((c) => c.box.y + c.box.h));
    const y = Math.min(snap(bottom + GRID), inner.h);
    return inner.h - y >= 200
      ? { x: 0, y, w: inner.w, h: Math.min(inner.h - y, 540) }
      : { x: 0, y: 0, w: inner.w, h: 400 };
  }

  /*
   * Where a chart actually is, in px from the card's padding edge. In automatic layout a section
   * stretches to fill its share of the card (a lone chart fills the whole page) with its content
   * centred, so this hugs the content (plus the section's own padding) instead. On a free card the
   * section is the box itself.
   */
  function chartBounds(sec) {
    const card = sec.parentElement;
    if (card.classList.contains('free')) {
      return { x: sec.offsetLeft, y: sec.offsetTop, w: sec.offsetWidth, h: sec.offsetHeight };
    }
    const kids = [...sec.children].filter((el) => el.offsetHeight > 0);
    if (!kids.length) return { x: sec.offsetLeft, y: sec.offsetTop, w: sec.offsetWidth, h: sec.offsetHeight };
    const cs = getComputedStyle(sec);
    const top = Math.max(sec.offsetTop, Math.min(...kids.map((el) => el.offsetTop)) - parseFloat(cs.paddingTop));
    const bottom = Math.min(sec.offsetTop + sec.offsetHeight,
      Math.max(...kids.map((el) => el.offsetTop + el.offsetHeight)) + parseFloat(cs.paddingBottom));
    return { x: sec.offsetLeft, y: top, w: sec.offsetWidth, h: bottom - top };
  }

  // Pins every chart where the automatic layout drew it (the start of any move or resize), at the
  // size of its content, so nothing jumps.
  function freeze(card) {
    const inner = cardInner(card);
    const bounds = [...card.querySelectorAll(':scope > section')].map((sec) => [sec, chartBounds(sec)]);
    bounds.forEach(([sec, b]) => {
      withBox(current.charts[sec.dataset.c], {
        x: Math.max(0, b.x - inner.l),
        y: Math.max(0, b.y - inner.t),
        w: Math.max(BOX_MIN_W, b.w),
        h: Math.max(BOX_MIN_H, b.h),
      });
    });
  }

  /*
   * Lays out the current page's card: automatic (stacked, fitCard) when no chart has a box, otherwise
   * every chart absolutely at its box with its own --k. Cheap enough to run on every pointer move
   * while dragging (no HTML is rebuilt). Returns false if anything overflows its box or the card.
   * Sets `layoutAdded` when a new chart had to be given a box, so the caller can save.
   */
  let layoutAdded = false;
  function layoutCard(card) {
    layoutAdded = false;
    if (!card || !current) return true;
    const secs = [...card.querySelectorAll(':scope > section')];
    const free = current.charts.some((c) => c.box);
    card.classList.toggle('free', free);
    if (!free) {
      secs.forEach((sec) => {
        delete sec.dataset.fit;
        ['left', 'top', 'width', 'height'].forEach((p) => { sec.style[p] = ''; });
        sec.style.removeProperty('--k');
      });
      return fitCard(card);
    }
    const inner = cardInner(card);
    let ok = true;
    secs.forEach((sec) => {
      const chart = current.charts[sec.dataset.c];
      if (!chart) return;
      if (!chart.box) {
        withBox(chart, placeNew(inner));
        layoutAdded = true;
      }
      const b = chart.box;
      sec.style.left = `${inner.l + b.x}px`;
      sec.style.top = `${inner.t + b.y}px`;
      sec.style.width = `${b.w}px`;
      if (chart.type === 'text') {
        if (!layoutText(sec, chart, inner)) ok = false;
        return;
      }
      const key = `${b.w}|${b.h}`;
      if (sec.dataset.fit !== key) {
        sec.dataset.fit = key;
        sec.dataset.fitOk = fitBox(sec, b.h) ? '1' : '0';
      }
      if (sec.dataset.fitOk === '0' || b.x + b.w > inner.w + 1 || b.y + b.h > inner.h + 1) ok = false;
    });
    return ok;
  }

  /*
   * A heading/text box on a free card: the text keeps its own font size (no fitBox), and the box grows
   * taller when the text needs more room (typing, a bigger size, a narrower box), up to the card's bottom.
   * Returns false if the text still doesn't fit. A box saved before font sizes existed (text scaled to
   * its box) gets the size it was showing, so it looks the same.
   */
  function layoutText(sec, chart, inner) {
    const tbox = sec.querySelector('.tbox');
    if (!chart.fontSize && tbox) {
      fitBox(sec, chart.box.h);
      const base = smallText(chart) ? 28 : 46;
      chart.fontSize = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(base * parseFloat(sec.style.getPropertyValue('--k')))));
      tbox.style.fontSize = `${chart.fontSize}px`;
      layoutAdded = true;
    }
    sec.style.removeProperty('--k');
    sec.style.height = 'auto';
    const need = Math.ceil(sec.offsetHeight);
    const b = chart.box;
    if (need > b.h) {
      const h = Math.min(need, Math.floor(inner.h - b.y));
      if (h > b.h) {
        withBox(chart, { ...b, h });
        layoutAdded = true;
      }
    }
    sec.style.height = `${chart.box.h}px`;
    return need <= chart.box.h + 0.5 && b.x + b.w <= inner.w + 1 && chart.box.y + chart.box.h <= inner.h + 1;
  }

  // Width counts too: at a large --kp, wide numbers (152,510,000.00 in the progress panels) pushed a chart
  // out past the card's left edge. Sections are RTL, so that overflow shows in each section's own
  // scrollWidth, not the card's — hence the per-section check.
  function fitCard(card) {
    if (!card) return true;
    const secs = [...card.querySelectorAll(':scope > section')];
    const fitsWide = () => secs.every((sec) => sec.scrollWidth <= sec.clientWidth + 1);
    for (const k of FIT_STEPS) {
      card.style.setProperty('--kp', k);
      if (card.scrollHeight <= card.clientHeight + 1 && fitsWide()) return true;
    }
    return false;
  }

  // Preview-only frame for a chart with no labels or numbers yet (never exported).
  const placeholderHTML = (chart) => `
    <section class="sec ph">
      <div class="ph-box">
        <span class="ph-type">${esc(CHART_TYPES[chart.type] || chart.type)}</span>
        <span class="ph-hint">Add labels and numbers in the panel</span>
      </div>
    </section>`;

  function renderReport(forExport = false) {
    editMode = !forExport;
    const el = $('report');
    if (!current) {
      el.innerHTML = '';
      return;
    }
    const charts = pageView(current);
    // Keep only charts that rendered something; data-c below ties each section back to its chart.
    // A chart with nothing filled in draws a placeholder frame so the builder shows what's on the
    // page — `forExport` leaves those out, so they never reach the PNG.
    const drawn = charts
      .map((chart, c) => ({ c, html: (CHARTS[chart.type] || CHARTS.cards)(chart, c) || (forExport ? '' : placeholderHTML(chart)) }))
      .filter((c) => c.html);
    el.innerHTML = `${headerHTML()}<div class="card">${drawn.map((c) => c.html).join('<div class="divider"></div>')}</div>${footerHTML()}`;
    // data-c ties each section to its chart (for the box and for the resize handles).
    el.querySelectorAll('.card > section').forEach((sec, i) => {
      sec.dataset.c = drawn[i].c;
    });
    if (!forExport) {
      // plaintext-only keeps pasted formatting and stray <div>s out of the report text.
      el.querySelectorAll('[data-e]').forEach((node) => {
        // Heading/text boxes hold formatted text; every other field stays plain.
        node.setAttribute('contenteditable', node.classList.contains('tbox') ? 'true' : 'plaintext-only');
        node.setAttribute('spellcheck', 'false');
      });
    }
    updateSummaries(charts, layoutCard(el.querySelector('.card')));
    if (layoutAdded) save();
    if (!forExport) placeSelection();
  }

  function updateSummaries(charts, fits) {
    // In a grid chart, icon rows are separate figures (stat panels), not part of its count, so they stay
    // out of the total. In other charts (cards) an icon is only decoration and the row counts as usual.
    const totals = charts.map((chart) => withShares(chart.type === 'grid' ? chart.items.filter((i) => !i.icon) : chart.items).total);
    charts.forEach((chart, c) => {
      const el = document.querySelector(`[data-total="${c}"]`);
      if (!el) return;
      if (chart.type === 'progress') {
        const whole = Number(chart.items[0]?.value) || 0;
        el.textContent = `Used: ${whole ? Math.round(((Number(chart.items[1]?.value) || 0) / whole) * 100) : 0}%`;
      } else if (chart.type === 'grid' && chart.items.every((i) => i.icon)) {
        // Only stat panels (e.g. population: total, men, women) — adding them up means nothing.
        el.textContent = '';
      } else {
        el.textContent = `Total: ${isMoney(chart) ? money(totals[c]) : count(totals[c])}`;
      }
    });
    const messages = [];
    // Two money breakdowns on one page describe the same money (e.g. sources vs spending), so their
    // totals should agree. This used to be a per-page flag.
    if (charts.length === 2 && charts.every((chart) => chart.type === 'money')
      && Math.abs(totals[0] - totals[1]) >= 0.005) {
      messages.push(`Heads up: the two chart totals differ by ${money(Math.abs(totals[0] - totals[1]))}.`);
    }
    if (!fits) messages.push('Too many rows to fit on this page — remove or combine some rows.');
    const warn = $('warn');
    warn.hidden = messages.length === 0;
    warn.textContent = messages.join(' ');
  }

  /* ---------- Sidebar (charts) and the page stepper ---------- */

  // Collapsed library groups, remembered in this browser (a convenience — losing it is harmless).
  const COLLAPSED_KEY = 'monthly-report:collapsed-groups';
  const collapsed = new Set((() => {
    try {
      const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  })());
  function toggleGroup(name) {
    if (collapsed.has(name)) collapsed.delete(name);
    else collapsed.add(name);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch { /* not important enough to fail over */ }
    buildNav();
  }

  function buildNav() {
    /*
     * The chart library as one flat list (the user asked for no page grouping). A chart already on
     * this page is drawn pressed, like a held-down button; one used on another page keeps a lighter
     * marker and says which page, so it's clear what is already in the report.
     */
    // Grouped charts first, under their Dhivehi heading (library `group`); the rest follow plain.
    const groups = [...new Set(CHART_LIBRARY.map((e) => e.group).filter(Boolean))];
    const ordered = [...groups.flatMap((g) => CHART_LIBRARY.filter((e) => e.group === g)),
      ...CHART_LIBRARY.filter((e) => !e.group)];

    const rowHTML = (e) => {
      const here = current?.charts.some((c) => c.src === e.key);
      const elsewhere = state.pages
        .map((p, i) => (p !== current && p.charts.some((c) => c.src === e.key) ? pageNo(i) : null))
        .filter(Boolean);
      const state_ = here ? ' in-use' : (elsewhere.length ? ' used-elsewhere' : '');
      // Just the name: the colour says whether it is in use (the user removed both caption lines).
      // The detail stays in the tooltip.
      const hint = here ? 'Already on this page'
        : (elsewhere.length ? `Already on page ${elsewhere.join(', ')} — click to add here too` : 'Add to this page');
      const button = `
        <button type="button" class="btn pick${state_}" data-new-chart="${e.key}"
          aria-pressed="${here ? 'true' : 'false'}" title="${hint}">
          <span class="pick-name tn" dir="rtl">${esc(e.name)}</span>
        </button>`;
      // A chart on this page gets an ✕ in its own column (buttons can't nest, hence the wrapper).
      const row = here ? `
        <div class="pick-wrap in-use">
          ${button}
          <button type="button" class="pick-x" data-off="${e.key}" title="Remove from this page" aria-label="Remove from this page">✕</button>
        </div>` : button;
      return row;
    };

    /*
     * Each group is a collapsible block: its heading is a button with a chevron. A collapsed group
     * still shows how many of its charts are on this page, so nothing in use is hidden silently.
     */
    const groupHTML = (g) => {
      const items = CHART_LIBRARY.filter((e) => e.group === g);
      const open = !collapsed.has(g);
      const onPage = items.filter((e) => current?.charts.some((c) => c.src === e.key)).length;
      return `
        <div class="lib-block${open ? '' : ' is-collapsed'}">
          <button type="button" class="lib-group" data-toggle-group="${esc(g)}" aria-expanded="${open}">
            <span class="lib-group-name tn" dir="rtl">${esc(g)}</span>
            ${!open && onPage ? `<span class="lib-group-used num" title="On this page">${onPage}</span>` : ''}
            <span class="lib-group-count num">${items.length}</span>
            <svg class="lib-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          ${open ? `<div class="lib-items">${items.map(rowHTML).join('')}</div>` : ''}
        </div>`;
    };
    const charts = groups.map(groupHTML).join('') + ordered.filter((e) => !e.group).map(rowHTML).join('');

    // The sidebar is the chart library only — the Pages list and its + New page button were removed
    // at the user's request; pages are reached with the stepper beside the page.
    // No heading inside the sidebar: the top bar's "ޗާރޓްތައް" is its header (user request).
    $('pagelist').innerHTML = `<div class="lib">${charts}</div>`;
    document.title = pageLabel(current) ? `${pageLabel(current)} · Monthly Report` : 'Monthly Report';

    // Stepper and delete only make sense with more than one page (user request).
    const many = state.pages.length > 1;
    const index = pageIndex();
    $('pager').hidden = !many;
    $('pagerAt').textContent = `${pageNo(index)}/${pageNo(state.pages.length - 1)}`;
    $('prevPage').disabled = index <= 0;
    $('nextPage').disabled = index >= state.pages.length - 1;
    $('deletePageTop').hidden = !many;
  }

  /* ---------- Page and chart operations ---------- */

  // Go to a page by object, keeping the hash (the hashchange handler does the rebuild).
  function goTo(page) {
    if (!page) return;
    if (decodeURIComponent(location.hash.slice(1)) === page.id) {
      current = page;
      rebuild();
    } else {
      location.hash = encodeURIComponent(page.id);
    }
  }

  function rebuild() {
    buildNav();
    buildEditor();
    commit();
  }

  const PAGE_OPS = {
    newPage() {
      const page = blankPage();
      state.pages.push(page);
      goTo(page);
    },

    deletePage() {
      if (!current) return;
      const label = pageLabel(current) ? `"${pageLabel(current)}"` : `page ${pageNo(pageIndex())}`;
      if (!confirm(`Delete ${label}?\nThe charts, labels and numbers on this page will be removed.`)) return;
      const index = pageIndex();
      state.pages.splice(index, 1);
      current = state.pages[Math.min(index, state.pages.length - 1)];
      if (!current) PAGE_OPS.newPage();
      else goTo(current);
    },

  };

  // `key` is a library key ("finance:0"): the chart comes in as a filled copy.
  function addChart(key) {
    const entry = CHART_LIBRARY.find((e) => e.key === key);
    if (!current || !entry) return;
    // The sidebar shows this chart as already here, so a second copy is worth a check.
    if (current.charts.some((c) => c.src === entry.key)
      && !confirm(`"${entry.name}" is already on this page.\nAdd another copy?`)) return;
    current.charts.push(entry.copy());
    buildNav(); // the library marks what is in use
    buildEditor();
    commit();
    // Show the new chart's fields straight away.
    const groups = document.querySelectorAll('#pageEditor .group.chart');
    groups[groups.length - 1]?.scrollIntoView({ block: 'nearest' });
  }

  // The "T" icon beside the page: a new, empty heading box, selected with the caret in it.
  // On a page arranged by hand it gets a heading-sized box (in free space at the bottom, else at the
  // top, on top of the charts); on an automatic page it goes after the text boxes already at the top.
  // style 'body' ("Add text"): the same box with smaller, lighter text and a shorter default box.
  // style 'list' ("Add list", 2026-11-25): body text as bullet points, starting with one empty bullet.
  function addHeading(style) {
    if (!current) return;
    const chart = { id: uid(), type: 'text', heading: '', rows: [] };
    if (style === 'body' || style === 'list') chart.style = style;
    if (style === 'list') chart.html = '<ul><li><br></li></ul>';
    chart.fontSize = textSize(chart); // 46 for a heading, 28 for text and lists
    const card = cardEl();
    if (card && current.charts.some((c) => c.box)) {
      const inner = cardInner(card);
      const h = (style ? 3 : 4) * GRID;
      const bottom = Math.max(0, ...current.charts.filter((c) => c.box).map((c) => c.box.y + c.box.h));
      const y = snap(bottom + GRID);
      withBox(chart, { x: 0, y: y + h <= inner.h ? y : 0, w: inner.w, h });
      current.charts.push(chart);
    } else {
      // After any heading/text boxes already at the top, so they stack in the order they were added.
      let at = 0;
      while (current.charts[at]?.type === 'text') at += 1;
      current.charts.splice(at, 0, chart);
    }
    buildEditor();
    commit();
    select(chart.id);
    const sec = document.querySelector(`#report .card > section[data-c="${current.charts.indexOf(chart)}"]`);
    const tbox = sec?.querySelector('.tbox');
    tbox?.focus();
    // A list: put the caret in its first bullet.
    const li = tbox?.querySelector('li');
    if (li) {
      const r = document.createRange();
      r.setStart(li, 0);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }
  }

  function moveChart(from, to) {
    if (!current || to < 0 || to >= current.charts.length) return;
    const [chart] = current.charts.splice(from, 1);
    current.charts.splice(to, 0, chart);
    buildEditor();
    commit();
  }

  // Has this copy been left as the library made it? If so it can be removed without asking.
  function isUnedited(chart, entry) {
    if (!entry) return false;
    const strip = ({ id, src, ...rest }) => JSON.stringify(rest);
    return strip(chart) === strip(entry.copy());
  }

  // The sidebar's ✕: take this library chart off the page being shown.
  function removeFromPage(key) {
    if (!current) return;
    const index = current.charts.findIndex((c) => c.src === key);
    if (index < 0) return;
    const entry = CHART_LIBRARY.find((e) => e.key === key);
    if (!isUnedited(current.charts[index], entry)
      && !confirm(`Remove "${entry?.name || 'this chart'}" from this page?\nThe labels and numbers you changed on it will be removed.`)) return;
    current.charts.splice(index, 1);
    buildNav();
    buildEditor();
    commit();
  }

  function removeChart(index) {
    if (!current) return;
    const chart = current.charts[index];
    const label = chart?.heading ? `"${chart.heading}"` : `chart ${index + 1}`;
    if (!confirm(`Remove ${label} from this page?\nIts labels and numbers will be removed.`)) return;
    current.charts.splice(index, 1);
    buildNav();
    buildEditor();
    commit();
  }

  /* ---------- Editor ---------- */

  function buildEditor() {
    if (!current) {
      $('pageEditor').innerHTML = '<p class="sub">No pages found. Check that library/charts.js loaded.</p>';
      return;
    }
    const charts = pageView(current);

    $('pageEditor').innerHTML = `
      <section class="group">
        <!-- Just the page number (the user removed the help texts); the buttons are actions. -->
        <!-- Reset layout sits on the page-number line, as a real button (user request), and only
             once charts have been moved or resized by hand. -->
        <h2 class="page-head">
          <span class="page-chip">Page <b>${pageNo(pageIndex())}</b>${state.pages.length > 1 ? `<span class="page-of">/${pageNo(state.pages.length - 1)}</span>` : ''}</span>
          <span class="page-actions">
            ${current.charts.some((c) => c.box) ? `<button type="button" class="btn pill-btn reset-layout" data-autolayout="1" title="Put the charts back in the automatic layout">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>
              Reset layout
            </button>` : ''}
            ${state.pages.length > 1 ? `<button type="button" class="btn pill-btn delete-page" id="deletePage" title="Delete this page">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 4h4l1 3H9z"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>
              Delete page
            </button>` : ''}
          </span>
        </h2>
      </section>

      ${charts.map((chart, c) => {
        const progress = chart.type === 'progress';
        const noun = isMoney(chart) ? 'Amount' : 'Count';
        return `
        <section class="group chart${isMoney(chart) ? '' : ' is-counts'}${chart.id === selectedId ? ' is-selected' : ''}" data-chart-id="${esc(chart.id)}">
          <!-- Card header: number + the chart's Dhivehi heading, so each chart is easy to tell apart. -->
          <h2 class="chart-head">
            <span class="chart-no num">${pageNo(c)}</span>
            <span class="chart-name tn" dir="rtl">${chart.heading ? esc(chart.heading) : ''}</span>
            <span class="chart-tools">
              <button type="button" class="btn icon" data-move="${c}:up" title="Move up"${c === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" class="btn icon" data-move="${c}:down" title="Move down"${c === charts.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" class="btn icon" data-drop="${c}" title="Remove this chart">✕</button>
            </span>
          </h2>
          ${chart.type === 'money' ? `
            <label class="field">Style
              <select data-c="${c}" data-chart="style">
                ${['stacked', 'bars', 'waffle'].map((v) => `<option value="${v}"${chart.style === v ? ' selected' : ''}>${v[0].toUpperCase()}${v.slice(1)}</option>`).join('')}
              </select>
            </label>` : ''}
          ${chart.type === 'grid' || chart.type === 'tiles' ? `
            <label class="field">Columns
              <select data-c="${c}" data-chart="cols">
                ${[2, 3].map((v) => `<option value="${v}"${Number(chart.cols) === v ? ' selected' : ''}>${v}</option>`).join('')}
              </select>
            </label>` : ''}
          ${progress ? '<p class="sub">Row 1 is the total and row 2 the amount used; the chart shows the percentage used.</p>' : ''}
          <!-- Rows can be edited here or on the page itself: both write the same document. Typing
               here redraws the preview straight away (bindEditor's input handler → commit()); edits
               made on the page reach these fields when focus leaves the page (buildEditor). -->
          <div class="item-head"><span>Rows</span><span>${noun}</span><span></span></div>
          ${chart.items.map((row, r) => `
            <div class="item">
              <input class="tn" dir="rtl" data-c="${c}" data-r="${r}" data-k="label" value="${esc(row.label)}" placeholder="Label" aria-label="Row ${r + 1} label">
              <input type="number" step="any" inputmode="decimal" dir="ltr" data-c="${c}" data-r="${r}" data-k="value" value="${Number(row.value) || 0}" aria-label="Row ${r + 1} ${noun}">
              ${progress ? '<span></span>' : `<button type="button" class="btn icon" data-remove="${c}:${r}" title="Remove row">×</button>`}
            </div>`).join('')}
          <div class="sec-foot">
            ${progress ? '<span></span>' : `<button type="button" class="btn" data-add="${c}">+ Add row</button>`}
            <span data-total="${c}"></span>
          </div>
        </section>`;
      }).join('')}

`;
  }

  function bindEditor() {
    const editor = $('pageEditor');

    editor.addEventListener('input', (e) => {
      const t = e.target;
      const { c, r, k, chart: field } = t.dataset;
      if (c !== undefined && field) {
        // Money style and columns (the chart-type picker was removed at the user's request:
        // a chart keeps the design it came with from the library).
        current.charts[c][field] = field === 'cols' ? Number(t.value) : t.value;
      } else if (c !== undefined && r !== undefined) {
        const row = current.charts[c].rows[r];
        row[k] = k === 'value' ? parseFloat(t.value) || 0 : oneSpace(t.value);
      } else return;
      commit();
    });

    editor.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const { add, remove, move, drop } = t.dataset;
      if (t.dataset.autolayout !== undefined) {
        current.charts.forEach((chart) => delete chart.box);
        buildEditor();
        commit();
        return;
      }
      if (drop !== undefined) return removeChart(Number(drop));
      if (move) {
        const [from, dir] = move.split(':');
        return moveChart(Number(from), Number(from) + (dir === 'up' ? -1 : 1));
      }
      if (t.id === 'deletePage') return PAGE_OPS.deletePage();
      if (add !== undefined) {
        current.charts[add].rows.push({ label: '', value: 0 });
      } else if (remove) {
        const [c, r] = remove.split(':').map(Number);
        current.charts[c].rows.splice(r, 1);
      } else {
        return;
      }
      buildEditor();
      commit();
    });

    // The icon buttons over the preview do the same two things.
    $('newPageTop').addEventListener('click', PAGE_OPS.newPage);
    $('addHeadingTop').addEventListener('click', () => addHeading());
    $('addTextTop').addEventListener('click', () => addHeading('body'));
    $('addListTop').addEventListener('click', () => addHeading('list'));
    $('downloadTop').addEventListener('click', downloadPng);
    $('deletePageTop').addEventListener('click', PAGE_OPS.deletePage);

    $('prevPage').addEventListener('click', () => goTo(state.pages[pageIndex() - 1]));
    $('nextPage').addEventListener('click', () => goTo(state.pages[pageIndex() + 1]));

    // The sidebar holds the chart library and is rebuilt, so listen on the sidebar itself.
    $('pagelist').addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle-group]');
      if (toggle) return toggleGroup(toggle.dataset.toggleGroup);
      const off = e.target.closest('[data-off]');
      if (off) return removeFromPage(off.dataset.off);
      const pick = e.target.closest('[data-new-chart]');
      if (pick) addChart(pick.dataset.newChart);
    });

    window.addEventListener('hashchange', () => {
      current = pageFromHash();
      buildNav();
      buildEditor();
      commit();
      document.querySelector('.panel').scrollTop = 0;
    });
  }

  function commit() {
    renderReport();
    save();
  }

  /* ---------- Editing in the preview ---------- */
  /*
   * Click any label, number or heading in the report and type. While a field has focus the document
   * is updated but the report is NOT re-rendered — a re-render replaces the node and would lose the
   * caret. Totals, percentages and bar lengths therefore catch up when the field is left.
   * Numbers show their raw value while being edited (200.00 → 200, 09 → 9) and reformat on blur.
   */
  function fieldAt(path) {
    const [c, a, b] = String(path).split(':');
    const chart = current?.charts?.[Number(c)];
    if (!chart) return null;
    if (b === undefined) return { chart, key: a }; // heading / totalLabel / subheading
    const row = chart.rows[Number(a)];
    return row ? { chart, row, key: b } : null;
  }

  // How a number reads in the report: money pages get 1,234.00, bar charts a plain count, the rest 09.
  const displayValue = ({ chart, row }) => (isMoney(chart) ? money(row.value)
    : (chart.type === 'bars' ? count(row.value) : pad(row.value)));

  const rawText = (target, path) => {
    const at = fieldAt(path);
    if (!at) return target.textContent;
    if (at.key === 'value') return String(Number(at.row.value) || 0);
    return at.row ? at.row.label : String(at.chart[at.key] ?? '');
  };

  let relisting = false;
  function bindPreview() {
    const report = $('report');

    report.addEventListener('focusin', (e) => {
      const node = e.target.closest('[data-e]');
      if (!node) return;
      // Heading/text boxes keep their formatting while edited (no swap to plain text).
      if (node.classList.contains('tbox')) {
        node.classList.add('is-editing');
        return;
      }
      // Swap to the raw text: labels carry .num spans for the RTL digit fix, numbers are formatted.
      const raw = rawText(node, node.dataset.e);
      if (node.textContent !== raw) node.textContent = raw;
      node.classList.add('is-editing');
    });

    report.addEventListener('input', (e) => {
      const node = e.target.closest('[data-e]');
      if (!node) return;
      const at = fieldAt(node.dataset.e);
      if (!at) return;
      if (node.classList.contains('tbox')) {
        // A list box emptied and typed into again: turn the line back into a bullet. (The command fires
        // its own input event, which saves; `relisting` keeps it from looping.)
        if (node.classList.contains('tbox-list') && !node.querySelector('li') && node.textContent.trim() && !relisting) {
          relisting = true;
          document.execCommand('insertUnorderedList');
          relisting = false;
          return;
        }
        // Formatted text: keep the cleaned markup, and the plain text as the heading.
        at.chart.html = richHTML(node, false);
        at.chart.heading = plainOf(node);
        node.classList.toggle('is-empty', !at.chart.heading.trim());
        // Grow the box (and its frame) as lines are added — layoutCard() moves no HTML, so the caret stays.
        layoutCard(cardEl());
        placeSelection();
        save();
        return;
      }
      const text = node.textContent;
      if (at.key === 'value') at.row.value = parseFloat(text.replace(/[^\d.-]/g, '')) || 0;
      else if (at.row) at.row.label = oneSpace(text);
      else at.chart[at.key] = oneSpace(text);
      node.classList.toggle('is-empty', at.key !== 'value' && !text.trim()); // the "…" hint goes as you type
      save(); // saved as typed; the redraw waits for blur
    });

    /*
     * Leaving a field: format its own text straight away, but only redraw the page once focus has
     * left the report. Redrawing here would replace the node the user is clicking on next, so
     * clicking from one field to another would need two clicks.
     */
    report.addEventListener('focusout', (e) => {
      const node = e.target.closest('[data-e]');
      if (!node) return;
      node.classList.remove('is-editing');
      const at = fieldAt(node.dataset.e);
      if (at?.key === 'value') node.textContent = displayValue(at);
      save();
      setTimeout(() => {
        if (report.contains(document.activeElement) && document.activeElement.hasAttribute('data-e')) return;
        // The panel's row fields follow along. Rebuild it first so commit() fills its totals, and put
        // the caret back if the user clicked straight from the page into a panel field.
        const was = document.activeElement;
        const key = $('pageEditor').contains(was) && was.dataset.c !== undefined
          ? `[data-c="${was.dataset.c}"][data-r="${was.dataset.r}"][data-k="${was.dataset.k}"]` : '';
        buildEditor();
        commit(); // re-total, reformat and re-fit
        if (key) $('pageEditor').querySelector(key)?.focus();
      }, 0);
    });

    report.addEventListener('keydown', (e) => {
      const node = e.target.closest('[data-e]');
      if (!node) return;
      if (e.key === 'Enter' && !e.shiftKey && node.classList.contains('tbox-list')) {
        // In a list box Enter adds a bullet, as in Word (the browser's own list editing; Enter on an
        // empty last bullet leaves the list). Shift + Enter is a new line inside the bullet, below.
        return;
      }
      if (e.key === 'Enter' && e.shiftKey && node.classList.contains('tbox')) {
        // Shift + Enter: a new line in a heading/text box (the user tried Ctrl + Enter and switched back).
        // Enter alone finishes editing.
        e.preventDefault();
        document.execCommand('insertLineBreak');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        node.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        node.blur();
      }
    });

  }

  /* ---------- Month picker (header) ---------- */
  /*
   * Click the month in the header: a popover with the year (‹ 2026 ›) and the twelve months. Picking a
   * month sets state.period for the whole report. The popover lives in <body>, outside #report, so it
   * is never exported; the calendar icon in the header is drawn only while editing.
   */
  function bindPeriodPicker() {
    const pop = $('periodPop');
    let year = state.period.y;

    const draw = () => {
      pop.innerHTML = `
        <div class="pp-year">
          <button type="button" class="pp-step" data-year="-1" aria-label="Previous year">‹</button>
          <span class="num">${year}</span>
          <button type="button" class="pp-step" data-year="1" aria-label="Next year">›</button>
        </div>
        <div class="pp-months" dir="rtl">${MONTHS.map((name, m) => `
          <button type="button" class="pp-month tn${year === state.period.y && m === state.period.m ? ' on' : ''}" data-month="${m}">${esc(name)}</button>`).join('')}
        </div>`;
    };
    const place = () => {
      const r = $('report').querySelector('.rh-date')?.getBoundingClientRect();
      if (!r) return;
      pop.style.top = `${Math.round(r.bottom + 8)}px`;
      pop.style.left = `${Math.round(Math.max(8, r.left))}px`;
    };
    const open = () => {
      year = state.period.y;
      draw();
      pop.hidden = false;
      place();
    };
    const close = () => { pop.hidden = true; };

    $('report').addEventListener('click', (e) => {
      if (!e.target.closest('.rh-date')) return;
      if (pop.hidden) open();
      else close();
    });
    $('report').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.rh-date')) {
        e.preventDefault();
        open();
      }
    });
    pop.addEventListener('click', (e) => {
      const step = e.target.closest('[data-year]');
      if (step) {
        year += Number(step.dataset.year);
        draw();
        return;
      }
      const month = e.target.closest('[data-month]');
      if (!month) return;
      state.period = periodOf({ y: year, m: Number(month.dataset.month) });
      close();
      commit();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!pop.hidden && !(e.target instanceof Element && e.target.closest('#periodPop, .rh-date'))) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !pop.hidden) close();
    });
    window.addEventListener('resize', () => { if (!pop.hidden) place(); });
    $('stage').addEventListener('scroll', () => { if (!pop.hidden) place(); });
  }

  /* ---------- Export ---------- */

  async function downloadPng() {
    if (!current) return;
    if (!window.htmlToImage) {
      alert('The PNG export library did not load. Check your internet connection and reload the page.');
      return;
    }
    // Opened as a file (file://), the browser won't let the export read fonts/Faruma.ttf, so the PNG
    // could come out without Faruma. The app is meant to run from serve.py or GitHub Pages.
    if (location.protocol === 'file:' && !confirm('This page was opened as a file, so the downloaded PNG may not use the Faruma font.\n\nFor a correct image, open the app through serve.py (http://localhost:5173) or its website.\n\nDownload anyway?')) return;
    // The icon beside the page is the only export control, so it shows the busy state.
    const btn = $('downloadTop');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    try {
      await document.fonts.load('32px "Faruma"', 'ދިވެހި');
      await document.fonts.ready;
      const node = $('report');
      await Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
      renderReport(true); // re-fit now that fonts are final, and drop the empty-chart placeholders
      // canvasWidth/Height scale the 1200×1500 canvas to exactly EXPORT_SIZE pixels.
      const { width: outW, height: outH } = EXPORT_SIZE;
      // imagePlaceholder: if an image can't be loaded, html-to-image uses this transparent pixel instead of
      // aborting the whole export (it used to reject with a bare Event → "[object Event]").
      const opts = {
        width: 1200, height: 1500, pixelRatio: 1, canvasWidth: outW, canvasHeight: outH,
        imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      };
      // First pass warms up font and image embedding; the second is the reliable one.
      await htmlToImage.toPng(node, opts);
      const url = await htmlToImage.toPng(node, opts);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${new Date().toISOString().slice(0, 10)}-page-${pageNo(pageIndex())}-${outW}x${outH}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      // html-to-image rejects with a DOM Event when something on the page fails to load.
      const why = err instanceof Event
        ? 'something on the page (an image or the font) could not be loaded. Open the app through serve.py (http://localhost:5173) or its website, not as a file, and try again.'
        : (err.message || String(err));
      alert(`Could not create the PNG: ${why}`);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      renderReport(); // bring the empty-chart placeholders back for editing
    }
  }

  /* ---------- Preview scaling ---------- */

  // Zoom slider (Canva-style): 'fit' (the whole page in the window, the default) or a percentage.
  // Clicking the percentage goes back to fit. Remembered per browser.
  const ZOOM_KEY = 'monthly-report:zoom';
  const ZOOM_MIN = 10;
  const ZOOM_MAX = 200;
  const zoomOf = (v) => {
    if (v === 'full') return 100; // the old Fit / 100% toggle
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) : 'fit';
  };
  let zoom = (() => {
    try {
      return zoomOf(localStorage.getItem(ZOOM_KEY));
    } catch {
      return 'fit';
    }
  })();

  function setZoom(next) {
    zoom = next === 'fit' ? 'fit' : zoomOf(next);
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch { /* not important enough to fail over */ }
    fit();
  }

  // Slider and label follow the actual scale, so "fit" shows its real percentage too.
  function showZoom(scale) {
    const pct = Math.round(scale * 100);
    const range = $('zoomRange');
    if (!range) return;
    range.value = String(pct);
    range.style.setProperty('--fill', `${((pct - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%`);
    $('zoomPct').textContent = `${pct}%`;
    $('zoomPct').title = zoom === 'fit' ? 'Fitted to the window' : 'Fit to the window';
  }

  /* ---------- Moving and resizing charts on the page ---------- */
  /*
   * Click a chart to select it: a frame with eight handles (#sel) and the alignment grid (#grid), both
   * beside #report inside .scale-inner, so neither reaches the PNG. Hold the mouse on the chart and
   * drag to move it; drag a handle to resize it (the opposite edge stays put). Edges snap to the grid
   * (Alt turns snapping off). A step that would push content out of its box is refused.
   * A plain click still edits text: a drag only starts once the pointer has moved a few pixels.
   */
  let selectedId = null;
  let viewScale = 1;
  const selObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeSelection()) : null;
  const cardEl = () => $('report').querySelector('.card');

  function selectedSection() {
    const c = current ? current.charts.findIndex((chart) => chart.id === selectedId) : -1;
    return c >= 0 ? $('report').querySelector(`.card > section[data-c="${c}"]`) : null;
  }

  // Page-px rect of an element inside .scale-inner.
  function pageRect(el) {
    const a = el.getBoundingClientRect();
    const b = $('scaleInner').getBoundingClientRect();
    return {
      left: (a.left - b.left) / viewScale,
      top: (a.top - b.top) / viewScale,
      width: a.width / viewScale,
      height: a.height / viewScale,
    };
  }

  function placeSelection() {
    const sel = $('sel');
    const grid = $('grid');
    if (!sel || !grid) return;
    const sec = selectedSection();
    selObserver?.disconnect();
    if (!sec) {
      sel.hidden = true;
      grid.hidden = true;
      return;
    }
    // Frame the chart's content (chartBounds), measured from the card's padding edge.
    const card = cardEl();
    const c = pageRect(card);
    const b = chartBounds(sec);
    Object.assign(sel.style, {
      left: `${c.left + card.clientLeft + b.x}px`,
      top: `${c.top + card.clientTop + b.y}px`,
      width: `${b.w}px`,
      height: `${b.h}px`,
    });
    sel.hidden = false;
    // The grid covers the card's inner area — the space boxes are measured in.
    const inner = cardInner(card);
    Object.assign(grid.style, {
      left: `${c.left + card.clientLeft + inner.l}px`,
      top: `${c.top + card.clientTop + inner.t}px`,
      width: `${inner.w}px`,
      height: `${inner.h}px`,
    });
    grid.hidden = false;
    selObserver?.observe(sec);
    syncToolbar(sec);
  }

  /*
   * Mini formatting toolbar (2026-11-25, user request): floats above a selected heading/text box, inside
   * #sel (so it is never exported) and drawn at screen size whatever the zoom. Size is Word-like: type
   * any size (TEXT_SIZE_MIN–MAX) or pick one from the list, and A−/A+ step through TEXT_SIZES.
   */
  const ALIGN_ICONS = {
    right: '<path d="M4 6h16M9 10h11M6 14h14M11 18h9"/>',
    center: '<path d="M4 6h16M7 10h10M5 14h14M8 18h8"/>',
    left: '<path d="M4 6h16M4 10h11M4 14h14M4 18h9"/>',
  };
  const toolbarHTML = () => `
    <div class="ttb" id="ttb" hidden>
      <button type="button" data-t="size:-" title="Smaller text">A−</button>
      <input class="ttb-size" id="ttbSize" type="number" min="${TEXT_SIZE_MIN}" max="${TEXT_SIZE_MAX}" step="any" list="ttbSizes" title="Font size — type any size or pick one" aria-label="Font size">
      <datalist id="ttbSizes">${TEXT_SIZES.map((s) => `<option value="${s}"></option>`).join('')}</datalist>
      <button type="button" data-t="size:+" title="Bigger text">A+</button>
      <span class="ttb-sep"></span>
      <button type="button" class="ttb-bold" data-t="bold" title="Bold">B</button>
      <span class="ttb-sep"></span>
      ${['right', 'center', 'left'].map((a) => `<button type="button" data-t="align:${a}" title="Align ${a}"><svg viewBox="0 0 24 24" aria-hidden="true">${ALIGN_ICONS[a]}</svg></button>`).join('')}
      <span class="ttb-sep"></span>
      <div class="ttb-colorwrap">
        <button type="button" class="ttb-color" data-t="colormenu" title="Font colour">
          <span class="ttb-a">A<i id="ttbColorBar"></i></span>
          <svg class="ttb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
        </button>
        ${colorMenuHTML()}
      </div>
    </div>`;

  /*
   * Word-style font colour menu (2026-11-25, user: "include the color spectrum"): Automatic (the box's
   * default colour), a theme grid — 10 base colours over 5 rows of tints/shades — standard colours, and
   * More colours (the browser's own colour picker, any colour). The theme row leads with the council teals.
   */
  const mixHex = (a, b, t) => `#${[1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  }).join('')}`;
  const THEME_COLORS = ['#ffffff', '#000000', '#e7e6e6', '#1e4d59', '#2f6e7e', '#3f8193', '#62a3bf', '#ed7d31', '#70ad47', '#7030a0'];
  const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
  // Row r (0–4) of the tint/shade grid under base colour c, as in Word.
  function themeShade(c, r) {
    if (c === '#ffffff') return mixHex(c, '#000000', [0.05, 0.15, 0.25, 0.35, 0.5][r]);
    if (c === '#000000') return mixHex(c, '#ffffff', [0.5, 0.35, 0.25, 0.15, 0.05][r]);
    if (c === '#e7e6e6') return mixHex(c, '#000000', [0.1, 0.25, 0.5, 0.75, 0.9][r]);
    return r < 3 ? mixHex(c, '#ffffff', [0.8, 0.6, 0.4][r]) : mixHex(c, '#000000', [0.25, 0.5][r - 3]);
  }
  const swatch = (hex) => `<button type="button" class="ttb-sw" data-t="color:${hex}" style="--sw:${hex}" title="${hex}"></button>`;
  const colorMenuHTML = () => `
    <div class="ttb-pop" id="ttbPop" hidden>
      <div class="ttb-pop-h">Font colour</div>
      <button type="button" class="ttb-auto" data-t="color:auto"><span class="ttb-dot"></span>Automatic</button>
      <div class="ttb-pal">${THEME_COLORS.map(swatch).join('')}</div>
      <div class="ttb-pal ttb-pal-grid">${[0, 1, 2, 3, 4].map((r) => THEME_COLORS.map((c) => swatch(themeShade(c, r))).join('')).join('')}</div>
      <div class="ttb-pop-h">Standard colours</div>
      <div class="ttb-pal">${STANDARD_COLORS.map(swatch).join('')}</div>
      <label class="ttb-more"><span class="ttb-wheel"></span>More colours…<input type="color" id="ttbCustom"></label>
    </div>`;

  function syncToolbar(sec) {
    const bar = $('ttb');
    if (!bar) return;
    const chart = current?.charts.find((c) => c.id === selectedId);
    bar.hidden = !sec || chart?.type !== 'text';
    $('selX').hidden = !sec; // every selected item can be removed (charts too)
    $('selEdges').hidden = bar.hidden;
    if (bar.hidden) {
      $('ttbPop').hidden = true;
      return;
    }
    const tbox = sec.querySelector('.tbox');
    // Don't overwrite the size while it is being typed.
    if (document.activeElement !== $('ttbSize')) {
      $('ttbSize').value = chart.fontSize || (tbox ? Math.round(parseFloat(getComputedStyle(tbox).fontSize)) : '');
    }
    const on = (t, yes) => bar.querySelector(`[data-t="${t}"]`)?.classList.toggle('on', yes);
    on('bold', !!chart.bold);
    ['right', 'center', 'left'].forEach((a) => on(`align:${a}`, (chart.align || 'right') === a));
    // The A's underline shows the colour in use (the box's default when Automatic).
    const set = textColor(chart.color);
    const shown = set || (tbox ? getComputedStyle(tbox).color : '');
    $('ttbColorBar').style.background = shown;
    bar.querySelectorAll('.ttb-pop [data-t^="color:"]').forEach((b) => {
      const v = b.dataset.t.slice(6);
      b.classList.toggle('on', v === 'auto' ? !set : v === set);
    });
    if (set) $('ttbCustom').value = set;
  }

  /*
   * Words selected in the box when a toolbar control was pressed (captured on pointerdown, before a size
   * or colour input can take focus and clear the selection). With a selection, colour / bold / size apply
   * to those words only (selectionTool); without one, to the whole box.
   */
  let pendingRange = null;
  function captureRange() {
    const s = getSelection();
    pendingRange = null;
    if (!s.rangeCount || s.isCollapsed) return;
    const r = s.getRangeAt(0);
    const at = r.commonAncestorContainer;
    if ((at.nodeType === 3 ? at.parentElement : at)?.closest?.('.tbox')) pendingRange = r.cloneRange();
  }

  function selectionTool(chart, what, arg) {
    const range = pendingRange;
    pendingRange = null;
    const at = range.commonAncestorContainer;
    const host = (at.nodeType === 3 ? at.parentElement : at)?.closest('.tbox');
    const sec = selectedSection();
    if (!host || !sec || !sec.contains(host)) return false;
    host.focus({ preventScroll: true });
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(range);
    document.execCommand('styleWithCSS', false, true);
    let size = null;
    if (what === 'bold') {
      document.execCommand('bold');
    } else if (what === 'color') {
      $('ttbPop').hidden = true;
      // Automatic = back to the box's own colour.
      const colour = arg === 'auto' ? getComputedStyle(host).color : textColor(arg);
      if (!colour) return true;
      document.execCommand('foreColor', false, colour);
    } else if (what === 'size') {
      const start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const now = parseFloat(getComputedStyle(start).fontSize) || textSize(chart);
      if (arg === '+') size = TEXT_SIZES.find((v) => v > now) ?? TEXT_SIZE_MAX;
      else if (arg === '-') size = [...TEXT_SIZES].reverse().find((v) => v < now) ?? TEXT_SIZE_MIN;
      else size = Number(String(arg).slice(1));
      if (!Number.isFinite(size) || size <= 0) return true;
      size = Math.round(Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size)) * 10) / 10;
      // execCommand only knows sizes 1–7: mark the selection with 7, then set the real px size.
      document.execCommand('fontSize', false, '7');
      host.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach((el) => {
        el.removeAttribute('size');
        el.style.fontSize = `${size}px`;
      });
    }
    chart.html = richHTML(host, false);
    chart.heading = plainOf(host);
    save();
    layoutCard(cardEl()); // the box grows if the text got bigger
    placeSelection();
    if (size) $('ttbSize').value = size;
    return true;
  }

  function textTool(action) {
    const chart = current?.charts.find((c) => c.id === selectedId);
    if (!chart || chart.type !== 'text') return;
    const [what, arg] = action.split(':');
    if (['bold', 'color', 'size'].includes(what) && pendingRange && selectionTool(chart, what, arg)) return;
    pendingRange = null;
    if (what === 'bold') {
      if (chart.bold) delete chart.bold;
      else chart.bold = true;
      if (chart.html) chart.html = stripRich(chart.html, 'font-weight');
    } else if (what === 'align') {
      if (arg === 'right') delete chart.align;
      else chart.align = arg;
    } else if (what === 'color') {
      $('ttbPop').hidden = true;
      if (arg === 'auto') delete chart.color;
      else if (textColor(arg)) chart.color = textColor(arg);
      else return;
      if (chart.html) chart.html = stripRich(chart.html, 'color');
    } else if (what === 'size') {
      // "+" / "-" step through TEXT_SIZES; "=N" is a typed size. The box grows to fit (layoutText); a size
      // whose text can't fit on the page even then is refused.
      const now = chart.fontSize || textSize(chart);
      let next = now;
      if (arg === '+') next = TEXT_SIZES.find((s) => s > now) ?? TEXT_SIZE_MAX;
      else if (arg === '-') next = [...TEXT_SIZES].reverse().find((s) => s < now) ?? TEXT_SIZE_MIN;
      else next = Number(String(arg).slice(1));
      if (!Number.isFinite(next) || next <= 0) {
        syncToolbar(selectedSection());
        return;
      }
      next = Math.round(Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, next)) * 10) / 10;
      if (next === chart.fontSize) {
        syncToolbar(selectedSection());
        return;
      }
      const before = { fontSize: chart.fontSize, box: chart.box && { ...chart.box }, html: chart.html };
      chart.fontSize = next;
      if (chart.html) chart.html = stripRich(chart.html, 'font-size'); // the whole box takes the new size
      renderReport();
      if (!layoutCard(cardEl())) {
        chart.fontSize = before.fontSize;
        withBox(chart, before.box);
        if (before.html !== undefined) chart.html = before.html;
      }
    }
    buildEditor();
    commit();
  }

  /*
   * The red ✕ at the selected item's top-right corner, and the Delete key: remove it. Text boxes go at
   * once from the ✕ (asked first from the Delete key when they have text). Charts always ask: since the
   * sidebar and panel are hidden, this is the only way to take a chart off a page (user, 2026-11-25:
   * charts left on the live site's saved page "I can't even remove them").
   */
  function removeSelected(ask) {
    const index = current ? current.charts.findIndex((c) => c.id === selectedId) : -1;
    const chart = current?.charts[index];
    if (!chart) return;
    if (chart.type !== 'text') {
      if (!confirm(`Remove ${chart.heading ? `the chart "${chart.heading}"` : 'this chart'} from the page?`)) return;
    } else if (ask && chart.heading.trim() && !confirm(`Remove the ${({ body: 'text', list: 'list' })[chart.style] || 'heading'} "${chart.heading.trim()}"?`)) return;
    current.charts.splice(index, 1);
    select(null);
    buildEditor();
    commit();
  }

  // fromPanel: the user pressed on the card in the panel itself, so it is already in view — scrolling
  // then would move the field they are clicking out from under the pointer.
  function select(id, { fromPanel = false } = {}) {
    selectedId = id;
    placeSelection();
    // The chart's card in the panel lights up with it (and is scrolled to when chosen on the page).
    document.querySelectorAll('#pageEditor .group.chart').forEach((card) => {
      const on = card.dataset.chartId === id;
      if (on && !fromPanel && !card.classList.contains('is-selected')) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      card.classList.toggle('is-selected', on);
    });
  }

  // One drag: 'move', or a handle name (n, ne, e, se, s, sw, w, nw) for a resize.
  function startDrag(mode, e0) {
    const sec = selectedSection();
    const card = cardEl();
    if (!sec || !card) return;
    const chart = current.charts[sec.dataset.c];
    if (!current.charts.some((ch) => ch.box)) freeze(card);
    const before = JSON.stringify(current.charts.map((ch) => ch.box));
    const b0 = { ...chart.box };
    const inner = cardInner(card);
    const start = { x: e0.clientX, y: e0.clientY };
    document.activeElement?.blur?.();
    window.getSelection()?.removeAllRanges();
    document.body.classList.add('dragging-chart');
    $('sel').classList.add('dragging');
    $('grid').classList.add('dragging');

    // Snap an edge to the grid (or to the card's far edge, which isn't always on it).
    const edge = (v, max, free) => {
      if (free) return v;
      const g = snap(v);
      return Math.abs(max - v) < Math.abs(g - v) ? max : g;
    };
    // Moving: snap whichever edge (left/right, top/bottom) is nearer a grid line.
    const place = (pos, size, max, free) => {
      if (free) return pos;
      const a = edge(pos, max, false);
      const b = edge(pos + size, max, false) - size;
      return Math.abs(a - pos) <= Math.abs(b - pos) ? a : b;
    };

    const move = (ev) => {
      const dx = (ev.clientX - start.x) / viewScale;
      const dy = (ev.clientY - start.y) / viewScale;
      const free = ev.altKey;
      const next = { ...b0 };
      if (mode === 'move') {
        next.x = Math.min(Math.max(0, place(b0.x + dx, b0.w, inner.w, free)), inner.w - b0.w);
        next.y = Math.min(Math.max(0, place(b0.y + dy, b0.h, inner.h, free)), inner.h - b0.h);
      } else {
        const right = b0.x + b0.w;
        const bottom = b0.y + b0.h;
        if (mode.includes('e')) next.w = Math.min(inner.w, edge(right + dx, inner.w, free)) - b0.x;
        if (mode.includes('w')) {
          next.x = Math.min(Math.max(0, edge(b0.x + dx, inner.w, free)), right - BOX_MIN_W);
          next.w = right - next.x;
        }
        if (mode.includes('s')) next.h = Math.min(inner.h, edge(bottom + dy, inner.h, free)) - b0.y;
        if (mode.includes('n')) {
          next.y = Math.min(Math.max(0, edge(b0.y + dy, inner.h, free)), bottom - BOX_MIN_H);
          next.h = bottom - next.y;
        }
        next.w = Math.max(BOX_MIN_W, next.w);
        next.h = Math.max(BOX_MIN_H, next.h);
      }
      const last = chart.box;
      withBox(chart, next);
      // Refuse a step that squeezes the content out of its box: keep the last size that fitted.
      if (!chart.box || !layoutCard(cardEl())) {
        withBox(chart, last);
        layoutCard(cardEl());
      }
      placeSelection();
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging-chart');
      $('sel').classList.remove('dragging');
      $('grid').classList.remove('dragging');
      if (before !== JSON.stringify(current.charts.map((ch) => ch.box))) {
        buildEditor();
        commit();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  function bindResize() {
    const sel = $('sel');
    // Edge strips first, so the handles drawn after them stay on top.
    sel.innerHTML = '<div id="selEdges" hidden>'
      + ['top', 'right', 'bottom', 'left'].map((s) => `<span class="sel-edge edge-${s}" data-edge="1" title="Drag to move"></span>`).join('')
      + '</div>'
      + ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
      .map((h) => `<span class="handle h-${h}" data-h="${h}"></span>`).join('') + toolbarHTML()
      + '<button type="button" class="sel-x" id="selX" title="Remove from the page" aria-label="Remove from the page" hidden>✕</button>';
    // Mini toolbar: pressing it must not deselect, start a drag or take focus from the text.
    // (Not for the size box or "More colours…": those inputs have to take the press.)
    $('ttb').addEventListener('pointerdown', (e) => {
      captureRange(); // words selected in the box, if any — before an input can take focus
      if (!e.target.closest('.ttb-more, input')) e.preventDefault();
      e.stopPropagation();
    });
    $('ttbSize').addEventListener('change', (e) => textTool(`size:=${e.target.value}`));
    $('ttbSize').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.target.blur(); // blur fires the change
    });
    $('selX').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    $('selX').addEventListener('click', () => removeSelected(false));
    $('ttb').addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t === 'colormenu') $('ttbPop').hidden = !$('ttbPop').hidden;
      else if (t) textTool(t);
    });
    $('ttbCustom').addEventListener('change', (e) => textTool(`color:${e.target.value}`));

    // Press on a chart: select it, and start moving it once the pointer travels a few pixels
    // (so a plain click still puts the caret in the text).
    $('report').addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sec = e.target.closest('.card > section');
      select(sec ? current.charts[sec.dataset.c]?.id ?? null : null);
      if (!sec) return;
      // Heading/text boxes move like Word's text boxes: by their border (#sel's edge strips), so a drag
      // inside selects text instead (user request, 2026-11-25).
      if (current.charts[sec.dataset.c]?.type === 'text') return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const watch = (ev) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        stop();
        startDrag('move', { clientX: x0, clientY: y0 });
      };
      const stop = () => {
        document.removeEventListener('pointermove', watch);
        document.removeEventListener('pointerup', stop);
      };
      document.addEventListener('pointermove', watch);
      document.addEventListener('pointerup', stop);
    });
    sel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // The border of a selected heading/text box: move it.
      const h = e.target.closest('[data-edge]') ? 'move' : e.target.closest('[data-h]')?.dataset.h;
      if (!h) return;
      e.preventDefault();
      startDrag(h, e);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('#report, #sel, .panel')) select(null);
    });
    // Clicking a chart's card in the panel selects that chart on the page.
    $('pageEditor').addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.group.chart');
      if (card) select(card.dataset.chartId, { fromPanel: true });
    });
    document.addEventListener('keydown', (e) => {
      const typing = e.target instanceof Element && e.target.closest('[data-e], input, textarea, select');
      if (e.key === 'Escape' && selectedId && !typing) select(null);
      // Delete / Backspace on a selected item (not while typing in it) removes it, asking first.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing && current
        && current.charts.some((c) => c.id === selectedId)) {
        e.preventDefault();
        removeSelected(true);
      }
    });
    window.addEventListener('hashchange', () => select(null));
  }

  function fit() {
    const stage = $('stage');
    if (!stage) return;
    // Stage padding (24 left, 150 right for the button column) plus a little breathing room.
    const gutter = 186;
    const narrow = window.innerWidth <= 900;
    const byWidth = (stage.clientWidth - gutter) / 1200;
    const byHeight = (stage.clientHeight - gutter) / 1500;
    const scale = zoom !== 'fit' ? zoom / 100
      : Math.max(0.1, Math.min(1, narrow ? byWidth : Math.min(byWidth, byHeight)));
    showZoom(scale);
    $('scaler').style.width = `${1200 * scale}px`;
    $('scaler').style.height = `${1500 * scale}px`;
    $('scaleInner').style.transform = `scale(${scale})`;
    // Handles stay the same size on screen whatever the zoom.
    viewScale = scale;
    $('scaleInner').style.setProperty('--vs', scale);
    placeSelection();
  }

  buildNav();
  buildEditor();
  bindEditor();
  bindPreview();
  bindResize();
  bindPeriodPicker();
  commit();
  $('zoomRange')?.addEventListener('input', (e) => setZoom(e.target.value));
  $('zoomPct')?.addEventListener('click', () => setZoom('fit'));
  // Ctrl + mouse wheel over the page zooms too, in 10% steps.
  $('stage')?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(Math.round(viewScale * 10 - Math.sign(e.deltaY)) * 10);
  }, { passive: false });
  setZoom(zoom);
  window.addEventListener('resize', fit);
  // Fonts change text height, so fit again once they've loaded.
  // Arrow, not a bare reference: .then() would pass the FontFaceSet as renderReport's forExport flag.
  document.fonts.ready.then(() => renderReport());
  // Fonts that load later (Poppins for the numbers loads only once a chart first uses it) change text
  // widths too: a page fitted with the fallback font then overflowed sideways. Re-fit when any font
  // finishes loading — but not while the user is typing on the page, which a redraw would interrupt.
  document.fonts.addEventListener('loadingdone', () => {
    if (!$('report').contains(document.activeElement)) renderReport();
  });
})();
