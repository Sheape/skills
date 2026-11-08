//! Where codelarper keeps its persistent data. One home per user, shared by every project.

use std::env;
use std::path::{Path, PathBuf};

pub const DEFAULT_PORT: u16 = 7357;

/// `$CODELARPER_HOME`, else `${XDG_DATA_HOME:-~/.local/share}/codelarper`.
pub fn home() -> PathBuf {
    if let Ok(h) = env::var("CODELARPER_HOME") {
        if !h.is_empty() {
            return absolute(Path::new(&h));
        }
    }
    let data = env::var("XDG_DATA_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| user_home().join(".local").join("share"));
    data.join("codelarper")
}

pub fn user_home() -> PathBuf {
    env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
}

pub fn absolute(p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        env::current_dir().unwrap_or_default().join(p)
    }
}

pub fn courses_dir() -> PathBuf {
    home().join("courses")
}
pub fn repos_dir() -> PathBuf {
    home().join("repos")
}
pub fn progress_dir() -> PathBuf {
    home().join("progress")
}
pub fn runs_dir() -> PathBuf {
    home().join("runs")
}
pub fn lib_dir() -> PathBuf {
    home().join("lib")
}
pub fn course_dir(slug: &str) -> PathBuf {
    courses_dir().join(slug)
}
pub fn repo_path(slug: &str) -> PathBuf {
    repos_dir().join(format!("{slug}.git"))
}
pub fn events_file(slug: &str) -> PathBuf {
    progress_dir().join(slug).join("events.jsonl")
}
pub fn latest_run_file(slug: &str) -> PathBuf {
    runs_dir().join(slug).join("latest.json")
}

pub fn port() -> u16 {
    env::var("CODELARPER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT)
}

pub fn web_url(port: u16, path: &str) -> String {
    format!("http://localhost:{port}{path}")
}

/// Replace the user's home prefix with `~` for display.
pub fn tilde(p: &Path) -> String {
    let h = user_home();
    match p.strip_prefix(&h) {
        Ok(rest) if h != Path::new("/") => format!("~/{}", rest.display()),
        _ => p.display().to_string(),
    }
}
