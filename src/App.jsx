import { useEffect, useState } from "react";
import ExactIllustratorPage from "./components/ExactIllustratorPage.jsx";
import { pagePaths, pathPages } from "./data/pageConfig.js";

function getPageFromLocation() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const hash = window.location.hash.replace("#", "");
  return pathPages[path] || pathPages[hash] || "home";
}

export default function App() {
  const [page, setPage] = useState(getPageFromLocation);

  useEffect(() => {
    const onLocationChange = () => {
      setPage(getPageFromLocation());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  const navigate = (nextPage) => {
    const normalizedPage = pagePaths[nextPage] ? nextPage : "home";
    const nextPath = pagePaths[normalizedPage];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPage(normalizedPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <ExactIllustratorPage page={page} onNavigate={navigate} />
  );
}
