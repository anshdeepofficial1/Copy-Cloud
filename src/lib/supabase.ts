import { createClient } from "@supabase/supabase-js";
import { generateCode } from "./transferProtocol.mjs";
export { generateCode };

const SUPABASE_URL = "https://luunzeonlmzvmewaucqj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1dW56ZW9ubG16dm1ld2F1Y3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzAyNzEsImV4cCI6MjA4NTcwNjI3MX0.qQpWEGFLg6Weof0NO_ApntTrGGYVsrsNB2zaujRMuFY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { addToHistory,getHistory,clearHistoryStore,type HistoryItem } from "./history";

// Detect image/video files so the UI can render previews.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
export function fileKind(name: string): "image" | "video" | "other" {
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  return "other";
}

