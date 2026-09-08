import { site } from "../site"

// schema.org SoftwareApplication markup, rendered as JSON-LD on landing pages
// so search engines know what renCal is, what it runs on, and that it's free.
export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.title,
  alternateName: "renCal calendar",
  url: site.url,
  description: site.description,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Calendar",
  operatingSystem: "Linux, macOS",
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  license: `${site.repoUrl}/blob/main/LICENSE`,
  downloadUrl: `${site.url}/download/`,
  installUrl: `${site.url}/download/`,
  softwareHelp: {
    "@type": "CreativeWork",
    url: `${site.url}/docs/installation/`,
  },
  releaseNotes: `${site.url}/changelog/`,
  screenshot: `${site.url}/screenshot.png`,
  image: site.ogImage,
  featureList: [
    "Built for Omarchy Linux, with themes that follow the system palette",
    "Two-way sync with Google Calendar, iCloud, Outlook and CalDAV",
    "Events stored locally as plaintext .ics files",
    "Natural-language event input",
    "Vim-style keyboard navigation",
    "Omarchy bar widget for upcoming events",
  ],
  keywords: "Omarchy calendar, Linux calendar app, CalDAV client, Google Calendar desktop app",
  author: {
    "@type": "Person",
    name: "T4T5",
    url: "https://t4t5.com",
  },
  sameAs: [site.repoUrl, site.aurPackageUrl],
}
