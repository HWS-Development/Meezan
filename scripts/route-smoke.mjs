import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(root, "dist");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 4177;
const debugPort = 9337;
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
          await Promise.all([...document.images].map(async (image) => {
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
            broken: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
          };
        })(),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, broken: [], reason: 'asset readiness timeout' }), 15000)),
      ])`);
      if (!ready.ok) throw new Error(`${pathname}: ${ready.reason}`);
      if (ready.broken.length) throw new Error(`${pathname}: broken images ${ready.broken.join(", ")}`);
    }

    async function clickAndAssert(selectorExpression, expectedPath) {
      await go("/");
      const clicked = await evaluate(`(() => { const el = ${selectorExpression}; if (!el) return false; el.click(); return true; })()`);
      if (!clicked) throw new Error(`Missing clickable target for ${expectedPath}`);
      await wait(500);
      const path = await evaluate("window.location.pathname");
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
      await wait(500);
      const path = await evaluate("window.location.pathname");
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
    await wait(500);
    const spaBlog = await evaluate(`(() => {
      const image = document.querySelector('.illustrator-text-raster-layer');
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
    if (spaBlog.imagePage !== "blog" || spaBlog.imageSrc !== "/assets/illustrator-text/blog-text.png") {
      throw new Error(`SPA Blog kept the wrong text raster: ${JSON.stringify(spaBlog)}`);
    }
    if (Math.abs(spaBlog.canvasHeight - 9235) > 0.1) throw new Error(`SPA Blog kept the wrong artboard: ${spaBlog.canvasHeight}`);
    if (spaBlog.title !== "Blog") throw new Error(`SPA Blog title content failed: ${spaBlog.title}`);
    if (spaBlog.subtitle !== "Actualités, inspirations et art de vivre.") throw new Error(`SPA Blog subtitle content failed: ${spaBlog.subtitle}`);
    if (spaBlog.active !== "BLOG" || spaBlog.documentTitle !== "Blog Meezane | Inspirations et art de vivre") {
      throw new Error(`SPA Blog metadata failed: ${JSON.stringify(spaBlog)}`);
    }
    results.push({ expectedPath: "/chambres -> /blog SPA content", path: "blog raster + editable copy" });

    const selectionState = await evaluate(`(() => {
      const article = document.querySelector('.seo-article');
      const header = document.querySelector('.exact-header-overlay');
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
      document.execCommand('selectAll');
      const selectedText = window.getSelection()?.toString() || '';
      window.getSelection()?.removeAllRanges();
      return {
        articleUserSelect: getComputedStyle(article).userSelect,
        headerUserSelect: getComputedStyle(header).userSelect,
        selectedText,
      };
    })()`);
    if (selectionState.articleUserSelect !== "none" || selectionState.headerUserSelect !== "none") {
      throw new Error(`Ghost text can still be selected: ${JSON.stringify(selectionState)}`);
    }
    if (selectionState.selectedText.includes("Actualités, inspirations et art de vivre.") || selectionState.selectedText.includes("Blog Meezane | Inspirations et art de vivre")) {
      throw new Error(`Ctrl+A selected hidden SEO content: ${selectionState.selectedText.slice(0, 180)}`);
    }
    results.push({ expectedPath: "/blog Ctrl+A", path: "no hidden SEO/header text" });

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
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const filledSprites = [...document.querySelectorAll('.exact-arrow-sprite')].filter((el) => el.src.includes('arrow-filled-'));
      if (document.querySelectorAll('.editable-media-layer.is-carousel-active').length < 3) return 'home gallery did not activate';
      if (filledSprites.length) return 'home gallery added duplicate arrow sprites';
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

    await go("/chambres");
    const chambresArrow = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!next) return 'missing chambres next';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const sprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-filled-right-exact.png'));
      if (!document.querySelector('.editable-media-layer.is-carousel-active')) return 'chambres carousel did not activate';
      if (!sprite) return 'missing exact chambres arrow sprite';
      return 'ok';
    })()`);
    if (chambresArrow !== "ok") throw new Error(`Chambres arrow failed: ${chambresArrow}`);
    results.push({ expectedPath: "/chambres arrows", path: "interactive" });

    await go("/galerie");
    const galerieArrow = await evaluate(`(async () => {
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!next) return 'missing galerie next';
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const sprite = [...document.querySelectorAll('.exact-arrow-sprite')].find((el) => el.src.includes('arrow-filled-right-exact.png'));
      if (!document.querySelector('.editable-media-layer.is-carousel-active')) return 'galerie carousel did not activate';
      if (!sprite) return 'missing exact galerie arrow sprite';
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
    const carouselChanged = await evaluate(`(async () => {
      const image = [...document.querySelectorAll('.editable-media-layer')].find((el) => el.src.includes('reservation-media-03-exact'));
      const next = [...document.querySelectorAll('.exact-carousel-hotspot')].find((el) => el.getAttribute('aria-label') === 'Image suivante');
      if (!image || !next) return false;
      const before = image.src;
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      return image.src !== before;
    })()`);
    if (!carouselChanged) throw new Error("Reservation carousel arrow did not change image");
    results.push({ expectedPath: "/reservation carousel", path: "changed" });

    const reservationControlsWork = await evaluate(`(async () => {
      const checkIn = document.querySelector('[aria-label="Calendrier date d\\'arrivee"]');
      if (!checkIn) return 'missing checkin';
      checkIn.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!document.querySelector('.reservation-live-picker')) return 'missing picker';
      const day20 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '20');
      if (!day20) return 'missing day';
      day20.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!document.querySelector('.reservation-live-picker')) return 'picker closed too early';
      const day23 = [...document.querySelectorAll('.reservation-live-day')].find((el) => el.textContent.trim() === '23');
      if (!day23) return 'missing checkout day';
      day23.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (document.querySelector('.reservation-live-picker.is-editing')) return 'picker did not close after checkout';
      if (!document.querySelector('.reservation-live-picker.is-resolved')) return 'missing resolved calendar after checkout';
      const dateText = [...document.querySelectorAll('.reservation-live-card-date')].map((el) => el.textContent.trim()).join('|');
      if (!dateText.includes('20/07/2026') || !dateText.includes('23/07/2026')) return 'date not updated: ' + dateText;
      const calendarFieldText = [...document.querySelectorAll('.reservation-live-fields span')].map((el) => el.textContent.trim()).join('|');
      if (!calendarFieldText.includes('20/07/2026') || !calendarFieldText.includes('23/07/2026')) return 'calendar fields not updated: ' + calendarFieldText;
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
      if (document.querySelector('.reservation-live-picker.is-editing')) return '22-26 picker did not close';
      const finalRange = [...document.querySelectorAll('.reservation-live-fields span')].map((el) => el.textContent.trim()).join('|');
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
          const header = document.querySelector('.exact-header-overlay');
          const canvasRect = canvas?.getBoundingClientRect();
          const headerRect = header?.getBoundingClientRect();
          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            canvasWidth: canvasRect?.width || 0,
            canvasHeight: canvasRect?.height || 0,
            headerLeft: headerRect?.left || 0,
            headerRight: headerRect?.right || 0,
            brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
          };
        })()`);
        if (layout.scrollWidth > layout.clientWidth + 1) throw new Error(`${viewport.label} ${route}: horizontal overflow ${layout.scrollWidth}/${layout.clientWidth}`);
        if (!(layout.canvasWidth > 0 && layout.canvasWidth <= layout.clientWidth + 0.1 && layout.canvasHeight > 0)) throw new Error(`${viewport.label} ${route}: invalid canvas ${layout.canvasWidth}x${layout.canvasHeight}`);
        if (layout.headerLeft < -0.1 || layout.headerRight > layout.clientWidth + 0.1) throw new Error(`${viewport.label} ${route}: header outside viewport`);
        if (layout.brokenImages) throw new Error(`${viewport.label} ${route}: ${layout.brokenImages} broken images`);
      }
      results.push({ expectedPath: `${viewport.label} responsive matrix`, path: "6 routes without overflow or broken assets" });
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
