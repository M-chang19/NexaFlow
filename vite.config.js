import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
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
