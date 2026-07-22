const REPOSITORY = "t4t5/rencal"
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}`

export interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

export interface GitHubRelease {
  name: string | null
  tag_name: string
  html_url: string
  published_at: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  assets: GitHubReleaseAsset[]
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "rencal-website",
    Accept: "application/vnd.github+json",
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  return headers
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, { headers: requestHeaders() })

  if (!response.ok) {
    throw new Error(`GitHub API responded ${response.status} for ${path}`)
  }

  return (await response.json()) as T
}

export async function getReleases(): Promise<GitHubRelease[]> {
  const releases = await request<GitHubRelease[]>("/releases?per_page=100")

  // The API returns releases newest-first. Drafts should never appear publicly.
  return releases.filter((release) => !release.draft)
}

export function getLatestRelease(): Promise<GitHubRelease> {
  // GitHub's latest endpoint excludes drafts and prereleases.
  return request<GitHubRelease>("/releases/latest")
}
