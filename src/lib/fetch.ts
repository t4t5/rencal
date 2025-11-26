import { logger } from "@/lib/logger"

export async function fetchWithLog(
  url: string | URL | Request,
  description: string,
  config?: RequestInit,
) {
  try {
    const rsp = await fetch(url, config)

    const json = await rsp.json()

    logger.info(`🌍️ Fetch (${description})`, {
      url,
      json,
    })

    return { rsp, json }
  } catch (error) {
    logger.error(`🌍️ Fetch (${description})`, error, {
      url,
    })

    throw error
  }
}
