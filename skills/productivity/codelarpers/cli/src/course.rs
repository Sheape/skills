//! Course files on disk: `courses/<slug>/course.json` plus markdown, tests, starters.

use crate::paths;
use crate::util::{front_matter, is_executable, read_json, read_text};
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const DIFFICULTIES: [&str; 4] = ["very_easy", "easy", "medium", "hard"];
pub const KINDS: [&str; 2] = ["codebase", "tutorial"];

pub fn language_name(id: &str) -> String {
    match id {
        "c" => "C",
        "cpp" => "C++",
        "csharp" => "C#",
        "dart" => "Dart",
        "elixir" => "Elixir",
        "gleam" => "Gleam",
        "go" => "Go",
        "haskell" => "Haskell",
        "java" => "Java",
        "javascript" => "JavaScript",
        "kotlin" => "Kotlin",
        "lua" => "Lua",
        "ocaml" => "OCaml",
        "odin" => "Odin",
        "php" => "PHP",
        "python" => "Python",
        "ruby" => "Ruby",
        "rust" => "Rust",
        "scala" => "Scala",
        "shell" => "Shell",
        "swift" => "Swift",
        "typescript" => "TypeScript",
        "zig" => "Zig",
        other => return other.to_string(),
    }
    .to_string()
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Source {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Extension {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Stage {
    pub id: String,
    pub name: String,
    pub difficulty: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Course {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub short: String,
    pub kind: String,
    #[serde(default)]
    pub languages: Vec<String>,
    #[serde(default)]
    pub created: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// CSS colour of a tile drawn behind the icon, for dark or monochrome logos.
    #[serde(default, rename = "iconBackground", skip_serializing_if = "Option::is_none")]
    pub icon_background: Option<String>,
    #[serde(default)]
    pub source: Source,
    #[serde(default)]
    pub extensions: Vec<Extension>,
    #[serde(default)]
    pub stages: Vec<Stage>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
    #[serde(skip)]
    pub dir: PathBuf,
}

impl Course {
    pub fn stage(&self, reference: &str) -> Option<&Stage> {
        let id = reference.trim_start_matches('#').to_lowercase();
        self.stages.iter().find(|s| s.id == id)
    }

    pub fn stage_dir(&self, id: &str) -> PathBuf {
        self.dir.join("stages").join(id)
    }

    /// Base stages first, then each extension's stages in extension order.
    pub fn ordered_stages(&self) -> Vec<&Stage> {
        let mut out: Vec<&Stage> = self.stages.iter().filter(|s| s.extension.is_none()).collect();
        for ext in &self.extensions {
            out.extend(self.stages.iter().filter(|s| s.extension.as_deref() == Some(ext.slug.as_str())));
        }
        out
    }

    pub fn save(&self) -> Result<()> {
        crate::util::write_json(&self.dir.join("course.json"), self)
    }
}

pub fn load_course(slug: &str) -> Option<Course> {
    load_course_at(&paths::course_dir(slug))
}

pub fn load_course_at(dir: &Path) -> Option<Course> {
    let file = dir.join("course.json");
    if !file.exists() {
        return None;
    }
    match read_json::<Course>(&file) {
        Ok(mut c) => {
            c.dir = dir.to_path_buf();
            Some(c)
        }
        Err(e) => {
            eprintln!("warning: skipping {}: {e:#}", file.display());
            None
        }
    }
}

pub fn require_course(slug: &str) -> Result<Course> {
    load_course(slug).ok_or_else(|| anyhow!("no course \"{slug}\" in {}", paths::tilde(&paths::courses_dir())))
}

/// Every course in the catalog, oldest first: project 3 is the third card.
pub fn list_courses() -> Vec<Course> {
    let Ok(entries) = fs::read_dir(paths::courses_dir()) else { return vec![] };
    let mut courses: Vec<Course> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| load_course_at(&e.path()))
        .collect();
    courses.sort_by(|a, b| a.created.cmp(&b.created).then(a.name.cmp(&b.name)));
    courses
}

#[derive(Serialize, Clone, Debug)]
pub struct Section {
    pub title: String,
    pub body: String,
}

/// Split markdown on `## ` headings. Returns (preamble, sections).
pub fn split_sections(md: &str) -> (String, Vec<Section>) {
    let mut preamble = String::new();
    let mut sections: Vec<Section> = vec![];
    let mut in_fence = false;
    for line in md.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        if !in_fence && line.starts_with("## ") {
            sections.push(Section { title: line[3..].trim().to_string(), body: String::new() });
            continue;
        }
        match sections.last_mut() {
            Some(s) => {
                s.body.push_str(line);
                s.body.push('\n');
            }
            None => {
                preamble.push_str(line);
                preamble.push('\n');
            }
        }
    }
    for s in &mut sections {
        s.body = s.body.trim().to_string();
    }
    (preamble.trim().to_string(), sections)
}

pub fn hints(course: &Course, id: &str) -> Vec<Section> {
    let md = read_text(&course.stage_dir(id).join("hints.md")).unwrap_or_default();
    if md.trim().is_empty() {
        return vec![];
    }
    let (pre, sections) = split_sections(&md);
    if sections.is_empty() { vec![Section { title: "Hint".into(), body: pre }] } else { sections }
}

#[derive(Serialize, Clone, Debug)]
pub struct Example {
    pub file: String,
    #[serde(flatten)]
    pub meta: std::collections::BTreeMap<String, String>,
    pub body: String,
}

pub fn examples(course: &Course, id: &str) -> Vec<Example> {
    let dir = course.stage_dir(id).join("examples");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let mut files: Vec<PathBuf> =
        entries.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "md")).collect();
    files.sort();
    files
        .into_iter()
        .filter_map(|p| {
            let text = fs::read_to_string(&p).ok()?;
            let (meta, body) = front_matter(&text);
            Some(Example { file: p.file_name()?.to_string_lossy().to_string(), meta, body })
        })
        .collect()
}

pub fn instructions(course: &Course, id: &str) -> String {
    read_text(&course.stage_dir(id).join("instructions.md")).unwrap_or_default()
}

pub fn resources(course: &Course, id: &str) -> String {
    read_text(&course.stage_dir(id).join("resources.md")).unwrap_or_default()
}

/// The test script of a stage, if any: test.py, test.sh, test.mjs, test.js, or an executable `test`.
pub fn test_script(course: &Course, id: &str) -> Option<PathBuf> {
    let dir = course.stage_dir(id);
    ["test.py", "test.sh", "test.mjs", "test.js", "test"].iter().map(|f| dir.join(f)).find(|p| p.is_file())
}

pub struct Lint {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Static checks on a course's files.
pub fn lint(course: &Course) -> Lint {
    let mut errors = vec![];
    let mut warnings = vec![];
    let folder = course.dir.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    if course.slug != folder {
        errors.push(format!("course.json slug \"{}\" must match its folder \"{folder}\"", course.slug));
    }
    if course.name.trim().is_empty() {
        errors.push("course.json is missing \"name\"".into());
    }
    if course.short.trim().is_empty() {
        errors.push("course.json is missing \"short\" (the one-line catalog description)".into());
    }
    if !KINDS.contains(&course.kind.as_str()) {
        errors.push(format!("kind must be one of {}", KINDS.join(", ")));
    }
    if course.languages.is_empty() {
        errors.push("course.json \"languages\" must list at least one language".into());
    }
    for lang in &course.languages {
        let starter = course.dir.join("starters").join(lang);
        if !starter.is_dir() {
            errors.push(format!("missing starter: starters/{lang}/"));
        } else {
            let run = starter.join(".codelarper/run.sh");
            if !run.is_file() {
                errors.push(format!("starters/{lang}/.codelarper/run.sh is required"));
            } else if !is_executable(&run) {
                errors.push(format!("starters/{lang}/.codelarper/run.sh must be executable"));
            }
            if !starter.join("your_program.sh").is_file() {
                errors.push(format!("starters/{lang}/your_program.sh is required"));
            }
            if !starter.join("README.md").is_file() {
                warnings.push(format!("starters/{lang}/README.md is missing"));
            }
        }
        if !course.dir.join("solution").join(lang).is_dir() {
            warnings.push(format!("no solution/{lang}/: tests cannot be proven passable"));
        }
    }
    match &course.icon {
        None => warnings.push("no icon: the catalog falls back to letters (see `codelarper dev find-icon`)".into()),
        Some(icon) if !course.dir.join(icon).is_file() => errors.push(format!("icon \"{icon}\" does not exist")),
        Some(icon) => {
            let ext = Path::new(icon).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !crate::icons::ICON_EXTS.contains(&ext.as_str()) {
                errors.push(format!("icon \"{icon}\" must be one of {}", crate::icons::ICON_EXTS.join(", ")));
            }
        }
    }
    if course.kind == "codebase" && course.source.project.is_none() && course.source.repository.is_none() {
        errors.push("codebase courses need source.project or source.repository".into());
    }
    for (f, marker) in [("overview.md", "<One paragraph"), ("introduction.md", "<Two or three sentences")] {
        match read_text(&course.dir.join(f)) {
            None => errors.push(format!("{f} is missing")),
            Some(body) if body.contains(marker) => errors.push(format!("{f} still has template placeholders")),
            Some(_) => {}
        }
    }
    if course.stages.is_empty() {
        errors.push("course.json has no stages".into());
    }

    let mut seen: Vec<String> = vec![];
    let mut saw_extension = false;
    for stage in &course.stages {
        let label = format!("stage {} ({})", stage.id, stage.name);
        let valid_id = stage.id.len() == 3
            && stage.id.chars().take(2).all(|c| c.is_ascii_lowercase())
            && stage.id.chars().nth(2).is_some_and(|c| c.is_ascii_digit());
        if !valid_id {
            errors.push(format!("{label}: id must be two lowercase letters and a digit, e.g. \"kp1\""));
        }
        if seen.contains(&stage.id) {
            errors.push(format!("{label}: duplicate id"));
        }
        seen.push(stage.id.clone());
        if !DIFFICULTIES.contains(&stage.difficulty.as_str()) {
            errors.push(format!("{label}: difficulty must be one of {}", DIFFICULTIES.join(", ")));
        }
        match &stage.extension {
            Some(ext) if !course.extensions.iter().any(|e| &e.slug == ext) => {
                errors.push(format!("{label}: unknown extension \"{ext}\""))
            }
            Some(_) => saw_extension = true,
            None if saw_extension => warnings.push(format!("{label}: base stage listed after an extension stage")),
            None => {}
        }
        let dir = course.stage_dir(&stage.id);
        if !dir.is_dir() {
            errors.push(format!("{label}: missing folder stages/{}/", stage.id));
            continue;
        }
        let text = instructions(course, &stage.id);
        if text.trim().is_empty() {
            errors.push(format!("{label}: instructions.md is missing or empty"));
        } else if !text.lines().any(|l| l.trim_start_matches('#').trim() == "Tests" && l.starts_with("##")) {
            warnings.push(format!("{label}: instructions.md has no \"### Tests\" section"));
        }
        for (file, markers) in [
            ("instructions.md", &["<One capability", "<Teach the concept"][..]),
            ("hints.md", &["<A nudge", "<The gotcha most"][..]),
            ("resources.md", &["(<url>)"][..]),
            ("tests.json", &["<what this case proves>", "\"<command>\""][..]),
        ] {
            let body = read_text(&dir.join(file)).unwrap_or_default();
            if markers.iter().any(|m| body.contains(m)) {
                errors.push(format!("{label}: {file} still has template placeholders"));
            }
        }
        let cases = dir.join("tests.json");
        let script = test_script(course, &stage.id);
        if !cases.is_file() && script.is_none() {
            errors.push(format!("{label}: needs tests.json or a test script (test.py, test.sh, ...)"));
        }
        if cases.is_file() {
            match read_json::<Value>(&cases) {
                Ok(v) => match v.get("cases").and_then(|c| c.as_array()) {
                    Some(list) if !list.is_empty() => {
                        for (i, c) in list.iter().enumerate() {
                            if c.get("expect").and_then(|e| e.as_object()).is_none_or(|e| e.is_empty()) {
                                errors.push(format!("{label}: tests.json case {} has no \"expect\"", i + 1));
                            }
                        }
                    }
                    _ => errors.push(format!("{label}: tests.json needs a non-empty \"cases\" array")),
                },
                Err(e) => errors.push(format!("{label}: tests.json does not parse: {e:#}")),
            }
        }
        if let Some(s) = &script {
            let ext = s.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
            if ext.is_empty() && !is_executable(s) {
                errors.push(format!("{label}: stages/{}/test must be executable", stage.id));
            }
        }
        if !dir.join("hints.md").is_file() {
            warnings.push(format!("{label}: no hints.md"));
        }
        if examples(course, &stage.id).is_empty() {
            warnings.push(format!("{label}: no code examples"));
        }
        for ex in examples(course, &stage.id) {
            let has = |k: &str| ex.meta.get(k).is_some_and(|v| !v.is_empty());
            if !ex.body.contains("```") {
                errors.push(format!("{label}: example {} has no code fence", ex.file));
            }
            if !has("title") {
                errors.push(format!("{label}: example {} needs a title", ex.file));
            }
            if course.kind == "codebase" && !(has("path") && has("commit")) {
                errors.push(format!("{label}: example {} must cite the codebase's own path and commit", ex.file));
            }
            if course.kind == "tutorial" && !(has("source") && has("url") && has("license")) {
                errors.push(format!("{label}: example {} must cite source, url and license of the real-world code", ex.file));
            }
        }
    }
    if let Ok(entries) = fs::read_dir(course.dir.join("stages")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !seen.contains(&name) {
                warnings.push(format!("stages/{name}/ is not listed in course.json"));
            }
        }
    }
    Lint { errors, warnings }
}

#[cfg(test)]
mod tests {
    use super::split_sections;

    #[test]
    fn sections_ignore_headings_inside_code_fences() {
        let (pre, s) = split_sections("Intro\n\n## One\nbody\n```\n## not a heading\n```\n## Two\nmore\n");
        assert_eq!(pre, "Intro");
        assert_eq!(s.len(), 2);
        assert!(s[0].body.contains("## not a heading"));
    }
}
