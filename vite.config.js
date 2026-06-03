import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Change base to match your GitHub repo name: /thermochrone/
export default defineConfig({
  plugins: [react()],
  base: "/thermochrone/",
});
