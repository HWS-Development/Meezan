import { useEffect, useState } from "react";
import siteContent from "../data/siteContent.json";
import {
  businessSchema,
  getPageConfig,
  headerBookAction,
  headerNavItems,
  seoContent,
  textActions,
} from "../data/pageConfig.js";
import {
  carouselSourcePools,
  customArrowHotspots,
  exactMediaOverrides,
  heroMediaBoxes,
} from "../data/mediaConfig.js";
import { exactOverlays } from "../data/exactOverlays.js";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cleanText(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function aiPx(value) {
  return `${Number(value || 0).toFixed(2)}px`;
}

function pct(value, total) {
  return `${(Number(value || 0) / Number(total || 1)) * 100}%`;
}

function cqw(value, artboardWidth) {
  return `calc(${(Number(value || 0) / Number(artboardWidth || 1920)) * 100}cqw)`;
}

function mediaSrc(item, fallbackSrc = item.src) {
  const replacement = String(item.replacementFile || "").trim().replace(/\\/g, "/");
  if (replacement.startsWith("/")) return replacement;
  if (replacement.startsWith("assets/")) return `/${replacement}`;
  const publicIndex = replacement.indexOf("/public/");
  if (publicIndex >= 0) return replacement.slice(publicIndex + "/public".length);
  return fallbackSrc;
}

function fontFamily(textFrame) {
  const name = textFrame.font?.name || textFrame.font?.family || "";
  const text = cleanText(textFrame.content);
  const size = Number(textFrame.size || 0);
  const color = String(textFrame.fillColor?.hex || "").toUpperCase();
  if (/meezane l'art de l[’']équilibre|meezane l'art de l[’']equilibre/i.test(text)) return "Roboto-Light";
  if (color === "#FFFFFF" && /^(gallerie|nos chambres)$/i.test(text)) return "Roboto-Light";
  if (/^parce que les plus beaux moments naissent quand la nature donne le rythme\.?$/i.test(text)) return "Roboto-Light";
  if (/^(important|les expériences signature meezane|les experiences signature meezane|une destination, plusieurs expériences|une destination, plusieurs experiences)$/i.test(text)) return "Roboto-Light";
  if (/Breathing/i.test(name)) return "BreathingPersonalUseOnly-Reg";
  if (/AALMAGHRIBI/i.test(name)) return "AALMAGHRIBI";
  if (/SignPainter/i.test(name)) return "SignPainter-HouseScript";
  if (/Erstoria/i.test(name)) return "Erstoria-Regular";
  if (/Roboto-Medium/i.test(name)) return "Roboto-Medium";
  if (/Roboto-Bold/i.test(name)) return "Roboto-Bold";
  if (/Roboto-Regular/i.test(name)) return "Roboto-Regular";
  if (!name) {
    if (/le silence a trouve une adresse|le silence a trouvé une adresse/i.test(text)) return "Erstoria-Regular";
    if (/^(book now|réserver|reserver|organiser|créer|creer|lancer|explorer|nous contacter|verifiez|vérifiez)/i.test(text)) return "Roboto-Medium";
    if (/^(la ferme|farmhouse|chambres|gallerie|galerie|experiences|expériences|blog|contact)/i.test(text) && size <= 18) return "Roboto-Medium";
    if (/hello@|bir jdid|morocco|casablanca/i.test(text)) return "Roboto-Light";
    if (/^[\d\s/.,A-Z€$-]+$/i.test(text) && size < 72) return "Roboto-Light";
    if (size <= 26) return "Roboto-Medium";
    if (size <= 36) return "Roboto-Light";
    if (size >= 70) return "Erstoria-Regular";
    return "Erstoria-Regular";
  }
  return "Roboto-Light";
}

function fontWeightForFamily(family) {
  if (family === "Roboto-Light") return 300;
  if (family === "Roboto-Regular") return 400;
  if (family === "Roboto-Medium") return 500;
  if (family === "Roboto-Bold") return 700;
  return 400;
}

function textClassName(item) {
  const text = cleanText(item.content);
  const size = Number(item.size || 0);
  const classes = ["editable-text-layer"];
  if (/^(book now|réserver|reserver|organiser|créer|creer|lancer|explorer|nous contacter|verifiez|vérifiez)/i.test(text)) classes.push("is-ui-text");
  if (/^(la ferme|farmhouse|chambres|gallerie|galerie|experiences|expériences|blog|contact)/i.test(text) && size <= 18) classes.push("is-nav-text");
  if (size === 60) classes.push("is-blog-article-title");
  if (size >= 70) classes.push("is-display-text");
  return classes.join(" ");
}

function isBlogArticleBody(item) {
  const text = cleanText(item.content);
  const size = Number(item.size || 0);
  return size === 21 && /^(meezane vous fera revivre|le centre de colonisation)/i.test(text);
}

const monthNames = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
const weekDays = ["L", "M", "M", "J", "V", "S", "D"];

const exactArrowSpriteSize = 42;
const exactArrowSprites = {
  filled: {
    previous: "/assets/illustrator-driven/arrow-filled-left-exact.png",
    next: "/assets/illustrator-driven/arrow-filled-right-exact.png",
  },
  light: {
    previous: "/assets/illustrator-driven/arrow-light-left-exact.png",
    next: "/assets/illustrator-driven/arrow-light-right-exact.png",
  },
};

function exactArrowSpriteSrc(variant, direction) {
  return exactArrowSprites[variant === "light" ? "light" : "filled"]?.[direction < 0 ? "previous" : "next"];
}

function ExactArrowSprite({ src, x, y, artboard }) {
  if (!src) return null;

  return (
    <img
      className="exact-arrow-sprite"
      src={src}
      alt=""
      style={{
        left: pct(x, artboard.width),
        top: pct(y, artboard.height),
        width: pct(exactArrowSpriteSize, artboard.width),
        height: pct(exactArrowSpriteSize, artboard.height),
      }}
      width={exactArrowSpriteSize}
      height={exactArrowSpriteSize}
      aria-hidden="true"
      draggable="false"
    />
  );
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatShortDate(date) {
  const shortMonths = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "aout", "sep", "oct", "nov", "dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
}

function nightsBetween(start, end) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function isHeaderText(item) {
  const text = cleanText(item.content);
  const y = Number(item.bounds?.y || 0);
  if (y > 150) return false;

  return /book now|farmhouse|la ferme|nos chambres|dar errouh|gall[ée]rie|gallerie|galerie|experiences|expériences|blog|contact|reservation/i.test(text);
}

function HeaderOverlay({ page, onNavigate }) {
  return (
    <div className="exact-header-overlay" aria-label="Navigation principale">
      <img
        className="exact-canonical-header"
        src="/assets/illustrator-driven/header-canonical-exact.png"
        alt=""
        width="1920"
        height="189"
        aria-hidden="true"
        draggable="false"
      />
      <button className="exact-header-logo" type="button" aria-label="Retour a l'accueil" onClick={() => onNavigate("home")} />
      <nav className="exact-header-nav">
        {headerNavItems.map((item) => item.href ? (
          <a key={item.label} className="exact-header-link" href={item.href} style={{ left: `${item.left}cqw`, width: `${item.width}cqw` }}>{item.label}</a>
        ) : (
          <button
            key={item.label}
            type="button"
            className={`exact-header-link${page === item.action ? " is-active" : ""}`}
            style={{ left: `${item.left}cqw`, width: `${item.width}cqw` }}
            onClick={() => onNavigate(item.action)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button className="exact-header-book" type="button" onClick={() => onNavigate(headerBookAction.action)}>{headerBookAction.label}</button>
    </div>
  );
}

function textAlign(justification) {
  if (/CENTER/i.test(justification || "")) return "center";
  if (/RIGHT/i.test(justification || "")) return "right";
  return "left";
}

function transformText(value, capitalization) {
  const text = normalizeText(value);
  return /ALLCAPS/i.test(capitalization || "") ? text.toLocaleUpperCase("fr") : text;
}

function upsertMeta(selector, create, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  Object.entries(content).forEach(([key, value]) => element.setAttribute(key, value));
}

function upsertNamedMeta(attribute, name, content) {
  upsertMeta(`meta[${attribute}="${name}"]`, () => {
    const element = document.createElement("meta");
    element.setAttribute(attribute, name);
    return element;
  }, { content });
}

function SeoHead({ page }) {
  const seo = seoContent[page] || seoContent.home;
  const description = seo.description;

  useEffect(() => {
    document.documentElement.lang = "fr";
    document.title = seo.title;
    upsertMeta('meta[name="description"]', () => {
      const element = document.createElement("meta");
      element.setAttribute("name", "description");
      return element;
    }, { content: description });
    upsertNamedMeta("property", "og:title", seo.title);
    upsertNamedMeta("property", "og:description", description);
    upsertNamedMeta("property", "og:url", `${window.location.origin}${seo.path}`);
    upsertNamedMeta("name", "twitter:title", seo.title);
    upsertNamedMeta("name", "twitter:description", description);
    upsertMeta('link[rel="canonical"]', () => {
      const element = document.createElement("link");
      element.setAttribute("rel", "canonical");
      return element;
    }, { href: `${window.location.origin}${seo.path}` });

    let jsonLd = document.getElementById("meezane-jsonld");
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.id = "meezane-jsonld";
      jsonLd.type = "application/ld+json";
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify({
      ...businessSchema,
      url: `${window.location.origin}${seo.path}`,
      description,
    });
  }, [description, seo.path, seo.title]);

  return null;
}

function SeoArticle({ page, textFrames }) {
  const seo = seoContent[page] || seoContent.home;
  const paragraphs = textFrames
    .map((item) => ({ id: item.id, text: cleanText(item.content) }))
    .filter((item) => item.text);

  return (
    <article className="seo-article" aria-label="Contenu editorial Meezane">
      <h1>{seo.title}</h1>
      <p>{seo.description}</p>
      {paragraphs.map((item, index) => (
        <p key={`${index}-${item.text}`} data-source-text-id={item.id}>{item.text}</p>
      ))}
    </article>
  );
}

function isBackdropMedia(item, artboard) {
  return item.bounds.width >= artboard.width * 0.9 && item.bounds.height >= artboard.width;
}

function isHeroMedia(item, artboard) {
  if (!(item.bounds.y < 0 && item.bounds.width >= artboard.width * 0.9)) return false;
  if (item.type === "placed") return true;
  return item.bounds.height < artboard.width;
}

function mediaClassName(item, artboard) {
  const classes = ["editable-media-layer"];
  if (isBackdropMedia(item, artboard)) classes.push("is-backdrop-media");
  if (isHeroMedia(item, artboard)) classes.push("is-hero-media");
  return classes.join(" ");
}

function BackgroundLayer({ src, title, artboard }) {
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="editable-background-layer"
      width={artboard.width}
      height={artboard.height}
      draggable="false"
    />
  );
}

function IllustratorTextLayer({ page, artboard }) {
  return (
    <img
      src={`/assets/illustrator-text/${page}-text.png`}
      data-illustrator-text-page={page}
      alt=""
      aria-hidden="true"
      className="illustrator-text-raster-layer"
      width={artboard.width}
      height={artboard.height}
      draggable="false"
    />
  );
}

function heroMediaBox(page, item, artboard) {
  if (!isHeroMedia(item, artboard)) return null;
  if (page === "experiences") return { hidden: true };

  return heroMediaBoxes[page] || null;
}

function mediaOverrideBox(page, item, artboard) {
  const heroOverride = heroMediaBox(page, item, artboard);
  if (heroOverride) return heroOverride;

  const exactMediaOverride = exactMediaOverrides[page]?.[item.id];
  if (exactMediaOverride) return exactMediaOverride;

  if (isBackdropMedia(item, artboard) && Math.abs(Number(item.bounds.height || 0) - 2952.3) < 0.01) {
    return { ...item.bounds, height: 2953 };
  }

  return null;
}

function MediaLayer({ item, artboard, page, carouselIndexes }) {
  if (isBackdropMedia(item, artboard) || isHeroMedia(item, artboard)) return null;

  if (!item.exported || !item.src) return null;
  const override = mediaOverrideBox(page, item, artboard);
  if (override?.hidden) return null;
  const defaultSrc = mediaSrc(item, override?.src || item.src);
  const carouselSources = carouselSourcesFor(page, item, defaultSrc);
  const carouselKey = `${page}:${item.id}`;
  const carouselIndex = carouselIndexes[carouselKey] || 0;
  const src = carouselSources?.[carouselIndex] || defaultSrc;
  const className = `${mediaClassName(item, artboard)}${carouselSources && carouselIndex ? " is-carousel-active" : ""}`;
  const bounds = override || item.bounds;

  return (
    <img
      className={className}
      src={src}
      alt=""
      style={{
        left: pct(bounds.x, artboard.width),
        top: pct(bounds.y, artboard.height),
        width: pct(bounds.width, artboard.width),
        height: pct(bounds.height, artboard.height),
        objectFit: page === "home" && isHeroMedia(item, artboard) ? "fill" : undefined,
        objectPosition: override?.objectPosition,
      }}
      width={bounds.width}
      height={bounds.height}
      aria-hidden="true"
      draggable="false"
    />
  );
}

function ExactOverlayLayer({ overlay, artboard }) {
  return (
    <img
      className="editable-exact-overlay-layer"
      src={overlay.src}
      alt=""
      style={{
        left: pct(overlay.x, artboard.width),
        top: pct(overlay.y, artboard.height),
        width: pct(overlay.width, artboard.width),
        height: pct(overlay.height, artboard.height),
      }}
      width={overlay.width}
      height={overlay.height}
      aria-hidden="true"
      draggable="false"
    />
  );
}

function PathTextLayer({ item, artboard }) {
  const id = `path-${item.id}`;
  const color = item.fillColor?.hex || "#AE573C";

  return (
    <svg
      className="editable-text-layer editable-path-text"
      viewBox="0 0 100 100"
      style={{
        left: pct(item.bounds.x, artboard.width),
        top: pct(item.bounds.y, artboard.height),
        width: pct(item.bounds.width, artboard.width),
        height: pct(item.bounds.height, artboard.height),
        color,
        fontFamily: fontFamily(item),
      }}
      aria-label={cleanText(item.content)}
    >
      <defs>
        <path id={id} d="M50 9a41 41 0 1 1-.1 0" />
      </defs>
      <text fill="currentColor" fontSize="7.2" letterSpacing="-.02em">
        <textPath href={`#${id}`} startOffset="0%">
          {cleanText(item.content)}
        </textPath>
      </text>
    </svg>
  );
}

function ReservationPriceAmountLayer({ item, artboard }) {
  const style = {
    left: pct(item.bounds.x, artboard.width),
    top: pct(item.bounds.y, artboard.height),
    width: pct(item.bounds.width, artboard.width),
    color: item.fillColor?.hex || "#4D4D4D",
  };

  return (
    <div className="editable-text-layer is-reservation-price-amount" style={style} aria-label={cleanText(item.content)}>
      <span className="reservation-price-number">4500</span>
      <span className="reservation-price-currency">DH</span>
    </div>
  );
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function ReservationLiveCalendarMonth({ monthDate, checkIn, checkOut, activeField, onSelectDate }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startKey = dateKey(checkIn);
  const endKey = dateKey(checkOut);
  const cells = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => new Date(year, month, index + 1)),
  ];

  return (
    <section className="reservation-live-month" aria-label={`${monthNames[month]} ${year}`}>
      <h3>{monthNames[month]} {year}</h3>
      <div className="reservation-live-weekdays" aria-hidden="true">
        {weekDays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="reservation-live-grid">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;
          const key = dateKey(date);
          const selected = key === startKey || key === endKey;
          const inRange = key > startKey && key < endKey;
          const disabled = activeField === "checkOut" && key <= startKey;
          return (
            <button
              key={key}
              type="button"
              className={["reservation-live-day", selected ? "is-selected" : "", inRange ? "is-in-range" : "", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}
              aria-pressed={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onSelectDate(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReservationBookingWidget({ artboard }) {
  const [checkIn, setCheckIn] = useState(() => new Date(2026, 6, 3));
  const [checkOut, setCheckOut] = useState(() => new Date(2026, 6, 7));
  const [activeField, setActiveField] = useState("checkIn");
  const [adults, setAdults] = useState(1);
  const [displayMonth, setDisplayMonth] = useState(() => new Date(2026, 6, 1));
  const [hasInteracted, setHasInteracted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adultsOpen, setAdultsOpen] = useState(false);
  const nights = nightsBetween(checkIn, checkOut);
  const nightLabel = nights > 1 ? "nuits" : "nuit";
  const totalPrice = nights * 900;
  const showCalendarPanel = hasInteracted || pickerOpen;
  const mailtoSubject = encodeURIComponent("Reservation Meezane");
  const mailtoBody = encodeURIComponent(`Bonjour Meezane,\n\nJe souhaite reserver du ${formatDate(checkIn)} au ${formatDate(checkOut)} pour ${adults} adulte(s).\nTotal indicatif: ${totalPrice} DH (${nights} ${nightLabel}).\n\nMerci.`);

  function openDatePicker(field) {
    setActiveField(field);
    setPickerOpen(true);
    setAdultsOpen(false);
    setHasInteracted(true);
  }

  function onSelectDate(date) {
    setHasInteracted(true);
    setPickerOpen(true);
    setAdultsOpen(false);

    if (activeField === "checkIn") {
      setCheckIn(date);
      if (dateKey(date) >= dateKey(checkOut)) setCheckOut(addDays(date, 1));
      setActiveField("checkOut");
      return;
    }

    if (dateKey(date) <= dateKey(checkIn)) {
      setActiveField("checkOut");
      return;
    }

    setCheckOut(date);
    setActiveField("checkIn");
    setPickerOpen(false);
  }

  function shiftMonth(amount) {
    setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setHasInteracted(true);
    setPickerOpen(true);
  }

  function changeAdults(amount) {
    setAdults((value) => Math.min(12, Math.max(1, value + amount)));
    setAdultsOpen(false);
    setHasInteracted(true);
  }

  function closeSelectors() {
    setPickerOpen(false);
    setAdultsOpen(false);
  }

  return (
    <div className="reservation-interaction-layer" aria-label="Reservation interactive">
      <span className="reservation-cursor-mask" aria-hidden="true" style={{ left: pct(1352, artboard.width), top: pct(2940, artboard.height), width: pct(36, artboard.width), height: pct(48, artboard.height) }} />
      {pickerOpen || adultsOpen ? <button className="reservation-popover-backdrop" type="button" aria-label="Fermer le selecteur" onClick={closeSelectors} /> : null}
      <button className="reservation-hit-area" type="button" aria-label="Choisir la date d'arrivee" onClick={() => openDatePicker("checkIn")} style={{ left: pct(1254, artboard.width), top: pct(2937, artboard.height), width: pct(138, artboard.width), height: pct(70, artboard.height) }} />
      <button className="reservation-hit-area" type="button" aria-label="Choisir la date de depart" onClick={() => openDatePicker("checkOut")} style={{ left: pct(1396, artboard.width), top: pct(2937, artboard.height), width: pct(132, artboard.width), height: pct(70, artboard.height) }} />
      <button className="reservation-hit-area" type="button" aria-label="Changer le nombre d'adultes" onClick={() => { setAdultsOpen((open) => !open); setPickerOpen(false); setHasInteracted(true); }} style={{ left: pct(1254, artboard.width), top: pct(3007, artboard.height), width: pct(274, artboard.width), height: pct(62, artboard.height) }} />
      <a className="reservation-hit-area" aria-label="Envoyer la demande de reservation" href={`mailto:hello@meezane.ma?subject=${mailtoSubject}&body=${mailtoBody}`} style={{ left: pct(1251, artboard.width), top: pct(3092, artboard.height), width: pct(256, artboard.width), height: pct(111, artboard.height) }} />
      <button className="reservation-hit-area" type="button" aria-label="Calendrier date d'arrivee" onClick={() => openDatePicker("checkIn")} style={{ left: pct(1208, artboard.width), top: pct(3248, artboard.height), width: pct(152, artboard.width), height: pct(70, artboard.height) }} />
      <button className="reservation-hit-area" type="button" aria-label="Calendrier date de depart" onClick={() => openDatePicker("checkOut")} style={{ left: pct(1362, artboard.width), top: pct(3248, artboard.height), width: pct(152, artboard.width), height: pct(70, artboard.height) }} />
      {hasInteracted ? (
        <div className="reservation-live-values" aria-live="polite">
          <span className="reservation-live-price-row-mask" aria-hidden="true" style={{ left: pct(1244, artboard.width), top: pct(2815, artboard.height), width: pct(300, artboard.width), height: pct(92, artboard.height) }} />
          <span className="reservation-live-price-total" style={{ left: pct(1248, artboard.width), top: pct(2820, artboard.height), width: pct(190, artboard.width), height: pct(70, artboard.height) }}>
            <span className="reservation-live-price">{totalPrice}</span>
            <span className="reservation-live-price-currency">DH</span>
          </span>
          <span className="reservation-live-nightly-rate" style={{ left: pct(1426, artboard.width), top: pct(2856, artboard.height), width: pct(95, artboard.width), height: pct(28, artboard.height) }}>900Dh/Nuit</span>
          <span className="reservation-live-card-date" style={{ left: pct(1272, artboard.width), top: pct(2961, artboard.height), width: pct(82, artboard.width), height: pct(22, artboard.height) }}>{formatDate(checkIn)}</span>
          <span className="reservation-live-card-date" style={{ left: pct(1410, artboard.width), top: pct(2961, artboard.height), width: pct(82, artboard.width), height: pct(22, artboard.height) }}>{formatDate(checkOut)}</span>
          <span className="reservation-live-adults" style={{ left: pct(1470, artboard.width), top: pct(3008, artboard.height), width: pct(24, artboard.width), height: pct(22, artboard.height) }}>{adults}</span>
        </div>
      ) : null}
      {adultsOpen ? (
        <div className="reservation-adults-popover" style={{ left: pct(1394, artboard.width), top: pct(3060, artboard.height), width: pct(150, artboard.width), height: pct(62, artboard.height) }}>
          <button type="button" aria-label="Retirer un adulte" onClick={() => changeAdults(-1)}>-</button>
          <strong>{adults}</strong>
          <button type="button" aria-label="Ajouter un adulte" onClick={() => changeAdults(1)}>+</button>
        </div>
      ) : null}
      {showCalendarPanel ? (
        <section className={`reservation-live-picker ${pickerOpen ? "is-editing" : "is-resolved"}`} aria-label="Selection des dates" style={{ left: pct(798, artboard.width), top: pct(3210, artboard.height), width: pct(748, artboard.width), height: pct(391, artboard.height) }}>
          <header className="reservation-live-header">
            <div><strong>{nights} {nightLabel}</strong><span>{formatShortDate(checkIn)} - {formatShortDate(checkOut)}</span></div>
            <div className="reservation-live-fields">
              <button type="button" className={activeField === "checkIn" ? "is-active" : ""} onClick={() => openDatePicker("checkIn")}><strong>Check-in</strong><span>{formatDate(checkIn)}</span></button>
              <button type="button" className={activeField === "checkOut" ? "is-active" : ""} onClick={() => openDatePicker("checkOut")}><strong>Check-out</strong><span>{formatDate(checkOut)}</span></button>
            </div>
            {pickerOpen ? <button type="button" className="reservation-live-close" aria-label="Fermer le calendrier" onClick={() => setPickerOpen(false)}>×</button> : null}
          </header>
          <div className="reservation-live-nav"><button type="button" aria-label="Mois precedent" onClick={() => shiftMonth(-1)}>‹</button><button type="button" aria-label="Mois suivant" onClick={() => shiftMonth(1)}>›</button></div>
          <div className="reservation-live-months">
            <ReservationLiveCalendarMonth monthDate={displayMonth} checkIn={checkIn} checkOut={checkOut} activeField={activeField} onSelectDate={onSelectDate} />
            <ReservationLiveCalendarMonth monthDate={new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1)} checkIn={checkIn} checkOut={checkOut} activeField={activeField} onSelectDate={onSelectDate} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function textLayoutOverride(page, item) {
  if (page === "blog" && isBlogArticleBody(item)) {
    return { y: -5, width: 65 };
  }

  if (
    page === "experiences" &&
    /AREATEXT/i.test(item.kind || "") &&
    Number(item.size || 0) === 21 &&
    /Roboto-Regular/i.test(item.font?.name || "")
  ) {
    return { width: 160 };
  }

  return null;
}

function TextLayer({ item, artboard, page }) {
  if (/PATHTEXT/i.test(item.kind || "")) return <PathTextLayer item={item} artboard={artboard} />;
  if (page === "reservation" && cleanText(item.content) === "4500DH") {
    return <ReservationPriceAmountLayer item={item} artboard={artboard} />;
  }

  const isArea = /AREATEXT/i.test(item.kind || "");
  const family = fontFamily(item);
  const horizontalScale = Number(item.horizontalScale || 100) / 100;
  const verticalScale = Number(item.verticalScale || 100) / 100;
  const layoutOverride = textLayoutOverride(page, item);
  const transform = horizontalScale !== 1 || verticalScale !== 1
    ? `scale(${horizontalScale}, ${verticalScale})`
    : undefined;
  const style = {
    left: pct(item.bounds.x, artboard.width),
    top: pct(item.bounds.y + (layoutOverride?.y || 0), artboard.height),
    fontFamily: family,
    fontWeight: fontWeightForFamily(family),
    fontSize: cqw(item.size, artboard.width),
    lineHeight: item.leading ? cqw(item.leading, artboard.width) : "normal",
    letterSpacing: `${Number(item.tracking || 0) / 1000}em`,
    color: item.fillColor?.hex || "#AE573C",
    textAlign: textAlign(item.justification),
    whiteSpace: isArea ? "pre-line" : "pre",
    width: pct(item.bounds.width + (layoutOverride?.width || 0), artboard.width),
    transform,
    transformOrigin: "top left",
  };

  return (
    <div className={textClassName(item)} style={style}>
      {transformText(item.content, item.capitalization)}
    </div>
  );
}

function Hotspot({ hotspot, pageWidth, pageHeight, onNavigate }) {
  const style = {
    left: `${(hotspot.x / pageWidth) * 100}%`,
    top: `${(hotspot.y / pageHeight) * 100}%`,
    width: `${(hotspot.w / pageWidth) * 100}%`,
    height: `${(hotspot.h / pageHeight) * 100}%`,
  };

  if (hotspot.href) {
    return <a className="exact-hotspot" href={hotspot.href} style={style} aria-label={hotspot.label} />;
  }

  return (
    <button
      className="exact-hotspot"
      type="button"
      style={style}
      aria-label={hotspot.label}
      onClick={() => onNavigate(hotspot.action)}
    />
  );
}

function textActionFor(page, item) {
  return textActions[page]?.[item.id] || null;
}

function TextActionLayer({ page, item, artboard, onNavigate }) {
  if (isHeaderText(item)) return null;
  const action = textActionFor(page, item);
  if (!action) return null;

  const bounds = {
    x: Number(item.bounds.x || 0) - 28,
    y: Number(item.bounds.y || 0) - 18,
    width: Number(item.bounds.width || 0) + 56,
    height: Math.max(Number(item.bounds.height || 0) + 36, 70),
  };
  const style = {
    left: pct(bounds.x, artboard.width),
    top: pct(bounds.y, artboard.height),
    width: pct(bounds.width, artboard.width),
    height: pct(bounds.height, artboard.height),
  };
  const label = cleanText(item.content);

  if (action.href) return <a className="exact-hotspot exact-text-action" href={action.href} style={style} aria-label={label} />;
  return <button className="exact-hotspot exact-text-action" type="button" style={style} aria-label={label} onClick={() => onNavigate(action.action)} />;
}

function carouselSourcesFor(page, item, currentSrc) {
  const poolConfig = carouselSourcePools[page];
  if (!poolConfig) return null;
  if (page !== "home" && !/^placed-/i.test(item.id || "")) return null;
  const pool = Array.isArray(poolConfig) ? poolConfig : poolConfig[item.id];
  if (!pool?.length) return null;
  if (!Array.isArray(poolConfig) && pool[0] === currentSrc) return pool;
  return [currentSrc, ...pool.filter((src) => src !== currentSrc)];
}

function CarouselHitZones({ page, mediaItems, artboard, carouselIndexes, onCarouselStep }) {
  if (page === "home") return null;

  return mediaItems.map((item) => {
    const override = mediaOverrideBox(page, item, artboard);
    if (!override || override.hidden || !/^placed-/i.test(item.id || "")) return null;
    const currentSrc = override.src || mediaSrc(item);
    if (!carouselSourcesFor(page, item, currentSrc)) return null;
    const active = Boolean(carouselIndexes[`${page}:${item.id}`]);
    const bounds = override || item.bounds;
    if (!bounds || Number(bounds.width || 0) < 500 || Number(bounds.height || 0) < 500) return null;
    const y = Number(bounds.y || 0) + Number(bounds.height || 0) / 2 - 32;
    const leftStyle = {
      left: pct(Number(bounds.x || 0) + 20, artboard.width),
      top: pct(y, artboard.height),
      width: pct(70, artboard.width),
      height: pct(64, artboard.height),
    };
    const rightStyle = {
      left: pct(Number(bounds.x || 0) + Number(bounds.width || 0) - 100, artboard.width),
      top: pct(y, artboard.height),
      width: pct(70, artboard.width),
      height: pct(64, artboard.height),
    };
    const spriteY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2 - exactArrowSpriteSize / 2;
    const previousSpriteX = Number(bounds.x || 0) + 34;
    const nextSpriteX = Number(bounds.x || 0) + Number(bounds.width || 0) - 86;
    return (
      <span key={`carousel-${item.id}`}>
        <button className={`exact-hotspot exact-carousel-hotspot is-filled is-previous${active ? " is-carousel-active" : ""}`} type="button" aria-label="Image precedente" style={leftStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => onCarouselStep(item.id, -1)} />
        <button className={`exact-hotspot exact-carousel-hotspot is-filled is-next${active ? " is-carousel-active" : ""}`} type="button" aria-label="Image suivante" style={rightStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => onCarouselStep(item.id, 1)} />
        {active ? (
          <>
            <ExactArrowSprite src={exactArrowSpriteSrc("filled", -1)} x={previousSpriteX} y={spriteY} artboard={artboard} />
            <ExactArrowSprite src={exactArrowSpriteSrc("filled", 1)} x={nextSpriteX} y={spriteY} artboard={artboard} />
          </>
        ) : null}
      </span>
    );
  });
}

function scrollCanvasTo(artboard, targetY) {
  const canvas = document.querySelector(".exact-canvas");
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  const y = window.scrollY + box.top + (Number(targetY || 0) / Number(artboard.height || 1)) * box.height;
  window.scrollTo({ top: y, behavior: "smooth" });
}

function CustomArrowHotspots({ page, artboard, carouselIndexes, onCarouselStep }) {
  return (customArrowHotspots[page] || []).map((hotspot) => {
    const ids = hotspot.ids || (hotspot.id ? [hotspot.id] : []);
    const active = ids.some((id) => Boolean(carouselIndexes[`${page}:${id}`]));
    const style = {
      left: pct(hotspot.x, artboard.width),
      top: pct(hotspot.y, artboard.height),
      width: pct(hotspot.w, artboard.width),
      height: pct(hotspot.h, artboard.height),
    };
    const directionClass = hotspot.direction < 0 ? "is-previous" : "is-next";
    const variantClass = hotspot.variant === "light" ? "is-light" : "is-filled";
    const className = `exact-hotspot exact-arrow-hotspot ${variantClass} ${directionClass}${active ? " is-carousel-active" : ""}`;
    const spriteVariant = hotspot.variant === "light" ? "light" : "filled";

    return (
      <span key={`${hotspot.label}-${hotspot.x}-${hotspot.y}`}>
        <button
          type="button"
          className={className}
          style={style}
          aria-label={hotspot.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (hotspot.type === "scroll") scrollCanvasTo(artboard, hotspot.targetY);
            if (hotspot.type === "carousel") onCarouselStep(hotspot.id, hotspot.direction);
            if (hotspot.type === "carouselGroup") hotspot.ids.forEach((id) => onCarouselStep(id, hotspot.direction));
          }}
        />
        {active && hotspot.type !== "scroll" && hotspot.restoreSprite !== false ? (
          <ExactArrowSprite src={exactArrowSpriteSrc(spriteVariant, hotspot.direction)} x={Number(hotspot.x || 0) + 24} y={Number(hotspot.y || 0) + 24} artboard={artboard} />
        ) : null}
      </span>
    );
  });
}

export default function ExactIllustratorPage({ page, onNavigate }) {
  const [carouselIndexes, setCarouselIndexes] = useState({});
  const fallback = getPageConfig(page);

  const pageData = siteContent.pages?.[page];
  const textFrames = (pageData?.text || []).map((item) => ({
      id: item.id,
      content: item.value,
      kind: item.kind,
      bounds: item.bounds,
      font: item.style?.font,
      size: item.style?.size,
      leading: item.style?.leading,
      tracking: item.style?.tracking,
      horizontalScale: item.style?.horizontalScale,
      verticalScale: item.style?.verticalScale,
      capitalization: item.style?.capitalization,
      fillColor: { hex: item.style?.color || "#000000" },
      justification: item.style?.justification,
    }));
  const mediaItems = pageData?.media || [];
  const artboard = pageData?.artboard || { width: fallback.width, height: fallback.height };
  const background = pageData?.background;

  const canvasStyle = {
    aspectRatio: `${artboard.width} / ${artboard.height}`,
  };

  function stepCarousel(itemId, direction) {
    const item = mediaItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const override = mediaOverrideBox(page, item, artboard);
    const defaultSrc = mediaSrc(item, override?.src || item.src);
    const sources = carouselSourcesFor(page, item, defaultSrc);
    if (!sources?.length) return;
    const key = `${page}:${itemId}`;
    setCarouselIndexes((current) => ({
      ...current,
      [key]: ((current[key] || 0) + direction + sources.length) % sources.length,
    }));
  }

  return (
    <main className="exact-shell" aria-label={(seoContent[page] || seoContent.home).title}>
      <SeoHead page={page} />
      <SeoArticle page={page} textFrames={textFrames} />
      <div
        className="exact-canvas"
        style={canvasStyle}
      >
        <BackgroundLayer src={background} title={fallback.title} artboard={artboard} />
        {mediaItems.map((item) => (
          <MediaLayer key={item.id} item={item} artboard={artboard} page={page} carouselIndexes={carouselIndexes} />
        ))}
        <IllustratorTextLayer page={page} artboard={artboard} />
        {(exactOverlays[page] || []).map((overlay) => (
          <ExactOverlayLayer key={overlay.src} overlay={overlay} artboard={artboard} />
        ))}
        {page === "reservation" ? <ReservationBookingWidget artboard={artboard} /> : null}
        {textFrames.map((item) => (
          <TextActionLayer key={`action-${item.id}`} page={page} item={item} artboard={artboard} onNavigate={onNavigate} />
        ))}
        <CarouselHitZones page={page} mediaItems={mediaItems} artboard={artboard} carouselIndexes={carouselIndexes} onCarouselStep={stepCarousel} />
        <CustomArrowHotspots page={page} artboard={artboard} carouselIndexes={carouselIndexes} onCarouselStep={stepCarousel} />
        <HeaderOverlay page={page} onNavigate={onNavigate} />
        {fallback.hotspots.map((hotspot) => (
          <Hotspot
            key={`${hotspot.label}-${hotspot.x}-${hotspot.y}`}
            hotspot={hotspot}
            pageWidth={artboard.width}
            pageHeight={artboard.height}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </main>
  );
}
