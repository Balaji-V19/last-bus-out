import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LastBusOutGame } from "../app/LastBusOutGame";
import "../app/globals.css";

const equipmentAtlas = new URL(
  "items/equipment-atlas.png",
  document.baseURI,
).toString();
document.documentElement.style.setProperty(
  "--equipment-atlas-image",
  `url("${equipmentAtlas}")`,
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("The game root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <LastBusOutGame />
  </StrictMode>,
);
