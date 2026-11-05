import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from https://ethanzim.github.io/ai-marketing/
export default defineConfig({
  base: "/ai-marketing/",
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 800 },
});
