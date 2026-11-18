import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.NEXAFLOW_PORT || 4318);

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    manifest: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        configure(proxy) {
          const token = process.env.NEXAFLOW_SYNC_TOKEN;
          if (token) {
            proxy.on("proxyReq", proxyRequest => {
              proxyRequest.setHeader("Authorization", `Bearer ${token}`);
            });
          }
        }
      }
    }
  }
});
