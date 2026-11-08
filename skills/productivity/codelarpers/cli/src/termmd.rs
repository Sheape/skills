//! Render challenge markdown for a terminal (`codelarper task`).

use crate::util::{bold, cyan, gray};
use regex::Regex;
use std::sync::OnceLock;

fn width() -> usize {
    std::env::var("COLUMNS").ok().and_then(|c| c.parse().ok()).unwrap_or(80usize).clamp(40, 100) - 4
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("static regex")
}

fn inline(text: &str) -> String {
    static LINK: OnceLock<Regex> = OnceLock::new();
    static STRONG: OnceLock<Regex> = OnceLock::new();
    static CODE: OnceLock<Regex> = OnceLock::new();
    let t = LINK.get_or_init(|| re(r"\[([^\]]+)\]\(([^)]+)\)")).replace_all(text, |c: &regex::Captures| {
        format!("{} {}", &c[1], gray(&format!("({})", &c[2])))
    });
    let t = STRONG.get_or_init(|| re(r"\*\*([^*]+)\*\*")).replace_all(&t, |c: &regex::Captures| bold(&c[1]));
    CODE.get_or_init(|| re(r"`([^`]+)`")).replace_all(&t, |c: &regex::Captures| cyan(&c[1])).to_string()
}

fn visible_len(s: &str) -> usize {
    static ANSI: OnceLock<Regex> = OnceLock::new();
    ANSI.get_or_init(|| re(r"\x1b\[[0-9;]*m")).replace_all(s, "").chars().count()
}

fn wrap(text: &str, indent: &str) -> String {
    let mut lines = vec![];
    let mut line = String::new();
    for word in text.split_whitespace() {
        if !line.is_empty() && visible_len(&line) + 1 + visible_len(word) > width() - indent.len() {
            lines.push(format!("{indent}{line}"));
            line = word.to_string();
        } else {
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
    }
    if !line.is_empty() {
        lines.push(format!("{indent}{line}"));
    }
    lines.join("\n")
}

pub fn render(md: &str) -> String {
    static SUMMARY: OnceLock<Regex> = OnceLock::new();
    static TAGS: OnceLock<Regex> = OnceLock::new();
    let src = SUMMARY.get_or_init(|| re(r"(?s)<summary>(.*?)</summary>")).replace_all(md, |c: &regex::Captures| {
        format!("\n#### {}\n", c[1].trim())
    });
    let src = TAGS.get_or_init(|| re(r"</?[a-zA-Z][^>]*>")).replace_all(&src, "");
    let mut out: Vec<String> = vec![];
    let mut para: Vec<String> = vec![];
    let flush = |para: &mut Vec<String>, out: &mut Vec<String>| {
        if !para.is_empty() {
            out.push(wrap(&inline(&para.join(" ")), "  "));
            out.push(String::new());
            para.clear();
        }
    };
    let lines: Vec<&str> = src.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            flush(&mut para, &mut out);
            i += 1;
            while i < lines.len() && !lines[i].trim_start().starts_with("```") {
                out.push(format!("    {}", cyan(lines[i])));
                i += 1;
            }
            out.push(String::new());
        } else if trimmed.starts_with('|') {
            flush(&mut para, &mut out);
            let is_rule = trimmed.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '));
            if !is_rule {
                let cells: Vec<String> = trimmed.trim_matches('|').split('|').map(|c| inline(c.trim())).collect();
                out.push(format!("    {}", cells.join(&gray("  │  "))));
            }
            if !lines.get(i + 1).is_some_and(|l| l.trim_start().starts_with('|')) {
                out.push(String::new());
            }
        } else if line.starts_with('#') {
            flush(&mut para, &mut out);
            let text = line.trim_start_matches('#').trim();
            if text != "Click to expand/collapse" {
                out.push(format!("  {}", bold(text)));
                out.push(String::new());
            }
        } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            flush(&mut para, &mut out);
            let depth = (line.len() - trimmed.len()) / 2;
            out.push(wrap(&format!("• {}", inline(&trimmed[2..])), &format!("  {}", "  ".repeat(depth))));
        } else if trimmed.split_once(". ").is_some_and(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit())) {
            flush(&mut para, &mut out);
            out.push(wrap(&inline(trimmed), "  "));
        } else if trimmed.is_empty() {
            flush(&mut para, &mut out);
            if out.last().is_some_and(|l| !l.is_empty()) {
                out.push(String::new());
            }
        } else {
            para.push(trimmed.to_string());
        }
        i += 1;
    }
    flush(&mut para, &mut out);
    out.join("\n")
}
