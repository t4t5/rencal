//! Colours and the colour maths the CSS theme contract relied on.
//!
//! Components are kept unclamped (extended sRGB) through every mix, exactly as
//! the webview does: a chroma-boosted event colour can leave the sRGB gamut and
//! still mix correctly. Only [`Rgba::to_hex`] and [`Rgba::to_bytes`] clip.

use std::fmt;

/// A straight-alpha sRGB colour. Components are nominally 0–1, but may lie
/// outside that range after an OKLCH boost.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rgba {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl Rgba {
    pub const TRANSPARENT: Rgba = Rgba::new(0.0, 0.0, 0.0, 0.0);
    pub const WHITE: Rgba = Rgba::new(1.0, 1.0, 1.0, 1.0);
    pub const BLACK: Rgba = Rgba::new(0.0, 0.0, 0.0, 1.0);

    pub const fn new(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self { r, g, b, a }
    }

    pub fn from_bytes(r: u8, g: u8, b: u8, a: u8) -> Self {
        let f = |v: u8| f64::from(v) / 255.0;
        Self::new(f(r), f(g), f(b), f(a))
    }

    /// Parses `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`.
    pub fn parse_hex(s: &str) -> Option<Self> {
        let hex = s.strip_prefix('#')?;
        if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let nibble = |i: usize| u8::from_str_radix(&hex[i..=i], 16).ok().map(|v| v * 17);
        let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
        match hex.len() {
            3 => Some(Self::from_bytes(nibble(0)?, nibble(1)?, nibble(2)?, 255)),
            4 => Some(Self::from_bytes(
                nibble(0)?,
                nibble(1)?,
                nibble(2)?,
                nibble(3)?,
            )),
            6 => Some(Self::from_bytes(byte(0)?, byte(2)?, byte(4)?, 255)),
            8 => Some(Self::from_bytes(byte(0)?, byte(2)?, byte(4)?, byte(6)?)),
            _ => None,
        }
    }

    /// Clipped to the sRGB gamut and rounded to 8 bits per channel.
    pub fn to_bytes(self) -> [u8; 4] {
        let byte = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        [byte(self.r), byte(self.g), byte(self.b), byte(self.a)]
    }

    /// `#rrggbbaa`, clipped to the sRGB gamut.
    pub fn to_hex(self) -> String {
        let [r, g, b, a] = self.to_bytes();
        format!("#{r:02x}{g:02x}{b:02x}{a:02x}")
    }

    pub fn with_alpha(self, a: f64) -> Self {
        Self { a, ..self }
    }

    /// CSS `color-mix(in srgb, self p, other)` with `p` in 0–1, using
    /// premultiplied alpha as the spec requires (so mixing into `transparent`
    /// only lowers alpha).
    pub fn mix(self, p: f64, other: Rgba) -> Rgba {
        let q = 1.0 - p;
        let a = self.a * p + other.a * q;
        if a == 0.0 {
            return Rgba::TRANSPARENT;
        }
        let channel = |x: f64, y: f64| (x * self.a * p + y * other.a * q) / a;
        Rgba::new(
            channel(self.r, other.r),
            channel(self.g, other.g),
            channel(self.b, other.b),
            a,
        )
    }

    pub fn to_oklch(self) -> Oklch {
        let lin = |c: f64| {
            let a = c.abs();
            c.signum()
                * if a <= 0.04045 {
                    a / 12.92
                } else {
                    ((a + 0.055) / 1.055).powf(2.4)
                }
        };
        let lab = mul(
            &LMS_TO_OKLAB,
            mul(
                &XYZ_TO_LMS,
                mul(&LIN_SRGB_TO_XYZ, [lin(self.r), lin(self.g), lin(self.b)]),
            )
            .map(f64::cbrt),
        );
        let [lightness, a, b] = lab;
        let chroma = a.hypot(b);
        // Hue is powerless for achromatic colours; any value gives the same result.
        let hue = if chroma < 1e-6 {
            0.0
        } else {
            b.atan2(a).to_degrees().rem_euclid(360.0)
        };
        Oklch {
            l: lightness,
            c: chroma,
            h: hue,
            alpha: self.a,
        }
    }
}

impl fmt::Display for Rgba {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}

/// An OKLCH colour (`h` in degrees).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Oklch {
    pub l: f64,
    pub c: f64,
    pub h: f64,
    pub alpha: f64,
}

impl Oklch {
    /// Converts to extended (unclipped) sRGB, like CSS does before mixing.
    pub fn to_rgba(self) -> Rgba {
        let h = self.h.to_radians();
        let lms =
            mul(&OKLAB_TO_LMS, [self.l, self.c * h.cos(), self.c * h.sin()]).map(|v| v.powi(3));
        let [r, g, b] = mul(&XYZ_TO_LIN_SRGB, mul(&LMS_TO_XYZ, lms));
        let gamma = |c: f64| {
            let a = c.abs();
            c.signum()
                * if a <= 0.003_130_8 {
                    12.92 * a
                } else {
                    1.055 * a.powf(1.0 / 2.4) - 0.055
                }
        };
        Rgba::new(gamma(r), gamma(g), gamma(b), self.alpha)
    }
}

// CSS Color 4 conversion matrices (sRGB ↔ XYZ D65 ↔ OKLab), as browsers use them.
type Matrix = [[f64; 3]; 3];

const LIN_SRGB_TO_XYZ: Matrix = [
    [
        506_752.0 / 1_228_815.0,
        87_881.0 / 245_763.0,
        12_673.0 / 70_218.0,
    ],
    [
        87_098.0 / 409_605.0,
        175_762.0 / 245_763.0,
        12_673.0 / 175_545.0,
    ],
    [
        7_918.0 / 409_605.0,
        87_881.0 / 737_289.0,
        1_001_167.0 / 1_053_270.0,
    ],
];
const XYZ_TO_LIN_SRGB: Matrix = [
    [12_831.0 / 3_959.0, -329.0 / 214.0, -1_974.0 / 3_959.0],
    [
        -851_781.0 / 878_810.0,
        1_648_619.0 / 878_810.0,
        36_519.0 / 878_810.0,
    ],
    [705.0 / 12_673.0, -2_585.0 / 12_673.0, 705.0 / 667.0],
];
const XYZ_TO_LMS: Matrix = [
    [
        0.819_022_437_996_703,
        0.361_906_260_052_890_4,
        -0.128_873_781_520_987_9,
    ],
    [
        0.032_983_653_932_388_5,
        0.929_286_861_586_343_4,
        0.036_144_666_350_642_4,
    ],
    [
        0.048_177_189_359_624_2,
        0.264_239_531_752_730_8,
        0.633_547_828_469_430_9,
    ],
];
const LMS_TO_XYZ: Matrix = [
    [
        1.226_879_875_845_924_3,
        -0.557_814_994_460_217_1,
        0.281_391_045_665_964_7,
    ],
    [
        -0.040_575_745_214_800_8,
        1.112_286_803_280_317,
        -0.071_711_058_065_516_4,
    ],
    [
        -0.076_372_936_674_660_1,
        -0.421_493_332_402_243_2,
        1.586_924_019_836_781_6,
    ],
];
const LMS_TO_OKLAB: Matrix = [
    [
        0.210_454_268_309_314,
        0.793_617_774_702_305_4,
        -0.004_072_043_011_619_3,
    ],
    [
        1.977_998_532_431_168_4,
        -2.428_592_242_048_58,
        0.450_593_709_617_411,
    ],
    [
        0.025_904_042_465_547_8,
        0.782_771_712_457_529_6,
        -0.808_675_754_923_077_4,
    ],
];
const OKLAB_TO_LMS: Matrix = [
    [1.0, 0.396_337_777_376_174_9, 0.215_803_757_309_913_6],
    [1.0, -0.105_561_345_815_658_6, -0.063_854_172_825_813_3],
    [1.0, -0.089_484_177_529_811_9, -1.291_485_548_019_409_2],
];

fn mul(m: &Matrix, v: [f64; 3]) -> [f64; 3] {
    m.map(|row| row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hex_forms() {
        assert_eq!(Rgba::parse_hex("#fff").unwrap().to_hex(), "#ffffffff");
        assert_eq!(Rgba::parse_hex("#f56313").unwrap().to_hex(), "#f56313ff");
        assert_eq!(Rgba::parse_hex("#13131380").unwrap().to_hex(), "#13131380");
        assert!(Rgba::parse_hex("#12345").is_none());
        assert!(Rgba::parse_hex("red").is_none());
    }

    #[test]
    fn mix_into_transparent_only_lowers_alpha() {
        let white = Rgba::WHITE;
        assert_eq!(white.mix(0.05, Rgba::TRANSPARENT).to_hex(), "#ffffff0d");
    }

    #[test]
    fn mix_matches_chromium() {
        // color-mix(in srgb, white 5%, #f56313) == color(srgb 0.962745 0.418824 0.120784)
        let c = Rgba::WHITE.mix(0.05, Rgba::parse_hex("#f56313").unwrap());
        assert!((c.r - 0.962_745).abs() < 1e-5 && (c.b - 0.120_784).abs() < 1e-5);
    }

    #[test]
    fn oklch_round_trips() {
        let c = Rgba::parse_hex("#3a93ff").unwrap();
        let back = c.to_oklch().to_rgba();
        assert!((c.r - back.r).abs() < 1e-6 && (c.g - back.g).abs() < 1e-6);
        // Chromium: oklch(from #3a93ff l calc(c * 1.4) h) == oklch(0.664382 0.25324 255.417).
        // Chromium computes in single precision, hence the tolerance.
        let o = c.to_oklch();
        assert!(
            (o.l - 0.664_382).abs() < 1e-4 && (o.c * 1.4 - 0.253_24).abs() < 1e-4,
            "{o:?}"
        );
    }
}
