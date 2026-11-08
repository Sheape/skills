//! The learner's repository: `codelarper.yml` plus a local bare "remote" per course.

use crate::course::Course;
use crate::paths;
use crate::util::{copy_dir, git_ok, set_executable};
use anyhow::{Context, Result, bail};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const CONFIG_FILE: &str = "codelarper.yml";

pub fn repo_initialized(slug: &str) -> bool {
    paths::repo_path(slug).join("HEAD").exists()
}

pub fn config_text(course: &Course, language: &str) -> String {
    format!(
        "# Links this repository to a codelarpers challenge. The CLI reads it.\ncourse: {}\n\n# Language this repository is written in.\nlanguage: {language}\n\n# Set to true to see every tester step. Very verbose.\ndebug: false\n",
        course.slug
    )
}

/// Copy `source` to `dest` as a ready-to-test working copy (adds codelarper.yml, fixes modes).
pub fn materialise(course: &Course, language: &str, source: &Path, dest: &Path) -> Result<()> {
    copy_dir(source, dest)?;
    fs::write(dest.join(CONFIG_FILE), config_text(course, language))?;
    for rel in ["your_program.sh", ".codelarper/run.sh", ".codelarper/compile.sh"] {
        let f = dest.join(rel);
        if f.exists() {
            set_executable(&f)?;
        }
    }
    Ok(())
}

pub fn temp_dir(prefix: &str) -> Result<PathBuf> {
    let mut rng = crate::util::Rng::from_time();
    let dir = std::env::temp_dir().join(format!("{prefix}-{}-{:x}", std::process::id(), rng.next()));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Create the course's local bare remote from its starter. Idempotent.
pub fn init_repo(course: &Course, language: &str) -> Result<PathBuf> {
    let bare = paths::repo_path(&course.slug);
    if repo_initialized(&course.slug) {
        return Ok(bare);
    }
    if !course.languages.iter().any(|l| l == language) {
        bail!("{} has no starter for \"{language}\"", course.slug);
    }
    let starter = course.dir.join("starters").join(language);
    if !starter.is_dir() {
        bail!("missing starter {}", starter.display());
    }
    let work = temp_dir("codelarper-init")?;
    let result = (|| -> Result<()> {
        materialise(course, language, &starter, &work)?;
        let id = ["-c", "user.name=codelarper", "-c", "user.email=codelarper@localhost"];
        git_ok(&["init", "-q", "-b", "main"], Some(&work))?;
        git_ok(&["add", "-A"], Some(&work))?;
        git_ok(&[id[0], id[1], id[2], id[3], "commit", "-q", "-m", "init [codelarper]"], Some(&work))?;
        fs::create_dir_all(paths::repos_dir())?;
        git_ok(&["clone", "-q", "--bare", &work.to_string_lossy(), &bare.to_string_lossy()], None)?;
        Ok(())
    })();
    let _ = fs::remove_dir_all(&work);
    result.map(|_| bare)
}

pub struct RepoConfig {
    pub course: String,
    pub language: String,
    pub debug: bool,
}

pub fn read_config(root: &Path) -> Result<RepoConfig> {
    let text = fs::read_to_string(root.join(CONFIG_FILE)).with_context(|| format!("reading {CONFIG_FILE}"))?;
    let mut map = BTreeMap::new();
    for line in text.lines() {
        let line = line.split('#').next().unwrap_or("");
        if let Some((k, v)) = line.split_once(':') {
            map.insert(k.trim().to_string(), v.trim().trim_matches(|c| c == '"' || c == '\'').to_string());
        }
    }
    Ok(RepoConfig {
        course: map.get("course").cloned().unwrap_or_default(),
        language: map.get("language").cloned().unwrap_or_default(),
        debug: map.get("debug").is_some_and(|v| v == "true"),
    })
}

/// Walk up from `start` to the directory holding codelarper.yml.
pub fn find_repo_root(start: &Path) -> Option<PathBuf> {
    let mut dir = paths::absolute(start);
    loop {
        if dir.join(CONFIG_FILE).is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}
