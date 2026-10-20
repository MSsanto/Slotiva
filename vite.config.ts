import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        configure(proxy) {
          // Only translate a legitimate same-origin development request.
          // Foreign origins remain unchanged and are rejected by the Worker.
          proxy.on("proxyReq", (upstream, request) => {
            if (request.headers.origin === `http://${request.headers.host}`)
              upstream.setHeader("Origin", "http://127.0.0.1:8787");
          });
        },
      },
    },
  },
});
