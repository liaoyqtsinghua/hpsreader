import { writeFileSync } from "node:fs";

const W = 1600;
const H = 900;

const palette = {
  bg: "#f4f1eb",
  surface: "#fbfaf6",
  card: "#fffef9",
  card2: "#f7f4ee",
  ink: "#262522",
  muted: "#77736b",
  line: "#d8d1c5",
  line2: "#c9c1b5",
  accent: "#5f7581",
  accent2: "#8a6f55",
  good: "#6f7d61",
  warn: "#a37c42",
  danger: "#9a665f",
  shadow: "rgba(38,37,34,.12)"
};

const flowSpecs = [
  {
    id: "01-overview-card-repository",
    title: "Overview / Private Card Repository",
    caption: "A focused academic workspace: documents are research cards, modules are slots, the composer is the command hand.",
    nav: "Documents",
    view: "overview"
  },
  {
    id: "02-import-to-deck",
    title: "Import / Add Materials To Deck",
    caption: "Incoming files become structured document cards through parsing, OCR, and metadata extraction.",
    nav: "Import",
    view: "import"
  },
  {
    id: "03-document-library",
    title: "Library / Index Card Catalog",
    caption: "A quiet card binder for searching, filtering, and reopening scholarly materials.",
    nav: "Documents",
    view: "library"
  },
  {
    id: "04-reading-active-page",
    title: "Reading / Active Page Card",
    caption: "One source page is active at a time, with a companion translation card and page deck.",
    nav: "Documents",
    view: "reading"
  },
  {
    id: "05-composer-command-hand",
    title: "Composer / Current Hand",
    caption: "Agent actions live in the Codex-like composer; plus opens restrained command cards.",
    nav: "Documents",
    view: "composer"
  },
  {
    id: "06-module-market",
    title: "Modules / Equip Function Cards",
    caption: "Optional tools are equipped as cards instead of crowding the permanent UI.",
    nav: "Modules",
    view: "modules"
  },
  {
    id: "07-floating-module-slots",
    title: "Active Modules / Floating Card",
    caption: "Equipped modules open as movable cards with bookmark tabs, not blocking sidebars.",
    nav: "Documents",
    view: "floating"
  },
  {
    id: "08-ocr-inspection-card",
    title: "OCR / Inspect And Repair Card",
    caption: "Raw OCR, normalized text, confidence, and warnings are visible without turning the app into a settings panel.",
    nav: "Documents",
    view: "ocr"
  },
  {
    id: "09-translation-revision-stack",
    title: "Translation / Revision Stack",
    caption: "Drafts, polish, comments, and terminology checks become inspectable revision cards.",
    nav: "Documents",
    view: "translation"
  },
  {
    id: "10-glossary-deck",
    title: "Glossary / Term Deck",
    caption: "Terminology is managed as an active deck that can be filtered, confirmed, and reused.",
    nav: "Documents",
    view: "glossary"
  },
  {
    id: "11-note-cards",
    title: "Notes / File Thought Cards",
    caption: "Quotes and agent suggestions become temporary or archived note cards.",
    nav: "Documents",
    view: "notes"
  },
  {
    id: "12-docx-export-bundle",
    title: "Export / Assemble Word Bundle",
    caption: "Formal output is assembled by choosing cards: translation, source, comments, glossary, and report.",
    nav: "Documents",
    view: "export"
  },
  {
    id: "13-collaboration-task-board",
    title: "Collaboration / Assignment Cards",
    caption: "Team work is represented as page, segment, OCR, term, and export task cards.",
    nav: "Documents",
    view: "collab"
  },
  {
    id: "14-revision-save-slots",
    title: "History / Save Slot Stack",
    caption: "Past translations are stored as selectable version cards, not hidden logs.",
    nav: "Documents",
    view: "history"
  },
  {
    id: "15-settings-card-backs",
    title: "Settings / Card Back Configuration",
    caption: "Advanced technical controls stay behind calm defaults and expandable card backs.",
    nav: "Settings",
    view: "settings"
  }
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgOpen(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="${palette.shadow}" />
    </filter>
    <pattern id="paper" width="32" height="32" patternUnits="userSpaceOnUse">
      <rect width="32" height="32" fill="${palette.bg}" />
      <path d="M0 31.5H32M31.5 0V32" stroke="#eee8dd" stroke-width=".5" opacity=".5" />
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)" />
`;
}

function svgClose() {
  return "</svg>\n";
}

function rect(x, y, w, h, opts = {}) {
  const {
    fill = palette.surface,
    stroke = palette.line,
    sw = 1,
    rx = 8,
    opacity = 1,
    filter = "",
    dash = "",
    cls = ""
  } = opts;
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${filter ? `filter="${filter}"` : ""} ${dash ? `stroke-dasharray="${dash}"` : ""}/>\n`;
}

function line(x1, y1, x2, y2, opts = {}) {
  const { stroke = palette.line2, sw = 1, dash = "", opacity = 1 } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>\n`;
}

function text(x, y, value, opts = {}) {
  const {
    size = 24,
    fill = palette.ink,
    weight = 500,
    anchor = "start",
    opacity = 1,
    mono = false
  } = opts;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${mono ? "ui-monospace, SFMono-Regular, Consolas, monospace" : "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" opacity="${opacity}">${esc(value)}</text>\n`;
}

function circle(cx, cy, r, opts = {}) {
  const { fill = palette.surface, stroke = palette.line, sw = 1, opacity = 1 } = opts;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>\n`;
}

function path(d, opts = {}) {
  const { fill = "none", stroke = palette.line2, sw = 1, opacity = 1, dash = "" } = opts;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>\n`;
}

function pill(x, y, label, opts = {}) {
  const w = opts.w ?? Math.max(62, label.length * 8 + 22);
  const fill = opts.fill ?? palette.card2;
  const stroke = opts.stroke ?? palette.line;
  const color = opts.color ?? palette.muted;
  return rect(x, y, w, 28, { fill, stroke, rx: 14 })
    + text(x + w / 2, y + 19, label, { size: 13, fill: color, weight: 650, anchor: "middle" });
}

function sidebar(active) {
  const items = [
    ["Import", "I"],
    ["Documents", "D"],
    ["Modules", "M"],
    ["Settings", "S"]
  ];
  let out = rect(28, 26, 92, 848, { fill: "#ebe5da", stroke: palette.line2, rx: 14 });
  out += text(74, 72, "HPS", { size: 18, weight: 750, anchor: "middle", fill: palette.accent });
  items.forEach(([label, icon], i) => {
    const y = i < 3 ? 126 + i * 96 : 792;
    const is = label === active;
    out += rect(46, y, 56, 56, {
      fill: is ? palette.surface : "transparent",
      stroke: is ? palette.line2 : "transparent",
      rx: 12,
      filter: is ? "url(#shadow)" : ""
    });
    out += text(74, y + 35, icon, { size: 18, weight: 800, anchor: "middle", fill: is ? palette.accent : palette.muted });
    out += text(74, y + 77, label, { size: 11, weight: 650, anchor: "middle", fill: is ? palette.ink : palette.muted });
  });
  return out;
}

function appChrome(spec) {
  let out = sidebar(spec.nav);
  out += text(150, 68, spec.title, { size: 26, weight: 720 });
  out += text(150, 96, spec.caption, { size: 15, fill: palette.muted, weight: 450 });
  out += pill(1290, 50, "90% neutral", { w: 128 });
  out += pill(1430, 50, "card UX", { w: 96, fill: "#edf0ee", color: palette.accent });
  return out;
}

function composer(open = false) {
  let out = rect(154, 788, 1394, 70, { fill: "#fdfbf5", stroke: palette.line2, rx: 16, filter: "url(#shadow)" });
  out += rect(174, 806, 38, 38, { fill: "#f1eee7", stroke: palette.line2, rx: 10 });
  out += text(193, 832, "+", { size: 25, weight: 500, anchor: "middle", fill: palette.accent });
  out += text(232, 831, "Ask, translate, inspect, file a card...", { size: 18, fill: "#8a867d", weight: 420 });
  out += pill(1192, 809, "Reading mode", { w: 122 });
  out += pill(1326, 809, "Current page", { w: 122 });
  out += rect(1466, 805, 46, 42, { fill: palette.accent, stroke: palette.accent, rx: 11 });
  out += text(1489, 833, "→", { size: 22, fill: "#fff", weight: 700, anchor: "middle" });
  if (open) {
    const labels = ["Translate", "Explain Term", "Check OCR", "Note Card", "Export Word", "Assign Task"];
    labels.forEach((label, i) => {
      const x = 190 + i * 190;
      out += rect(x, 684, 168, 74, { fill: palette.card, stroke: palette.line2, rx: 12, filter: "url(#shadow)" });
      out += line(x + 1, 699, x + 167, 699, { stroke: i % 2 ? palette.accent2 : palette.accent, sw: 3 });
      out += text(x + 18, 728, label, { size: 17, weight: 700 });
      out += text(x + 18, 750, "command card", { size: 12, fill: palette.muted, weight: 500 });
    });
  }
  return out;
}

function docCard(x, y, w, h, title, opts = {}) {
  let out = rect(x, y, w, h, { fill: opts.fill ?? palette.card, stroke: opts.stroke ?? palette.line2, rx: 10, filter: opts.shadow ? "url(#shadow)" : "" });
  out += rect(x + 14, y + 14, 44, 58, { fill: "#eee9df", stroke: palette.line, rx: 6 });
  out += text(x + 72, y + 34, title, { size: opts.titleSize ?? 17, weight: 720 });
  out += text(x + 72, y + 57, opts.meta ?? "Author · 1936 · Translation 62%", { size: 12, fill: palette.muted, weight: 480 });
  out += pill(x + 72, y + 76, opts.tag ?? "Needs review", { w: opts.tagW ?? 106, fill: "#f2eee6", color: opts.tagColor ?? palette.accent2 });
  out += line(x + 18, y + h - 28, x + w - 18, y + h - 28, { stroke: palette.line, sw: 6, opacity: .7 });
  out += line(x + 18, y + h - 28, x + 18 + (w - 36) * (opts.progress ?? .62), y + h - 28, { stroke: opts.progressColor ?? palette.accent, sw: 6 });
  return out;
}

function cardGrid() {
  const titles = ["Hobbes on Method", "Kepler Notes", "Newton Opticks", "Leibniz Letters", "Early Royal Society", "Kant Manuscript"];
  let out = "";
  titles.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    out += docCard(170 + col * 330, 168 + row * 190, 296, 146, t, {
      shadow: i === 0,
      tag: ["Active", "OCR 81%", "Glossary", "Draft", "Notes", "Done"][i],
      tagW: [74, 84, 86, 72, 72, 62][i],
      progress: [.72, .36, .58, .44, .2, .92][i],
      progressColor: [palette.accent, palette.warn, palette.accent, palette.accent2, palette.danger, palette.good][i]
    });
  });
  return out;
}

function rightInspector() {
  let out = rect(1186, 138, 334, 604, { fill: palette.surface, stroke: palette.line2, rx: 14 });
  out += text(1216, 178, "Today in deck", { size: 19, weight: 720 });
  out += ["3 pages need OCR review", "8 terms unconfirmed", "DOCX export ready"].map((label, i) => {
    const y = 210 + i * 74;
    let s = rect(1214, y, 276, 52, { fill: palette.card, stroke: palette.line, rx: 9 });
    s += circle(1240, y + 26, 8, { fill: [palette.warn, palette.accent2, palette.good][i], stroke: "none" });
    s += text(1260, y + 32, label, { size: 15, weight: 560 });
    return s;
  }).join("");
  out += text(1216, 466, "Equipped modules", { size: 16, weight: 700 });
  ["Terms", "Notes", "OCR", "Export"].forEach((label, i) => {
    out += pill(1214 + (i % 2) * 134, 492 + Math.floor(i / 2) * 42, label, { w: 116, fill: "#f2eee6" });
  });
  return out;
}

function overview() {
  return rect(150, 136, 1000, 606, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 })
    + text(184, 180, "Research card binder", { size: 22, weight: 750 })
    + pill(938, 154, "deck search", { w: 128 })
    + cardGrid()
    + rightInspector()
    + composer(false);
}

function importView() {
  let out = rect(154, 140, 632, 602, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(190, 184, "Intake tray", { size: 22, weight: 750 });
  ["PDF: marginalia_scan.pdf", "Image: page_042.png", "Text: notes.txt"].forEach((label, i) => {
    const y = 230 + i * 122;
    out += rect(196, y, 524, 82, { fill: palette.card, stroke: palette.line2, rx: 12, filter: i === 0 ? "url(#shadow)" : "" });
    out += rect(220, y + 20, 46, 44, { fill: "#eee8dc", stroke: palette.line, rx: 6 });
    out += text(286, y + 45, label, { size: 17, weight: 650 });
    out += pill(584, y + 27, ["queued", "OCR pending", "metadata"][i], { w: 112 });
  });
  out += path("M804 440 C874 440 874 440 944 440", { stroke: palette.accent, sw: 2, dash: "8 8" });
  out += text(874, 422, "becomes", { size: 13, fill: palette.muted, anchor: "middle" });
  out += rect(962, 140, 558, 602, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(998, 184, "Structured cards", { size: 22, weight: 750 });
  out += docCard(1010, 230, 450, 160, "Optical Text In Context", { meta: "36 pages · English · OCR 87%", tag: "Ready", tagW: 70, progress: .87, shadow: true });
  out += docCard(1010, 422, 450, 160, "Unverified Scan Bundle", { meta: "12 pages · mixed scripts · needs review", tag: "Inspect", tagW: 82, progress: .44, progressColor: palette.warn });
  out += composer(false);
  return out;
}

function libraryView() {
  let out = rect(154, 132, 1368, 94, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(184, 172, "Catalog lookup", { size: 19, weight: 720 });
  out += rect(366, 152, 510, 42, { fill: palette.card, stroke: palette.line, rx: 11 });
  out += text(390, 179, "Search title, author, term, note...", { size: 15, fill: palette.muted });
  ["All", "Active", "Needs Review", "Finished", "Favorites"].forEach((label, i) => {
    out += pill(910 + i * 116, 157, label, { w: i === 2 ? 112 : 88, fill: i === 1 ? "#edf0ee" : palette.card2, color: i === 1 ? palette.accent : palette.muted });
  });
  out += rect(154, 254, 1368, 488, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 });
  out += cardGrid();
  out += docCard(1160, 168, 296, 146, "Descartes Drafts", { tag: "Priority", tagW: 82, progress: .5, progressColor: palette.accent2 });
  out += docCard(1160, 358, 296, 146, "Astronomy Tables", { tag: "Symbols", tagW: 84, progress: .3, progressColor: palette.warn });
  out += composer(false);
  return out;
}

function pageThumbnails(x = 154, y = 140) {
  let out = rect(x, y, 166, 602, { fill: palette.surface, stroke: palette.line2, rx: 14 });
  out += text(x + 26, y + 38, "Page deck", { size: 17, weight: 720 });
  for (let i = 0; i < 6; i++) {
    const yy = y + 70 + i * 82;
    const selected = i === 2;
    out += rect(x + 28, yy, 108, 66, { fill: selected ? "#edf0ee" : palette.card, stroke: selected ? palette.accent : palette.line, rx: 8 });
    out += text(x + 82, yy + 41, String(i + 1).padStart(2, "0"), { size: 17, anchor: "middle", fill: selected ? palette.accent : palette.muted, weight: 750 });
  }
  return out;
}

function sourceCard(x = 350, y = 140, w = 518, h = 602) {
  let out = rect(x, y, w, h, { fill: palette.card, stroke: palette.line2, rx: 14, filter: "url(#shadow)" });
  out += text(x + 34, y + 48, "Source page 03", { size: 20, weight: 750 });
  out += text(x + 34, y + 78, "active card", { size: 13, fill: palette.muted, mono: true });
  for (let i = 0; i < 12; i++) {
    const yy = y + 124 + i * 34;
    out += line(x + 44, yy, x + w - 44 - (i % 4) * 42, yy, { stroke: i === 5 ? palette.warn : "#d7d0c3", sw: i === 5 ? 3 : 2, opacity: .86 });
  }
  out += rect(x + 34, y + h - 92, w - 68, 46, { fill: "#f3efe6", stroke: palette.line, rx: 8 });
  out += text(x + 54, y + h - 63, "selected sentence", { size: 15, fill: palette.accent2, weight: 650 });
  return out;
}

function translationCard(x = 902, y = 140, w = 620, h = 602) {
  let out = rect(x, y, w, h, { fill: "#fffdf7", stroke: palette.line2, rx: 14, filter: "url(#shadow)" });
  out += text(x + 34, y + 48, "Translation companion", { size: 20, weight: 750 });
  out += pill(x + w - 160, y + 26, "Draft", { w: 92 });
  for (let i = 0; i < 11; i++) {
    const yy = y + 118 + i * 38;
    out += line(x + 42, yy, x + w - 54 - (i % 3) * 72, yy, { stroke: "#d5cec2", sw: 2 });
  }
  out += rect(x + 34, y + h - 118, w - 68, 72, { fill: "#f5f1e9", stroke: palette.line, rx: 10 });
  out += text(x + 56, y + h - 84, "Terminology warning kept as support card", { size: 16, fill: palette.accent2, weight: 620 });
  return out;
}

function readingBase() {
  return pageThumbnails() + sourceCard() + translationCard() + composer(false);
}

function readingView() {
  return readingBase();
}

function composerView() {
  return pageThumbnails() + sourceCard() + translationCard() + composer(true);
}

function moduleCard(x, y, label, status, category, accent = palette.accent) {
  let out = rect(x, y, 188, 158, { fill: palette.card, stroke: palette.line2, rx: 14, filter: "url(#shadow)" });
  out += rect(x + 20, y + 18, 52, 52, { fill: "#eee9df", stroke: palette.line, rx: 12 });
  out += line(x + 22, y + 34, x + 70, y + 34, { stroke: accent, sw: 3 });
  out += text(x + 20, y + 96, label, { size: 17, weight: 750 });
  out += text(x + 20, y + 119, category, { size: 12, fill: palette.muted });
  out += pill(x + 20, y + 132, status, { w: 96, fill: status === "Equipped" ? "#edf0ee" : "#f2eee6", color: status === "Equipped" ? palette.accent : palette.muted });
  return out;
}

function modulesView() {
  let out = rect(154, 138, 1368, 604, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 });
  out += text(190, 184, "Function card market", { size: 22, weight: 750 });
  ["Reading", "Translation", "OCR", "Notes", "Export", "Collaboration"].forEach((label, i) => {
    out += pill(190 + i * 136, 206, label, { w: 118, fill: i === 0 ? "#edf0ee" : palette.card2, color: i === 0 ? palette.accent : palette.muted });
  });
  const mods = [
    ["Term Library", "Equipped", "Translation", palette.accent],
    ["OCR Review", "Available", "OCR", palette.warn],
    ["Consistency", "Equipped", "Translation", palette.accent2],
    ["Note Cards", "Available", "Notes", palette.good],
    ["Word Export", "Automatic", "Export", palette.accent],
    ["Tasks", "Available", "Collab", palette.danger],
    ["Suggestions", "Equipped", "Reading", palette.accent2],
    ["History", "Available", "Revision", palette.muted],
    ["Glossary Audit", "Available", "Terms", palette.good],
    ["Report Builder", "Automatic", "Export", palette.accent]
  ];
  mods.forEach((m, i) => {
    out += moduleCard(190 + (i % 5) * 250, 282 + Math.floor(i / 5) * 196, ...m);
  });
  out += composer(false);
  return out;
}

function floatingWindow(tab = "Terms") {
  let out = rect(968, 244, 456, 354, { fill: palette.card, stroke: palette.line2, rx: 14, filter: "url(#shadow)" });
  ["Terms", "Notes", "Suggestions", "OCR", "Tasks"].forEach((label, i) => {
    out += rect(988 + i * 82, 264, 72, 34, { fill: label === tab ? "#edf0ee" : "#f6f2ea", stroke: palette.line, rx: 8 });
    out += text(1024 + i * 82, 286, label, { size: 12, weight: 700, anchor: "middle", fill: label === tab ? palette.accent : palette.muted });
  });
  out += text(998, 334, `${tab} card`, { size: 19, weight: 760 });
  for (let i = 0; i < 4; i++) {
    out += rect(998, 362 + i * 48, 392, 34, { fill: "#f8f5ef", stroke: palette.line, rx: 8 });
    out += text(1018, 384 + i * 48, ["active term slot", "unconfirmed item", "linked page 03", "file to archive"][i], { size: 14, fill: palette.muted, weight: 550 });
  }
  out += circle(1376, 280, 7, { fill: palette.accent, stroke: "none" });
  out += circle(1398, 280, 7, { fill: palette.line2, stroke: "none" });
  return out;
}

function floatingView() {
  let out = pageThumbnails() + sourceCard(350, 140, 560, 602) + translationCard(940, 140, 480, 602);
  ["Terms", "Notes", "OCR"].forEach((label, i) => {
    out += pill(378 + i * 106, 716, label, { w: 92, fill: "#edf0ee", color: palette.accent });
  });
  out += floatingWindow("Terms");
  out += composer(false);
  return out;
}

function ocrView() {
  let out = pageThumbnails() + sourceCard(350, 140, 560, 602);
  out += rect(486, 328, 232, 52, { fill: "transparent", stroke: palette.warn, rx: 6, dash: "5 4", sw: 2 });
  out += floatingWindow("OCR");
  out += rect(996, 352, 180, 150, { fill: "#f8f5ef", stroke: palette.line, rx: 10 });
  out += text(1016, 382, "Raw OCR", { size: 14, weight: 750 });
  out += line(1016, 410, 1146, 410);
  out += line(1016, 436, 1128, 436);
  out += line(1016, 462, 1158, 462);
  out += rect(1198, 352, 188, 150, { fill: "#f8f5ef", stroke: palette.line, rx: 10 });
  out += text(1218, 382, "Normalized", { size: 14, weight: 750 });
  out += line(1218, 410, 1350, 410);
  out += line(1218, 436, 1332, 436);
  out += line(1218, 462, 1360, 462);
  out += pill(998, 520, "confidence 81%", { w: 136, fill: "#edf0ee", color: palette.accent });
  out += pill(1144, 520, "ligature", { w: 92, fill: "#f4eee4", color: palette.warn });
  out += pill(1246, 520, "Greek", { w: 82, fill: "#f4eee4", color: palette.warn });
  out += composer(false);
  return out;
}

function translationView() {
  let out = pageThumbnails() + sourceCard(350, 140, 500, 602) + translationCard(880, 140, 450, 410);
  ["Draft", "Polished", "Term checked", "Commented"].forEach((label, i) => {
    const x = 890 + i * 110;
    const y = 584 + i * 14;
    out += rect(x, y, 216, 82, { fill: palette.card, stroke: i === 2 ? palette.accent2 : palette.line2, rx: 11, filter: "url(#shadow)" });
    out += text(x + 18, y + 34, label, { size: 16, weight: 740 });
    out += text(x + 18, y + 58, "revision card", { size: 12, fill: palette.muted });
  });
  out += path("M720 662 C804 638 828 628 890 626", { stroke: palette.accent2, sw: 2 });
  out += composer(false);
  return out;
}

function glossaryView() {
  let out = pageThumbnails() + sourceCard(350, 140, 440, 602);
  out += rect(830, 140, 692, 602, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(864, 184, "Active glossary deck", { size: 22, weight: 750 });
  ["Unconfirmed", "Inconsistent", "Frequent", "Recent"].forEach((label, i) => out += pill(864 + i * 128, 208, label, { w: 112, fill: i === 1 ? "#f4eee4" : palette.card2, color: i === 1 ? palette.warn : palette.muted }));
  ["substance", "hypothesis", "experiment", "aether", "demonstration", "phenomenon"].forEach((label, i) => {
    const x = 864 + (i % 2) * 312;
    const y = 278 + Math.floor(i / 2) * 112;
    out += rect(x, y, 274, 82, { fill: palette.card, stroke: palette.line, rx: 10 });
    out += text(x + 20, y + 32, label, { size: 17, weight: 740 });
    out += text(x + 20, y + 56, "target term · occurrences", { size: 12, fill: palette.muted });
    out += circle(x + 244, y + 28, 7, { fill: i % 3 ? palette.accent : palette.warn, stroke: "none" });
  });
  out += composer(false);
  return out;
}

function notesView() {
  let out = pageThumbnails() + sourceCard(350, 140, 500, 602);
  out += rect(884, 140, 638, 602, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(918, 184, "Thought card archive", { size: 22, weight: 750 });
  ["Quote", "Interpretation", "Question", "Bibliography", "Argument", "Draft suggestion"].forEach((label, i) => {
    const x = 920 + (i % 2) * 286;
    const y = 236 + Math.floor(i / 2) * 132;
    out += rect(x, y, 250, 104, { fill: i === 5 ? "#f7f3ea" : palette.card, stroke: i === 5 ? palette.line : palette.line2, rx: 12, opacity: i === 5 ? .72 : 1 });
    out += text(x + 18, y + 34, label, { size: 17, weight: 740 });
    out += line(x + 18, y + 58, x + 214, y + 58);
    out += line(x + 18, y + 78, x + 188, y + 78);
  });
  out += composer(false);
  return out;
}

function exportView() {
  let out = rect(154, 138, 1368, 604, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 });
  out += rect(392, 180, 850, 506, { fill: palette.card, stroke: palette.line2, rx: 18, filter: "url(#shadow)" });
  out += text(438, 230, "Assemble Word bundle", { size: 25, weight: 780 });
  out += text(438, 262, "Choose which research cards become the deliverable.", { size: 15, fill: palette.muted });
  ["Translation only", "Source + Translation", "Comments", "Glossary", "Reading report", "Notes"].forEach((label, i) => {
    const x = 438 + (i % 3) * 248;
    const y = 310 + Math.floor(i / 3) * 112;
    out += rect(x, y, 214, 82, { fill: i < 2 ? "#edf0ee" : "#f8f5ef", stroke: i < 2 ? palette.accent : palette.line, rx: 12 });
    out += text(x + 18, y + 34, label, { size: 16, weight: 730 });
    out += text(x + 18, y + 58, "include card", { size: 12, fill: palette.muted });
  });
  out += text(438, 566, "Format", { size: 16, weight: 750 });
  out += pill(510, 546, "DOCX", { w: 90, fill: "#edf0ee", color: palette.accent });
  out += pill(612, 546, "Markdown", { w: 112 });
  out += pill(736, 546, "CSV", { w: 76 });
  out += rect(1038, 540, 132, 46, { fill: palette.accent, stroke: palette.accent, rx: 12 });
  out += text(1104, 570, "Export", { size: 16, fill: "#fff", weight: 750, anchor: "middle" });
  out += composer(false);
  return out;
}

function collabView() {
  let out = rect(154, 138, 1368, 604, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 });
  ["To Review", "In Progress", "Done"].forEach((col, i) => {
    const x = 190 + i * 430;
    out += text(x, 186, col, { size: 20, weight: 760 });
    out += rect(x, 210, 374, 484, { fill: palette.surface, stroke: palette.line, rx: 14 });
    for (let j = 0; j < 3; j++) {
      out += rect(x + 24, 242 + j * 130, 326, 94, { fill: palette.card, stroke: palette.line2, rx: 12, filter: j === 0 && i === 0 ? "url(#shadow)" : "" });
      out += text(x + 44, 276 + j * 130, ["OCR correction", "Term consistency", "DOCX check"][j], { size: 16, weight: 740 });
      out += text(x + 44, 300 + j * 130, `page ${3 + j} · reviewer card`, { size: 12, fill: palette.muted });
      out += pill(x + 238, 270 + j * 130, ["Owner", "Editor", "Reviewer"][j], { w: 92 });
    }
  });
  out += composer(false);
  return out;
}

function historyView() {
  let out = pageThumbnails() + sourceCard(350, 140, 430, 602);
  out += rect(820, 140, 702, 602, { fill: palette.surface, stroke: palette.line2, rx: 16 });
  out += text(856, 184, "Translation save slots", { size: 22, weight: 750 });
  for (let i = 0; i < 4; i++) {
    const x = 910 + i * 64;
    const y = 250 + i * 58;
    out += rect(x, y, 420, 138, { fill: i === 0 ? palette.card : "#f7f3ea", stroke: i === 0 ? palette.accent : palette.line2, rx: 14, filter: "url(#shadow)", opacity: 1 - i * .07 });
    out += text(x + 28, y + 42, i === 0 ? "Current translation" : `Previous version ${i}`, { size: 18, weight: 760 });
    out += text(x + 28, y + 70, "editor · timestamp · change summary", { size: 13, fill: palette.muted });
    out += line(x + 28, y + 98, x + 360, y + 98, { stroke: i === 2 ? palette.warn : palette.line2, sw: 3 });
  }
  out += composer(false);
  return out;
}

function settingsView() {
  let out = rect(154, 138, 1368, 604, { fill: "#f8f5ef", stroke: palette.line2, rx: 16 });
  out += text(190, 184, "Card-back configuration", { size: 22, weight: 750 });
  const settings = [
    ["OCR Engine", "Automatic", "provider details on card back"],
    ["Translation Model", "Default", "mode and cost controls"],
    ["Export Defaults", "DOCX preferred", "content bundle presets"],
    ["Collaboration", "Local project", "roles and task authors"],
    ["Storage", "Local JSON", "backup and migration"]
  ];
  settings.forEach(([a, b, c], i) => {
    const x = 204 + (i % 3) * 420;
    const y = 248 + Math.floor(i / 3) * 192;
    out += rect(x, y, 364, 146, { fill: palette.card, stroke: palette.line2, rx: 14, filter: "url(#shadow)" });
    out += text(x + 26, y + 42, a, { size: 19, weight: 760 });
    out += pill(x + 26, y + 62, b, { w: 142, fill: "#edf0ee", color: palette.accent });
    out += text(x + 26, y + 116, c, { size: 13, fill: palette.muted });
    out += text(x + 324, y + 48, "↻", { size: 20, fill: palette.muted, anchor: "middle" });
  });
  out += composer(false);
  return out;
}

function renderView(view) {
  switch (view) {
    case "overview": return overview();
    case "import": return importView();
    case "library": return libraryView();
    case "reading": return readingView();
    case "composer": return composerView();
    case "modules": return modulesView();
    case "floating": return floatingView();
    case "ocr": return ocrView();
    case "translation": return translationView();
    case "glossary": return glossaryView();
    case "notes": return notesView();
    case "export": return exportView();
    case "collab": return collabView();
    case "history": return historyView();
    case "settings": return settingsView();
    default: return overview();
  }
}

function render(spec) {
  return svgOpen(spec.title) + appChrome(spec) + renderView(spec.view) + svgClose();
}

for (const spec of flowSpecs) {
  writeFileSync(new URL(`./${spec.id}.svg`, import.meta.url), render(spec), "utf8");
}

const manifest = {
  generatedAt: new Date().toISOString(),
  concept: "restrained scholarly productivity tool with card-game interaction logic",
  files: flowSpecs.map((spec) => ({
    id: spec.id,
    title: spec.title,
    file: `${spec.id}.svg`,
    caption: spec.caption
  }))
};

writeFileSync(new URL("./manifest.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n", "utf8");
