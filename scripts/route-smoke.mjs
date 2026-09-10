import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(root, "dist");
const port = 4187;
const debugPort = 9347;
const baseUrl = `http://127.0.0.1:${port}`;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttc": "font/collection",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  if (process.platform === "darwin") {
    const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
    const versions = await readdir(cache).catch(() => []);
    versions
      .filter((entry) => entry.startsWith("chromium-"))
      .sort()
      .reverse()
      .forEach((entry) => candidates.push(path.join(cache, entry, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")));
  }

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Chrome executable not found. Set CHROME_PATH to run route:smoke.");
}

async function waitFor(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", baseUrl);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const requestedPath = pathname === "/" ? "/index.html" : pathname;
      const hasExtension = Boolean(path.extname(requestedPath));
      const candidate = path.resolve(distRoot, `.${requestedPath}`);

      if (!candidate.startsWith(distRoot)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      let filePath = candidate;
      let body;
      try {
        body = await readFile(filePath);
      } catch (error) {
        if (hasExtension) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        filePath = path.join(distRoot, "index.html");
        body = await readFile(filePath);
      }

      response.setHeader("Content-Type", contentTypes[path.extname(filePath)] || "application/octet-stream");
      response.end(body);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message || "Server error");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function cdpConnect() {
  await waitFor(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chrome page target found");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      events.push(message);
    }
  });

  function send(method, params = {}) {
    id += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  return { socket, send, events };
}

async function main() {
  const chrome = await chromeExecutable();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "meezan-route-smoke-"));
  const server = await startStaticServer();

  const browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `${baseUrl}/`,
  ], { stdio: "ignore", windowsHide: true });

  try {
    await waitFor(`${baseUrl}/`);
    const { socket, send, events } = await cdpConnect();
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Log.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });

    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
      return result.result.value;
    }

    async function go(pathname) {
      await send("Page.navigate", { url: `${baseUrl}${pathname}` });
      await wait(250);
      const ready = await evaluate(`Promise.race([
        (async () => {
          await document.fonts.ready;
          const images = [...document.images].filter((image) => {
            if (image.loading !== 'lazy') return true;
            const rect = image.getBoundingClientRect();
            return rect.bottom >= -1000 && rect.top <= window.innerHeight + 1000;
          });
          await Promise.all(images.map(async (image) => {
            if (!image.complete) {
              await new Promise((resolve, reject) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', () => reject(new Error(image.currentSrc || image.src)), { once: true });
              });
            }
            if (image.decode) await image.decode().catch(() => {});
          }));
          return {
            ok: true,
            broken: images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
          };
        })(),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, broken: [], reason: 'asset readiness timeout' }), 15000)),
      ])`);
      if (!ready.ok) throw new Error(`${pathname}: ${ready.reason}`);
      if (ready.broken.length) throw new Error(`${pathname}: broken images ${ready.broken.join(", ")}`);
    }

    async function waitForSpaPath(expectedPath) {
      const expectedPage = expectedPath === "/" ? "home" : expectedPath.replace(/^\//, "");
      const ready = await evaluate(`new Promise((resolve) => {
        const deadline = Date.now() + 30000;
        const check = () => {
          const app = document.querySelector('.site-app');
          const state = {
            path: window.location.pathname,
            page: app?.dataset.activePage,
            busy: app?.getAttribute('aria-busy'),
          };
          if (state.path === ${JSON.stringify(expectedPath)} && state.page === ${JSON.stringify(expectedPage)} && state.busy !== 'true') {
            resolve({ ok: true, ...state });
            return;
          }
          if (Date.now() >= deadline) {
            resolve({ ok: false, ...state });
            return;
          }
          setTimeout(check, 50);
        };
        check();
      })`);
      if (!ready.ok) throw new Error(`SPA navigation timeout for ${expectedPath}: ${JSON.stringify(ready)}`);
      return ready;
    }

    async function clickAndAssert(selectorExpression, expectedPath) {
      await go("/");
      const clicked = await evaluate(`(() => { const el = ${selectorExpression}; if (!el) return false; el.click(); return true; })()`);
      if (!clicked) throw new Error(`Missing clickable target for ${expectedPath}`);
      const { path } = await waitForSpaPath(expectedPath);
      if (path !== expectedPath) throw new Error(`Expected ${expectedPath}, got ${path}`);
      return { expectedPath, path };
    }

    async function clickPointAndAssert(fromPath, x, y, expectedPath) {
      await go(fromPath);
      const target = await evaluate(`(() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return null;
        const result = { label: el.getAttribute('aria-label') || el.textContent.trim(), tag: el.tagName };
        el.click();
        return result;
      })()`);
      if (!target) throw new Error(`Missing clickable target at ${x},${y} on ${fromPath}`);
      const { path } = await waitForSpaPath(expectedPath);
      if (path !== expectedPath) throw new Error(`Click at ${x},${y} on ${fromPath} hit ${target.label || target.tag}: expected ${expectedPath}, got ${path}`);
      return { expectedPath: `${fromPath} @ ${x},${y}`, path };
    }

    const results = [];
    results.push(await clickAndAssert("document.querySelector('.exact-header-logo')", "/"));
    results.push(await clickAndAssert("[...document.querySelectorAll('.exact-header-link')].find((el) => el.textContent.trim() === 'NOS CHAMBRES')", "/chambres"));
    results.push(await clickAndAssert("[...document.querySelectorAll('.exact-header-link')].find((el) => el.textContent.trim() === 'GALLERIE')", "/galerie"));
    results.push(await clickAndAssert("[...document.querySelectorAll('.exact-header-link')].find((el) => el.textContent.trim() === 'EXPÉRIENCES')", "/experiences"));
    results.push(await clickAndAssert("[...document.querySelectorAll('.exact-header-link')].find((el) => el.textContent.trim() === 'BLOG')", "/blog"));
    results.push(await clickAndAssert("document.querySelector('.exact-header-book')", "/reservation"));
    results.push(await clickAndAssert("[...document.querySelectorAll('.exact-text-action')].find((el) => el.getAttribute('aria-label') === 'Explorer les espaces')", "/chambres"));

    await go("/chambres");
    await evaluate("window.__meezaneSpaMarker = 'chambres-to-blog'");
    const blogClicked = await evaluate(`(() => {
      const link = [...document.querySelectorAll('.exact-header-link')].find((el) => el.textContent.trim() === 'BLOG');
      if (!link) return false;
      link.click();
      return true;
    })()`);
    if (!blogClicked) throw new Error("Missing Blog link for SPA regression");
    await waitForSpaPath("/blog");
    const spaBlog = await evaluate(`(() => {
      const image = document.querySelector('.illustrator-text-vector-layer');
      const canvas = document.querySelector('.exact-canvas');
      const title = document.querySelector('[data-source-text-id="text-21"]');
      const subtitle = document.querySelector('[data-source-text-id="text-20"]');
      const active = document.querySelector('.exact-header-link.is-active');
      return {
        path: window.location.pathname,
        marker: window.__meezaneSpaMarker,
        imagePage: image?.dataset.illustratorTextPage,
        imageSrc: image?.getAttribute('src'),
        canvasHeight: canvas?.getBoundingClientRect().height,
        title: title?.textContent.trim(),
        subtitle: subtitle?.textContent.trim(),
        active: active?.textContent.trim(),
        documentTitle: document.title,
      };
    })()`);
    if (spaBlog.path !== "/blog") throw new Error(`SPA Blog path failed: ${spaBlog.path}`);
    if (spaBlog.marker !== "chambres-to-blog") throw new Error("Chambres to Blog caused a document reload");
    if (spaBlog.imagePage !== "blog" || spaBlog.imageSrc !== "/assets/illustrator-text/blog-text.svg") {
      throw new Error(`SPA Blog kept the wrong text vector: ${JSON.stringify(spaBlog)}`);
    }
    if (Math.abs(spaBlog.canvasHeight - 9235) > 0.1) throw new Error(`SPA Blog kept the wrong artboard: ${spaBlog.canvasHeight}`);
    if (spaBlog.title !== "Blog") throw new Error(`SPA Blog title content failed: ${spaBlog.title}`);
    if (spaBlog.subtitle !== "Actualités, inspirations et art de vivre.") throw new Error(`SPA Blog subtitle content failed: ${spaBlog.subtitle}`);
    if (spaBlog.active !== "BLOG" || spaBlog.documentTitle !== "Blog Meezane | Inspirations et art de vivre") {
      throw new Error(`SPA Blog metadata failed: ${JSON.stringify(spaBlog)}`);
    }
    results.push({ expectedPath: "/chambres -> /blog SPA content", path: "blog vector + selectable copy" });

    await evaluate(`(() => {
      window.getSelection()?.removeAllRanges();
      const input = document.createElement('input');
      input.dataset.selectionProbe = 'true';
      input.value = 'native select all';
      document.body.append(input);
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
    })()`);
    const selectAllModifiers = process.platform === "darwin" ? 4 : 2;
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: selectAllModifiers,
      commands: ["SelectAll"],
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: selectAllModifiers,
    });
    const selectionState = await evaluate(`(() => {
      const article = document.querySelector('.seo-article');
      const header = document.querySelector('.exact-header-overlay');
       const root = document.querySelector('.selectable-text-root');
       const canvas = document.querySelector('.exact-canvas');
       const vector = document.querySelector('.illustrator-text-vector-layer');
       const selectable = root.querySelector('.selectable-text-layer');
       const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
      const expectedText = normalize(root.textContent);
      const selectedText = normalize(selection?.toString());
       const selectionForeground = getComputedStyle(selectable, '::selection').color;
      const canvasRect = canvas.getBoundingClientRect();
      const canvasSizedRects = range ? [...range.getClientRects()].filter((rect) => (
        Math.abs(rect.width - canvasRect.width) < 1
        && Math.abs(rect.height - canvasRect.height) < 1
      )).length : -1;
      const selectedOutsideRoot = [...canvas.children]
        .filter((node) => node !== root && selection?.containsNode(node, true))
        .map((node) => node.tagName + '.' + node.className);
      const state = {
        articleUserSelect: getComputedStyle(article).userSelect,
        headerUserSelect: getComputedStyle(header).userSelect,
        selectedText,
         selectionForeground,
         selectableZIndex: Number(getComputedStyle(root).zIndex),
         vectorZIndex: Number(getComputedStyle(vector).zIndex),
        transparentSelectionForeground: selectionForeground === 'transparent' || selectionForeground === 'rgba(0, 0, 0, 0)',
        exactText: selectedText === expectedText,
        exactBoundaries: Boolean(range)
          && range.startContainer === root
          && range.startOffset === 0
          && range.endContainer === root
          && range.endOffset === root.childNodes.length,
        selectedOutsideRoot,
        canvasSizedRects,
      };
      selection?.removeAllRanges();
      return state;
    })()`);
    if (selectionState.articleUserSelect !== "none" || selectionState.headerUserSelect !== "none") {
      throw new Error(`Ghost text can still be selected: ${JSON.stringify(selectionState)}`);
    }
    if (!selectionState.exactText || !selectionState.exactBoundaries || selectionState.selectedOutsideRoot.length || selectionState.canvasSizedRects !== 0) {
      throw new Error(`Ctrl+A escaped the visible-text scope: ${JSON.stringify(selectionState)}`);
    }
     if (!selectionState.transparentSelectionForeground) {
       throw new Error(`Selection repaints HTML glyphs over Illustrator typography: ${JSON.stringify(selectionState)}`);
     }
     if (!(selectionState.selectableZIndex < selectionState.vectorZIndex)) {
       throw new Error(`Selection highlight is not behind Illustrator typography: ${JSON.stringify(selectionState)}`);
     }
    results.push({ expectedPath: "/blog Ctrl+A", path: "exact range and highlight without repainting Illustrator glyphs" });

    await evaluate(`(() => {
      const input = document.querySelector('[data-selection-probe]');
      input.focus();
      input.setSelectionRange(6, 6);
    })()`);
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: selectAllModifiers,
      commands: ["SelectAll"],
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: selectAllModifiers,
    });
    const nativeInputSelection = await evaluate(`(() => {
      const input = document.querySelector('[data-selection-probe]');
      const result = {
        start: input.selectionStart,
        end: input.selectionEnd,
        length: input.value.length,
      };
      input.remove();
      return result;
    })()`);
    if (nativeInputSelection.start !== 0 || nativeInputSelection.end !== nativeInputSelection.length) {
      throw new Error(`Ctrl+A broke native input selection: ${JSON.stringify(nativeInputSelection)}`);
    }
    results.push({ expectedPath: "/blog input Ctrl+A", path: "native editable-control selection preserved" });

    for (const route of ["/", "/experiences", "/reservation", "/blog", "/chambres", "/galerie"]) {
      await go(route);
      const dragProbe = await evaluate(`(async () => {
        window.getSelection()?.removeAllRanges();
        const candidates = [...document.querySelectorAll('.selectable-text-layer')]
          .filter((element) => element.textContent.trim().length >= 20)
          .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
        const target = candidates.find((element) => {
          element.scrollIntoView({ block: 'center' });
          const rect = element.getBoundingClientRect();
          const x = Math.max(rect.left + 2, Math.min(rect.right - 2, rect.left + rect.width / 2));
          const y = Math.max(rect.top + 2, Math.min(rect.bottom - 2, rect.top + Math.min(rect.height / 2, parseFloat(getComputedStyle(element).fontSize))));
          return document.elementFromPoint(x, y) === element;
        });
        if (!target) return { error: 'no unobstructed selectable text' };
        target.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = target.getBoundingClientRect();
        const y = Math.max(rect.top + 2, Math.min(rect.bottom - 2, rect.top + Math.min(rect.height / 2, parseFloat(getComputedStyle(target).fontSize))));
        return {
          id: target.dataset.textId,
          startX: rect.left + Math.max(2, rect.width * 0.15),
          endX: rect.left + Math.min(rect.width - 2, rect.width * 0.85),
          y,
        };
      })()`);
      if (dragProbe.error) throw new Error(`${route}: ${dragProbe.error}`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragProbe.startX, y: dragProbe.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: dragProbe.startX, y: dragProbe.y, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragProbe.endX, y: dragProbe.y, button: "left", buttons: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragProbe.endX, y: dragProbe.y, button: "left", buttons: 0, clickCount: 1 });
      const dragSelection = await evaluate(`(() => {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const root = document.querySelector('.selectable-text-root');
        const state = {
          text: selection?.toString() || '',
          insideRoot: Boolean(range && root?.contains(range.startContainer) && root.contains(range.endContainer)),
        };
        selection?.removeAllRanges();
        return state;
      })()`);
      if (!dragSelection.insideRoot || !dragSelection.text.trim()) {
        throw new Error(`${route}: pointer text selection failed for ${dragProbe.id}: ${JSON.stringify(dragSelection)}`);
      }
    }
    results.push({ expectedPath: "6 routes pointer selection", path: "mouse drag selects Illustrator-backed text" });

    for (const route of ["/", "/experiences", "/reservation", "/blog", "/chambres", "/galerie"]) {
      await go(route);
      await evaluate(`(() => {
        window.getSelection()?.removeAllRanges();
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
      })()`);
      await send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: selectAllModifiers,
        commands: ["SelectAll"],
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: selectAllModifiers,
      });
      const allTextSelection = await evaluate(`(() => {
        const root = document.querySelector('.selectable-text-root');
        const layers = [...root.querySelectorAll('.selectable-text-layer')];
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
        const selectedText = normalize(selection?.toString());
        const expectedText = normalize(root.textContent);
        const compact = (text) => text.replace(/\\s+/g, '');
        let mismatch = 0;
        while (mismatch < selectedText.length && mismatch < expectedText.length && selectedText[mismatch] === expectedText[mismatch]) mismatch += 1;
        const state = {
          rootHidden: root.hasAttribute('aria-hidden'),
          complete: compact(selectedText) === compact(expectedText),
          selectedLength: selectedText.length,
          expectedLength: expectedText.length,
          selectedMismatch: selectedText.slice(Math.max(0, mismatch - 30), mismatch + 70),
          expectedMismatch: expectedText.slice(Math.max(0, mismatch - 30), mismatch + 70),
          exactBoundaries: Boolean(range)
            && range.startContainer === root
            && range.startOffset === 0
            && range.endContainer === root
            && range.endOffset === root.childNodes.length,
          invalidLayers: layers.filter((layer) => {
            const rect = layer.getBoundingClientRect();
            return getComputedStyle(layer).userSelect !== 'text' || rect.width <= 0 || rect.height <= 0;
          }).map((layer) => layer.dataset.textId),
        };
        selection?.removeAllRanges();
        return state;
      })()`);
      if (allTextSelection.rootHidden || !allTextSelection.complete || !allTextSelection.exactBoundaries || allTextSelection.invalidLayers.length) {
        throw new Error(`${route}: not all Illustrator text is selectable: ${JSON.stringify(allTextSelection)}`);
      }
    }
    results.push({ expectedPath: "6 routes Ctrl+A", path: "all Illustrator-backed text selected" });

    for (const route of ["/", "/experiences", "/reservation", "/blog", "/chambres", "/galerie"]) {
      await go(route);
      const header = await evaluate(`(() => {
        const image = document.querySelector('.exact-canonical-header');
        const links = [...document.querySelectorAll('.exact-header-link')].map((el) => {
          const rect = el.getBoundingClientRect();
          return { label: el.textContent.trim(), left: rect.left, right: rect.right };
        }).sort((a, b) => a.left - b.left);
        const overlaps = links.slice(1).filter((link, index) => links[index].right > link.left + 0.1);
        if (!image) return { error: 'missing canonical header' };
        const rect = image.getBoundingClientRect();
        return {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          width: rect.width,
          height: rect.height,
          overlaps,
        };
      })()`);
      if (header.error) throw new Error(`${route}: ${header.error}`);
      if (header.naturalWidth !== 1920 || header.naturalHeight !== 189) throw new Error(`${route}: wrong canonical header asset ${header.naturalWidth}x${header.naturalHeight}`);
      if (Math.abs(header.width - 1920) > 0.1 || Math.abs(header.height - 189) > 0.1) throw new Error(`${route}: wrong rendered header size ${header.width}x${header.height}`);
      if (header.overlaps.length) throw new Error(`${route}: overlapping header links ${JSON.stringify(header.overlaps)}`);
      results.push({ expectedPath: `${route} canonical header`, path: "1920x189" });
    }

    results.push(await clickPointAndAssert("/chambres", 1095, 95, "/experiences"));
    results.push(await clickPointAndAssert("/blog", 830, 95, "/chambres"));
    results.push(await clickPointAndAssert("/reservation", 1025, 95, "/galerie"));

    await go("/");
    const homeGalleryArrow = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-arrow-hotspot')].find((el) => el.getAttribute('aria-label') === 'Galerie suivante');
      if (!next) return 'missing home gallery next';
      const initialSprites = [...document.querySelectorAll('.exact-arrow-sprite')].filter((el) => el.src.includes('arrow-filled-'));
      if (initialSprites.length !== 2) return 'home gallery arrows missing initially: ' + initialSprites.length;
      const initialRects = initialSprites.map((el) => el.getBoundingClientRect());
      if (initialSprites.some((el) => el.naturalWidth !== 42 || el.naturalHeight !== 42)) return 'home gallery arrow asset failed';
      if (Math.abs(initialRects[0].left - 318) > 0.1 || Math.abs(initialRects[0].top - 9202) > 0.1) return 'left home gallery arrow misplaced';
      if (Math.abs(initialRects[1].left - 1578) > 0.1 || Math.abs(initialRects[1].top - 9202) > 0.1) return 'right home gallery arrow misplaced';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const filledSprites = [...document.querySelectorAll('.exact-arrow-sprite')].filter((el) => el.src.includes('arrow-filled-'));
      if (document.querySelectorAll('.editable-media-layer.is-carousel-active').length < 3) return 'home gallery did not activate';
      if (filledSprites.length !== 2) return 'home gallery duplicated arrow sprites: ' + filledSprites.length;
      const gallerySources = [...document.querySelectorAll('.editable-media-layer.is-carousel-active')]
        .slice(0, 3)
        .map((image) => image.getAttribute('src'));
      if (gallerySources.some((src) => /home-media-0[46]-exact/.test(src))) return 'home gallery mixed unrelated media: ' + gallerySources.join(',');
      return 'ok';
    })()`);
    if (homeGalleryArrow !== "ok") throw new Error(`Home gallery arrow failed: ${homeGalleryArrow}`);
    results.push({ expectedPath: "/ home gallery arrow", path: "interactive" });

    const homeImageArrowVisual = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-arrow-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!next) return 'missing home image next';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const rect = next.getBoundingClientRect();
      const before = getComputedStyle(next, '::before');
      const leftSprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-light-left-exact.png'));
      const rightSprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-light-right-exact.png'));
      const leftRect = leftSprite?.getBoundingClientRect();
      const rightRect = rightSprite?.getBoundingClientRect();
      if (!next.classList.contains('is-carousel-active')) return 'home image arrow did not activate';
      if (before.content && !['none', 'normal', '""'].includes(before.content)) return 'home image still uses pseudo arrow: ' + before.content;
      if (!leftSprite || !rightSprite) return 'missing exact home image arrow sprites';
      if (!(rightRect.width > 0 && rightRect.width < rect.width * 0.65)) return 'home image arrow sprite wrong size: ' + rightRect.width + '/' + rect.width;
      if (Math.abs(leftRect.left - 977) > 0.1 || Math.abs(leftRect.top - 11078) > 0.1) return 'left home image arrow misplaced: ' + leftRect.left + ',' + leftRect.top;
      if (Math.abs(rightRect.left - 1515) > 0.1 || Math.abs(rightRect.top - 11078) > 0.1) return 'right home image arrow misplaced: ' + rightRect.left + ',' + rightRect.top;
      return 'ok';
    })()`);
    if (homeImageArrowVisual !== "ok") throw new Error(`Home image arrow visual failed: ${homeImageArrowVisual}`);
    results.push({ expectedPath: "/ home image arrow exact crop", path: "adobe-crop" });

    await go("/");
    const balanceState = await evaluate(`(async () => {
      const mask = document.querySelector('.home-balance-copy-mask');
      const rubrics = [...document.querySelectorAll('.selectable-text-layer.is-home-balance-rubric')];
      const copyArea = document.querySelector('.home-balance-hit-area.is-copy-area');
      const vector = document.querySelector('.illustrator-text-vector-layer');
      const copy = document.querySelector('.selectable-text-layer[data-text-id="text-05"]');
      if (!mask || rubrics.length !== 5 || copyArea || !vector || !copy) return { error: 'invalid balance interaction structure' };
      if (mask.naturalWidth !== 320 || vector.naturalWidth !== 1920) return { error: 'balance visual assets did not load' };
      if (getComputedStyle(mask).opacity !== '1') return { error: 'balance copy visible initially' };
      window.scrollTo(0, 4400);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const rubricRect = rubrics[0].getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      return {
        rubricX: rubricRect.left + rubricRect.width / 2,
        rubricY: rubricRect.top + rubricRect.height / 2,
        copyX: copyRect.left + copyRect.width / 2,
        copyY: copyRect.top + copyRect.height / 2,
        rubricOnTop: document.elementFromPoint(rubricRect.left + rubricRect.width / 2, rubricRect.top + rubricRect.height / 2) === rubrics[0],
      };
    })()`);
    if (balanceState.error || !balanceState.rubricOnTop) throw new Error(`Home balance setup failed: ${JSON.stringify(balanceState)}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: balanceState.rubricX, y: balanceState.rubricY });
    await wait(180);
    const rubricOpacity = await evaluate("getComputedStyle(document.querySelector('.home-balance-copy-mask')).opacity");
    if (rubricOpacity !== "0") throw new Error(`Home balance copy did not reveal from source rubric: ${rubricOpacity}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: balanceState.copyX, y: balanceState.copyY });
    await wait(180);
    const copyOpacity = await evaluate("getComputedStyle(document.querySelector('.home-balance-copy-mask')).opacity");
    if (copyOpacity !== "1") throw new Error(`Home balance copy area incorrectly acts as a hover trigger: ${copyOpacity}`);

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await go("/");
    const mobileBalanceOpacity = await evaluate("getComputedStyle(document.querySelector('.home-balance-copy-mask')).opacity");
    if (mobileBalanceOpacity !== "0") throw new Error(`Home balance copy remains hidden without hover on touch: ${mobileBalanceOpacity}`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });

    const homeInteractions = await evaluate(`(async () => {
      const checkIn = document.querySelector('[aria-label="Choisir la date d\\'arrivee"]');
      if (!checkIn) return 'missing Home check-in';
      if (document.querySelector('.home-live-picker')) return 'Home picker visible before click';
      checkIn.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const picker = document.querySelector('.home-live-picker');
      if (!picker) return 'missing Home picker';
      const firstMonth = picker.querySelector('.reservation-live-month');
      const day27 = [...firstMonth.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '27');
      if (!day27) return 'missing Home day 27';
      day27.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const day30 = [...firstMonth.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '30');
      if (!day30) return 'missing Home day 30';
      day30.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (document.querySelector('.home-live-picker')) return 'Home picker did not close';
      const values = [...document.querySelectorAll('.home-booking-value')].map((el) => el.textContent.trim()).join('|');
      if (values !== '27/Juin|30/Juin|03') return 'Home dates did not update: ' + values;
      return 'ok';
    })()`);
    if (homeInteractions !== "ok") throw new Error(`Home interactions failed: ${homeInteractions}`);
    results.push({ expectedPath: "/ Home feedback interactions", path: "source-text hover + calendar" });

    await go("/chambres");
    const chambresArrow = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!next) return 'missing chambres next';
      const initialSprites = [...next.parentElement.querySelectorAll('.exact-arrow-sprite')];
      if (initialSprites.length !== 2 || initialSprites.some((image) => image.naturalWidth !== 42 || image.naturalHeight !== 42)) return 'missing initial chambres arrow sprites';
      const nextRect = next.getBoundingClientRect();
      const initialRightRect = initialSprites[1].getBoundingClientRect();
      if (Math.abs((nextRect.left + nextRect.width / 2) - (initialRightRect.left + initialRightRect.width / 2)) > 0.1 || Math.abs((nextRect.top + nextRect.height / 2) - (initialRightRect.top + initialRightRect.height / 2)) > 0.1) return 'initial chambres arrow sprite misplaced';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const sprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-filled-right-exact.png'));
      if (!document.querySelector('.editable-media-layer.is-carousel-active')) return 'chambres carousel did not activate';
      if (!sprite) return 'missing exact chambres arrow sprite';
      if (next.parentElement.querySelectorAll('.exact-arrow-sprite').length !== 2) return 'chambres carousel duplicated arrow sprites';
      return 'ok';
    })()`);
    if (chambresArrow !== "ok") throw new Error(`Chambres arrow failed: ${chambresArrow}`);
    results.push({ expectedPath: "/chambres arrows", path: "interactive" });

    await go("/galerie");
    const galerieArrow = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!next) return 'missing galerie next';
      const initialSprites = [...next.parentElement.querySelectorAll('.exact-arrow-sprite')];
      if (initialSprites.length !== 2 || initialSprites.some((image) => image.naturalWidth !== 42 || image.naturalHeight !== 42)) return 'missing initial galerie arrow sprites';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const sprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-filled-right-exact.png'));
      if (!document.querySelector('.editable-media-layer.is-carousel-active')) return 'galerie carousel did not activate';
      if (!sprite) return 'missing exact galerie arrow sprite';
      if (next.parentElement.querySelectorAll('.exact-arrow-sprite').length !== 2) return 'galerie carousel duplicated arrow sprites';
      return 'ok';
    })()`);
    if (galerieArrow !== "ok") throw new Error(`Galerie arrow failed: ${galerieArrow}`);
    results.push({ expectedPath: "/galerie arrows", path: "interactive" });

    const heroScrollArrow = await evaluate(`(async () => {
      window.scrollTo(0, 0);
      const down = [...document.querySelectorAll('.exact-arrow-hotspot')].find((el) => el.getAttribute('aria-label') === 'Defiler vers la galerie');
      if (!down) return 'missing hero scroll';
      down.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      return window.scrollY > 100 ? 'ok' : 'hero scroll did not move: ' + window.scrollY;
    })()`);
    if (heroScrollArrow !== "ok") throw new Error(`Hero scroll arrow failed: ${heroScrollArrow}`);
    results.push({ expectedPath: "/galerie hero arrow", path: "scrolls" });

    await go("/reservation");
    const reservationInitialCalendar = await evaluate(`(() => ({
      livePickerVisible: Boolean(document.querySelector('.reservation-live-picker')),
      staticCalendarVisible: [...document.images].some((image) => image.src.includes('reservation-calendar-exact.png')),
      closedMaskReady: (() => {
        const mask = document.querySelector('.reservation-calendar-closed-mask');
        return Boolean(mask?.complete && mask.naturalWidth === 775 && mask.naturalHeight === 413);
      })(),
    }))()`);
    if (reservationInitialCalendar.livePickerVisible || reservationInitialCalendar.staticCalendarVisible || !reservationInitialCalendar.closedMaskReady) {
      throw new Error(`Reservation calendar visible before click: ${JSON.stringify(reservationInitialCalendar)}`);
    }
    results.push({ expectedPath: "/reservation calendar initially hidden", path: "hidden until date-field click" });

    const carouselChanged = await evaluate(`(async () => {
      const image = [...document.querySelectorAll('.editable-media-layer')].find((el) => el.src.includes('reservation-media-03-exact'));
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!image || !next) return false;
      const initialSprites = [...next.parentElement.querySelectorAll('.exact-arrow-sprite')];
      if (initialSprites.length !== 2 || initialSprites.some((sprite) => sprite.naturalWidth !== 42 || sprite.naturalHeight !== 42)) return false;
      const before = image.src;
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      return image.src !== before;
    })()`);
    if (!carouselChanged) throw new Error("Reservation carousel arrow did not change image");
    results.push({ expectedPath: "/reservation carousel", path: "changed" });

    const reservationControlsWork = await evaluate(`(async () => {
      const initialDates = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      const initialPrice = document.querySelector('.reservation-live-price')?.textContent.trim();
      if (!initialDates.includes('03/07/2026') || !initialDates.includes('07/07/2026')) return 'wrong initial dates: ' + initialDates;
      if (initialPrice !== '3600') return 'wrong initial price: ' + initialPrice;
      const checkIn = document.querySelector('[aria-label="Choisir la date d\\'arrivee"]');
      if (!checkIn) return 'missing checkin';
      checkIn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!document.querySelector('.reservation-live-picker')) return 'missing picker';
      if (!document.querySelector('.reservation-calendar-closed-mask')) return 'source calendar mask missing under picker';
      const day20 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '20');
      if (!day20) return 'missing day';
      day20.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!document.querySelector('.reservation-live-picker')) return 'picker closed too early';
      const day23 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '23');
      if (!day23) return 'missing checkout day';
      day23.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (document.querySelector('.reservation-live-picker')) return 'picker did not close after checkout';
      if (!document.querySelector('.reservation-calendar-closed-mask')) return 'closed-state mask did not return';
      const dateText = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      if (!dateText.includes('20/07/2026') || !dateText.includes('23/07/2026')) return 'date not updated: ' + dateText;
      const priceText = document.querySelector('.reservation-live-price')?.textContent.trim();
      if (priceText !== '2700') return 'price not updated: ' + priceText;
      const adultsHit = document.querySelector('[aria-label="Changer le nombre d\\'adultes"]');
      if (!adultsHit) return 'missing adults';
      adultsHit.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const plus = [...document.querySelectorAll('.reservation-adults-popover button')].find((el) => el.textContent.trim() === '+');
      if (!plus) return 'missing plus';
      plus.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (document.querySelector('.reservation-adults-popover')) return 'adults popover did not close';
      const adultsValue = document.querySelector('.reservation-live-adults')?.textContent.trim();
      if (adultsValue !== '2') return 'adults not updated: ' + adultsValue;

      checkIn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const day12 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '12');
      if (!day12) return 'missing day 12';
      day12.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const day14 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '14');
      if (!day14) return 'missing day 14';
      day14.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const shortRange = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      if (!shortRange.includes('12/07/2026') || !shortRange.includes('14/07/2026')) return 'short range not updated: ' + shortRange;
      const shortPrice = document.querySelector('.reservation-live-price')?.textContent.trim();
      if (shortPrice !== '1800') return 'short range price not updated: ' + shortPrice;

      document.querySelector('[aria-label="Choisir la date de depart"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const disabledStart = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '12');
      if (!disabledStart?.disabled) return 'checkout start date is not disabled';
      disabledStart.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const stableRange = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      if (!stableRange.includes('12/07/2026') || !stableRange.includes('14/07/2026')) return 'invalid checkout mutated range: ' + stableRange;

      checkIn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const day22 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '22');
      if (!day22) return 'missing day 22';
      day22.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const day26 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '26');
      if (!day26) return 'missing day 26';
      day26.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (document.querySelector('.reservation-live-picker')) return '22-26 picker did not close';
      const finalRange = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      if (!finalRange.includes('22/07/2026') || !finalRange.includes('26/07/2026')) return '22-26 range not reflected: ' + finalRange;
      const finalPrice = document.querySelector('.reservation-live-price')?.textContent.trim();
      if (finalPrice !== '3600') return '22-26 price not updated: ' + finalPrice;
      return 'ok';
    })()`);
    if (reservationControlsWork !== "ok") throw new Error(`Reservation controls failed: ${reservationControlsWork}`);
    results.push({ expectedPath: "/reservation controls", path: "interactive" });

    const responsiveViewports = [
      { label: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "tablet-768", width: 768, height: 1024, deviceScaleFactor: 2, mobile: false },
      { label: "client-730", width: 730, height: 1024, deviceScaleFactor: 2, mobile: false },
      { label: "mobile-390", width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
    ];
    const routePaths = ["/", "/experiences", "/reservation", "/blog", "/chambres", "/galerie"];
    for (const viewport of responsiveViewports) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.mobile,
      });
      for (const route of routePaths) {
        await go(route);
        const layout = await evaluate(`(() => {
          const canvas = document.querySelector('.exact-canvas');
          const responsivePage = document.querySelector('.responsive-page');
          const header = document.querySelector('.exact-header-overlay');
          const mobileHeader = document.querySelector('.mobile-exact-header');
          const canvasRect = canvas?.getBoundingClientRect();
          const mobileHeaderVisible = mobileHeader && getComputedStyle(mobileHeader).display !== 'none';
          const headerRect = header?.getBoundingClientRect();
          const densityDeficits = [...document.querySelectorAll('.editable-background-layer, .editable-media-layer, .editable-exact-overlay-layer')]
            .filter((image) => image.complete && image.naturalWidth > 0)
            .map((image) => {
              const rect = image.getBoundingClientRect();
              return {
                src: image.getAttribute('src'),
                requiredWidth: rect.width * devicePixelRatio,
                naturalWidth: image.naturalWidth,
              };
            })
            .filter((image) => image.naturalWidth + 1 < image.requiredWidth);
          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            canvasWidth: canvasRect?.width || 0,
            canvasHeight: canvasRect?.height || 0,
            responsivePagePresent: Boolean(responsivePage),
            headerLeft: headerRect?.left || 0,
            headerRight: headerRect?.right || 0,
            mobileHeaderVisible,
            brokenImages: [...document.images].filter((image) => image.loading !== 'lazy' && image.complete && image.naturalWidth === 0).length,
            deferredExactMedia: [...document.querySelectorAll('.editable-media-layer')].filter((image) => image.loading !== 'eager').length,
            densityDeficits,
          };
        })()`);
        if (layout.scrollWidth > layout.clientWidth + 1) throw new Error(`${viewport.label} ${route}: horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);
        if (!(layout.canvasWidth > 0 && layout.canvasWidth <= layout.clientWidth + 0.1 && layout.canvasHeight > 0)) {
          throw new Error(`${viewport.label} ${route}: invalid canvas ${layout.canvasWidth}x${layout.canvasHeight}`);
        }
        if (layout.responsivePagePresent) throw new Error(`${viewport.label} ${route}: non-Illustrator responsive composition rendered`);
        if (layout.deferredExactMedia) throw new Error(`${viewport.label} ${route}: ${layout.deferredExactMedia} exact media still deferred`);
        if (layout.headerLeft < -0.1 || layout.headerRight > layout.clientWidth + 0.1) throw new Error(`${viewport.label} ${route}: header outside viewport`);
        if (layout.mobileHeaderVisible) throw new Error(`${viewport.label} ${route}: non-Illustrator mobile header rendered`);
        if (layout.brokenImages) throw new Error(`${viewport.label} ${route}: ${layout.brokenImages} broken images`);
        if (layout.densityDeficits.length) throw new Error(`${viewport.label} ${route}: raster density deficit ${JSON.stringify(layout.densityDeficits)}`);
      }
      results.push({ expectedPath: `${viewport.label} exact matrix`, path: "6 Illustrator canvases without overflow, broken assets, or raster upscaling" });
    }

    if (process.env.MEEZAN_CAPTURE_DIR) {
      const capturePages = {
        home: { path: "/", width: 1920, height: 12229 },
        experiences: { path: "/experiences", width: 1920, height: 16004 },
        reservation: { path: "/reservation", width: 1920, height: 4074 },
        blog: { path: "/blog", width: 1920, height: 9235 },
        chambres: { path: "/chambres", width: 1920, height: 11568 },
        galerie: { path: "/galerie", width: 1920, height: 6098 },
      };
      await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const [page, dimensions] of Object.entries(capturePages)) {
        await go(`${dimensions.path}?visual-audit=1`);
        await evaluate(`Promise.all([...document.images].map(async (image) => {
          if (!image.complete) await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', reject, { once: true });
          });
          if (image.decode) await image.decode().catch(() => {});
        }))`);
        const screenshot = await send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height, scale: 1 },
        });
        await writeFile(path.join(process.env.MEEZAN_CAPTURE_DIR, `${page}.png`), Buffer.from(screenshot.data, "base64"));
      }
      results.push({ expectedPath: "desktop captures", path: process.env.MEEZAN_CAPTURE_DIR });
    }

    const runtimeFailures = events.flatMap((event) => {
      if (event.method === "Runtime.exceptionThrown") return [`exception: ${event.params.exceptionDetails?.text || "unknown"}`];
      if (event.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(event.params.type)) {
        return [`console.${event.params.type}: ${event.params.args?.map((arg) => arg.value || arg.description).join(" ")}`];
      }
      if (event.method === "Log.entryAdded" && event.params.entry?.level === "error") return [`log: ${event.params.entry.text}`];
      if (event.method === "Network.loadingFailed" && !event.params.canceled) return [`request failed: ${event.params.errorText}`];
      if (event.method === "Network.responseReceived" && event.params.response?.status >= 400) {
        return [`HTTP ${event.params.response.status}: ${event.params.response.url}`];
      }
      return [];
    });
    if (runtimeFailures.length) throw new Error(`Runtime failures:\n${[...new Set(runtimeFailures)].join("\n")}`);
    results.push({ expectedPath: "runtime diagnostics", path: "no console, exception, network, HTTP, image, or font failures" });

    socket.close();
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    browser.kill();
    await closeServer(server);
    await wait(500);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
