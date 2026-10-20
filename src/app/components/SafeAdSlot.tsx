import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    __copyCloudAdsenseLoaded?: boolean;
  }
}

type PageIntent = "content" | "form" | "loading" | "error" | "empty" | "redirect" | "auth" | "unknown";

type SafeAdSlotProps = {
  slot: string;
  pageIntent?: PageIntent;
  hasMeaningfulContent?: boolean;
  contentText?: string;
  className?: string;
  style?: CSSProperties;
};

const ADS_CLIENT = "ca-pub-5287107562841728";
const BLOCKED_PATH_KEYWORDS = ["/admin-approval", "/auth", "/login", "/signin", "/signup", "/error", "/loading", "/redirect"];

function hasBlockedPath(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  return BLOCKED_PATH_KEYWORDS.some((segment) => lowerPath.includes(segment));
}

export function SafeAdSlot({
  slot,
  pageIntent = "unknown",
  hasMeaningfulContent = false,
  contentText = "",
  className,
  style,
}: SafeAdSlotProps) {
  const location = useLocation();
  const [scriptReady, setScriptReady] = useState(false);

  const wordCount = useMemo(() => {
    const normalized = contentText.trim();
    if (!normalized) {
      return 0;
    }
    return normalized.split(/\s+/).length;
  }, [contentText]);

  const isEligible =
    !hasBlockedPath(location.pathname) &&
    hasMeaningfulContent &&
    pageIntent === "content" &&
    wordCount >= 80;

  useEffect(() => {
    if (!isEligible) {
      return;
    }

    if (window.__copyCloudAdsenseLoaded) {
      setScriptReady(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-copycloud-adsense="${ADS_CLIENT}"]`);
    if (existingScript) {
      window.__copyCloudAdsenseLoaded = true;
      setScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT}`;
    script.crossOrigin = "anonymous";
    script.dataset.copycloudAdsense = ADS_CLIENT;
    script.onload = () => {
      window.__copyCloudAdsenseLoaded = true;
      setScriptReady(true);
    };
    document.head.appendChild(script);
  }, [isEligible]);

  useEffect(() => {
    if (!isEligible || !scriptReady) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore duplicate slot pushes.
    }
  }, [isEligible, scriptReady, slot]);

  if (!isEligible) {
    return null;
  }

  return (
    <ins
      className={`adsbygoogle${className ? ` ${className}` : ""}`}
      style={{ display: "block", ...style }}
      data-ad-client={ADS_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      aria-label="Advertisement"
    />
  );
}
