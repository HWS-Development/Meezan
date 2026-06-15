import { useEffect, useState } from "react";
import ExactIllustratorPage from "./components/ExactIllustratorPage.jsx";

function getPageFromHash() {
  return window.location.hash.replace("#", "") === "experiences" ? "experiences" : "home";
}

export default function App() {
  const [page, setPage] = useState(getPageFromHash);

  useEffect(() => {
    const onHashChange = () => {
      setPage(getPageFromHash());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (nextPage) => {
    window.location.hash = nextPage === "experiences" ? "experiences" : "home";
  };

  return (
    <ExactIllustratorPage page={page} onNavigate={navigate} />
  );
}
