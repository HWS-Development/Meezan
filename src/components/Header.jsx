import { useState } from "react";
import { navItems } from "../data/content.js";

export default function Header({ page, onNavigate }) {
  const [open, setOpen] = useState(false);

  const selectPage = (nextPage) => {
    onNavigate(nextPage);
    setOpen(false);
  };

  return (
    <header className="site-header">
      <button className="brand" onClick={() => selectPage("home")} aria-label="Retour a l'accueil">
        <span className="brand-mark">M</span>
        <span>
          <strong>Meezane</strong>
          <small>Art retreat house</small>
        </span>
      </button>

      <button className="menu-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Menu
      </button>

      <nav className={open ? "nav is-open" : "nav"} aria-label="Navigation principale">
        {navItems.map((item) => (
          <button
            key={`${item.label}-${item.page}`}
            className={page === item.page && item.label === "Experiences" ? "is-active" : ""}
            onClick={() => selectPage(item.page)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <a className="book-link" href="mailto:hello@meezane.ma?subject=Reservation Meezane">
        Book now
      </a>
    </header>
  );
}
