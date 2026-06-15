export default function Footer({ onNavigate }) {
  return (
    <footer className="footer-cta">
      <div>
        <h2>Arrivez comme un invite, repartez comme un ami.</h2>
        <a className="light-button" href="mailto:hello@meezane.ma?subject=Reservation Meezane">
          hello@meezane.ma
        </a>
      </div>

      <button className="footer-brand" onClick={() => onNavigate("home")}>
        Meezane
      </button>

      <address>
        <span>Le silence a trouve une adresse.</span>
        <strong>Bir Jdid, Casablanca-Settat</strong>
        <span>Morocco</span>
      </address>
    </footer>
  );
}
