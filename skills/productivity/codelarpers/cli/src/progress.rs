//! The learner's progress: an append-only event log per course, folded into state.

use crate::course::{Course, Stage};
use crate::paths;
use crate::util::{local_day, now_iso, today};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs::{self, OpenOptions};
use std::io::Write;

pub const HINT_PENALTY: f64 = 0.1;
pub const EXAMPLES_PENALTY: f64 = 0.5;
pub const MIN_MULTIPLIER: f64 = 0.1;

pub fn base_points(difficulty: &str) -> u32 {
    match difficulty {
        "very_easy" => 10,
        "easy" => 20,
        "medium" => 40,
        "hard" => 80,
        _ => 20,
    }
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    #[serde(default)]
    pub ts: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub points: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub passed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answers: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ext: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

impl Event {
    pub fn new(kind: &str) -> Self {
        Event { kind: kind.to_string(), ..Default::default() }
    }
    pub fn stage(mut self, id: &str) -> Self {
        self.stage = Some(id.to_string());
        self
    }
}

pub fn read_events(slug: &str) -> Vec<Event> {
    let Ok(text) = fs::read_to_string(paths::events_file(slug)) else { return vec![] };
    // A torn final line from a crash is skipped rather than poisoning the log.
    text.lines().filter(|l| !l.trim().is_empty()).filter_map(|l| serde_json::from_str(l).ok()).collect()
}

pub fn append_event(slug: &str, mut event: Event) -> Result<Event> {
    let file = paths::events_file(slug);
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    if event.ts.is_empty() {
        event.ts = now_iso();
    }
    let mut f = OpenOptions::new().create(true).append(true).open(&file)?;
    writeln!(f, "{}", serde_json::to_string(&event)?)?;
    Ok(event)
}

#[derive(Serialize, Clone, Copy, Debug)]
pub struct Worth {
    pub base: u32,
    pub multiplier: f64,
    pub points: u32,
}

/// What a stage pays right now, given the hints and code examples already used.
pub fn stage_worth(stage: &Stage, st: &StageState) -> Worth {
    let base = base_points(&stage.difficulty);
    let penalty = HINT_PENALTY * st.hints as f64 + if st.examples_viewed { EXAMPLES_PENALTY } else { 0.0 };
    let multiplier = (1.0 - penalty).max(MIN_MULTIPLIER);
    Worth { base, multiplier, points: (base as f64 * multiplier).round() as u32 }
}

#[derive(Serialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StageState {
    pub attempts: u32,
    pub passes: u32,
    pub hints: u32,
    pub examples_viewed: bool,
    pub completed_at: Option<String>,
    pub points: u32,
    pub rating: Option<Value>,
    pub last_attempt_at: Option<String>,
}

#[derive(Serialize, Default, Clone, Copy, Debug)]
pub struct DayStat {
    pub attempts: u32,
    pub completions: u32,
    pub points: u32,
}

#[derive(Serialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub intro_done: bool,
    pub intro: Option<Value>,
    pub setup_done: bool,
    pub ping_cwd: Option<String>,
    pub extensions: BTreeMap<String, bool>,
    pub stages: HashMap<String, StageState>,
    pub days: BTreeMap<String, DayStat>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub current_stage_id: Option<String>,
    pub active_stage_ids: Vec<String>,
    pub completed_count: u32,
    pub points: u32,
    pub attempts: u32,
    pub streak: u32,
    pub longest_streak: u32,
}

impl State {
    pub fn stage(&self, id: &str) -> StageState {
        self.stages.get(id).cloned().unwrap_or_default()
    }
}

pub fn derive(course: &Course) -> State {
    derive_from(course, &read_events(&course.slug))
}

/// Fold a course's event log into the learner's current state.
pub fn derive_from(course: &Course, events: &[Event]) -> State {
    let start = events.iter().rposition(|e| e.kind == "reset").map(|i| i + 1).unwrap_or(0);
    let mut s = State {
        extensions: course.extensions.iter().map(|e| (e.slug.clone(), true)).collect(),
        stages: course.stages.iter().map(|st| (st.id.clone(), StageState::default())).collect(),
        ..Default::default()
    };
    for e in &events[start..] {
        let day = local_day(&e.ts);
        match e.kind.as_str() {
            "intro" => {
                s.intro_done = true;
                s.intro = e.answers.clone();
                s.started_at.get_or_insert(e.ts.clone());
            }
            "ping" => {
                s.setup_done = true;
                if e.cwd.is_some() {
                    s.ping_cwd = e.cwd.clone();
                }
                s.started_at.get_or_insert(e.ts.clone());
            }
            "attempt" => {
                s.setup_done = true;
                s.started_at.get_or_insert(e.ts.clone());
                s.days.entry(day).or_default().attempts += 1;
                if let Some(st) = e.stage.as_ref().and_then(|id| s.stages.get_mut(id)) {
                    st.attempts += 1;
                    st.last_attempt_at = Some(e.ts.clone());
                    if e.passed == Some(true) {
                        st.passes += 1;
                    }
                }
            }
            "complete" => {
                if let Some(st) = e.stage.as_ref().and_then(|id| s.stages.get_mut(id)) {
                    if st.completed_at.is_none() {
                        st.completed_at = Some(e.ts.clone());
                        st.points = e.points.unwrap_or(0);
                        let d = s.days.entry(day).or_default();
                        d.completions += 1;
                        d.points += st.points;
                    }
                }
            }
            "hint" => {
                if let Some(st) = e.stage.as_ref().and_then(|id| s.stages.get_mut(id)) {
                    st.hints = st.hints.max(e.n.unwrap_or(0));
                }
            }
            "examples" => {
                if let Some(st) = e.stage.as_ref().and_then(|id| s.stages.get_mut(id)) {
                    if st.completed_at.is_none() {
                        st.examples_viewed = true;
                    }
                }
            }
            "rating" => {
                if let Some(st) = e.stage.as_ref().and_then(|id| s.stages.get_mut(id)) {
                    st.rating = e.value.clone();
                }
            }
            "extension" => {
                if let (Some(ext), Some(on)) = (&e.ext, e.enabled) {
                    if let Some(v) = s.extensions.get_mut(ext) {
                        *v = on;
                    }
                }
            }
            _ => {}
        }
    }

    let active: Vec<&Stage> = course
        .ordered_stages()
        .into_iter()
        .filter(|st| st.extension.as_ref().is_none_or(|x| s.extensions.get(x).copied().unwrap_or(true)))
        .collect();
    s.active_stage_ids = active.iter().map(|st| st.id.clone()).collect();
    s.current_stage_id = active.iter().find(|st| s.stages[&st.id].completed_at.is_none()).map(|st| st.id.clone());
    s.completed_count = s.stages.values().filter(|st| st.completed_at.is_some()).count() as u32;
    s.points = s.stages.values().map(|st| st.points).sum();
    s.attempts = s.stages.values().map(|st| st.attempts).sum();
    if s.current_stage_id.is_none() && !active.is_empty() {
        s.completed_at = active.iter().filter_map(|st| s.stages[&st.id].completed_at.clone()).max();
    }
    let (streak, longest) = streaks(&s.days);
    s.streak = streak;
    s.longest_streak = longest;
    s
}

fn day_number(d: &str) -> i64 {
    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map(|x| x.num_days_from_ce() as i64).unwrap_or(0)
}

use chrono::Datelike;

/// (current, longest) runs of consecutive active days.
pub fn streaks(days: &BTreeMap<String, DayStat>) -> (u32, u32) {
    let active: Vec<i64> =
        days.iter().filter(|(_, v)| v.attempts > 0 || v.completions > 0).map(|(d, _)| day_number(d)).collect();
    let (mut longest, mut run, mut prev) = (0u32, 0u32, None::<i64>);
    for d in &active {
        run = if prev.is_some_and(|p| d - p == 1) { run + 1 } else { 1 };
        longest = longest.max(run);
        prev = Some(*d);
    }
    let current = match active.last() {
        Some(last) if day_number(&today()) - last <= 1 => run,
        _ => 0,
    };
    (current, longest)
}

pub fn merge_days<'a>(all: impl Iterator<Item = &'a BTreeMap<String, DayStat>>) -> BTreeMap<String, DayStat> {
    let mut out: BTreeMap<String, DayStat> = BTreeMap::new();
    for days in all {
        for (d, v) in days {
            let t = out.entry(d.clone()).or_default();
            t.attempts += v.attempts;
            t.completions += v.completions;
            t.points += v.points;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::course::{Course, Extension, Stage};

    fn course() -> Course {
        let stage = |id: &str, d: &str, ext: Option<&str>| Stage {
            id: id.into(),
            name: id.into(),
            difficulty: d.into(),
            extension: ext.map(String::from),
            extra: Default::default(),
        };
        Course {
            slug: "t".into(),
            name: "T".into(),
            short: String::new(),
            kind: "tutorial".into(),
            languages: vec!["python".into()],
            created: "2026-01-01".into(),
            icon: None,
            icon_background: None,
            source: Default::default(),
            extensions: vec![Extension { slug: "x".into(), name: "X".into(), description: String::new() }],
            stages: vec![stage("aa1", "easy", None), stage("bb2", "medium", None), stage("cc3", "hard", Some("x"))],
            extra: Default::default(),
            dir: Default::default(),
        }
    }

    fn ev(kind: &str, stage: Option<&str>) -> Event {
        Event { ts: "2026-11-08T10:00:00.000Z".into(), stage: stage.map(String::from), ..Event::new(kind) }
    }

    #[test]
    fn hints_and_examples_reduce_what_a_stage_pays() {
        let c = course();
        let s = &c.stages[1];
        let mut st = StageState::default();
        assert_eq!(stage_worth(s, &st).points, 40);
        st.hints = 2;
        assert_eq!(stage_worth(s, &st).points, 32);
        st.examples_viewed = true;
        assert_eq!(stage_worth(s, &st).points, 12);
        st.hints = 9;
        assert_eq!(stage_worth(s, &st).points, 4, "never below the 10% floor");
    }

    #[test]
    fn current_stage_advances_and_skips_disabled_extensions() {
        let c = course();
        let mut events = vec![ev("attempt", Some("aa1")), Event { points: Some(20), ..ev("complete", Some("aa1")) }];
        let s = derive_from(&c, &events);
        assert_eq!(s.current_stage_id.as_deref(), Some("bb2"));
        assert_eq!(s.points, 20);
        assert_eq!(s.attempts, 1);
        events.push(Event { points: Some(40), ..ev("complete", Some("bb2")) });
        events.push(Event { ext: Some("x".into()), enabled: Some(false), ..ev("extension", None) });
        let s = derive_from(&c, &events);
        assert_eq!(s.current_stage_id, None, "disabled extension stages are not required");
        assert!(s.completed_at.is_some());
    }

    #[test]
    fn reset_forgets_earlier_progress() {
        let c = course();
        let events = vec![Event { points: Some(20), ..ev("complete", Some("aa1")) }, ev("reset", None)];
        let s = derive_from(&c, &events);
        assert_eq!(s.points, 0);
        assert_eq!(s.current_stage_id.as_deref(), Some("aa1"));
    }

    #[test]
    fn examples_viewed_after_completion_cost_nothing() {
        let c = course();
        let events = vec![Event { points: Some(20), ..ev("complete", Some("aa1")) }, ev("examples", Some("aa1"))];
        assert!(!derive_from(&c, &events).stage("aa1").examples_viewed);
    }
}
