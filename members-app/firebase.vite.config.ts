import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "firebase-static",
  publicDir: "../public",
  plugins: [react()],
  define: {
    "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify("https://members.tassisto.be"),
  },
  build: {
    outDir: "../firebase-dist",
    emptyOutDir: true,
  },
});
