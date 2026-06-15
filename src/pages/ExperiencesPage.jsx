import { BalanceIcon, LineHouse, SectionStamp } from "../components/Decorative.jsx";
import { activities, experienceCards, image } from "../data/content.js";

export default function ExperiencesPage() {
  return (
    <div className="page experiences-page">
      <section className="hero experiences-hero">
        <img src={image("experiences-raster-06.png")} alt="Piscine et jardin de Meezane" />
        <div className="hero-overlay warm" />
        <div className="hero-copy">
          <h1>Une destination, plusieurs experiences</h1>
          <p>Chaque projet est unique. Chaque experience est pensee sur mesure.</p>
        </div>
      </section>

      <section className="experience-list section-pad">
        <SectionStamp />
        {experienceCards.map((card, index) => (
          <article className={`experience-card ${index % 2 ? "is-reversed" : ""}`} key={card.title}>
            <figure className={`experience-image ${card.shape}`}>
              <img src={card.image} alt={card.title} />
            </figure>
            <div className="experience-copy">
              <span className="small-line" />
              <h2>{card.title}</h2>
              <h3>{card.kicker}</h3>
              <p>{card.text}</p>
              <a href="mailto:hello@meezane.ma?subject=Experience Meezane">{card.cta}</a>
            </div>
          </article>
        ))}
      </section>

      <section className="brush-section event-brush section-pad">
        <div className="brush-bg" />
        <div className="brush-content">
          <h2>Expertise evenementielle</h2>
          <strong>Un lieu. Et une equipe pour tout orchestrer.</strong>
          <p>
            Grace a Feat. Agency, nous pouvons concevoir, produire et orchestrer l'ensemble de votre evenement :
            direction artistique, scenographie, production, logistique, experiences immersives, contenus et branding.
          </p>
        </div>
      </section>

      <section className="split-section engagement-section section-pad">
        <div className="copy">
          <span className="small-line" />
          <h2>Engagement & equilibre</h2>
          <p>
            Meezane a ete pense avec une approche consciente : reutilisation de materiaux, mobilier avec histoire,
            energie partiellement renouvelable et respect du rythme naturel du lieu.
          </p>
        </div>
        <div className="engagement-icons">
          {[0, 1, 2, 3, 4].map((item) => (
            <BalanceIcon key={item} index={item} />
          ))}
        </div>
      </section>

      <section className="food-section">
        <img src={image("experiences-raster-07.png")} alt="Table de petit dejeuner Meezane" />
        <div className="food-copy">
          <span className="small-line" />
          <h2>Food</h2>
          <h3>L'equilibre dans l'assiette aussi</h3>
          <p>
            A Meezane, la cuisine fait partie integrante de l'experience. Nous proposons une cuisine maison preparee
            avec soin, a partir de produits frais et de saison.
          </p>
          <ul>
            <li>Cuisine traditionnelle marocaine</li>
            <li>Options healthy et equilibrees</li>
            <li>Plats gourmands a partager</li>
          </ul>
        </div>
      </section>

      <section className="activities-section section-pad">
        <div className="activities-title">
          <p>Les experiences signature Meezane</p>
          <h2>Plus que des activites, des moments qui marquent</h2>
        </div>
        <div className="activities-list">
          {activities.map((activity, index) => (
            <article key={activity.title}>
              <BalanceIcon index={index} />
              <div>
                <h3>{activity.title}</h3>
                <strong>{activity.kicker}</strong>
                <p>{activity.text}</p>
              </div>
            </article>
          ))}
        </div>
        <LineHouse />
      </section>

      <section className="final-invite section-pad">
        <div>
          <span className="small-line" />
          <h2>Et si vous veniez trouver votre equilibre ?</h2>
          <p>Sejour, retraite ou evenement sur mesure. Meezane vous ouvre ses portes.</p>
          <a href="mailto:hello@meezane.ma?subject=Projet Meezane">Nous contacter</a>
        </div>
        <SectionStamp />
      </section>
    </div>
  );
}
