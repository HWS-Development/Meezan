function footerHotspots(height) {
  return [
    { label: "Email Meezane", href: "mailto:hello@meezane.ma", x: 350, y: height - 340, w: 340, h: 125 },
  ];
}

function pageHotspots(height, extras = []) {
  return [...extras, ...footerHotspots(height)];
}

export const pageKeys = ["home", "experiences", "reservation", "blog", "chambres", "galerie"];

export const pagePaths = {
  home: "/",
  experiences: "/experiences",
  reservation: "/reservation",
  blog: "/blog",
  chambres: "/chambres",
  galerie: "/galerie",
};

export const pathPages = {
  experiences: "experiences",
  reservation: "reservation",
  blog: "blog",
  chambres: "chambres",
  galerie: "galerie",
  gallerie: "galerie",
};

export const headerNavItems = [
  { label: "LA FERME", action: "home", left: 35.9375, width: 4.2708 },
  { label: "NOS CHAMBRES", action: "chambres", left: 40.2083, width: 6.25 },
  { label: "DAR ERROUH", action: "chambres", left: 46.4583, width: 5.3125 },
  { label: "GALLERIE", action: "galerie", left: 51.7708, width: 4.1146 },
  { label: "EXPÉRIENCES", action: "experiences", left: 55.8854, width: 5.4688 },
  { label: "BLOG", action: "blog", left: 61.3542, width: 3.0208 },
  { label: "CONTACT", href: "mailto:hello@meezane.ma", left: 64.375, width: 4.1667 },
];

export const headerBookAction = { label: "BOOK NOW", action: "reservation" };

function mailto(subject) {
  return { href: `mailto:hello@meezane.ma?subject=${encodeURIComponent(subject)}` };
}

// Actions are tied to stable Illustrator IDs, never inferred from mutable copy.
export const textActions = {
  experiences: {
    "text-02": mailto("Projet Meezane"),
    "text-03": { action: "reservation" },
    "text-21": mailto("Lancer une résidence"),
    "text-25": mailto("Créer votre événement"),
    "text-28": mailto("Organiser un anniversaire"),
    "text-31": mailto("Organiser un événement corporate"),
    "text-34": mailto("Organiser une retraite"),
    "text-37": { action: "reservation" },
  },
  home: {
    "text-14": { action: "chambres" },
    "text-28": mailto("Disponibilité Meezane"),
  },
};

export const pageConfigs = {
  home: {
    title: "Meezane - L'art de l'equilibre",
    path: pagePaths.home,
    width: 1920,
    height: 12229,
    hotspots: pageHotspots(12229),
  },
  experiences: {
    title: "Meezane - Experiences",
    path: pagePaths.experiences,
    width: 1920,
    height: 16004,
    hotspots: pageHotspots(16004),
  },
  reservation: {
    title: "Meezane - Reservation",
    path: pagePaths.reservation,
    width: 1920,
    height: 4074,
    hotspots: pageHotspots(4074),
  },
  blog: {
    title: "Meezane - Blog",
    path: pagePaths.blog,
    width: 1920,
    height: 9235,
    hotspots: pageHotspots(9235),
  },
  chambres: {
    title: "Meezane - Chambres",
    path: pagePaths.chambres,
    width: 1920,
    height: 11568,
    hotspots: pageHotspots(11568),
  },
  galerie: {
    title: "Meezane - Galerie",
    path: pagePaths.galerie,
    width: 1920,
    height: 6098,
    hotspots: pageHotspots(6098),
  },
};

export const seoContent = {
  home: {
    title: "Meezane | Maison d'hotes et retraites pres de Casablanca",
    description:
      "Meezane est un lieu confidentiel pres de Casablanca pour ralentir, creer, celebrer et retrouver l'equilibre au coeur de la nature.",
    path: "/",
  },
  experiences: {
    title: "Experiences Meezane | Sejours, retraites et evenements",
    description:
      "Tourisme, retraites bien-etre, journees corporate, celebrations, residences artistiques et experiences signature sur mesure chez Meezane.",
    path: "/experiences",
  },
  reservation: {
    title: "Reservation Meezane | Demander un sejour sur mesure",
    description:
      "Demandez une reservation chez Meezane pour un sejour, une retraite, une celebration ou une experience sur mesure pres de Casablanca.",
    path: "/reservation",
  },
  blog: {
    title: "Blog Meezane | Inspirations et art de vivre",
    description:
      "Actualites, inspirations et recits autour de Meezane, de l'art de vivre, du bien-etre, de la nature et des experiences sur mesure.",
    path: "/blog",
  },
  chambres: {
    title: "Chambres Meezane | Sejourner pres de Casablanca",
    description:
      "Decouvrez les chambres et espaces de Meezane, maison confidentielle pour sejourner, ralentir et retrouver l'equilibre.",
    path: "/chambres",
  },
  galerie: {
    title: "Galerie Meezane | Images du lieu",
    description:
      "Explorez la galerie Meezane : maison, nature, piscine, chambres, espaces de vie et moments d'experience pres de Casablanca.",
    path: "/galerie",
  },
};

export const businessSchema = {
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  name: "Meezane",
  email: "hello@meezane.ma",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bir Jdid",
    addressRegion: "Casablanca-Settat",
    addressCountry: "MA",
  },
};

export function getPageConfig(page) {
  return pageConfigs[page] || pageConfigs.home;
}
