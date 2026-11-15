import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "../styles/glass.css";
const ClassicApp=lazy(()=>import("./App"));
const EditorialApp=lazy(()=>import("./editorial/EditorialApp"));
const GlassApp=lazy(()=>import("./glass/GlassApp").then(m=>({default:m.GlassApp})));
const fallback=<div role="status" style={{padding:24}}>Opening CopyCloud…</div>;

type UiMode = "classic" | "glass" | "editorial";
type GlassTheme = "system" | "light" | "dark";

const UI_KEY = "cc_ui_version";
const THEME_KEY = "cc_glass_theme";

function readUiMode(): UiMode {
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "glass" || view === "classic" ? view : "editorial";
}

function readTheme(): GlassTheme {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export default function ExperienceRouter() {
  const [uiMode, setUiMode] = useState<UiMode>(() => readUiMode());
  const [glassTheme, setGlassTheme] = useState<GlassTheme>(() => readTheme());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const update = () => setSystemDark(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const resolvedTheme = useMemo<"light" | "dark">(
    () => (glassTheme === "system" ? (systemDark ? "dark" : "light") : glassTheme),
    [glassTheme, systemDark]
  );

  useEffect(() => {
    document.body.classList.toggle("cc-glass-mode", uiMode === "glass");
    if (uiMode === "glass") {
      document.documentElement.dataset.ccTheme = resolvedTheme;
    } else {
      delete document.documentElement.dataset.ccTheme;
    }
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.content = uiMode === "glass"
        ? (resolvedTheme === "dark" ? "#07101d" : "#eef7ff")
        : "#030307";
    }
    return () => document.body.classList.remove("cc-glass-mode");
  }, [uiMode, resolvedTheme]);

  const selectUi = (next: UiMode) => {
    localStorage.setItem(UI_KEY, next);
    setUiMode(next);
  };

  const selectTheme = (next: GlassTheme) => {
    localStorage.setItem(THEME_KEY, next);
    setGlassTheme(next);
  };

  if (uiMode === "editorial") return <Suspense fallback={fallback}><EditorialApp /></Suspense>;

  if (uiMode === "glass") {
    return (
      <Suspense fallback={fallback}><GlassApp
        theme={glassTheme}
        resolvedTheme={resolvedTheme}
        onThemeChange={selectTheme}
        onSwitchToClassic={() => selectUi("classic")}
      /></Suspense>
    );
  }

  return <Suspense fallback={fallback}><ClassicApp onSwitchToGlass={() => selectUi("glass")} /></Suspense>
}
