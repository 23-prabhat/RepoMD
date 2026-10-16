"use client";

import { useState, useRef } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

const features = [
  {
    tag: "M1",
    icon: "▤",
    title: "Folder Structure Analysis",
    desc: "Every directory explained in plain English. Understand what each module owns in seconds.",
    accent: "var(--accent-green)",
    sample: [
      { indent: 0, text: "src/", color: "var(--accent-green)" },
      { indent: 1, text: "controllers/  →  Business logic handlers", color: "var(--text-50)" },
      { indent: 1, text: "models/       →  Database schemas", color: "var(--text-50)" },
      { indent: 1, text: "routes/       →  API endpoints", color: "var(--text-50)" },
      { indent: 1, text: "middleware/   →  Auth, logging, validation", color: "var(--text-50)" },
    ],
  },
  {
    tag: "M2",
    icon: "⚡",
    title: "Entry Point Detection",
    desc: "Auto-detect where execution begins and trace the full startup flow, step by step.",
    accent: "var(--accent-cyan)",
    sample: [
      { indent: 0, text: "Entry Point: server.js", color: "var(--accent-cyan)" },
      { indent: 0, text: "", color: "" },
      { indent: 0, text: "Execution Flow:", color: "var(--text-60)" },
      { indent: 1, text: "→ Loads environment variables", color: "var(--text-45)" },
      { indent: 1, text: "→ Connects to MongoDB", color: "var(--text-45)" },
      { indent: 1, text: "→ Mounts API routes", color: "var(--text-45)" },
      { indent: 1, text: "→ Starts listening on PORT 3000", color: "var(--text-45)" },
    ],
  },
  {
    tag: "M3",
    icon: "◈",
    title: "Dependency Mapping",
    desc: "Visualize how files import each other — from route all the way down to the database model.",
    accent: "var(--accent-amber)",
    sample: [
      { indent: 0, text: "auth.routes.js", color: "var(--accent-amber)" },
      { indent: 1, text: "└── auth.controller.js", color: "var(--text-60)" },
      { indent: 2, text: "└── user.service.js", color: "var(--text-50)" },
      { indent: 3, text: "└── user.model.js", color: "var(--text-40)" },
    ],
  },
];

const bonusFeatures = [
  { tag: "B1", label: "Critical File Identification", desc: "Highlights auth, DB config, and API controllers" },
  { tag: "B2", label: "Execution Flow Explanation", desc: "Request → Route → Controller → Service → Database" },
  { tag: "B3", label: "Intelligent Repo Summary", desc: "Tech stack, architecture style, key design decisions" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const { theme, toggle } = useTheme();

  function scrollToSection(id: "home" | "features" | "bonus") {
    const target = document.getElementById(id);
    if (!target) return;

    // Scroll only the document, with room for the header at its current size.
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
    const top = id === "home"
      ? 0
      : window.scrollY + target.getBoundingClientRect().top - headerHeight - 16;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  async function handleAnalyze() {
    if (!url.trim()) {
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    setProgress(0);
    setStage("Connecting...");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Analysis failed");
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        // SSE streaming response
        const reader = res.body?.getReader();
        if (!reader) {
          setError("Failed to read response stream");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const block of lines) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;

            const event = JSON.parse(dataLine.slice(6));

            if (event.stage === "error") {
              setError(event.error ?? "Analysis failed");
              return;
            }

            if (event.stage === "done") {
              setProgress(100);
              setStage("Complete!");
              sessionStorage.setItem("repomd_result", JSON.stringify(event.data));
              window.location.href = `/results?url=${encodeURIComponent(url)}`;
              return;
            }

            // Progress update
            setProgress(event.progress ?? 0);
            setStage(event.detail ?? event.stage ?? "");
          }
        }

        // Stream ended without a done event
        setError("Analysis stream ended unexpectedly");
      } else {
        // Fallback: non-streaming JSON response
        const data = await res.json();
        if (!data.ok) {
          setError(data.error ?? "Analysis failed");
          return;
        }
        sessionStorage.setItem("repomd_result", JSON.stringify(data));
        window.location.href = `/results?url=${encodeURIComponent(url)}`;
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
      setProgress(0);
      setStage("");
    }
  }

  return (
    <>
      <style>{`
        .font-syne { font-family: var(--font-syne), sans-serif; }

        @keyframes scanline {
          0% { top: -4px; }
          100% { top: 100%; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes drift-a {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(40px, -30px) scale(1.05); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes drift-b {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-30px, 20px) scale(1.08); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(57,255,20,0.35); }
          50%       { box-shadow: 0 0 48px rgba(57,255,20,0.65); }
        }

        .scanline {
          position: absolute;
          left: 0; right: 0;
          height: 3px;
          background: linear-gradient(to right, transparent, rgba(57,255,20,0.06), transparent);
          animation: scanline 9s linear infinite;
          pointer-events: none;
        }
        .blob-a {
          animation: drift-a 18s ease-in-out infinite;
        }
        .blob-b {
          animation: drift-b 22s ease-in-out infinite;
        }
        .cursor-blink {
          display: inline-block;
          width: 0.12em;
          height: 0.8em;
          margin-left: 0.08em;
          vertical-align: -0.06em;
          background: var(--accent-green);
          animation: blink 1s step-end infinite;
        }
        .fade-1 { animation: fade-up 0.6s ease 0.12s both; }
        .fade-2 { animation: fade-up 0.6s ease 0.24s both; }
        .fade-3 { animation: fade-up 0.6s ease 0.38s both; }
        .fade-4 { animation: fade-up 0.6s ease 0.52s both; }
        .fade-5 { animation: fade-up 0.6s ease 0.68s both; }

        .input-root {
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-root:focus-within {
          border-color: #39FF14;
          box-shadow: 0 0 0 1px rgba(57,255,20,0.25), 0 0 32px rgba(57,255,20,0.1);
        }
        input::placeholder { color: var(--text-25); }
        input:focus { outline: none; }

        .btn-analyze {
          background: #39FF14;
          color: #07090F;
          animation: glow-pulse 2.4s ease-in-out infinite;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .btn-analyze:hover {
          animation: none;
          transform: translateY(-1px);
          box-shadow: 0 0 60px rgba(57,255,20,0.6);
        }
        .btn-analyze:active {
          transform: translateY(0);
        }

        .feature-card {
          background: var(--surface-alt);
          border: 1px solid var(--border-card);
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
        }
        .feature-card:hover {
          border-color: var(--border-hover);
          box-shadow: 0 8px 40px var(--shadow-card);
          transform: translateY(-2px);
        }

        .dot-grid {
          background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        .tag-badge {
          font-family: var(--font-geist-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--text-45);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .theme-toggle:hover {
          color: var(--text-100);
          border-color: var(--border-hover);
        }

        .homepage-nav button:focus-visible,
        .homepage-nav a:focus-visible {
          outline: 2px solid var(--accent-green);
          outline-offset: 5px;
          border-radius: 4px;
        }

        @media (prefers-reduced-motion: reduce) {
          .home-page .blob-a,
          .home-page .blob-b,
          .home-page .scanline,
          .home-page .cursor-blink,
          .home-page .btn-analyze,
          .home-page .status-dot,
          .home-page [class*="fade-"] {
            animation: none !important;
          }
        }
      `}</style>

      <div
        style={{ background: "var(--page-bg)", minHeight: "100vh", color: "var(--text-100)" }}
        className="home-page relative isolate"
      >
        {/* Clip decorations independently so the page never becomes a nested scroll container. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* Ambient blobs */}
          <div
            className="blob-a pointer-events-none absolute"
            style={{
              top: "-280px",
              left: "-280px",
              width: "700px",
              height: "700px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(57,255,20,0.055) 0%, transparent 65%)",
            }}
          />
          <div
            className="blob-b pointer-events-none absolute"
            style={{
              bottom: "-200px",
              right: "-200px",
              width: "600px",
              height: "600px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,212,255,0.045) 0%, transparent 65%)",
            }}
          />

          {/* Dot grid */}
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />

          {/* Scanline */}
          <div className="scanline" />
        </div>

        {/* ── Nav ── */}
        <header
          ref={headerRef}
          className="sticky top-0 z-40"
          style={{
            background: "var(--header-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: "1px solid var(--border-faint)",
          }}
        >
          <nav
            aria-label="Main navigation"
            className="homepage-nav mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 px-4 py-3 sm:flex sm:gap-x-6 sm:px-8 sm:py-4"
          >
            <button
              type="button"
              aria-label="RepoMD home"
              onClick={() => scrollToSection("home")}
              className="flex shrink-0 cursor-pointer items-center justify-self-start gap-1.5"
            >
              <span className="font-syne text-xl font-extrabold tracking-tight text-white">Repo</span>
              <span className="font-syne text-xl font-extrabold tracking-tight" style={{ color: "var(--accent-green)" }}>
                MD
              </span>
              <span
                className="tag-badge ml-2"
                style={{ background: "color-mix(in srgb, var(--accent-green) 10%, transparent)", color: "var(--accent-green)", border: "1px solid color-mix(in srgb, var(--accent-green) 22%, transparent)" }}
              >
                BETA
              </span>
            </button>
            <div
              className="col-span-2 row-start-2 flex items-center justify-center gap-6 text-sm sm:ml-auto"
              style={{ color: "var(--text-45)", fontFamily: "var(--font-geist-mono)" }}
            >
              <button
                type="button"
                onClick={() => scrollToSection("home")}
                className="hover:text-white transition-colors cursor-pointer"
              >
                home
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features")}
                className="hover:text-white transition-colors cursor-pointer"
              >
                features
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("bonus")}
                className="hover:text-white transition-colors cursor-pointer"
              >
                bonus
              </button>
            </div>
            <div className="col-start-2 row-start-1 flex items-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={toggle}
                className="theme-toggle"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 sm:px-4 py-1.5 rounded border text-white transition-all hover:bg-white/5 dark:hover:bg-white/5"
                style={{ borderColor: "var(--input-border)", fontSize: "13px" }}
              >
                GitHub ↗
              </a>
            </div>
          </nav>
        </header>

        {/* ── Hero ── */}
        <main id="home" className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-28">
          {/* Badge */}
          <div
            className="fade-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8"
            style={{
              background: "color-mix(in srgb, var(--accent-green) 9%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-green) 22%, transparent)",
              color: "var(--accent-green)",
              fontSize: "12px",
              fontFamily: "var(--font-geist-mono)",
              letterSpacing: "0.06em",
            }}
          >
            <span
              className="status-dot inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent-green)", animation: "blink 1.5s ease-in-out infinite" }}
            />
            AI-POWERED · CODEBASE INTELLIGENCE
          </div>

          {/* Headline */}
          <h1
            className="fade-2 font-syne font-extrabold text-white leading-[1.0] mb-6"
            style={{
              fontSize: "clamp(40px, 8.5vw, 100px)",
              letterSpacing: "-0.035em",
              maxWidth: "900px",
              lineHeight: 1,
            }}
          >
            Diagnose any
            <br />
            <span className="inline-block whitespace-nowrap" style={{ color: "var(--accent-green)" }}>
              codebase<span className="cursor-blink" aria-hidden="true" />
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="fade-3 text-lg max-w-lg mb-2 leading-relaxed"
            style={{ color: "var(--text-50)" }}
          >
            Drop a GitHub URL. Get instant architecture maps, entry point detection, and dependency graphs.
          </p>
          <p
            className="fade-3 text-sm mb-12"
            style={{ color: "var(--text-22)", fontFamily: "var(--font-geist-mono)" }}
          >
            No signup · No setup · Just paste and analyze
          </p>

          {/* ── URL Input ── */}
          <div className="fade-4 w-full max-w-2xl">
            <div className="input-root flex items-center rounded-xl overflow-hidden">
              <span
                className="pl-5 pr-2 text-sm select-none shrink-0"
                style={{ color: "color-mix(in srgb, var(--accent-green) 65%, transparent)", fontFamily: "var(--font-geist-mono)" }}
              >
                $
              </span>
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="https://github.com/owner/repository"
                aria-label="GitHub repository URL"
                className="min-w-0 flex-1 py-4 pr-3 text-sm text-white bg-transparent"
                style={{ fontFamily: "var(--font-geist-mono)" }}
                disabled={loading}
              />
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="btn-analyze font-syne font-bold text-xs sm:text-sm px-4 sm:px-7 py-4 shrink-0"
                style={{ letterSpacing: "0.06em", whiteSpace: "nowrap", opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "ANALYZING..." : "ANALYZE →"}
              </button>
            </div>
            {loading && (
              <div className="mt-3 w-full">
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--input-border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: "var(--accent-green)",
                      transition: "width 0.4s ease-out",
                      boxShadow: "0 0 8px rgba(57,255,20,0.5)",
                    }}
                  />
                </div>
                <p
                  className="mt-1.5 text-xs text-center"
                  style={{ color: "var(--text-40)", fontFamily: "var(--font-geist-mono)" }}
                >
                  {stage}
                </p>
              </div>
            )}
            {error && (
              <p
                className="mt-2 text-xs text-center"
                style={{ color: "#FF5F57", fontFamily: "var(--font-geist-mono)" }}
              >
                {error}
              </p>
            )}
            <p
              className="mt-3 text-xs text-center"
              style={{ color: "var(--text-20)", fontFamily: "var(--font-geist-mono)" }}
            >
              Node.js · React · Python · Java · Full-stack
            </p>
          </div>

          {/* ── Terminal Preview ── */}
          <div
            className="fade-5 mt-16 w-full max-w-2xl rounded-xl overflow-hidden text-left"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-card)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* titlebar */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-faint)" }}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: "#FF5F57" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#FFBD2E" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#28C840" }} />
              <span
                className="ml-4 text-xs"
                style={{ color: "var(--text-28)", fontFamily: "var(--font-geist-mono)" }}
              >
                repomd — analysis output
              </span>
            </div>
            {/* content */}
            <div
              className="p-6 text-xs leading-loose"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              <div style={{ color: "var(--accent-green)" }}>
                ✓ Entry Point:{" "}
                <span style={{ color: "var(--text-70)" }}>server.js</span>
              </div>
              <div style={{ color: "var(--text-35)" }}>
                &nbsp;&nbsp;└── loads env → connects MongoDB → mounts routes → listens :3000
              </div>
              <div className="mt-2" style={{ color: "var(--accent-cyan)" }}>
                ✓ Structure:{" "}
                <span style={{ color: "var(--text-70)" }}>6 modules detected</span>
              </div>
              <div style={{ color: "var(--text-35)" }}>
                &nbsp;&nbsp;├── controllers/ → request handlers &nbsp;├── models/ → schemas
              </div>
              <div className="mt-2" style={{ color: "var(--accent-amber)" }}>
                ✓ Dependencies:{" "}
                <span style={{ color: "var(--text-70)" }}>23 file relationships mapped</span>
              </div>
              <div style={{ color: "var(--text-35)" }}>
                &nbsp;&nbsp;auth.routes → auth.controller → user.service → user.model
              </div>
            </div>
          </div>
        </main>

        {/* ── Features ── */}
        <section id="features" className="relative z-10 px-6 py-24 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div
              className="tag-badge inline-block mb-5"
              style={{
                background: "color-mix(in srgb, var(--accent-green) 9%, transparent)",
                color: "var(--accent-green)",
                border: "1px solid color-mix(in srgb, var(--accent-green) 18%, transparent)",
              }}
            >
              MANDATORY FEATURES
            </div>
            <h2
              className="font-syne font-bold text-white"
              style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "-0.025em" }}
            >
              Three lenses.{" "}
              <span style={{ color: "var(--text-40)" }}>Full clarity.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.tag} className="feature-card rounded-xl p-6 flex flex-col">
                {/* header */}
                <div className="flex items-center gap-3 mb-5">
                  <span
                    className="tag-badge"
                    style={{
                      background: `color-mix(in srgb, ${f.accent} 9%, transparent)`,
                      color: f.accent,
                      border: `1px solid color-mix(in srgb, ${f.accent} 18%, transparent)`,
                    }}
                  >
                    {f.tag}
                  </span>
                  <span
                    className="text-xl"
                    style={{ color: f.accent, fontFamily: "var(--font-geist-mono)" }}
                  >
                    {f.icon}
                  </span>
                </div>
                {/* title */}
                <h3
                  className="font-syne font-bold text-white text-lg mb-2"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {f.title}
                </h3>
                <p
                  className="text-sm leading-relaxed mb-6"
                  style={{ color: "var(--text-42)" }}
                >
                  {f.desc}
                </p>
                {/* sample output */}
                <div
                  className="mt-auto rounded-lg p-4 text-xs leading-loose [overflow-wrap:anywhere]"
                  style={{
                    background: "var(--surface-term)",
                    border: "1px solid var(--border-faint)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {f.sample.map((line, i) =>
                    line.text === "" ? (
                      <br key={i} />
                    ) : (
                      <div
                        key={i}
                        style={{
                          color: line.color,
                          paddingLeft: `${line.indent * 14}px`,
                        }}
                      >
                        {line.text}
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bonus Features ── */}
        <section id="bonus" className="relative z-10 px-6 pb-28 max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div
              className="tag-badge inline-block mb-5"
              style={{
                background: "color-mix(in srgb, var(--accent-amber) 9%, transparent)",
                color: "var(--accent-amber)",
                border: "1px solid color-mix(in srgb, var(--accent-amber) 22%, transparent)",
              }}
            >
              BONUS FEATURES
            </div>
            <h2
              className="font-syne font-bold text-white"
              style={{ fontSize: "clamp(26px, 3.5vw, 38px)", letterSpacing: "-0.02em" }}
            >
              Going further.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {bonusFeatures.map((b) => (
              <div
                key={b.tag}
                className="feature-card rounded-xl px-6 py-5 flex items-start gap-4"
              >
                <span
                  className="tag-badge shrink-0 mt-0.5"
                  style={{
                    background: "color-mix(in srgb, var(--accent-amber) 11%, transparent)",
                    color: "var(--accent-amber)",
                    border: "1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent)",
                  }}
                >
                  {b.tag}
                </span>
                <div>
                  <p
                    className="font-syne font-bold text-sm text-white mb-1"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {b.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-38)", fontFamily: "var(--font-geist-mono)" }}>
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA strip ── */}
        <div
          className="relative z-10 mx-6 mb-20 max-w-4xl xl:mx-auto rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(57,255,20,0.08) 0%, rgba(0,212,255,0.05) 100%)",
            border: "1px solid rgba(57,255,20,0.15)",
          }}
        >
          <div className="px-10 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3
                className="font-syne font-extrabold text-white text-2xl mb-1"
                style={{ letterSpacing: "-0.02em" }}
              >
                Ready to dissect a repo?
              </h3>
              <p className="text-sm" style={{ color: "var(--text-40)" }}>
                Paste any public GitHub URL and let RepoMD do the rest.
              </p>
            </div>
            <button
              onClick={() => {
                inputRef.current?.focus({ preventScroll: true });
                scrollToSection("home");
              }}
              className="btn-analyze font-syne font-bold px-8 py-4 rounded-xl shrink-0"
              style={{ fontSize: "14px", letterSpacing: "0.06em" }}
            >
              ANALYZE NOW →
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer
          className="relative z-10 text-center py-8 px-6"
          style={{ borderTop: "1px solid var(--border-footer)" }}
        >
          <p
            className="text-xs"
            style={{ color: "var(--text-20)", fontFamily: "var(--font-geist-mono)" }}
          >
            RepoMD · Codebase Intelligence Agent · Built for WINGS Hackathon
          </p>
        </footer>
      </div>
    </>
  );
}
