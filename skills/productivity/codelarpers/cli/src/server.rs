//! `codelarpers serve`: the embedded web UI plus a small JSON API over the data directory.

use crate::course::{self, Course, Stage, language_name};
use crate::paths;
use crate::progress::{self, EXAMPLES_PENALTY, Event, HINT_PENALTY, State, append_event, base_points, derive, stage_worth};
use crate::repo::{init_repo, repo_initialized};
use crate::util::read_text;
use anyhow::Result;
use axum::body::Bytes;
use axum::extract::{Path as UrlPath, State as Ext};
use axum::http::{StatusCode, Uri, header};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{Stream, StreamExt, stream};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::convert::Infallible;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

#[derive(rust_embed::RustEmbed)]
#[folder = "$OUT_DIR/web"]
struct Assets;

#[derive(Clone)]
struct App {
    tx: broadcast::Sender<String>,
    build: String,
    port: u16,
}

struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
    }
}
type ApiResult = Result<Response, ApiError>;

fn not_found(what: String) -> ApiError {
    ApiError(StatusCode::NOT_FOUND, what)
}

fn ok_json(v: Value) -> ApiResult {
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(v)).into_response())
}

fn load(slug: &str) -> Result<Course, ApiError> {
    course::load_course(slug).ok_or_else(|| not_found(format!("no course \"{slug}\"")))
}

fn load_stage(course: &Course, id: &str) -> Result<Stage, ApiError> {
    course.stage(id).cloned().ok_or_else(|| not_found(format!("no stage \"{id}\"")))
}

fn body_json(b: &Bytes) -> Value {
    serde_json::from_slice(b).unwrap_or(Value::Null)
}

fn user_name() -> &'static str {
    static NAME: OnceLock<String> = OnceLock::new();
    NAME.get_or_init(|| {
        let out = std::process::Command::new("git").args(["config", "--global", "user.name"]).output();
        let name = out.map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        if name.is_empty() { std::env::var("USER").unwrap_or_else(|_| "You".into()) } else { name }
    })
}

fn course_language(course: &Course, state: &State) -> Option<String> {
    if course.languages.len() == 1 {
        return course.languages.first().cloned();
    }
    let chosen = state.intro.as_ref()?.get("language")?.as_str()?.to_string();
    course.languages.contains(&chosen).then_some(chosen)
}

fn summary(course: &Course, state: &State) -> Value {
    let lang = course_language(course, state);
    let icon = course.icon.as_ref().filter(|i| course.dir.join(i).is_file()).map(|_| format!("/api/courses/{}/icon", course.slug));
    json!({
        "slug": course.slug,
        "name": course.name,
        "short": course.short,
        "kind": course.kind,
        "created": course.created,
        "source": course.source,
        "languages": course.languages.iter().map(|l| json!({ "id": l, "name": language_name(l) })).collect::<Vec<_>>(),
        "language": lang.map(|l| json!({ "id": l, "name": language_name(&l) })),
        "iconBackground": if icon.is_some() { course.icon_background.clone() } else { None },
        "icon": icon,
        "stageCount": state.active_stage_ids.len(),
        "totalStages": course.stages.len(),
        "completed": state.completed_count,
        "points": state.points,
        "maxPoints": course.stages.iter().map(|s| base_points(&s.difficulty)).sum::<u32>(),
        "attempts": state.attempts,
        "currentStageId": state.current_stage_id,
        "introDone": state.intro_done,
        "setupDone": state.setup_done,
        "started": state.started_at.is_some(),
        "finished": state.completed_at.is_some(),
        "repoReady": repo_initialized(&course.slug),
    })
}

fn stage_status(state: &State, stage: &Stage) -> &'static str {
    if state.stage(&stage.id).completed_at.is_some() {
        "completed"
    } else if stage.extension.as_ref().is_some_and(|x| !state.extensions.get(x).copied().unwrap_or(true)) {
        "disabled"
    } else if state.current_stage_id.as_deref() == Some(stage.id.as_str()) {
        "current"
    } else {
        "pending"
    }
}

fn course_detail(course: &Course) -> Value {
    let state = derive(course);
    let (description, faq) = course::split_sections(&read_text(&course.dir.join("overview.md")).unwrap_or_default());
    let mut v = summary(course, &state);
    let extra = json!({
        "overview": { "description": description, "faq": faq },
        "introduction": read_text(&course.dir.join("introduction.md")).unwrap_or_default(),
        "extensions": course.extensions.iter().map(|e| json!({
            "slug": e.slug, "name": e.name, "description": e.description,
            "enabled": state.extensions.get(&e.slug).copied().unwrap_or(true),
        })).collect::<Vec<_>>(),
        "stages": course.ordered_stages().iter().map(|s| {
            let st = state.stage(&s.id);
            json!({
                "id": s.id, "name": s.name, "difficulty": s.difficulty, "extension": s.extension,
                "status": stage_status(&state, s), "points": st.points, "worth": stage_worth(s, &st).points,
                "base": base_points(&s.difficulty), "attempts": st.attempts,
            })
        }).collect::<Vec<_>>(),
        "progress": {
            "intro": state.intro, "pingCwd": state.ping_cwd, "streak": state.streak,
            "longestStreak": state.longest_streak, "startedAt": state.started_at,
            "completedAt": state.completed_at, "days": state.days,
        },
        "repo": {
            "path": paths::repo_path(&course.slug),
            "display": paths::tilde(&paths::repo_path(&course.slug)),
            "cloneDir": format!("codelarpers-{}", course.slug),
        },
    });
    if let (Value::Object(a), Value::Object(b)) = (&mut v, extra) {
        a.extend(b);
    }
    v
}

fn stage_detail(course: &Course, stage: &Stage) -> Value {
    let state = derive(course);
    let st = state.stage(&stage.id);
    let idx = state.active_stage_ids.iter().position(|id| id == &stage.id);
    let hints = course::hints(course, &stage.id);
    json!({
        "id": stage.id, "name": stage.name, "difficulty": stage.difficulty, "extension": stage.extension,
        "status": stage_status(&state, stage),
        "position": idx.map(|i| i + 1),
        "instructions": course::instructions(course, &stage.id),
        "resources": course::resources(course, &stage.id),
        "hints": hints.iter().enumerate().map(|(i, h)| {
            let revealed = (i as u32) < st.hints;
            json!({ "n": i + 1, "title": h.title, "revealed": revealed, "body": if revealed { Some(&h.body) } else { None } })
        }).collect::<Vec<_>>(),
        "examplesCount": course::examples(course, &stage.id).len(),
        "examplesUnlocked": st.completed_at.is_some() || st.examples_viewed,
        "progress": st,
        "worth": stage_worth(stage, &st),
        "penalties": { "hint": HINT_PENALTY, "examples": EXAMPLES_PENALTY },
        "prev": idx.and_then(|i| i.checked_sub(1)).and_then(|i| state.active_stage_ids.get(i)),
        "next": idx.and_then(|i| state.active_stage_ids.get(i + 1)),
    })
}

fn totals(courses: &[Course]) -> (Value, BTreeMap<String, progress::DayStat>) {
    let states: Vec<State> = courses.iter().map(derive).collect();
    let days = progress::merge_days(states.iter().map(|s| &s.days));
    let (streak, longest) = progress::streaks(&days);
    (
        json!({
            "points": states.iter().map(|s| s.points).sum::<u32>(),
            "completed": states.iter().map(|s| s.completed_count).sum::<u32>(),
            "attempts": states.iter().map(|s| s.attempts).sum::<u32>(),
            "courses": courses.len(),
            "streak": streak,
            "longestStreak": longest,
        }),
        days,
    )
}

fn timeline(courses: &[Course]) -> Vec<Value> {
    let mut items: Vec<Value> = vec![];
    for c in courses {
        let state = derive(c);
        if !c.created.is_empty() {
            items.push(json!({ "ts": format!("{}T00:00:00", c.created), "kind": "created", "course": c.slug, "courseName": c.name,
                "project": c.source.project.as_ref().map(|p| paths::tilde(Path::new(p))) }));
        }
        if let Some(ts) = &state.started_at {
            items.push(json!({ "ts": ts, "kind": "started", "course": c.slug, "courseName": c.name,
                "language": course_language(c, &state).map(|l| language_name(&l)) }));
        }
        for s in &c.stages {
            let st = state.stage(&s.id);
            if let Some(ts) = st.completed_at {
                items.push(json!({ "ts": ts, "kind": "stage", "course": c.slug, "courseName": c.name, "stage": s.id, "stageName": s.name, "points": st.points }));
            }
        }
        if let Some(ts) = &state.completed_at {
            items.push(json!({ "ts": ts, "kind": "finished", "course": c.slug, "courseName": c.name }));
        }
    }
    items.sort_by(|a, b| b["ts"].as_str().cmp(&a["ts"].as_str()));
    items
}

async fn health(Ext(app): Ext<App>) -> ApiResult {
    ok_json(json!({ "app": "codelarpers", "build": app.build, "home": paths::home(), "pid": std::process::id() }))
}

async fn meta(Ext(app): Ext<App>) -> ApiResult {
    let courses = course::list_courses();
    let (t, _) = totals(&courses);
    ok_json(json!({ "user": { "name": user_name() }, "home": paths::tilde(&paths::home()), "port": app.port, "totals": t, "build": app.build }))
}

async fn catalog() -> ApiResult {
    let courses = course::list_courses();
    ok_json(json!({ "courses": courses.iter().map(|c| summary(c, &derive(c))).collect::<Vec<_>>() }))
}

async fn activity() -> ApiResult {
    let (_, days) = totals(&course::list_courses());
    ok_json(json!({ "days": days }))
}

async fn profile() -> ApiResult {
    let courses = course::list_courses();
    let (mut t, days) = totals(&courses);
    t["days"] = json!(days);
    ok_json(json!({
        "user": { "name": user_name() },
        "totals": t,
        "courses": courses.iter().map(|c| summary(c, &derive(c))).collect::<Vec<_>>(),
        "timeline": timeline(&courses),
    }))
}

async fn course_get(UrlPath(slug): UrlPath<String>) -> ApiResult {
    ok_json(course_detail(&load(&slug)?))
}

fn file_response(path: &Path, immutable: bool) -> ApiResult {
    let data = std::fs::read(path).map_err(|_| not_found("file not found".into()))?;
    let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
    let cache = if immutable { "public, max-age=31536000, immutable" } else { "no-store" };
    Ok(([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache.to_string())], data).into_response())
}

async fn course_icon(UrlPath(slug): UrlPath<String>) -> ApiResult {
    let c = load(&slug)?;
    let icon = c.icon.clone().ok_or_else(|| not_found("no icon".into()))?;
    file_response(&c.dir.join(icon), false)
}

/// Course-local images: only `assets/**` and `stages/<id>/assets/**` are served.
async fn course_asset(UrlPath((slug, rest)): UrlPath<(String, String)>) -> ApiResult {
    let c = load(&slug)?;
    let rel = PathBuf::from(&rest);
    if rel.components().any(|p| !matches!(p, std::path::Component::Normal(_))) {
        return Err(not_found("not found".into()));
    }
    let parts: Vec<String> = rel.components().map(|p| p.as_os_str().to_string_lossy().to_string()).collect();
    let allowed = parts.first().is_some_and(|p| p == "assets") || (parts.len() > 3 && parts[0] == "stages" && parts[2] == "assets");
    if !allowed {
        return Err(not_found("not found".into()));
    }
    file_response(&c.dir.join(rel), false)
}

async fn course_run(UrlPath(slug): UrlPath<String>) -> ApiResult {
    let run = crate::util::read_json::<Value>(&paths::latest_run_file(&slug)).unwrap_or(json!({ "status": "idle", "lines": [] }));
    ok_json(run)
}

async fn course_intro(UrlPath(slug): UrlPath<String>, body: Bytes) -> ApiResult {
    let c = load(&slug)?;
    let answers = body_json(&body).get("answers").cloned().unwrap_or(json!({}));
    let lang = answers.get("language").and_then(|l| l.as_str()).map(String::from).or_else(|| (c.languages.len() == 1).then(|| c.languages[0].clone()));
    append_event(&slug, Event { answers: Some(answers), ..Event::new("intro") })?;
    if let Some(l) = lang {
        if c.languages.contains(&l) && !repo_initialized(&slug) {
            init_repo(&c, &l)?;
        }
    }
    ok_json(json!({ "ok": true }))
}

async fn course_extension(UrlPath((slug, ext)): UrlPath<(String, String)>, body: Bytes) -> ApiResult {
    let c = load(&slug)?;
    if !c.extensions.iter().any(|e| e.slug == ext) {
        return Err(not_found(format!("no extension \"{ext}\"")));
    }
    let enabled = body_json(&body).get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    append_event(&slug, Event { ext: Some(ext), enabled: Some(enabled), ..Event::new("extension") })?;
    ok_json(json!({ "ok": true }))
}

async fn course_reset(UrlPath(slug): UrlPath<String>) -> ApiResult {
    load(&slug)?;
    append_event(&slug, Event::new("reset"))?;
    ok_json(json!({ "ok": true }))
}

async fn stage_get(UrlPath((slug, id)): UrlPath<(String, String)>) -> ApiResult {
    let c = load(&slug)?;
    let s = load_stage(&c, &id)?;
    ok_json(stage_detail(&c, &s))
}

async fn stage_examples(UrlPath((slug, id)): UrlPath<(String, String)>) -> ApiResult {
    let c = load(&slug)?;
    let s = load_stage(&c, &id)?;
    let st = derive(&c).stage(&s.id);
    if st.completed_at.is_none() && !st.examples_viewed {
        return Err(ApiError(StatusCode::FORBIDDEN, "gated".into()));
    }
    ok_json(json!({ "kind": c.kind, "examples": course::examples(&c, &s.id) }))
}

async fn stage_unlock(UrlPath((slug, id)): UrlPath<(String, String)>) -> ApiResult {
    let c = load(&slug)?;
    let s = load_stage(&c, &id)?;
    let st = derive(&c).stage(&s.id);
    if st.completed_at.is_none() && !st.examples_viewed {
        append_event(&slug, Event::new("examples").stage(&s.id))?;
    }
    ok_json(json!({ "ok": true }))
}

async fn stage_hint(UrlPath((slug, id)): UrlPath<(String, String)>) -> ApiResult {
    let c = load(&slug)?;
    let s = load_stage(&c, &id)?;
    let st = derive(&c).stage(&s.id);
    if (st.hints as usize) < course::hints(&c, &s.id).len() {
        append_event(&slug, Event { n: Some(st.hints + 1), ..Event::new("hint").stage(&s.id) })?;
    }
    ok_json(json!({ "ok": true }))
}

async fn stage_rating(UrlPath((slug, id)): UrlPath<(String, String)>, body: Bytes) -> ApiResult {
    let c = load(&slug)?;
    let s = load_stage(&c, &id)?;
    let value = body_json(&body).get("value").cloned();
    append_event(&slug, Event { value, ..Event::new("rating").stage(&s.id) })?;
    ok_json(json!({ "ok": true }))
}

async fn events(Ext(app): Ext<App>) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = app.tx.subscribe();
    let hello = stream::once(async { Ok(SseEvent::default().data(r#"{"kind":"hello"}"#)) });
    let updates = stream::unfold(rx, |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(msg) => return Some((Ok(SseEvent::default().data(msg)), rx)),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return None,
            }
        }
    });
    Sse::new(hello.chain(updates)).keep_alive(KeepAlive::default())
}

async fn static_files(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.starts_with("api/") {
        return not_found("not found".into()).into_response();
    }
    if !path.is_empty() {
        if let Some(file) = Assets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
            let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-store" };
            return ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache.to_string())], file.data.into_owned()).into_response();
        }
    }
    match Assets::get("index.html") {
        Some(index) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8".to_string()), (header::CACHE_CONTROL, "no-store".to_string())], index.data.into_owned()).into_response(),
        None => (StatusCode::INTERNAL_SERVER_ERROR, "codelarpers UI is missing from this build").into_response(),
    }
}

/// Watch the data directory and broadcast `{kind, slug}` change notices (debounced) to SSE clients.
fn spawn_watcher(tx: broadcast::Sender<String>) {
    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};
        let (wtx, wrx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = match notify::recommended_watcher(wtx) {
            Ok(w) => w,
            Err(e) => return eprintln!("file watching unavailable ({e}); the UI falls back to polling"),
        };
        let mut roots: Vec<(PathBuf, &str)> = vec![];
        for (dir, kind) in [(paths::progress_dir(), "progress"), (paths::runs_dir(), "run"), (paths::courses_dir(), "course")] {
            let _ = std::fs::create_dir_all(&dir);
            if watcher.watch(&dir, RecursiveMode::Recursive).is_ok() {
                roots.push((dir.canonicalize().unwrap_or(dir.clone()), kind));
                roots.push((dir, kind));
            }
        }
        let mut pending: BTreeMap<String, Value> = BTreeMap::new();
        let mut deadline: Option<Instant> = None;
        loop {
            let wait = deadline.map(|d| d.saturating_duration_since(Instant::now())).unwrap_or(Duration::from_secs(3600));
            match wrx.recv_timeout(wait) {
                Ok(Ok(event)) => {
                    for p in event.paths {
                        if let Some((root, kind)) = roots.iter().find(|(r, _)| p.starts_with(r)) {
                            let slug = p.strip_prefix(root).ok().and_then(|r| r.components().next()).map(|c| c.as_os_str().to_string_lossy().to_string());
                            pending.insert(format!("{kind}:{slug:?}"), json!({ "kind": kind, "slug": slug }));
                            deadline.get_or_insert(Instant::now() + Duration::from_millis(120));
                        }
                    }
                }
                Ok(Err(_)) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    for v in pending.values() {
                        let _ = tx.send(v.to_string());
                    }
                    pending.clear();
                    deadline = None;
                }
                Err(_) => break,
            }
        }
        drop(watcher);
    });
}

pub async fn serve(port: u16, build: String) -> Result<()> {
    let (tx, _) = broadcast::channel(256);
    spawn_watcher(tx.clone());
    let app = App { tx, build, port };
    let router = Router::new()
        .route("/api/health", get(health))
        .route("/api/events", get(events))
        .route("/api/meta", get(meta))
        .route("/api/catalog", get(catalog))
        .route("/api/activity", get(activity))
        .route("/api/profile", get(profile))
        .route("/api/courses/{slug}", get(course_get))
        .route("/api/courses/{slug}/icon", get(course_icon))
        .route("/api/courses/{slug}/asset/{*rest}", get(course_asset))
        .route("/api/courses/{slug}/run", get(course_run))
        .route("/api/courses/{slug}/introduction", post(course_intro))
        .route("/api/courses/{slug}/extensions/{ext}", post(course_extension))
        .route("/api/courses/{slug}/reset", post(course_reset))
        .route("/api/courses/{slug}/stages/{id}", get(stage_get))
        .route("/api/courses/{slug}/stages/{id}/examples", get(stage_examples))
        .route("/api/courses/{slug}/stages/{id}/unlock-examples", post(stage_unlock))
        .route("/api/courses/{slug}/stages/{id}/reveal-hint", post(stage_hint))
        .route("/api/courses/{slug}/stages/{id}/rating", post(stage_rating))
        .fallback(static_files)
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    println!("codelarpers listening on http://localhost:{port} (home {})", paths::home().display());
    axum::serve(listener, router).await?;
    Ok(())
}
