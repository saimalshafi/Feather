import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
      manifest: {
        name: "F*eather",
        short_name: "Feather",
        description: "Sarcastic weather, with attitude.",
        theme_color: "#F5F5F2",
        background_color: "#F5F5F2",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        icons: [
          { src: "icon-192.png",         sizes: "192x192", type: "image/png" },
          { src: "icon-512.png",         sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
});
