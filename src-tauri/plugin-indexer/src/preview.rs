use std::io::{Cursor, Write};
use std::path::Path;

use anyhow::{Context, Result, bail};
use image::{ImageDecoder, ImageEncoder, ImageFormat, ImageReader, codecs::png::PngEncoder};
use reqwest::{StatusCode, Url};
use sha2::{Digest, Sha256};

use super::GithubClient;

pub const INPUT_LIMIT: usize = 10 * 1024 * 1024;
const PIXEL_LIMIT: u64 = 20_000_000;
const MAX_EDGE: u32 = 960;

pub struct Preview {
    filename: String,
    bytes: Vec<u8>,
}

impl Preview {
    pub fn url(&self) -> String {
        format!("https://rencal.org/plugin-previews/{}", self.filename)
    }

    pub fn write(&self, directory: &Path) -> Result<()> {
        std::fs::create_dir_all(directory)?;
        let mut file = tempfile::NamedTempFile::new_in(directory)?;
        file.write_all(&self.bytes)?;
        file.persist(directory.join(&self.filename))?;
        Ok(())
    }
}

pub async fn fetch(client: &dyn GithubClient, url: Url) -> Result<Option<Preview>> {
    let response = client.get(url, INPUT_LIMIT).await?;
    if response.status == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status.is_success() {
        bail!("preview download returned HTTP {}", response.status);
    }
    process(&response.body).map(Some)
}

fn process(bytes: &[u8]) -> Result<Preview> {
    if bytes.len() > INPUT_LIMIT {
        bail!("preview exceeds the 10 MiB input limit");
    }
    if image::guess_format(bytes)? != ImageFormat::Png {
        bail!("preview must be a PNG image");
    }
    // Constructing the decoder reads headers only. Check the pixel count before
    // DynamicImage allocates a full decoded frame; retain the decoder's memory limit too.
    let decoder = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png)
        .into_decoder()
        .context("invalid PNG headers")?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > PIXEL_LIMIT {
        bail!("preview exceeds the 20-megapixel decoded limit or has empty dimensions");
    }
    let image = image::DynamicImage::from_decoder(decoder).context("invalid PNG pixels")?;
    let image = if width > MAX_EDGE || height > MAX_EDGE {
        image.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Lanczos3)
    } else {
        image
    }
    .to_rgba8();
    let mut bytes = Vec::new();
    // A fresh encoder copies no source metadata or animation frames.
    PngEncoder::new(&mut bytes).write_image(
        image.as_raw(),
        image.width(),
        image.height(),
        image::ExtendedColorType::Rgba8,
    )?;
    let filename = format!("{:x}.png", Sha256::digest(&bytes));
    Ok(Preview { filename, bytes })
}
