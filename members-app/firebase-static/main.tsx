import React from "react";
import { createRoot } from "react-dom/client";
import { AdminConsole } from "../app/admin/admin-console";
import { HomeClient } from "../app/home-client";
import "../app/globals.css";

const app = window.location.pathname.replace(/\/$/, "") === "/admin"
  ? <AdminConsole />
  : <HomeClient now={new Date().toISOString()} />;

createRoot(document.getElementById("root")!).render(<React.StrictMode>{app}</React.StrictMode>);
