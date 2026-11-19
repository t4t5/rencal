//! Plugin fonts as their manifest declares them. On the web `@font-face` names a
//! file's family, weight and style; NSH registers a font by the names inside it,
//! so a theme whose bold file calls itself "MS Sans Serif Bold" would get two
//! families. Each WOFF2 file is decoded and its names and style bits rewritten
//! to the declaration, giving NSH a TrueType or OpenType font.

use crate::plugins::FontStyle;

/// Name IDs a declaration replaces: family, subfamily, full name, PostScript
/// name, typographic family and subfamily.
const DECLARED_NAMES: [u16; 6] = [1, 2, 4, 6, 16, 17];

const WINDOWS: u16 = 3;
const UNICODE_BMP: u16 = 1;
const EN_US: u16 = 0x409;

pub fn as_declared(
    woff2: &[u8],
    family: &str,
    weight: u16,
    style: FontStyle,
) -> Result<Vec<u8>, String> {
    let sfnt = nsh_core::font_data(woff2)?;
    rewrite(&sfnt, family, weight, style)
}

fn rewrite(sfnt: &[u8], family: &str, weight: u16, style: FontStyle) -> Result<Vec<u8>, String> {
    let mut tables = read_tables(sfnt)?;
    let bold = weight >= 600;
    let slanted = style != FontStyle::Normal;

    let name = tables
        .iter_mut()
        .find(|table| &table.tag == b"name")
        .ok_or("the font has no name table")?;
    name.data = name_table(&name.data, family, weight, style)?;

    for table in &mut tables {
        match &table.tag {
            b"OS/2" if table.data.len() >= 64 => {
                let version = read_u16(&table.data, 0)?;
                write_u16(&mut table.data, 4, weight);
                let mut selection = read_u16(&table.data, 62)? & !(1 | 1 << 5 | 1 << 6 | 1 << 9);
                if slanted {
                    selection |= 1;
                }
                if style == FontStyle::Oblique && version >= 4 {
                    selection |= 1 << 9;
                }
                if bold {
                    selection |= 1 << 5;
                }
                if !bold && !slanted {
                    selection |= 1 << 6;
                }
                write_u16(&mut table.data, 62, selection);
            }
            b"head" if table.data.len() >= 54 => {
                let mac_style =
                    read_u16(&table.data, 44)? & !0b11 | u16::from(bold) | u16::from(slanted) << 1;
                write_u16(&mut table.data, 44, mac_style);
            }
            _ => {}
        }
    }
    Ok(write_sfnt(&sfnt[..4], tables))
}

struct Table {
    tag: [u8; 4],
    data: Vec<u8>,
}

fn read_tables(sfnt: &[u8]) -> Result<Vec<Table>, String> {
    let version = sfnt.get(..4).ok_or("the font is truncated")?;
    if !matches!(version, [0, 1, 0, 0] | b"OTTO" | b"true") {
        return Err("the font is not a single TrueType or OpenType font".to_owned());
    }
    let count = read_u16(sfnt, 4)?;
    (0..usize::from(count))
        .map(|index| {
            let record = 12 + index * 16;
            let tag = sfnt
                .get(record..record + 4)
                .ok_or("the font is truncated")?
                .try_into()
                .map_err(|_| "the font is truncated")?;
            let offset = read_u32(sfnt, record + 8)? as usize;
            let length = read_u32(sfnt, record + 12)? as usize;
            let data = sfnt
                .get(offset..offset.saturating_add(length))
                .ok_or("a font table is out of bounds")?
                .to_vec();
            Ok(Table { tag, data })
        })
        .collect()
}

fn name_table(
    original: &[u8],
    family: &str,
    weight: u16,
    style: FontStyle,
) -> Result<Vec<u8>, String> {
    let count = usize::from(read_u16(original, 2)?);
    let storage = usize::from(read_u16(original, 4)?);
    let mut records: Vec<(u16, u16, u16, u16, Vec<u8>)> = Vec::with_capacity(count + 6);
    for index in 0..count {
        let record = 6 + index * 12;
        let platform = read_u16(original, record)?;
        let encoding = read_u16(original, record + 2)?;
        let language = read_u16(original, record + 4)?;
        let id = read_u16(original, record + 6)?;
        // Format 1 language tags aren't carried over; the table is written as format 0.
        if DECLARED_NAMES.contains(&id) || language >= 0x8000 {
            continue;
        }
        let length = usize::from(read_u16(original, record + 8)?);
        let start = storage + usize::from(read_u16(original, record + 10)?);
        let text = original
            .get(start..start + length)
            .ok_or("a font name is out of bounds")?;
        records.push((platform, encoding, language, id, text.to_vec()));
    }

    let subfamily = subfamily(weight, style);
    let ribbi = match (weight >= 600, style != FontStyle::Normal) {
        (false, false) => "Regular",
        (true, false) => "Bold",
        (false, true) => "Italic",
        (true, true) => "Bold Italic",
    };
    let postscript: String = format!("{family}-{}", subfamily.replace(' ', ""))
        .chars()
        .filter(|c| c.is_ascii_graphic() && !"[](){}<>/%".contains(*c))
        .take(63)
        .collect();
    for (id, text) in [
        (1, family.to_owned()),
        (2, ribbi.to_owned()),
        (4, format!("{family} {subfamily}")),
        (6, postscript),
        (16, family.to_owned()),
        (17, subfamily),
    ] {
        let utf16 = text.encode_utf16().flat_map(u16::to_be_bytes).collect();
        records.push((WINDOWS, UNICODE_BMP, EN_US, id, utf16));
    }
    records
        .sort_by_key(|&(platform, encoding, language, id, _)| (platform, encoding, language, id));

    let storage = 6 + records.len() * 12;
    let mut table = Vec::new();
    let mut strings: Vec<u8> = Vec::new();
    table.extend(0u16.to_be_bytes());
    table.extend(
        u16::try_from(records.len())
            .map_err(|_| "too many font names")?
            .to_be_bytes(),
    );
    table.extend(
        u16::try_from(storage)
            .map_err(|_| "too many font names")?
            .to_be_bytes(),
    );
    for (platform, encoding, language, id, text) in &records {
        let length = u16::try_from(text.len()).map_err(|_| "a font name is too long")?;
        let offset = u16::try_from(strings.len()).map_err(|_| "the font's names are too long")?;
        for field in [*platform, *encoding, *language, *id, length, offset] {
            table.extend(field.to_be_bytes());
        }
        strings.extend(text);
    }
    table.extend(strings);
    Ok(table)
}

/// "Bold Italic", "Light", "Regular": the style a font's full name ends with.
fn subfamily(weight: u16, style: FontStyle) -> String {
    let weight_name = match weight {
        ..=149 => "Thin",
        150..=249 => "ExtraLight",
        250..=349 => "Light",
        350..=449 => "",
        450..=549 => "Medium",
        550..=649 => "SemiBold",
        650..=749 => "Bold",
        750..=849 => "ExtraBold",
        _ => "Black",
    };
    let style_name = match style {
        FontStyle::Normal => "",
        FontStyle::Italic => "Italic",
        FontStyle::Oblique => "Oblique",
    };
    match (weight_name, style_name) {
        ("", "") => "Regular".to_owned(),
        (name, "") | ("", name) => name.to_owned(),
        (weight_name, style_name) => format!("{weight_name} {style_name}"),
    }
}

fn write_sfnt(version: &[u8], mut tables: Vec<Table>) -> Vec<u8> {
    tables.sort_by_key(|table| table.tag);
    let count = tables.len() as u16;
    let power = 1u16 << (15 - count.max(1).leading_zeros());
    let search_range = power * 16;
    let mut font = Vec::new();
    font.extend(version);
    font.extend(count.to_be_bytes());
    font.extend(search_range.to_be_bytes());
    font.extend((power.trailing_zeros() as u16).to_be_bytes());
    font.extend((count * 16 - search_range).to_be_bytes());

    let mut offset = 12 + tables.len() * 16;
    let mut head_offset = None;
    for table in &mut tables {
        if &table.tag == b"head" && table.data.len() >= 12 {
            table.data[8..12].fill(0);
            head_offset = Some(offset);
        }
        font.extend(table.tag);
        font.extend(checksum(&table.data).to_be_bytes());
        font.extend((offset as u32).to_be_bytes());
        font.extend((table.data.len() as u32).to_be_bytes());
        offset += table.data.len().next_multiple_of(4);
    }
    for table in &tables {
        font.extend(&table.data);
        font.resize(font.len().next_multiple_of(4), 0);
    }
    if let Some(head) = head_offset {
        let adjustment = 0xB1B0_AFBAu32.wrapping_sub(checksum(&font));
        font[head + 8..head + 12].copy_from_slice(&adjustment.to_be_bytes());
    }
    font
}

fn checksum(data: &[u8]) -> u32 {
    data.chunks(4).fold(0u32, |sum, chunk| {
        let mut word = [0; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum.wrapping_add(u32::from_be_bytes(word))
    })
}

fn read_u16(data: &[u8], at: usize) -> Result<u16, String> {
    data.get(at..at + 2)
        .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
        .ok_or_else(|| "the font is truncated".to_owned())
}

fn read_u32(data: &[u8], at: usize) -> Result<u32, String> {
    data.get(at..at + 4)
        .map(|bytes| u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        .ok_or_else(|| "the font is truncated".to_owned())
}

fn write_u16(data: &mut [u8], at: usize, value: u16) {
    data[at..at + 2].copy_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &[u8] = include_bytes!("fixtures/pixel.woff2");

    fn name(face: &ttf_parser::Face, id: u16) -> Option<String> {
        face.names()
            .into_iter()
            .filter(|name| name.name_id == id && name.is_unicode())
            .find_map(|name| name.to_string())
    }

    #[test]
    fn renames_a_woff2_font_to_its_declared_face() {
        let font = as_declared(FIXTURE, "Pixelated Sans", 700, FontStyle::Italic).unwrap();
        let face = ttf_parser::Face::parse(&font, 0).unwrap();

        assert_eq!(nsh_core::font_family(&font).unwrap(), "Pixelated Sans");
        assert_eq!(name(&face, 1).as_deref(), Some("Pixelated Sans"));
        assert_eq!(name(&face, 2).as_deref(), Some("Bold Italic"));
        assert_eq!(
            name(&face, 4).as_deref(),
            Some("Pixelated Sans Bold Italic")
        );
        assert_eq!(name(&face, 6).as_deref(), Some("PixelatedSans-BoldItalic"));
        assert_eq!(face.weight().to_number(), 700);
        assert!(face.is_bold());
        assert!(face.is_italic());
        // Glyphs survive the rewrite.
        assert!(face.glyph_index('A').is_some());
    }

    #[test]
    fn regular_faces_drop_style_bits_and_keep_a_valid_checksum() {
        let bold = as_declared(FIXTURE, "Pixel", 700, FontStyle::Normal).unwrap();
        let regular = rewrite(&bold, "Pixel", 400, FontStyle::Normal).unwrap();
        let face = ttf_parser::Face::parse(&regular, 0).unwrap();

        assert_eq!(name(&face, 2).as_deref(), Some("Regular"));
        assert_eq!(face.weight().to_number(), 400);
        assert!(face.is_regular());
        assert_eq!(checksum(&regular), 0xB1B0_AFBA);
    }

    #[test]
    fn names_intermediate_weights() {
        assert_eq!(subfamily(300, FontStyle::Normal), "Light");
        assert_eq!(subfamily(400, FontStyle::Oblique), "Oblique");
        assert_eq!(subfamily(600, FontStyle::Italic), "SemiBold Italic");
    }

    #[test]
    fn rejects_data_that_is_no_woff2_font() {
        assert!(as_declared(b"wOF2font", "Pixel", 400, FontStyle::Normal).is_err());
    }
}
