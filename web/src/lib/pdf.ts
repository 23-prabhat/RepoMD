import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyzeSuccessResponse } from "./types";

// ── Print-friendly palette ────────────────────────────────────────────────
type RGB = [number, number, number];

const P = {
  text:    [15,  17,  23]  as RGB,
  muted:   [90,  100, 120] as RGB,
  faint:   [165, 173, 190] as RGB,
  green:   [22,  163, 74]  as RGB,
  cyan:    [2,   132, 199] as RGB,
  amber:   [180, 83,  9]   as RGB,
  violet:  [109, 40,  217] as RGB,
  rose:    [190, 24,  93]  as RGB,
  teal:    [15,  118, 110] as RGB,
  red:     [220, 38,  38]  as RGB,
  border:  [218, 223, 233] as RGB,
  surface: [246, 248, 252] as RGB,
  white:   [255, 255, 255] as RGB,
};

const CAT_COLOR: Record<string, RGB> = {
  auth:       P.red,
  database:   P.cyan,
  api:        P.green,
  config:     P.muted,
  core:       P.violet,
  routing:    P.teal,
  middleware: P.amber,
};

const W = 210;
const M = 16;
const CONTENT_W = W - M * 2;

// ── Helpers ───────────────────────────────────────────────────────────────

function fill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function stroke(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function ink(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }

function lightTint(c: RGB, amount = 210): RGB {
  return [
    Math.min(255, c[0] + amount),
    Math.min(255, c[1] + amount),
    Math.min(255, c[2] + amount),
  ];
}

// Truncate a string to fit within maxChars, adding ellipsis
function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

// ── Main export ───────────────────────────────────────────────────────────

export function generatePdf(data: AnalyzeSuccessResponse): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const { repoFullName, repoUrl, analyzedFileCount, totalFileCount, analysis } = data;
  const [owner, repo] = repoFullName.split("/");
  const { folderStructure, entryPoints, dependencyMap, criticalFiles, executionFlow, repoSummary } = analysis;

  let y = M;

  // ── Page utilities ────────────────────────────────────────────────────────

  function checkPage(needed = 20) {
    if (y + needed > 280) { doc.addPage(); y = M; }
  }

  function hRule(color: RGB = P.border, weight = 0.25) {
    stroke(doc, color);
    doc.setLineWidth(weight);
    doc.line(M, y, W - M, y);
    y += 3;
  }

  function sectionTitle(label: string, name: string, color: RGB) {
    checkPage(22);
    fill(doc, color);
    doc.roundedRect(M, y, 13, 5.5, 1.3, 1.3, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    ink(doc, P.white);
    doc.text(label, M + 6.5, y + 3.8, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    ink(doc, P.text);
    doc.text(name, M + 17, y + 4.3);
    y += 8;
    hRule(lightTint(color, 195));
  }

  function afterTable() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 7;
  }

  // Renders wrapped text, returns new y
  function textBlock(
    text: string,
    x: number,
    startY: number,
    maxW: number,
    size: number,
    color: RGB,
    font: "helvetica" | "courier" = "helvetica",
    style: "normal" | "bold" = "normal",
  ): number {
    doc.setFont(font, style);
    doc.setFontSize(size);
    ink(doc, color);
    const lines = doc.splitTextToSize(text, maxW);
    doc.text(lines, x, startY);
    return startY + lines.length * (size * 0.42) + 1;
  }

  const tableDefaults = {
    margin: { left: M, right: M },
    theme: "plain" as const,
    styles: {
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      overflow: "linebreak" as const,
      lineColor: P.border,
      lineWidth: 0.2,
    },
    headStyles: {
      font: "helvetica",
      fontStyle: "bold" as const,
      fontSize: 7.5,
      textColor: P.muted,
      fillColor: P.surface,
      lineWidth: 0.2,
      lineColor: P.border,
    },
    alternateRowStyles: { fillColor: [250, 251, 253] as RGB },
  };

  // ── Cover ─────────────────────────────────────────────────────────────────

  fill(doc, P.green);
  doc.rect(0, 0, W, 2, "F");

  y = 12;

  // logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  ink(doc, P.text);
  doc.text("Repo", M, y);
  const repoTextW = doc.getTextWidth("Repo");
  ink(doc, P.green);
  doc.text("MD", M + repoTextW + 0.5, y);
  const mdW = doc.getTextWidth("MD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, P.muted);
  doc.text("Codebase Intelligence Report", M + repoTextW + mdW + 3.5, y - 0.5);

  y += 6;
  hRule(P.border, 0.4);

  // repo name
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  ink(doc, P.muted);
  doc.text(`${owner}/`, M, y);
  const ownerPartW = doc.getTextWidth(`${owner}/`);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  ink(doc, P.text);
  doc.text(repo, M + ownerPartW + 1, y + 1);

  y += 9;

  if (repoSummary.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    ink(doc, P.muted);
    const descLines = doc.splitTextToSize(repoSummary.description, CONTENT_W);
    doc.text(descLines, M, y);
    y += descLines.length * 4 + 3;
  }

  y += 2;

  // stats grid (2 × 2)
  const stats = [
    { label: "FILES ANALYZED", value: `${analyzedFileCount} / ${totalFileCount}`, color: P.green  },
    { label: "ARCHITECTURE",   value: repoSummary.architectureStyle,               color: P.teal   },
    { label: "PRIMARY LANG",   value: repoSummary.techStack.languages[0] ?? "--",  color: P.cyan   },
    { label: "ENTRY POINT",    value: entryPoints.primary.file,                    color: P.amber  },
  ];

  const cellW = (CONTENT_W - 4) / 2;
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = M + col * (cellW + 4);
    const sy = y + row * 15;
    fill(doc, P.surface);
    doc.roundedRect(sx, sy, cellW, 12, 1.5, 1.5, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    ink(doc, P.muted);
    doc.text(s.label, sx + 4, sy + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    ink(doc, s.color);
    // truncate value to fit cell
    const valLine = doc.splitTextToSize(s.value, cellW - 8)[0];
    doc.text(valLine, sx + 4, sy + 10);
  });

  y += 36;

  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  ink(doc, P.faint);
  doc.text(`Generated ${date}  |  ${repoUrl}`, M, y);

  y += 5;
  hRule(P.border, 0.5);
  y += 2;

  // ── M1: Folder Structure ──────────────────────────────────────────────────

  sectionTitle("M1", "Folder Structure", P.green);

  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Path", "Purpose"]],
    body: folderStructure.map(e => [e.path, e.purpose]),
    columnStyles: {
      0: { textColor: P.green, cellWidth: 60, font: "courier", fontStyle: "bold" },
      1: { textColor: P.text,  font: "helvetica" },
    },
  });
  afterTable();

  // ── M2: Entry Points ──────────────────────────────────────────────────────

  sectionTitle("M2", "Entry Points", P.cyan);

  // primary entry card
  checkPage(30);
  fill(doc, P.surface);
  doc.roundedRect(M, y, CONTENT_W, 9, 1.5, 1.5, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(6.5);
  ink(doc, P.cyan);
  doc.text("PRIMARY ENTRY POINT", M + 4, y + 3.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  ink(doc, P.text);
  doc.text(entryPoints.primary.file, M + 4, y + 7.8);

  y += 13;

  if (entryPoints.primary.description) {
    y = textBlock(
      entryPoints.primary.description,
      M, y, CONTENT_W, 8.5, P.muted,
    );
    y += 3;
  }

  // execution flow label
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  ink(doc, P.muted);
  doc.text("EXECUTION FLOW", M, y);
  y += 5;

  // execution flow steps — NOTE: use ASCII ">" instead of Unicode arrow
  entryPoints.primary.executionFlow.forEach((step, i) => {
    checkPage(12);

    // numbered circle
    fill(doc, P.cyan);
    doc.circle(M + 3, y + 1.5, 3, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    ink(doc, P.white);
    doc.text(String(i + 1), M + 3, y + 2.4, { align: "center" });

    // step text (helvetica, full width minus circle indent)
    const stepText = `> ${step}`;
    const stepX = M + 9;
    const stepW = CONTENT_W - 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    ink(doc, P.text);
    const stepLines = doc.splitTextToSize(stepText, stepW);
    doc.text(stepLines, stepX, y + 2.4);
    y += stepLines.length * 4 + 3;
  });

  // secondary entry points
  if (entryPoints.secondary.length > 0) {
    y += 3;
    checkPage(12);
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    ink(doc, P.muted);
    doc.text("SECONDARY ENTRY POINTS", M, y);
    y += 4;

    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [["File", "Description"]],
      body: entryPoints.secondary.map(ep => [ep.file, ep.description]),
      columnStyles: {
        0: { textColor: P.cyan, cellWidth: 55, font: "courier" },
        1: { textColor: P.text, font: "helvetica" },
      },
    });
    afterTable();
  }

  // ── M3: Dependency Map ────────────────────────────────────────────────────

  sectionTitle("M3", "Dependency Map", P.amber);

  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["From", "Uses", "To"]],
    body: dependencyMap.map(e => [e.from, e.uses, e.to]),
    columnStyles: {
      0: { textColor: P.amber, cellWidth: 62, font: "courier", fontStyle: "bold" },
      1: { textColor: P.muted, cellWidth: 30, halign: "center", font: "courier" },
      2: { textColor: P.text,  font: "courier" },
    },
  });
  afterTable();

  // ── B1: Critical Files ────────────────────────────────────────────────────

  sectionTitle("B1", "Critical Files", P.violet);

  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Category", "File", "Reason"]],
    body: criticalFiles.map(f => [f.category.toUpperCase(), f.file, f.reason]),
    columnStyles: {
      0: { cellWidth: 26, font: "courier", fontSize: 7,   halign: "center" },
      1: { textColor: P.violet, cellWidth: 58, font: "courier", fontStyle: "bold", fontSize: 7.5 },
      2: { textColor: P.text, font: "helvetica" },
    },
    didParseCell: (hookData) => {
      if (hookData.column.index === 0 && hookData.section === "body") {
        const cat = String(hookData.cell.raw).toLowerCase();
        hookData.cell.styles.textColor = CAT_COLOR[cat] ?? P.muted;
      }
    },
  });
  afterTable();

  // ── B2: Execution Flow ────────────────────────────────────────────────────

  sectionTitle("B2", "Execution Flow", P.rose);

  executionFlow.forEach((step) => {
    // Estimate height: card row (8mm) + description lines
    const estimatedLines = Math.ceil(step.description.length / 90) + 1;
    checkPage(10 + estimatedLines * 5);

    const cardX = M + 12;
    const cardW = CONTENT_W - 12;

    // step node circle (centered at y + 4)
    fill(doc, P.rose);
    doc.circle(M + 4, y + 4, 4, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    ink(doc, P.white);
    doc.text(String(step.step).padStart(2, "0"), M + 4, y + 5.2, { align: "center" });

    // card box (layer + file row)
    fill(doc, P.surface);
    doc.roundedRect(cardX, y, cardW, 8, 1.2, 1.2, "F");

    // layer badge inside card
    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    ink(doc, P.rose);
    const layerText = step.layer;
    doc.text(layerText, cardX + 4, y + 5);
    const layerW = doc.getTextWidth(layerText);

    // separator dot + file path
    const fileText = trunc(step.file, 55);
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    ink(doc, P.muted);
    doc.text(`  .  ${fileText}`, cardX + 4 + layerW, y + 5);

    y += 11;

    // description below card
    y = textBlock(step.description, cardX, y, cardW - 4, 8.5, P.text);
    y += 4; // gap between steps
  });

  // ── B3: Repo Summary ──────────────────────────────────────────────────────

  sectionTitle("B3", "Repo Summary", P.teal);

  // Architecture style pill (standalone, before description)
  checkPage(12);
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  ink(doc, P.muted);
  doc.text("ARCHITECTURE STYLE", M, y);
  y += 4;

  const archLabel = repoSummary.architectureStyle;
  const archW = doc.getTextWidth(archLabel) + 10;
  fill(doc, P.teal);
  doc.roundedRect(M, y, archW, 6.5, 1.5, 1.5, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  ink(doc, P.white);
  doc.text(archLabel, M + archW / 2, y + 4.5, { align: "center" });
  y += 11;

  // description card (full width, no badge overlap)
  if (repoSummary.description) {
    checkPage(16);
    fill(doc, lightTint(P.teal, 215));
    const descLines = doc.splitTextToSize(repoSummary.description, CONTENT_W - 8);
    const cardH = descLines.length * 4.8 + 8;
    doc.roundedRect(M, y, CONTENT_W, cardH, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    ink(doc, P.text);
    doc.text(descLines, M + 5, y + 6.5);
    y += cardH + 6;
  }

  // tech stack
  checkPage(16);
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  ink(doc, P.muted);
  doc.text("TECH STACK", M, y);
  y += 5;

  const stackGroups = [
    { label: "Languages",  items: repoSummary.techStack.languages,  color: P.teal   },
    { label: "Frameworks", items: repoSummary.techStack.frameworks, color: P.cyan   },
    { label: "Databases",  items: repoSummary.techStack.databases,  color: P.amber  },
    { label: "Tools",      items: repoSummary.techStack.tools,      color: P.violet },
  ];

  stackGroups.forEach(({ label, items, color }) => {
    if (!items.length) return;
    checkPage(10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(doc, P.muted);
    doc.text(label, M, y + 3.5);

    let tx = M + 26;
    items.forEach((item) => {
      const tw = doc.getTextWidth(item) + 7;
      if (tx + tw > W - M) { tx = M + 26; y += 8; }
      fill(doc, lightTint(color, 215));
      doc.roundedRect(tx, y - 0.5, tw, 5.5, 1.1, 1.1, "F");
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      ink(doc, color);
      doc.text(item, tx + 3.5, y + 3.5);
      tx += tw + 3;
    });
    y += 9;
  });

  // key decisions
  if (repoSummary.keyDecisions.length > 0) {
    checkPage(14);
    y += 4;
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    ink(doc, P.muted);
    doc.text("KEY DESIGN DECISIONS", M, y);
    y += 6;

    repoSummary.keyDecisions.forEach((d, i) => {
      checkPage(14);
      const numX = M;
      const textX = M + 10;
      const textW = CONTENT_W - 10;

      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      ink(doc, P.teal);
      doc.text(`${String(i + 1).padStart(2, "0")}.`, numX, y + 1);

      y = textBlock(d, textX, y, textW, 8.5, P.text);
      y += 3;
    });
  }

  // ── Page numbers ──────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    ink(doc, P.faint);
    doc.text(
      `RepoMD  |  ${repoFullName}  |  Page ${i} of ${totalPages}`,
      W / 2, 292, { align: "center" },
    );
    fill(doc, P.green);
    doc.rect(0, 294, W, 1.5, "F");
  }

  doc.save(`repomd-${repo}-analysis.pdf`);
}
