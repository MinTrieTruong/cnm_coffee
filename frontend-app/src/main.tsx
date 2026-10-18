import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "./index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/bottomnav.css";
import "./delivery.css";
import L from "leaflet";

// Global fix for Leaflet marker icon paths in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
