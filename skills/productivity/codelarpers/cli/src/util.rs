use anyhow::{Context, Result, bail};
use std::collections::BTreeMap;
use std::fs;
use std::io::IsTerminal;
use std::path::Path;
use std::process::{Command, Output};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("parsing {}", path.display()))
}

/// Write JSON atomically (temp file + rename) so readers never see a torn file.
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(&tmp, format!("{}\n", serde_json::to_string_pretty(value)?))?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn write_file(path: &Path, content: &str, executable: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    if executable {
        set_executable(path)?;
    }
    Ok(())
}

pub fn set_executable(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perm = fs::metadata(path)?.permissions();
        perm.set_mode(perm.mode() | 0o755);
        fs::set_permissions(path, perm)?;
    }
    Ok(())
}

pub fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path).map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.exists()
    }
}

pub fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from).with_context(|| format!("reading {}", from.display()))? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if kind.is_symlink() {
            let link = fs::read_link(entry.path())?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(link, &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Parse a flat `key: value` front-matter block. Returns (data, body).
pub fn front_matter(text: &str) -> (BTreeMap<String, String>, String) {
    let mut data = BTreeMap::new();
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return (data, text.to_string());
    };
    let Some(end) = rest.find("\n---") else {
        return (data, text.to_string());
    };
    for line in rest[..end].lines() {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim();
            if !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
                data.insert(key.to_string(), v.trim().trim_matches(|c| c == '"' || c == '\'').to_string());
            }
        }
    }
    let after = &rest[end + 4..];
    let body = after.strip_prefix("\r\n").or_else(|| after.strip_prefix('\n')).unwrap_or(after);
    (data, body.to_string())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Local calendar day (YYYY-MM-DD) of an RFC 3339 timestamp or bare date.
pub fn local_day(ts: &str) -> String {
    if ts.len() == 10 {
        return ts.to_string();
    }
    chrono::DateTime::parse_from_rfc3339(ts)
        .map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| ts.chars().take(10).collect())
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Small xorshift RNG: no dependency, good enough for ids and test seeds.
pub struct Rng(u64);
impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed.max(1))
    }
    pub fn from_time() -> Self {
        let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
        Rng::new(n ^ (std::process::id() as u64) << 17)
    }
    pub fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    pub fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
}

/// A CodeCrafters-style stage id: two letters and a digit, e.g. `kp1`.
pub fn stage_code(taken: &[String]) -> String {
    let letters: Vec<char> = "abcdefghjkmnpqrstuvwxyz".chars().collect();
    let mut rng = Rng::from_time();
    loop {
        let code = format!(
            "{}{}{}",
            letters[rng.below(letters.len() as u64) as usize],
            letters[rng.below(letters.len() as u64) as usize],
            rng.below(10)
        );
        if !taken.contains(&code) {
            return code;
        }
    }
}

pub fn git(args: &[&str], cwd: Option<&Path>) -> Result<Output> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.output().context("running git (is it installed?)")
}

pub fn git_ok(args: &[&str], cwd: Option<&Path>) -> Result<String> {
    let out = git(args, cwd)?;
    if !out.status.success() {
        bail!("git {} failed: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| format!("{s:?}"))
}

pub fn shell_quote(arg: &str) -> String {
    if !arg.is_empty() && arg.chars().all(|c| c.is_ascii_alphanumeric() || "@%+=:,./-_".contains(c)) {
        arg.to_string()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
}

fn color_on() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none())
}

pub fn paint(code: &str, text: &str) -> String {
    if color_on() { format!("\x1b[{code}m{text}\x1b[0m") } else { text.to_string() }
}
pub fn bold(t: &str) -> String {
    paint("1", t)
}
pub fn red(t: &str) -> String {
    paint("31", t)
}
pub fn green(t: &str) -> String {
    paint("32", t)
}
pub fn yellow(t: &str) -> String {
    paint("33", t)
}
pub fn blue(t: &str) -> String {
    paint("34", t)
}
pub fn cyan(t: &str) -> String {
    paint("36", t)
}
pub fn gray(t: &str) -> String {
    paint("90", t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn front_matter_splits_meta_and_body() {
        let (meta, body) = front_matter("---\ntitle: A \"quoted\" title\npath: src/a.rs\n---\nBody\n");
        assert_eq!(meta["title"], "A \"quoted\" title");
        assert_eq!(meta["path"], "src/a.rs");
        assert_eq!(body, "Body\n");
        assert_eq!(front_matter("no meta").1, "no meta");
    }

    #[test]
    fn stage_codes_are_two_letters_and_a_digit() {
        let code = stage_code(&[]);
        assert_eq!(code.len(), 3);
        assert!(code[..2].chars().all(|c| c.is_ascii_lowercase()) && code.as_bytes()[2].is_ascii_digit());
    }
}
