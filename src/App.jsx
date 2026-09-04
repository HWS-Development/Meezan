import { startTransition, useEffect, useRef, useState } from "react";
import ExactIllustratorPage from "./components/ExactIllustratorPage.jsx";
import { exactOverlays } from "./data/exactOverlays.js";
import { exactMediaOverrides } from "./data/mediaConfig.js";
import { pagePaths, pathPages } from "./data/pageConfig.js";
import siteContent from "./data/siteContent.json";

const headerAsset = "/assets/illustrator-driven/header-canonical-exact.png";
const imagePreloads = new Map();

function getPageFromLocation() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const hash = window.location.hash.replace("#", "");
  return pathPages[path] || pathPages[hash] || "home";
}

function mediaAsset(item, fallbackSrc) {
  const replacement = String(item.replacementFile || "").trim().replace(/\\/g, "/");
  if (replacement.startsWith("/")) return replacement;
  if (replacement.startsWith("assets/")) return `/${replacement}`;
  const publicIndex = replacement.indexOf("/public/");
  if (publicIndex >= 0) return replacement.slice(publicIndex + "/public".length);
  return fallbackSrc;
}

function isRenderedMedia(item, artboard) {
  const bounds = item.bounds || {};
  const artboardWidth = Number(artboard?.width || 1920);
  const wide = Number(bounds.width || 0) >= artboardWidth * 0.9;
  const backdrop = wide && Number(bounds.height || 0) >= artboardWidth;
  const hero = Number(bounds.y || 0) < 0 && wide && (item.type === "placed" || Number(bounds.height || 0) < artboardWidth);
  return !backdrop && !hero && item.exported && item.src;
}

function initialArtboardLimit(artboard) {
  const artboardWidth = Number(artboard?.width || 1920);
  const renderedWidth = Math.min(window.innerWidth, artboardWidth);
  return (window.innerHeight + 120) * (artboardWidth / renderedWidth);
}

function criticalPageAssets(page) {
  const pageData = siteContent.pages?.[page];
  if (!pageData) return [headerAsset];

  const assets = new Set([
    headerAsset,
    pageData.background,
    `/assets/illustrator-text/${page}-text.png`,
  ]);
  const preloadLimit = initialArtboardLimit(pageData.artboard);

  for (const item of pageData.media || []) {
    if (!isRenderedMedia(item, pageData.artboard)) continue;
    const override = exactMediaOverrides[page]?.[item.id];
    if (override?.hidden) continue;
    const bounds = override || item.bounds || {};
    if (Number(bounds.y || 0) > preloadLimit) continue;
    assets.add(mediaAsset(item, override?.src || item.src));
  }

  for (const overlay of exactOverlays[page] || []) {
    if (Number(overlay.y || 0) <= preloadLimit) assets.add(overlay.src);
  }

  return [...assets].filter(Boolean);
}

function preloadImage(src) {
  if (imagePreloads.has(src)) return imagePreloads.get(src);

  const preload = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      if (image.decode) await image.decode().catch(() => {});
      resolve(src);
    };
    image.onerror = () => reject(new Error(`Unable to preload ${src}`));
    image.src = src;
  }).catch((error) => {
    imagePreloads.delete(src);
    throw error;
  });

  imagePreloads.set(src, preload);
  return preload;
}

function preloadPage(page) {
  return Promise.all(criticalPageAssets(page).map(preloadImage));
}

export default function App() {
  const [page, setPage] = useState(getPageFromLocation);
  const [isNavigating, setIsNavigating] = useState(false);
  const pageRef = useRef(page);
  const navigationRequest = useRef(0);
  pageRef.current = page;

  async function showPage(nextPage) {
    const normalizedPage = pagePaths[nextPage] ? nextPage : "home";
    const request = navigationRequest.current + 1;
    navigationRequest.current = request;
    if (normalizedPage === pageRef.current) {
      setIsNavigating(false);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    setIsNavigating(true);

    await preloadPage(normalizedPage).catch(() => {});
    if (request !== navigationRequest.current) return;

    startTransition(() => {
      pageRef.current = normalizedPage;
      setPage(normalizedPage);
      setIsNavigating(false);
    });
  }

  useEffect(() => {
    const onLocationChange = () => {
      void showPage(getPageFromLocation());
    };

    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);

  const navigate = (nextPage) => {
    const normalizedPage = pagePaths[nextPage] ? nextPage : "home";
    const nextPath = pagePaths[normalizedPage];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    void showPage(normalizedPage);
  };

  const prefetch = (nextPage) => {
    const normalizedPage = pagePaths[nextPage] ? nextPage : "home";
    if (normalizedPage !== pageRef.current) void preloadPage(normalizedPage).catch(() => {});
  };

  return (
    <div className="site-app" data-active-page={page} aria-busy={isNavigating}>
      <ExactIllustratorPage key={page} page={page} onNavigate={navigate} onPrefetch={prefetch} />
    </div>
  );
}
