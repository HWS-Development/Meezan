import { BalanceIcon, LineHouse, SectionStamp } from "../components/Decorative.jsx";
import { balancePillars, bookingItems, galleryImages, image } from "../data/content.js";

function BookingBar() {
  return (
    <section className="booking-bar" aria-label="Reservation">
      {bookingItems.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
      <a href="mailto:hello@meezane.ma?subject=Reservation Meezane">Verifiez la disponibilite</a>
    </section>
  );
}

export default function HomePage({ onNavigate }) {
  return (
    <div className="page home-page">
      <section className="hero home-hero">
        <img src={image("home-raster-08.png")} alt="Salon et patio de Meezane" />
        <div className="hero-overlay" />
        <button className="play-button" aria-label="Lire la video de presentation" />
      </section>

      <BookingBar />

      <section className="intro-section section-pad">
        <div className="eyebrow">Meezane</div>
        <h1>
          L'art de <span>l'equilibre</span>
        </h1>
        <p>Un lieu confidentiel au coeur de la nature, ou l'on vient ralentir, creer, celebrer et se reconnecter.</p>
        <LineHouse />
      </section>

      <section className="split-section sanctuary section-pad">
        <div className="copy narrow-copy">
          <span className="small-line" />
          <h2>Un sanctuaire discret, proche de tout, loin du bruit.</h2>
          <p>
            A 45 minutes de Casablanca, Meezane s'etend sur un hectare de nature vivante. Ici, le temps ralentit. Les
            espaces respirent.
          </p>
        </div>
        <figure className="framed-image offset-frame">
          <img src={image("home-raster-07.png")} alt="Vue sur la nature et les espaces Meezane" />
        </figure>
      </section>

      <section className="identity-section section-pad">
        <div className="identity-title">
          <h2>Meezane</h2>
          <p className="arabic-word">ميزان</p>
          <p>"Meezane" signifie equilibre.</p>
          <strong>Un mot, plusieurs dimensions...</strong>
        </div>
        <div className="pillar-grid">
          {balancePillars.map((pillar, index) => (
            <article key={pillar.title}>
              <BalanceIcon index={index} />
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="brush-section section-pad">
        <div className="brush-bg" />
        <div className="brush-content">
          <h2>Un lieu qui incarne cet equilibre</h2>
          <LineHouse className="light-line" />
          <p>
            Meezane n'est pas seulement un lieu ou l'on vient. C'est un lieu que l'on ressent. Un espace ou l'on peut
            ralentir sans culpabilite, creer sans contrainte, celebrer avec sens et se reconnecter profondement.
          </p>
        </div>
      </section>

      <section className="split-section pool-story section-pad">
        <figure className="framed-image">
          <img src={image("home-raster-06.png")} alt="Piscine de Meezane le soir" />
        </figure>
        <div className="copy">
          <span className="small-line" />
          <h2>Vivre son propre Meezane</h2>
          <p>
            Parce que l'equilibre n'est jamais fige. Il se cherche, se perd, se retrouve. Meezane n'impose rien. Il
            laisse place. A vous de retrouver votre equilibre.
          </p>
        </div>
      </section>

      <section className="experience-gallery section-pad">
        <div className="copy">
          <span className="small-line" />
          <h2>L'experience Meezane</h2>
          <p>
            Un sanctuaire de deconnexion, des chambres chaleureuses, une shala ouverte sur la lumiere et des espaces
            penses pour accueillir sans jamais envahir.
          </p>
        </div>
        <div className="mini-sketch"><LineHouse /></div>
        <h2 className="gallery-title">Gallerie</h2>
        <div className="gallery-strip">
          {galleryImages.map((item) => (
            <img key={item.src} src={item.src} alt={item.alt} />
          ))}
        </div>
      </section>

      <section className="spaces-section">
        <img src={image("home-raster-05.png")} alt="Chambre chaleureuse Meezane" />
        <div className="spaces-copy">
          <span className="small-line" />
          <h2>Les espaces</h2>
          <p>Des espaces penses pour accueillir, sans jamais envahir.</p>
          <ul>
            <li>7 suites avec salles de bain privatives</li>
            <li>Literie haut de gamme</li>
            <li>Piscine en U et lounges exterieurs</li>
            <li>Nature omnipresente</li>
          </ul>
          <button onClick={() => onNavigate("experiences")}>Explorer les experiences</button>
        </div>
      </section>

      <section className="split-section dar-section section-pad">
        <div className="copy">
          <span className="small-line" />
          <h2 className="arabic-heading">الداروح</h2>
          <h3>Some spaces are built. Others are felt.</h3>
          <p>
            Notre Shala de 140 m2 a ete imaginee comme un veritable sanctuaire : un espace ou l'on se retrouve pour
            respirer, creer, celebrer, reflechir et se reconnecter.
          </p>
        </div>
        <figure className="framed-image">
          <img src={image("home-raster-04.png")} alt="Shala Meezane preparee pour le bien-etre" />
        </figure>
      </section>
    </div>
  );
}
