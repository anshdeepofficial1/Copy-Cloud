import { lazy, Suspense, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster } from "sonner";
import { Send, Download, Clock, Info, Zap, Shield, Timer, FileText, Lock, Workflow, CheckCircle2 } from "lucide-react";
import { PremiumBackground } from "./components/PremiumBackground";
import { WorkspaceCard } from "./components/WorkspaceCard";
import { SendTab } from "./components/SendTab";
import { RetrieveTab } from "./components/RetrieveTab";
import { HistoryTab } from "./components/HistoryTab";
import { AboutTab } from "./components/AboutTab";
import { SafeAdSlot } from "./components/SafeAdSlot";

const Chatbot = lazy(() => import("./components/Chatbot").then((module) => ({ default: module.Chatbot })));

type Tab = "send" | "retrieve" | "history" | "about";

const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: "send", label: "Send", icon: Send },
  { id: "retrieve", label: "Retrieve", icon: Download },
  { id: "history", label: "History", icon: Clock },
  { id: "about", label: "About", icon: Info },
];

const HERO: Record<Tab, { eyebrow: string; title: string; sub: string }> = {
  send: {
    eyebrow: "INSTANT TRANSFER",
    title: "Send Anything.",
    sub: "Text, code, or files — warped to any device with a single code.",
  },
  retrieve: {
    eyebrow: "CLOUD RETRIEVAL",
    title: "Open the Portal.",
    sub: "Enter your 6-digit code to pull content from the cloud instantly.",
  },
  history: {
    eyebrow: "LOCAL LOG",
    title: "Your Trail.",
    sub: "Recent transfers on this device. Cloud data self-destructs in 24h.",
  },
  about: {
    eyebrow: "DIGITAL GHOST",
    title: "Built to Forget.",
    sub: "Anonymous, encrypted, ephemeral. Zero accounts. Zero traces.",
  },
};

const FEATURE_BULLETS = [
  "Securely send notes, snippets, links, and files between devices in seconds.",
  "No signup required, so teams and individuals can share content instantly.",
  "Automatic 24-hour deletion keeps storage temporary and clutter-free.",
  "Cross-platform support for desktop and mobile browsers.",
  "Local transfer history helps you quickly reuse recent retrieval codes.",
];

const SUPPORTED_TYPES = [
  "Plain text and rich copied snippets",
  "Source code files and configuration files",
  "Documents, screenshots, PDFs, and compressed archives",
  "Common media files such as images, audio, and short video clips",
];

const FAQ_ITEMS = [
  {
    question: "Do I need an account to use CopyCloud?",
    answer: "No. CopyCloud is designed for fast temporary sharing without account creation or profile setup.",
  },
  {
    question: "How long does shared data stay available?",
    answer: "Each transfer expires automatically after 24 hours, and expired content is removed from storage.",
  },
  {
    question: "Can I use it across phone and laptop?",
    answer: "Yes. Generate a code on one device and retrieve content from any modern browser on another device.",
  },
  {
    question: "Is my transfer code private?",
    answer: "Only someone with the code can retrieve the content, so share codes only with intended recipients.",
  },
];

const HOME_PUBLISHER_COPY = [
  "CopyCloud is a secure temporary clipboard built for people who move content between devices every day.",
  "It combines one-time retrieval codes with automatic expiration so sharing stays quick and disposable.",
  "Built-in privacy controls reduce account friction while still keeping data transfer practical for real workflows.",
  "From drafts and snippets to files and references, CopyCloud keeps transfer simple without changing your existing tools.",
].join(" ");

export default function App() {
  const [tab, setTab] = useState<Tab>("send");
  const [prefill, setPrefill] = useState<string | undefined>();

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t !== "retrieve") setPrefill(undefined);
  };

  const handleHistoryRetrieve = (code: string) => {
    setPrefill(code);
    setTab("retrieve");
  };

  const hero = HERO[tab];

  const structuredFaqJson = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }),
    [],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
      <PremiumBackground />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(12, 12, 20, 0.95)",
            border: "1px solid rgba(99,102,241,0.25)",
            color: "#f1f5f9",
            backdropFilter: "blur(12px)",
            fontFamily: "'Inter', sans-serif",
            fontSize: "0.875rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
          },
        }}
      />

      <header className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 bg-[#030307]/85 border-b border-white/5 backdrop-blur-md">
        <button
          type="button"
          aria-label="Go to CopyCloud home"
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: "transparent", border: "none", padding: 0 }}
          onClick={() => handleTabChange("send")}
        >
          <img src="/logo.png" alt="CopyCloud logo" className="h-8 w-auto" />
          <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.03em", color: "#f1f5f9" }}>
            Copy<span style={{ color: "#818cf8" }}>Cloud</span>
          </span>
        </button>

        <nav aria-label="Primary" className="hidden md:flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-label={`Open ${t.label} tab`}
                aria-current={active ? "page" : undefined}
                onClick={() => handleTabChange(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 16px",
                  borderRadius: 9,
                  background: active ? "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.15))" : "transparent",
                  border: active ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent",
                  color: active ? "#c7d2fe" : "#334155",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.18s",
                  boxShadow: active ? "0 0 16px rgba(99,102,241,0.1)" : "none",
                }}
              >
                <t.icon size={13} />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }} aria-label="Security and retention status">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 99,
              background: "rgba(34,197,94,0.07)",
              border: "1px solid rgba(34,197,94,0.15)",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse 2s infinite" }} />
            <span style={{ color: "#22c55e", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace" }}>SECURE</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
            <Timer size={11} color="#6366f1" />
            <span style={{ color: "#6366f1", fontSize: "0.7rem", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>24H WIPE</span>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, position: "relative", zIndex: 1 }}>
        <section style={{ textAlign: "center", padding: "48px 24px 32px" }} aria-label="Hero section">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ height: 1, width: 28, background: "rgba(99,102,241,0.4)" }} />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    color: "rgba(99,102,241,0.7)",
                  }}
                >
                  {hero.eyebrow}
                </span>
                <div style={{ height: 1, width: 28, background: "rgba(99,102,241,0.4)" }} />
              </div>

              <h1
                style={{
                  fontSize: "clamp(2.8rem, 7vw, 5rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.05,
                  marginBottom: 14,
                  background: "linear-gradient(160deg, #ffffff 0%, #c7d2fe 40%, #a855f7 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {hero.title}
              </h1>

              <p
                style={{
                  color: "#334155",
                  fontSize: "clamp(0.9rem, 2vw, 1rem)",
                  lineHeight: 1.6,
                  maxWidth: 460,
                  margin: "0 auto",
                }}
              >
                {hero.sub}
              </p>

              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                {[
                  { icon: <Shield size={11} />, text: "Anonymous" },
                  { icon: <Timer size={11} />, text: "Wipe-on-24" },
                  { icon: <Zap size={11} />, text: "Cross-platform" },
                ].map((pill) => (
                  <div
                    key={pill.text}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 12px",
                      borderRadius: 99,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "#334155",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: "#6366f1" }}>{pill.icon}</span>
                    {pill.text}
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0 24px 60px",
            position: "relative",
          }}
          aria-label="Workspace"
        >
          <div className="w-full max-w-[660px] px-4 md:px-0">
            <WorkspaceCard>
              <div
                style={{
                  display: "flex",
                  gap: 0,
                  padding: "0 24px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "rgba(0,0,0,0.15)",
                }}
                role="tablist"
                aria-label="CopyCloud workspace tabs"
              >
                {TABS.map((t) => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`${t.label} panel`}
                      onClick={() => handleTabChange(t.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "12px 16px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
                        marginBottom: -1,
                        color: active ? "#a5b4fc" : "#1e293b",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#475569";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#1e293b";
                      }}
                    >
                      <t.icon size={13} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {tab === "send" && (
                  <motion.div key="send" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                    <SendTab />
                  </motion.div>
                )}
                {tab === "retrieve" && (
                  <motion.div key="retrieve" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                    <RetrieveTab prefillCode={prefill} />
                  </motion.div>
                )}
                {tab === "history" && (
                  <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                    <HistoryTab onRetrieve={handleHistoryRetrieve} />
                  </motion.div>
                )}
                {tab === "about" && (
                  <motion.div key="about" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                    <AboutTab />
                  </motion.div>
                )}
              </AnimatePresence>
            </WorkspaceCard>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 40,
              left: "50%",
              transform: "translateX(-50%)",
              width: 400,
              height: 80,
              background: "radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
              pointerEvents: "none",
              zIndex: -1,
            }}
          />
        </section>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px 56px" }} aria-label="About CopyCloud">
          <article
            style={{
              borderRadius: 20,
              padding: "28px 24px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 18,
            }}
          >
            <h2 style={{ color: "#e2e8f0", fontSize: "1.4rem", marginBottom: 12 }}>What is CopyCloud?</h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.75, marginBottom: 0 }}>{HOME_PUBLISHER_COPY}</p>
          </article>

          <div
            style={{
              borderRadius: 20,
              padding: "20px 18px",
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 18,
            }}
          >
            <SafeAdSlot
              slot="3147244974"
              pageIntent="content"
              hasMeaningfulContent
              contentText={HOME_PUBLISHER_COPY}
              style={{ minHeight: 90 }}
            />
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 18 }}>
            <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px" }}>
              <h3 style={{ color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><FileText size={16} /> Features</h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#64748b", lineHeight: 1.7 }}>
                {FEATURE_BULLETS.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
            <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px" }}>
              <h3 style={{ color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Lock size={16} /> Security and Privacy</h3>
              <p style={{ color: "#64748b", lineHeight: 1.75, marginTop: 0 }}>
                Transfers run over HTTPS and access is tied to one-time retrieval codes. Data is stored temporarily and wiped after expiration. CopyCloud does not require profile setup, reducing personal data collection while keeping sharing practical.
              </p>
            </article>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 18 }}>
            <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px" }}>
              <h3 style={{ color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><CheckCircle2 size={16} /> Benefits</h3>
              <p style={{ color: "#64748b", lineHeight: 1.75, margin: 0 }}>
                CopyCloud is useful for moving quick notes from phone to desktop, sharing files across operating systems, and handing off work without adding account steps. It fits both personal workflows and lightweight team collaboration.
              </p>
            </article>
            <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px" }}>
              <h3 style={{ color: "#cbd5e1", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Workflow size={16} /> Workflow</h3>
              <ol style={{ margin: 0, paddingLeft: 18, color: "#64748b", lineHeight: 1.7 }}>
                <li>Upload text or files in the Send tab.</li>
                <li>Receive a short retrieval code instantly.</li>
                <li>Open CopyCloud on another device.</li>
                <li>Enter the code in Retrieve and download the content.</li>
              </ol>
            </article>
          </div>

          <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px", marginBottom: 18 }}>
            <h3 style={{ color: "#cbd5e1", marginBottom: 10 }}>Supported file types</h3>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#64748b", lineHeight: 1.7 }}>
              {SUPPORTED_TYPES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", padding: "18px 16px" }}>
            <h3 style={{ color: "#cbd5e1", marginBottom: 12 }}>FAQ</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", padding: "10px 12px", background: "rgba(0,0,0,0.12)" }}>
                  <summary style={{ color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>{item.question}</summary>
                  <p style={{ color: "#64748b", lineHeight: 1.65, margin: "10px 0 2px" }}>{item.answer}</p>
                </details>
              ))}
            </div>
          </article>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredFaqJson }} />
      </main>

      <footer
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "16px 24px 24px",
          borderTop: "1px solid rgba(255,255,255,0.03)",
          color: "#0f172a",
          fontSize: "0.72rem",
        }}
      >
        <nav aria-label="Trust and policy links" style={{ marginBottom: 8, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
          {[
            { href: "/about.html", label: "About" },
            { href: "/contact.html", label: "Contact" },
            { href: "/faq.html", label: "FAQ" },
            { href: "/privacy.html", label: "Privacy Policy" },
            { href: "/terms.html", label: "Terms" },
          ].map((link) => (
            <a key={link.label} href={link.href} style={{ color: "#475569", textDecoration: "none", fontWeight: 600 }}>
              {link.label}
            </a>
          ))}
        </nav>
        <p>© 2026 Copy Cloud · Anonymous Ephemeral Transfer · No accounts · No tracking</p>
      </footer>

      <Suspense fallback={null}>
        <Chatbot />
      </Suspense>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
