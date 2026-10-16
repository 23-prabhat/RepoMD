"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Sun, Moon, Download, FileText, Layers, Code2, LogIn,
  Lock, Database, Globe, Settings, Cpu, GitBranch, Shield,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { AnalyzeSuccessResponse, CriticalFile } from "@/lib/types";
import { useTheme } from "@/lib/theme-provider";

const DependencyGraph = dynamic(() => import("./DependencyGraph"), { ssr: false });
const ArchitectureGraph = dynamic(() => import("./ArchitectureGraph"), { ssr: false });
const RepoChat = dynamic(() => import("./RepoChat"), { ssr: false });

// ── colour tokens — CSS vars so they adapt to light/dark ───────────────────
const C = {
  green:  "var(--accent-green)",
  cyan:   "var(--accent-cyan)",
  amber:  "var(--accent-amber)",
  violet: "var(--accent-violet)",
  rose:   "var(--accent-rose)",
  teal:   "var(--accent-teal)",
};

const MODULES = [
  { id: "m1", label: "M1", name: "Folder Structure", color: C.green  },
  { id: "m2", label: "M2", name: "Entry Points",     color: C.cyan   },
  { id: "m3",   label: "M3",   name: "Dependency Map",       color: C.amber  },
  { id: "arch", label: "ARCH", name: "Architecture Diagram", color: C.rose   },
  { id: "b1",   label: "B1",   name: "Critical Files",       color: C.violet },
  { id: "b2", label: "B2", name: "Execution Flow",   color: C.rose   },
  { id: "b3", label: "B3", name: "Repo Summary",     color: C.teal   },
];

const CATEGORY_COLORS: Record<string, string> = {
  auth:       "var(--accent-red)",
  database:   "var(--accent-cyan)",
  api:        "var(--accent-green)",
  config:     "#8899AA",
  core:       "var(--accent-violet)",
  routing:    "var(--accent-teal)",
  middleware: "var(--accent-amber)",
};

const CATEGORY_ICONS: Record<string, typeof Lock> = {
  auth:       Lock,
  database:   Database,
  api:        Globe,
  config:     Settings,
  core:       Cpu,
  routing:    GitBranch,
  middleware: Shield,
};

// ── tiny helpers ───────────────────────────────────────────────────────────

function hexAlpha(color: string, a: number) {
  if (color.startsWith("var(")) {
    return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
  }
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function catColor(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? "#8899AA";
}

// ── useScrollReveal hook ──────────────────────────────────────────────────
function useScrollReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function RevealSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useScrollReveal();
  return (
    <div ref={ref} className={`reveal-section ${visible ? "revealed" : ""} ${className}`}>
      {children}
    </div>
  );
}

// ── AnimatedNumber ────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true;
        obs.disconnect();
        const start = performance.now();
        function tick(now: number) {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          setDisplay(Math.round(eased * value));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{display}</span>;
}

// ── Section components ────────────────────────────────────────────────────

function SectionHeader({ id, label, name, color }: { id: string; label: string; name: string; color: string }) {
  return (
    <div id={id} className="flex items-center gap-4 mb-8 scroll-mt-28">
      <span
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          color,
          background: hexAlpha(color, 0.1),
          border: `1px solid ${hexAlpha(color, 0.25)}`,
          borderRadius: 4,
          padding: "3px 10px",
        }}
      >
        {label}
      </span>
      <h2
        className="font-syne font-bold text-white"
        style={{ fontSize: "clamp(22px, 2.5vw, 32px)", letterSpacing: "-0.02em" }}
      >
        {name}
      </h2>
      <div style={{ flex: 1, height: 1, background: hexAlpha(color, 0.15) }} />
    </div>
  );
}

// ── Module components ──────────────────────────────────────────────────────

function M1FolderStructure({ data }: { data: AnalyzeSuccessResponse["analysis"]["folderStructure"] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${hexAlpha(C.green, 0.12)}` }}
    >
      {data.map((entry, i) => {
        const cleanPath = entry.path.replace(/\/+$/, "");
        const depth = (cleanPath.match(/\//g) || []).length;
        const segments = cleanPath.split("/");
        const lastSegment = segments[segments.length - 1] || cleanPath;
        return (
          <div
            key={i}
            className="flex gap-0 group folder-row"
            style={{
              borderBottom: i < data.length - 1 ? `1px solid var(--border-row)` : undefined,
              background: i % 2 === 0 ? "var(--surface-stripe)" : "transparent",
              transition: "background 0.15s, box-shadow 0.15s",
            }}
          >
            {/* path */}
            <div
              className="py-3 px-5 shrink-0"
              style={{
                width: "38%",
                fontFamily: "var(--font-geist-mono)",
                fontSize: 12,
                color: C.green,
                borderRight: `1px solid var(--border-footer)`,
                wordBreak: "break-all",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {depth > 0 && (
                <span style={{ color: "var(--text-20)", userSelect: "none" }}>
                  {"  ".repeat(depth - 1)}{"└─ "}
                </span>
              )}
              <span>{depth > 0 ? lastSegment : cleanPath}</span>
            </div>
            {/* purpose */}
            <div
              className="py-3 px-5 flex-1 text-sm"
              style={{ color: "var(--text-55)", lineHeight: 1.6 }}
            >
              {entry.purpose}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function M2EntryPoints({ data }: { data: AnalyzeSuccessResponse["analysis"]["entryPoints"] }) {
  const { primary, secondary } = data;
  return (
    <div className="flex flex-col gap-5">
      {/* Primary */}
      <div
        className="rounded-xl overflow-hidden terminal-card"
        style={{ border: `1px solid ${hexAlpha(C.cyan, 0.2)}` }}
      >
        {/* terminal titlebar */}
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ borderBottom: `1px solid ${hexAlpha(C.cyan, 0.1)}`, background: hexAlpha(C.cyan, 0.04) }}
        >
          <span className="w-3 h-3 rounded-full terminal-dot" style={{ background: "#FF5F57" }} />
          <span className="w-3 h-3 rounded-full terminal-dot" style={{ background: "#FFBD2E" }} />
          <span className="w-3 h-3 rounded-full terminal-dot" style={{ background: "#28C840" }} />
          <span
            className="ml-3 text-xs"
            style={{ color: C.cyan, fontFamily: "var(--font-geist-mono)", letterSpacing: "0.06em" }}
          >
            PRIMARY ENTRY POINT
          </span>
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--text-35)", fontFamily: "var(--font-geist-mono)" }}
          >
            {primary.file}
          </span>
        </div>
        <div className="p-6" style={{ fontFamily: "var(--font-geist-mono)", fontSize: 13 }}>
          <div style={{ color: C.cyan, marginBottom: 8 }}>
            <span style={{ color: "var(--text-30)" }}>$ </span>
            {primary.file}
            <span className="blink-cursor">█</span>
          </div>
          <p className="mb-6 text-sm" style={{ color: "var(--text-50)", fontFamily: "inherit", lineHeight: 1.7 }}>
            {primary.description}
          </p>
          <div style={{ color: "var(--text-30)", marginBottom: 10, fontSize: 11, letterSpacing: "0.08em" }}>
            EXECUTION FLOW
          </div>
          <div className="flex flex-col gap-1.5">
            {primary.executionFlow.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span style={{ color: C.cyan, minWidth: 22, paddingTop: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ color: "var(--text-60)" }}>
                  {"→"}&nbsp;{step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary */}
      {secondary.length > 0 && (
        <div>
          <p
            className="mb-3 text-xs"
            style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
          >
            SECONDARY ENTRY POINTS
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {secondary.map((ep, i) => (
              <div
                key={i}
                className="rounded-lg px-5 py-4"
                style={{ background: "var(--surface-alt)", border: `1px solid ${hexAlpha(C.cyan, 0.1)}` }}
              >
                <div
                  className="text-xs mb-1"
                  style={{ color: C.cyan, fontFamily: "var(--font-geist-mono)" }}
                >
                  {ep.file}
                </div>
                <div className="text-sm" style={{ color: "var(--text-45)", lineHeight: 1.5 }}>
                  {ep.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function M3DependencyMap({ data }: { data: AnalyzeSuccessResponse["analysis"]["dependencyMap"] }) {
  const [view, setView] = useState<"graph" | "list">("graph");

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented control */}
      <div
        className="segmented-control"
        style={{
          display: "inline-flex",
          position: "relative",
          borderRadius: 8,
          border: "1px solid var(--input-border)",
          background: "var(--surface-card)",
          padding: 2,
          alignSelf: "flex-start",
        }}
      >
        <div
          className="segmented-indicator"
          style={{
            position: "absolute",
            top: 2,
            left: view === "graph" ? 2 : "calc(50%)",
            width: "calc(50% - 2px)",
            height: "calc(100% - 4px)",
            borderRadius: 6,
            background: hexAlpha(C.amber, 0.15),
            border: `1px solid ${hexAlpha(C.amber, 0.35)}`,
            transition: "left 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {(["graph", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "5px 16px",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: view === v ? C.amber : "var(--text-35)",
              cursor: "pointer",
              transition: "color 0.2s",
              position: "relative",
              zIndex: 1,
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "graph" ? (
        <DependencyGraph data={data} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((edge, i) => (
            <div
              key={i}
              className="flex items-center gap-0 rounded-lg overflow-hidden"
              style={{ border: `1px solid var(--border-faint)`, background: "var(--surface-stripe)" }}
            >
              {/* from */}
              <div
                className="py-3 px-4 text-xs shrink-0"
                style={{
                  width: "32%",
                  fontFamily: "var(--font-geist-mono)",
                  color: C.amber,
                  borderRight: "1px solid var(--border-footer)",
                  wordBreak: "break-all",
                }}
              >
                {edge.from}
              </div>
              {/* arrow + uses */}
              <div
                className="py-3 px-3 shrink-0 text-xs"
                style={{
                  color: "var(--text-20)",
                  fontFamily: "var(--font-geist-mono)",
                  borderRight: "1px solid var(--border-footer)",
                  minWidth: 90,
                }}
              >
                <span style={{ color: hexAlpha(C.amber, 0.7) }}>——</span>
                &nbsp;
                <span style={{ color: "var(--text-35)", fontSize: 10 }}>{edge.uses}</span>
                &nbsp;
                <span style={{ color: hexAlpha(C.amber, 0.7) }}>→</span>
              </div>
              {/* to */}
              <div
                className="py-3 px-4 text-xs flex-1"
                style={{ fontFamily: "var(--font-geist-mono)", color: "var(--text-55)", wordBreak: "break-all" }}
              >
                {edge.to}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function B1CriticalFiles({ data }: { data: CriticalFile[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
      {data.map((f, i) => {
        const cc = catColor(f.category);
        const IconComp = CATEGORY_ICONS[f.category.toLowerCase()] ?? Cpu;
        return (
          <div
            key={i}
            className="rounded-xl p-5 flex flex-col gap-3 critical-card"
            style={{
              background: "var(--surface-alt)",
              border: `1px solid ${hexAlpha(cc, 0.18)}`,
              transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1.5"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.06em",
                  color: cc,
                  background: hexAlpha(cc, 0.12),
                  border: `1px solid ${hexAlpha(cc, 0.25)}`,
                  textTransform: "uppercase",
                  fontSize: 10,
                }}
              >
                <IconComp size={11} />
                {f.category}
              </span>
            </div>
            <div
              className="text-xs break-all"
              style={{ color: C.violet, fontFamily: "var(--font-geist-mono)" }}
            >
              {f.file}
            </div>
            <div className="text-sm" style={{ color: "var(--text-50)", lineHeight: 1.6 }}>
              {f.reason}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function B2ExecutionFlow({ data }: { data: AnalyzeSuccessResponse["analysis"]["executionFlow"] }) {
  const { ref, visible } = useScrollReveal(0.08);
  return (
    <div ref={ref} className={`relative flex flex-col gap-0 pl-10 ${visible ? "b2-animated" : ""}`}>
      {/* vertical rail */}
      <div
        className="absolute left-[18px] top-5 bottom-5 b2-rail"
        style={{ width: 2, background: `linear-gradient(to bottom, ${C.rose}, ${hexAlpha(C.rose, 0.1)})` }}
      />

      {data.map((step, i) => (
        <div
          key={i}
          className={`relative flex gap-6 pb-8 last:pb-0 b2-step`}
          style={{ "--step-i": i } as React.CSSProperties}
        >
          {/* node */}
          <div
            className="absolute -left-10 flex items-center justify-center rounded-full shrink-0 b2-node"
            style={{
              width: 36,
              height: 36,
              background: "var(--page-bg)",
              border: `2px solid ${C.rose}`,
              fontFamily: "var(--font-geist-mono)",
              fontSize: 11,
              color: C.rose,
              fontWeight: 700,
              zIndex: 1,
            }}
          >
            {String(step.step).padStart(2, "0")}
          </div>

          {/* card */}
          <div
            className={`flex-1 rounded-xl p-5 b2-card ${i % 2 === 0 ? "b2-from-left" : "b2-from-right"}`}
            style={{ background: "var(--surface-alt)", border: `1px solid ${hexAlpha(C.rose, 0.12)}` }}
          >
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span
                className="text-xs px-2.5 py-0.5 rounded"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: C.rose,
                  background: hexAlpha(C.rose, 0.1),
                  border: `1px solid ${hexAlpha(C.rose, 0.2)}`,
                  letterSpacing: "0.05em",
                }}
              >
                {step.layer}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--text-35)", fontFamily: "var(--font-geist-mono)" }}
              >
                {step.file}
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--text-60)", lineHeight: 1.65 }}>
              {step.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function B3RepoSummary({ data }: { data: AnalyzeSuccessResponse["analysis"]["repoSummary"] }) {
  const { description, techStack, architectureStyle, keyDecisions } = data;
  const stackGroups = [
    { label: "Languages",  items: techStack.languages,  color: C.teal   },
    { label: "Frameworks", items: techStack.frameworks, color: C.cyan   },
    { label: "Databases",  items: techStack.databases,  color: C.amber  },
    { label: "Tools",      items: techStack.tools,      color: C.violet },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Description + architecture */}
      <div
        className="rounded-xl p-6"
        style={{
          background: `linear-gradient(135deg, ${hexAlpha(C.teal, 0.05)} 0%, ${hexAlpha(C.cyan, 0.03)} 100%)`,
          border: `1px solid ${hexAlpha(C.teal, 0.18)}`,
        }}
      >
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-wrap gap-2">
            {architectureStyle.split(",").map((style, i) => (
              <span
                key={i}
                className="arch-badge px-3 py-1.5 rounded-full text-xs font-bold"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.06em",
                  color: C.teal,
                  background: `linear-gradient(135deg, ${hexAlpha(C.teal, 0.15)} 0%, ${hexAlpha(C.teal, 0.08)} 100%)`,
                  border: `1px solid ${hexAlpha(C.teal, 0.3)}`,
                  boxShadow: `0 0 20px ${hexAlpha(C.teal, 0.12)}`,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {style.trim()}
              </span>
            ))}
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-65)" }}>
            {description}
          </p>
        </div>
      </div>

      {/* Tech stack */}
      <div
        className="rounded-xl p-6"
        style={{ background: "var(--surface-alt)", border: "1px solid var(--border-card)" }}
      >
        <p
          className="text-xs mb-4"
          style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
        >
          TECH STACK
        </p>
        <div className="flex flex-col gap-4">
          {stackGroups.map(({ label, items, color }) =>
            items.length > 0 ? (
              <div key={label} className="flex items-start gap-4">
                <span
                  className="text-xs shrink-0 mt-0.5"
                  style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", minWidth: 80 }}
                >
                  {label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1 rounded-full text-xs tech-badge"
                      style={{
                        fontFamily: "var(--font-geist-mono)",
                        color,
                        background: hexAlpha(color, 0.08),
                        border: `1px solid ${hexAlpha(color, 0.2)}`,
                        transition: "transform 0.15s, box-shadow 0.15s, background 0.15s",
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* Key decisions */}
      {keyDecisions.length > 0 && (
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--surface-alt)", border: "1px solid var(--border-card)" }}
        >
          <p
            className="text-xs mb-4"
            style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
          >
            KEY DESIGN DECISIONS
          </p>
          <div className="flex flex-col gap-3">
            {keyDecisions.map((d, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="decision-num"
                  style={{
                    color: C.teal,
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: hexAlpha(C.teal, 0.1),
                    border: `1px solid ${hexAlpha(C.teal, 0.25)}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <p className="text-sm pt-0.5" style={{ color: "var(--text-55)", lineHeight: 1.65 }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const [data, setData] = useState<AnalyzeSuccessResponse | null>(null);
  const [activeSection, setActiveSection] = useState("m1");
  const [pdfLoading, setPdfLoading] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const { theme, toggle } = useTheme();
  const dotGridRef = useRef<HTMLDivElement>(null);

  const downloadPdf = useCallback(async () => {
    if (!data || pdfLoading) return;
    setPdfLoading(true);
    try {
      const { generatePdf } = await import("@/lib/pdf");
      generatePdf(data);
    } finally {
      setPdfLoading(false);
    }
  }, [data, pdfLoading]);

  useEffect(() => {
    const raw = sessionStorage.getItem("repomd_result");
    if (raw) {
      try { setData(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  // Intersection observer to highlight active nav pill
  useEffect(() => {
    if (!data) return;
    const ids = MODULES.map((m) => m.id);
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-30% 0px -60% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [data]);

  // Sliding nav indicator
  useEffect(() => {
    const pill = pillRefs.current[activeSection];
    if (!pill) return;
    setIndicatorStyle({
      left: pill.offsetLeft,
      width: pill.offsetWidth,
    });
  }, [activeSection]);

  // Dot-grid parallax
  useEffect(() => {
    const el = dotGridRef.current;
    if (!el) return;
    function onScroll() {
      if (el) el.style.transform = `translateY(${window.scrollY * 0.03}px)`;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── No data / redirect ─────────────────────────────────────────────────
  if (!data) {
    return (
      <div
        style={{ background: "var(--page-bg)", minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <div className="text-center">
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-40)", fontFamily: "var(--font-geist-mono)" }}
          >
            No analysis data found.
          </p>
          <Link
            href="/"
            className="text-sm"
            style={{ color: C.green, fontFamily: "var(--font-geist-mono)", textDecoration: "underline" }}
          >
            ← Analyze a repository
          </Link>
        </div>
      </div>
    );
  }

  const { repoFullName, repoUrl, analyzedFileCount, totalFileCount, treeTruncated, analysis } = data;
  const [owner, repo] = repoFullName.split("/");

  return (
    <>
      <style>{`
        .font-syne { font-family: var(--font-syne), sans-serif; }

        /* ── Scroll reveal ── */
        @keyframes reveal-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reveal-section {
          opacity: 0;
          transform: translateY(24px);
        }
        .reveal-section.revealed {
          animation: reveal-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        /* ── Stagger children ── */
        .stagger-children > * {
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .revealed .stagger-children > *,
        .stagger-children > * {
          opacity: 1;
          transform: translateY(0);
        }
        .stagger-children > *:nth-child(1) { transition-delay: 0ms; }
        .stagger-children > *:nth-child(2) { transition-delay: 60ms; }
        .stagger-children > *:nth-child(3) { transition-delay: 120ms; }
        .stagger-children > *:nth-child(4) { transition-delay: 180ms; }
        .stagger-children > *:nth-child(5) { transition-delay: 240ms; }
        .stagger-children > *:nth-child(6) { transition-delay: 300ms; }
        .stagger-children > *:nth-child(n+7) { transition-delay: 360ms; }

        @keyframes scanline {
          0%   { top: -4px; }
          100% { top: 100%; }
        }
        .scanline {
          position: absolute;
          left: 0; right: 0;
          height: 3px;
          background: linear-gradient(to right, transparent, rgba(57,255,20,0.04), transparent);
          animation: scanline 12s linear infinite;
          pointer-events: none;
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fade-up 0.5s ease both; }

        .nav-pill {
          transition: color 0.2s;
          cursor: pointer;
          border: 1px solid transparent;
          border-radius: 999px;
          font-family: var(--font-geist-mono);
          font-size: 12px;
          letter-spacing: 0.05em;
          padding: 5px 14px;
          white-space: nowrap;
          color: var(--text-35);
          background: transparent;
          position: relative;
          z-index: 1;
        }
        .nav-pill:hover {
          color: var(--text-70);
        }

        /* ── Nav sliding indicator ── */
        .nav-indicator {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          height: 30px;
          border-radius: 999px;
          transition: left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
          z-index: 0;
        }

        .dot-grid {
          background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
          background-size: 28px 28px;
          will-change: transform;
        }

        /* ── Stat cards ── */
        .stat-card {
          background: var(--surface-card);
          border: 1px solid var(--border-card);
          border-radius: 12px;
          padding: 18px 24px;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .stat-card:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 24px var(--shadow-card);
        }
        @keyframes subtle-pulse {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        .stat-glow {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          animation: subtle-pulse 3.5s ease-in-out infinite;
        }

        /* ── M1 folder rows ── */
        .folder-row:hover {
          box-shadow: inset 3px 0 0 var(--accent-green);
          background: var(--surface-card) !important;
        }

        /* ── M2 terminal polish ── */
        .terminal-card {
          box-shadow: 0 0 20px color-mix(in srgb, var(--accent-cyan) 10%, transparent);
        }
        .terminal-dot {
          box-shadow: inset 0 -1px 2px rgba(0,0,0,0.3);
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .blink-cursor {
          animation: blink 1.1s step-end infinite;
          margin-left: 2px;
          font-weight: 400;
          opacity: 0.6;
        }

        /* ── B1 critical cards ── */
        .critical-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px var(--shadow-card);
          border-color: var(--border-hover) !important;
        }

        /* ── B2 timeline ── */
        @keyframes draw-line {
          from { height: 0; }
          to   { height: 100%; }
        }
        @keyframes node-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-rose) 40%, transparent); }
          70%  { box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-rose) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-rose) 0%, transparent); }
        }
        @keyframes slide-from-left {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slide-from-right {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .b2-animated .b2-rail {
          animation: draw-line 0.8s ease-out forwards;
          height: 0 !important;
        }
        .b2-animated .b2-node {
          animation: node-pulse 1.5s ease-out calc(var(--step-i, 0) * 0.12s) both;
        }
        .b2-animated .b2-from-left {
          animation: slide-from-left 0.45s ease-out calc(var(--step-i, 0) * 0.12s + 0.15s) both;
        }
        .b2-animated .b2-from-right {
          animation: slide-from-right 0.45s ease-out calc(var(--step-i, 0) * 0.12s + 0.15s) both;
        }

        /* ── B3 tech badges ── */
        .tech-badge:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--shadow-card);
          background: var(--surface-card) !important;
        }

        /* ── Section divider ── */
        .section-divider {
          height: 1px;
          margin: 0 auto;
          width: 100%;
          background: linear-gradient(to right,
            transparent,
            color-mix(in srgb, var(--text-100) 8%, transparent) 20%,
            color-mix(in srgb, var(--text-100) 8%, transparent) 80%,
            transparent
          );
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 7px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--text-45);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          flex-shrink: 0;
        }
        .theme-toggle:hover {
          color: var(--text-100);
          border-color: var(--border-hover);
        }

        .pdf-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 7px;
          border: 1px solid color-mix(in srgb, var(--accent-green) 35%, transparent);
          background: color-mix(in srgb, var(--accent-green) 8%, transparent);
          color: var(--accent-green);
          font-family: var(--font-geist-mono);
          font-size: 11px;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, opacity 0.15s;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .pdf-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent-green) 15%, transparent);
          border-color: color-mix(in srgb, var(--accent-green) 55%, transparent);
        }
        .pdf-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>

      <div style={{ background: "var(--page-bg)", minHeight: "100vh", color: "var(--text-100)" }} className="relative">
        <div ref={dotGridRef} className="dot-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="scanline" />

        {/* ── Sticky top bar ── */}
        <header
          className="sticky top-0 z-40 flex items-center gap-4 px-6 py-3"
          style={{
            background: "var(--header-bg)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid var(--border-faint)",
          }}
        >
          <Link
            href="/"
            className="shrink-0"
            aria-label="RepoMD home"
          >
            <Image
              src="/repomd-logo.png"
              alt="RepoMD"
              width={568}
              height={227}
              className="h-8 w-auto sm:h-9"
            />
          </Link>
          <div
            style={{ width: 1, height: 16, background: "var(--input-border)" }}
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="font-syne font-bold truncate"
              style={{ fontSize: 15, color: "var(--text-85)" }}
            >
              {owner}
              <span style={{ color: "var(--text-30)" }}>/</span>
              <span style={{ color: C.green }}>{repo}</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={downloadPdf}
              disabled={pdfLoading}
              className="pdf-btn"
              aria-label="Download PDF report"
            >
              <Download size={12} />
              {pdfLoading ? "GENERATING…" : "PDF"}
            </button>
            <button
              onClick={toggle}
              className="theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs shrink-0 px-3 py-1.5 rounded"
              style={{
                color: "var(--text-40)",
                fontFamily: "var(--font-geist-mono)",
                border: "1px solid var(--input-border)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-100)";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-40)";
                e.currentTarget.style.borderColor = "var(--input-border)";
              }}
            >
              GitHub ↗
            </a>
          </div>
        </header>

        {/* ── Hero ── */}
        <div className="relative z-10 px-6 pt-12 pb-8 max-w-5xl mx-auto fade-in">
          {/* Repo name */}
          <h1
            className="font-syne font-extrabold mb-3"
            style={{ fontSize: "clamp(32px, 5vw, 58px)", letterSpacing: "-0.03em", lineHeight: 1 }}
          >
            <span style={{ color: "var(--text-45)" }}>{owner}/</span>
            <span className="text-white">{repo}</span>
          </h1>

          {/* Description */}
          {analysis.repoSummary.description && (
            <p
              className="text-base max-w-2xl mb-8"
              style={{ color: "var(--text-45)", lineHeight: 1.7 }}
            >
              {analysis.repoSummary.description}
            </p>
          )}

          {/* Stats strip */}
          <div className="flex flex-wrap gap-4">
            <div className="stat-card">
              <div className="stat-glow" style={{ background: `radial-gradient(circle at 30% 50%, ${hexAlpha(C.green, 0.06)}, transparent 70%)` }} />
              <div className="flex items-center gap-3 mb-1">
                <FileText size={14} style={{ color: "var(--text-30)" }} />
                <span
                  className="text-xs"
                  style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
                >
                  FILES ANALYZED
                </span>
              </div>
              <div className="font-syne font-bold text-2xl" style={{ color: C.green }}>
                <AnimatedNumber value={analyzedFileCount} />
                <span className="text-sm font-normal ml-1" style={{ color: "var(--text-25)" }}>
                  / {totalFileCount}
                </span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-glow" style={{ background: `radial-gradient(circle at 30% 50%, ${hexAlpha(C.teal, 0.06)}, transparent 70%)` }} />
              <div className="flex items-center gap-3 mb-1">
                <Layers size={14} style={{ color: "var(--text-30)" }} />
                <span
                  className="text-xs"
                  style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
                >
                  ARCHITECTURE
                </span>
              </div>
              <div className="font-syne font-bold text-xl" style={{ color: C.teal }}>
                {analysis.repoSummary.architectureStyle}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-glow" style={{ background: `radial-gradient(circle at 30% 50%, ${hexAlpha(C.cyan, 0.06)}, transparent 70%)` }} />
              <div className="flex items-center gap-3 mb-1">
                <Code2 size={14} style={{ color: "var(--text-30)" }} />
                <span
                  className="text-xs"
                  style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
                >
                  PRIMARY LANGUAGE
                </span>
              </div>
              <div className="font-syne font-bold text-xl" style={{ color: C.cyan }}>
                {analysis.repoSummary.techStack.languages[0] ?? "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-glow" style={{ background: `radial-gradient(circle at 30% 50%, ${hexAlpha(C.amber, 0.06)}, transparent 70%)` }} />
              <div className="flex items-center gap-3 mb-1">
                <LogIn size={14} style={{ color: "var(--text-30)" }} />
                <span
                  className="text-xs"
                  style={{ color: "var(--text-30)", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.08em" }}
                >
                  ENTRY POINT
                </span>
              </div>
              <div
                className="font-bold text-sm mt-0.5"
                style={{ color: C.amber, fontFamily: "var(--font-geist-mono)" }}
              >
                {analysis.entryPoints.primary.file}
              </div>
            </div>
            {treeTruncated && (
              <div className="stat-card">
                <div
                  className="text-xs"
                  style={{ color: "var(--accent-amber)", fontFamily: "var(--font-geist-mono)" }}
                >
                  ⚠ tree truncated by GitHub
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Section nav ── */}
        <div
          ref={navRef}
          className="sticky z-30 px-6 py-3"
          style={{
            top: 53,
            background: "var(--subnav-bg)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-footer)",
          }}
        >
          <div className="relative flex items-center gap-1 max-w-5xl mx-auto overflow-x-auto pb-0.5">
            {/* Sliding indicator */}
            <div
              className="nav-indicator"
              style={{
                ...indicatorStyle,
                background: (() => {
                  const active = MODULES.find((m) => m.id === activeSection);
                  return active ? hexAlpha(active.color, 0.1) : "transparent";
                })(),
                border: (() => {
                  const active = MODULES.find((m) => m.id === activeSection);
                  return active ? `1px solid ${hexAlpha(active.color, 0.25)}` : "1px solid transparent";
                })(),
              }}
            />
            {MODULES.map((m) => {
              const active = activeSection === m.id;
              return (
                <button
                  key={m.id}
                  ref={(el) => { pillRefs.current[m.id] = el; }}
                  onClick={() => scrollTo(m.id)}
                  className="nav-pill"
                  style={active ? { color: m.color } : {}}
                >
                  <span style={{ opacity: 0.6, marginRight: 5 }}>{m.label}</span>
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content sections ── */}
        <main className="relative z-10 px-6 py-12 max-w-5xl mx-auto">
          <div className="flex flex-col gap-20">

            {/* M1 */}
            <RevealSection>
              <section>
                <SectionHeader id="m1" label="M1" name="Folder Structure" color={C.green} />
                <M1FolderStructure data={analysis.folderStructure} />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* M2 */}
            <RevealSection>
              <section>
                <SectionHeader id="m2" label="M2" name="Entry Points" color={C.cyan} />
                <M2EntryPoints data={analysis.entryPoints} />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* M3 */}
            <RevealSection>
              <section>
                <SectionHeader id="m3" label="M3" name="Dependency Map" color={C.amber} />
                <M3DependencyMap data={analysis.dependencyMap} />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* ARCH */}
            <RevealSection>
              <section>
                <SectionHeader id="arch" label="ARCH" name="Architecture Diagram" color={C.rose} />
                <ArchitectureGraph
                  executionFlow={analysis.executionFlow}
                  criticalFiles={analysis.criticalFiles}
                />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* B1 */}
            <RevealSection>
              <section>
                <SectionHeader id="b1" label="B1" name="Critical Files" color={C.violet} />
                <B1CriticalFiles data={analysis.criticalFiles} />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* B2 */}
            <RevealSection>
              <section>
                <SectionHeader id="b2" label="B2" name="Execution Flow" color={C.rose} />
                <B2ExecutionFlow data={analysis.executionFlow} />
              </section>
            </RevealSection>

            <div className="section-divider" />

            {/* B3 */}
            <RevealSection>
              <section>
                <SectionHeader id="b3" label="B3" name="Repo Summary" color={C.teal} />
                <B3RepoSummary data={analysis.repoSummary} />
              </section>
            </RevealSection>

          </div>
        </main>

        {/* ── Footer ── */}
        <footer
          className="relative z-10 text-center py-8 px-6 mt-8"
          style={{ borderTop: "none" }}
        >
          <div
            style={{
              height: 1,
              background: `linear-gradient(to right, transparent, ${hexAlpha(C.green, 0.2)} 30%, ${hexAlpha(C.cyan, 0.15)} 50%, ${hexAlpha(C.violet, 0.2)} 70%, transparent)`,
              marginBottom: 24,
            }}
          />
          <p
            className="text-xs mb-1"
            style={{ color: "var(--text-22)", fontFamily: "var(--font-geist-mono)" }}
          >
            RepoMD · Codebase Intelligence Agent
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--text-12)", fontFamily: "var(--font-geist-mono)" }}
          >
            Built for WINGS Hackathon
          </p>
        </footer>

        <RepoChat repoFullName={repoFullName} analysis={analysis} />
      </div>
    </>
  );
}
