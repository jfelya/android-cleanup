import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const storedTheme = localStorage.getItem("asc.theme");
document.documentElement.dataset.theme = storedTheme === "light" ? "light" : "dark";
const storedLanguage = localStorage.getItem("asc.language");
document.documentElement.lang = storedLanguage === "en" ? "en" : "es";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
