export const image = (name) => `/assets/images/${name}`;

export const navItems = [
  { label: "La ferme", page: "home" },
  { label: "Nos chambres", page: "home" },
  { label: "Dar errouh", page: "home" },
  { label: "Gallerie", page: "home" },
  { label: "Experiences", page: "experiences" },
  { label: "Blog", page: "home" },
  { label: "Contact", page: "home" },
];

export const bookingItems = [
  { label: "Check in", value: "26/Juin" },
  { label: "Check out", value: "29/Juin" },
  { label: "Jours", value: "03" },
];

export const balancePillars = [
  {
    title: "L'equilibre juste",
    text: "Dans son sens premier, Meezane est la balance. La mesure exacte. La justesse.",
  },
  {
    title: "L'equilibre interieur",
    text: "Un espace pour ralentir sans culpabilite, respirer, revenir a soi.",
  },
  {
    title: "L'equilibre des formes",
    text: "Architecture, matieres naturelles et lignes simples se repondent.",
  },
  {
    title: "Le rythme",
    text: "Le lieu avance au rythme du vivant, de la lumiere et des saisons.",
  },
  {
    title: "L'equilibre du vivant",
    text: "Nature, hospitalite et creation cohabitent avec douceur.",
  },
];

export const galleryImages = [
  { src: image("home-raster-01.png"), alt: "Grande table sous pergola" },
  { src: image("home-raster-02.png"), alt: "Salon interieur vitree" },
  { src: image("home-raster-03.png"), alt: "Piscine et transats au soleil" },
];

export const experienceCards = [
  {
    title: "Tourisme & sejours",
    kicker: "Un refuge pour ralentir",
    text: "Un refuge pour ralentir, respirer et profiter de la nature. Sejours entre amis ou en famille, dans un cadre paisible et inspirant.",
    cta: "Reserver votre sejour",
    image: image("experiences-raster-06.png"),
    shape: "portrait",
  },
  {
    title: "Retraites bien-etre",
    kicker: "Respirer, pratiquer, revenir",
    text: "Yoga, meditation, pratiques spirituelles ou holistiques. Meezane est concu pour accueillir des retraites immersives et profondes.",
    cta: "Organiser une retraite",
    image: image("experiences-raster-05.png"),
    shape: "arch",
  },
  {
    title: "Journees corporate",
    kicker: "Prendre du recul ensemble",
    text: "Team buildings, workshops, seminaires. Un cadre naturel pour creer du lien, prendre du recul et stimuler la creativite.",
    cta: "Organiser un evenement corporate",
    image: image("experiences-raster-04.png"),
    shape: "round",
  },
  {
    title: "Anniversaires enfants",
    kicker: "Jouer, creer, celebrer",
    text: "Des moments joyeux, libres et creatifs en pleine nature. Animations, jeux et activites sur mesure.",
    cta: "Organiser un anniversaire",
    image: image("experiences-raster-03.png"),
    shape: "soft",
  },
  {
    title: "Evenements & celebrations",
    kicker: "Des instants inoubliables",
    text: "Fiancailles, mariages, anniversaires, moments de vie. Meezane devient le decor d'instants inoubliables.",
    cta: "Creer votre evenement",
    image: image("experiences-raster-02.png"),
    shape: "portrait",
  },
  {
    title: "Residences artistiques",
    kicker: "Creer loin du bruit",
    text: "Un lieu d'inspiration et de creation. Pour artistes, collectifs et esprits creatifs.",
    cta: "Lancer une residence",
    image: image("experiences-raster-01.png"),
    shape: "soft",
  },
];

export const activities = [
  {
    title: "Le rituel Meezane",
    kicker: "Se reconnecter, s'aligner, respirer",
    text: "Seance de yoga ou meditation, respiration guidee, moment de silence dans la nature, infusion ou collation healthy.",
  },
  {
    title: "Terre & mains",
    kicker: "Creer, toucher, ralentir",
    text: "Atelier poterie, decouverte des matieres et creation d'un objet a emporter.",
  },
  {
    title: "Du jardin a l'assiette",
    kicker: "Comprendre, cueillir, cuisiner",
    text: "Initiation au jardinage, recolte selon disponibilite, cours de cuisine marocaine et degustation collective.",
  },
  {
    title: "L'echappee ocean",
    kicker: "Changer d'horizon",
    text: "Excursion plage ou ocean, avec possibilite de cours de surf selon la saison.",
  },
  {
    title: "Memoire & culture",
    kicker: "Explorer, comprendre, ressentir",
    text: "Visite d'El Jadida, decouverte de Casablanca, de la mosquee Hassan II et du quartier historique.",
  },
];
