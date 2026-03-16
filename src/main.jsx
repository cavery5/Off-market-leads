import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LeadDashboard from "./LeadDashboard";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LeadDashboard />
  </StrictMode>
);
