import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { AdminApp } from "./AdminApp";

const root = document.getElementById("admin-root");
if (!root) throw new Error("admin-root element not found");

createRoot(root).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
