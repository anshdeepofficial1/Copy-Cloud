import { injectSpeedInsights } from "@vercel/speed-insights";
injectSpeedInsights();
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import App from "./app/App.tsx";
import AdminPage from "./app/pages/AdminPage.tsx";
import "./styles/index.css";

const BASE_URL = "https://copycloud.me";
const CANONICAL_PATH_OVERRIDES: Record<string, string> = {
  "/app": "/",
  "/send": "/",
  "/retrieve": "/",
  "/history": "/",
  "/about": "/about.html",
  "/contact": "/contact.html",
  "/faq": "/faq.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/index": "/",
  "/index.html": "/",
};

type RouteSeoConfig = {
  title: string;
  description: string;
  robots: string;
  structuredData?: Record<string, unknown>;
};

const DEFAULT_SEO: RouteSeoConfig = {
  title: "Copy Cloud - Secure Ephemeral Clipboard for Text and Files",
  description:
    "Copy Cloud lets you securely move text and files between devices using a short code, with automatic 24-hour deletion and no account required.",
  robots: "index, follow",
  structuredData: {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Copy Cloud",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    url: "https://copycloud.me/",
    description:
      "A secure cross-device clipboard for temporary text and file sharing with automatic deletion.",
  },
};

const ROUTE_SEO: Record<string, RouteSeoConfig> = {
  "/": DEFAULT_SEO,
  "/admin-approval": {
    title: "Admin Approval - Copy Cloud",
    description: "Restricted admin approval access for Copy Cloud operators.",
    robots: "noindex, nofollow",
  },
};

function removeTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getCanonicalPath(pathname: string): string {
  const normalized = removeTrailingSlash(pathname) || "/";
  return CANONICAL_PATH_OVERRIDES[normalized] ?? normalized;
}

function setMetaTag(selector: string, attribute: "name" | "property", key: string, content: string) {
  const meta = document.querySelector<HTMLMetaElement>(selector);
  if (meta) {
    meta.setAttribute("content", content);
    return;
  }
  const newMeta = document.createElement("meta");
  newMeta.setAttribute(attribute, key);
  newMeta.setAttribute("content", content);
  document.head.appendChild(newMeta);
}

function RouteSeoManager() {
  const location = useLocation();

  useEffect(() => {
    const canonicalPath = getCanonicalPath(location.pathname);
    const canonicalUrl = `${BASE_URL}${canonicalPath}`;
    const seo = ROUTE_SEO[location.pathname] ?? DEFAULT_SEO;

    document.title = seo.title;

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      canonical.href = canonicalUrl;
    }

    setMetaTag('meta[name="description"]', "name", "description", seo.description);
    setMetaTag('meta[name="robots"]', "name", "robots", seo.robots);
    setMetaTag('meta[property="og:title"]', "property", "og:title", seo.title);
    setMetaTag('meta[property="og:description"]', "property", "og:description", seo.description);
    setMetaTag('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMetaTag('meta[name="twitter:title"]', "name", "twitter:title", seo.title);
    setMetaTag('meta[name="twitter:description"]', "name", "twitter:description", seo.description);
    setMetaTag('meta[name="twitter:url"]', "name", "twitter:url", canonicalUrl);

    const structuredDataScriptId = "route-structured-data";
    const existingScript = document.getElementById(structuredDataScriptId);
    if (existingScript) {
      existingScript.remove();
    }

    if (seo.structuredData) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = structuredDataScriptId;
      script.text = JSON.stringify(seo.structuredData);
      document.head.appendChild(script);
    }
  }, [location.pathname]);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <RouteSeoManager />
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/admin-approval" element={<AdminPage />} />
    </Routes>
  </BrowserRouter>,
);
