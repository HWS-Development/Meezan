const exactPages = {
  home: {
    title: "Meezane - L'art de l'equilibre",
    image: "/assets/images/reference-home-preview.png",
    width: 1920,
    height: 12229,
    hotspots: [
      { label: "Accueil", action: "home", x: 215, y: 0, w: 255, h: 128 },
      { label: "Experiences", action: "experiences", x: 1085, y: 22, w: 150, h: 50 },
      { label: "Book now", href: "mailto:hello@meezane.ma?subject=Reservation Meezane", x: 1586, y: 24, w: 190, h: 62 },
      { label: "Verifier la disponibilite", href: "mailto:hello@meezane.ma?subject=Disponibilite Meezane", x: 1284, y: 792, w: 292, h: 89 },
      { label: "Explorer les espaces", action: "experiences", x: 1302, y: 8545, w: 285, h: 78 },
      { label: "Email Meezane", href: "mailto:hello@meezane.ma", x: 370, y: 11920, w: 300, h: 95 },
    ],
  },
  experiences: {
    title: "Meezane - Experiences",
    image: "/assets/images/reference-experiences-preview.png",
    width: 1920,
    height: 16004,
    hotspots: [
      { label: "Accueil", action: "home", x: 215, y: 0, w: 255, h: 128 },
      { label: "Experiences", action: "experiences", x: 1085, y: 22, w: 150, h: 50 },
      { label: "Book now", href: "mailto:hello@meezane.ma?subject=Reservation Meezane", x: 1586, y: 24, w: 190, h: 62 },
      { label: "Reserver votre sejour", href: "mailto:hello@meezane.ma?subject=Tourisme et sejour Meezane", x: 490, y: 2925, w: 266, h: 70 },
      { label: "Organiser une retraite", href: "mailto:hello@meezane.ma?subject=Retraite bien-etre Meezane", x: 1192, y: 4130, w: 305, h: 70 },
      { label: "Organiser un evenement corporate", href: "mailto:hello@meezane.ma?subject=Evenement corporate Meezane", x: 488, y: 5335, w: 395, h: 70 },
      { label: "Organiser un anniversaire", href: "mailto:hello@meezane.ma?subject=Anniversaire enfants Meezane", x: 1190, y: 6540, w: 330, h: 70 },
      { label: "Creer votre evenement", href: "mailto:hello@meezane.ma?subject=Evenement Meezane", x: 488, y: 7750, w: 300, h: 70 },
      { label: "Lancer une residence", href: "mailto:hello@meezane.ma?subject=Residence artistique Meezane", x: 1190, y: 8955, w: 290, h: 70 },
      { label: "Nous contacter", href: "mailto:hello@meezane.ma?subject=Projet Meezane", x: 410, y: 15332, w: 240, h: 75 },
      { label: "Email Meezane", href: "mailto:hello@meezane.ma", x: 370, y: 15690, w: 300, h: 95 },
    ],
  },
};

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

export default function ExactIllustratorPage({ page, onNavigate }) {
  const config = exactPages[page] || exactPages.home;

  return (
    <main className="exact-shell" aria-label={config.title}>
      <h1 className="sr-only">{config.title}</h1>
      <p className="sr-only">
        Version React basee directement sur l'export Illustrator pour conserver le rendu visuel exact de la maquette.
      </p>
      <div className="exact-canvas" style={{ aspectRatio: `${config.width} / ${config.height}` }}>
        <img src={config.image} alt={config.title} className="exact-image" draggable="false" />
        {config.hotspots.map((hotspot) => (
          <Hotspot
            key={`${hotspot.label}-${hotspot.x}-${hotspot.y}`}
            hotspot={hotspot}
            pageWidth={config.width}
            pageHeight={config.height}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </main>
  );
}
