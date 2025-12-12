import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig, Plugin } from "vite"

function serveVortex(): Plugin {
  return {
    name: "serve-vortex",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/") req.url = "/vortex.html"
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [serveVortex(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 9000,
  },
})
