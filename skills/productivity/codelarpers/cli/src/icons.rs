//! Course logos: find the studied repository's own logo, and install a chosen file as the course icon.

use crate::course::Course;
use anyhow::{Result, bail};
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const ICON_EXTS: [&str; 7] = ["svg", "png", "webp", "jpg", "jpeg", "gif", "ico"];
const MAX_ICON_BYTES: u64 = 1_500_000;

const SKIP_DIRS: [&str; 26] = [
    ".git", "node_modules", "target", "dist", "build", "out", "vendor", ".venv", "venv", "__pycache__", ".next", ".cache",
    "coverage", ".tox", "third_party", "third-party", "3rdparty", "deps", "Pods", ".idea", "tests", "test", "testdata",
    "fixtures", "examples", "benches",
];
const GOOD_DIRS: [&str; 17] = [
    "assets", "static", "public", "docs", "doc", "images", "img", "media", "branding", "brand", "logo", "logos", ".github", "art",
    "icons", "resources", "res",
];
const BAD_WORDS: [&str; 16] = [
    "screenshot", "banner", "example", "sample", "test", "fixture", "demo", "badge", "avatar", "button", "arrow", "social", "preview",
    "splash", "sponsor", "og-image",
];

#[derive(Serialize, Debug, Clone)]
pub struct Candidate {
    /// Absolute path, or a URL for images the README loads remotely.
    pub location: String,
    pub score: i32,
    pub bytes: u64,
    pub reason: String,
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

fn ext_bonus(ext: &str) -> i32 {
    match ext {
        "svg" => 15,
        "png" => 8,
        "webp" => 5,
        "jpg" | "jpeg" => 2,
        _ => 0,
    }
}

fn score_file(rel: &Path, project: &str, bytes: u64) -> Option<(i32, String)> {
    let ext = ext_of(rel);
    if !ICON_EXTS.contains(&ext.as_str()) || bytes == 0 || bytes > 4_000_000 {
        return None;
    }
    let stem = rel.file_stem()?.to_string_lossy().to_lowercase();
    let mut score = 0;
    let mut why = vec![];
    if stem.contains("logo") {
        score += 60;
        why.push("named logo");
    }
    if stem.contains("icon") {
        score += 35;
        why.push("named icon");
    }
    if ["brand", "mark", "emblem", "mascot"].iter().any(|w| stem.contains(w)) {
        score += 20;
        why.push("brand name");
    }
    if score == 0 {
        return None;
    }
    if !project.is_empty() && stem.contains(project) {
        score += 30;
        why.push("project name");
    }
    // Prefer the full-colour square mark over wordmarks and single-theme variants.
    if ["primary", "color", "colour", "default", "main"].iter().any(|w| stem.contains(w)) {
        score += 8;
    }
    if ["black", "white", "mono", "inverse", "outline", "dark", "light"].iter().any(|w| stem.contains(w)) {
        score -= 6;
    }
    if ["horizontal", "wordmark", "text", "full", "lockup", "vertical"].iter().any(|w| stem.contains(w)) {
        score -= 10;
    }
    score += ext_bonus(&ext);
    let dirs: Vec<String> = rel.parent().map(|p| p.components().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect()).unwrap_or_default();
    score += (dirs.iter().filter(|d| GOOD_DIRS.contains(&d.as_str())).count() as i32 * 6).min(12);
    score -= 3 * dirs.len() as i32;
    if BAD_WORDS.iter().any(|w| stem.contains(w)) {
        score -= 45;
    }
    Some((score, why.join(", ")))
}

fn walk(dir: &Path, root: &Path, project: &str, depth: usize, budget: &mut usize, out: &mut Vec<Candidate>) {
    if depth > 6 || *budget == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) && !(name.starts_with('.') && name != ".github") {
                walk(&path, root, project, depth + 1, budget, out);
            }
        } else if kind.is_file() {
            let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let rel = path.strip_prefix(root).unwrap_or(&path);
            if let Some((score, reason)) = score_file(rel, project, bytes) {
                out.push(Candidate { location: path.display().to_string(), score, bytes, reason });
            }
        }
    }
}

/// Images the README shows: projects usually put their logo first.
fn readme_images(root: &Path) -> Vec<Candidate> {
    let readme = ["README.md", "readme.md", "Readme.md", "README.markdown", "README"].iter().map(|f| root.join(f)).find(|p| p.is_file());
    let Some(text) = readme.and_then(|p| fs::read_to_string(p).ok()) else { return vec![] };
    let re = Regex::new(r#"!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]*?\bsrc\s*=\s*["']([^"']+)["']"#).expect("static regex");
    let mut out = vec![];
    for (i, cap) in re.captures_iter(&text).enumerate().take(6) {
        let src = cap.get(1).or(cap.get(2)).map(|m| m.as_str().to_string()).unwrap_or_default();
        let lower = src.to_lowercase();
        if lower.contains("shields.io") || lower.contains("badge") || lower.contains("/workflows/") {
            continue;
        }
        let order_bonus = 20 - 4 * i as i32;
        if lower.starts_with("http://") || lower.starts_with("https://") {
            let looks = lower.contains("logo") || lower.contains("icon") || lower.contains("brand");
            if looks {
                out.push(Candidate { location: src, score: 40 + order_bonus, bytes: 0, reason: "README image (remote; download it)".into() });
            }
            continue;
        }
        let path = root.join(src.trim_start_matches("./").split(['?', '#']).next().unwrap_or_default());
        let ext = ext_of(&path);
        if path.is_file() && ICON_EXTS.contains(&ext.as_str()) {
            let bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            out.push(Candidate { location: path.display().to_string(), score: 45 + order_bonus + ext_bonus(&ext), bytes, reason: "README image".into() });
        }
    }
    out
}

/// The repository owner's GitHub avatar, which for most projects is their logo.
fn github_avatar(root: &Path) -> Option<Candidate> {
    let url = crate::util::git_ok(&["remote", "get-url", "origin"], Some(root)).ok()?;
    let re = Regex::new(r"github\.com[:/]([A-Za-z0-9_.-]+)/").expect("static regex");
    let owner = re.captures(&url)?.get(1)?.as_str().to_string();
    Some(Candidate {
        location: format!("https://github.com/{owner}.png?size=256"),
        score: 30,
        bytes: 0,
        reason: format!("GitHub avatar of {owner} (remote; check it is the project's logo)"),
    })
}

/// Ranked logo candidates for a project directory, best first.
pub fn find_icons(root: &Path) -> Vec<Candidate> {
    let project = root.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let project = project.split(['-', '_', '.']).next().unwrap_or_default().to_string();
    let mut out = readme_images(root);
    out.extend(github_avatar(root));
    let mut budget = 200_000;
    walk(root, root, &project, 0, &mut budget, &mut out);
    out.sort_by(|a, b| b.score.cmp(&a.score).then(a.location.len().cmp(&b.location.len())));
    out.dedup_by(|a, b| a.location == b.location);
    out.truncate(10);
    out
}

/// Image type from the file's first bytes.
fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF8") {
        Some("gif")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(&[0, 0, 1, 0]) {
        Some("ico")
    } else if String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]).to_lowercase().contains("<svg") {
        Some("svg")
    } else {
        None
    }
}

/// Copy a local file, or download a URL (with curl), into the course as `icon.<ext>`.
pub fn set_icon(course: &mut Course, source: &str, background: Option<String>) -> Result<PathBuf> {
    let tmp;
    let file: PathBuf = if source.starts_with("http://") || source.starts_with("https://") {
        tmp = crate::repo::temp_dir("codelarper-icon")?;
        let dest = tmp.join("download");
        let ok = std::process::Command::new("curl").args(["-fsSL", "--max-time", "30", "-o"]).arg(&dest).arg(source).status()?.success();
        if !ok {
            bail!("could not download {source}");
        }
        dest
    } else {
        crate::paths::absolute(Path::new(source))
    };
    let data = fs::read(&file)?;
    let ext = sniff(&data).map(String::from).unwrap_or_else(|| ext_of(&file));
    if !ICON_EXTS.contains(&ext.as_str()) || (sniff(&data).is_none() && ext != "svg") {
        bail!("{source} is not an image (svg, png, webp, jpg, gif or ico)");
    }
    let bytes = data.len() as u64;
    if bytes > MAX_ICON_BYTES {
        bail!("{source} is {} KB; use an icon under {} KB (an SVG, or a PNG around 256px)", bytes / 1000, MAX_ICON_BYTES / 1000);
    }
    let name = format!("icon.{ext}");
    if let Some(old) = &course.icon {
        if old != &name {
            let _ = fs::remove_file(course.dir.join(old));
        }
    }
    let dest = course.dir.join(&name);
    fs::write(&dest, &data)?;
    course.icon = Some(name);
    course.icon_background = background.filter(|b| !b.is_empty() && b != "none");
    course.save()?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_projects_own_square_logo_outranks_generic_and_wide_variants() {
        let s = |p: &str| score_file(Path::new(p), "bettergov", 4000).map(|x| x.0).unwrap_or(i32::MIN);
        assert!(s("public/logos/svg/BetterGov_Icon-Primary.svg") > s("public/ph-logo.svg"));
        assert!(s("public/logos/svg/BetterGov_Icon-Primary.svg") > s("public/logos/svg/BetterGov_Horizontal-Primary.svg"));
        assert!(s("public/logos/svg/BetterGov_Icon-Primary.svg") > s("public/logos/svg/BetterGov_Icon-Black.svg"));
        assert_eq!(s("src/screenshot.png"), i32::MIN, "unnamed images are not candidates");
    }

    #[test]
    fn sniffs_image_types_from_content() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n...."), Some("png"));
        assert_eq!(sniff(b"<?xml version=\"1.0\"?><svg xmlns=...>"), Some("svg"));
        assert_eq!(sniff(b"<html>not an image</html>"), None);
    }
}
