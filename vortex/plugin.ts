import type { Plugin } from "vite"

export function vortex(): Plugin {
  return {
    name: "vortex",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/") req.url = "/vortex.html"
        next()
      })
    },
  }
}
