import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
 
export default defineConfig({
  plugins: [react()],
  base: "/thermochrone/",
  optimizeDeps: {
    exclude: ["maplibre-gl", "@maplibre/maplibre-gl-leaflet"],
  },
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});