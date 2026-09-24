import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA ?? "dev"),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Minesweeper Trainee",
        short_name: "扫雷训练",
        description: "本地优先、离线可玩的经典扫雷训练",
        theme_color: "#2f6fed",
        background_color: "#e9eef5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  build: {
    target: "es2022",
  },
});
