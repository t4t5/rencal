const DEFAULT_HUE = 220

export function hexToHue(color: string | null) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return DEFAULT_HUE

  const red = Number.parseInt(color.slice(1, 3), 16) / 255
  const green = Number.parseInt(color.slice(3, 5), 16) / 255
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  if (delta === 0) return DEFAULT_HUE
  if (max === red) return Math.round(60 * (((green - blue) / delta) % 6) + 360) % 360
  if (max === green) return Math.round(60 * ((blue - red) / delta + 2))
  return Math.round(60 * ((red - green) / delta + 4))
}

export function hueToHex(hue: number) {
  const saturation = 0.65
  const lightness = 0.55
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const secondary = chroma * (1 - Math.abs((section % 2) - 1))
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const offset = lightness - chroma / 2

  return `#${[red, green, blue]
    .map((component) =>
      Math.round((component + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}
