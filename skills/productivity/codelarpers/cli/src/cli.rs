//! Command implementations for the learner (`submit`, `test`, `task`, ...) and authors (`dev ...`).

use crate::course::{self, Course, Stage};
use crate::paths::{self, tilde, web_url};
use crate::progress::{Event, append_event, derive, read_events, stage_worth};
use crate::repo::{self, find_repo_root, init_repo, materialise, read_config, repo_initialized};
use crate::tester::{self, LogLine, Logger, format_line, run_stage, run_tests};
use crate::util::{bold, copy_dir, cyan, git, gray, green, now_iso, red, write_json, yellow};
use anyhow::{Context, Result, anyhow, bail};
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

struct RepoCtx {
    root: PathBuf,
    debug: bool,
    language: String,
    course: Course,
}

fn course_from_repo() -> Result<RepoCtx> {
    let cwd = std::env::current_dir()?;
    let root = find_repo_root(&cwd).ok_or_else(|| {
        anyhow!("Not inside a codelarpers repository (no codelarpers.yml found).\nClone your repository from the challenge's Local Setup page, then run this inside it.")
    })?;
    let config = read_config(&root)?;
    let course = course::load_course(&config.course)
        .ok_or_else(|| anyhow!("codelarpers.yml points at \"{}\", which isn't in {}", config.course, tilde(&paths::courses_dir())))?;
    Ok(RepoCtx { root, debug: config.debug, language: config.language, course })
}

fn url(path: &str) -> String {
    web_url(paths::port(), path)
}

/// `latest.json` for the web UI's logs drawer, flushed at most every 150ms while tests stream.
struct RunRecord {
    file: PathBuf,
    data: serde_json::Value,
    last_flush: Instant,
}

impl RunRecord {
    fn start(course: &Course, stage: &Stage, mode: &str) -> Result<Self> {
        let id = format!("{:x}", std::time::SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis());
        let mut r = RunRecord {
            file: paths::latest_run_file(&course.slug),
            data: json!({ "id": id, "mode": mode, "course": course.slug, "stage": stage.id, "stageName": stage.name,
                "status": "running", "startedAt": now_iso(), "finishedAt": null, "lines": [] }),
            last_flush: Instant::now(),
        };
        r.flush();
        Ok(r)
    }
    fn push(&mut self, line: &LogLine) {
        if let Some(lines) = self.data["lines"].as_array_mut() {
            lines.push(json!(line));
        }
        if self.last_flush.elapsed() > Duration::from_millis(150) {
            self.flush();
        }
    }
    fn flush(&mut self) {
        let _ = write_json(&self.file, &self.data);
        self.last_flush = Instant::now();
    }
    fn finish(&mut self, status: &str) {
        self.data["status"] = json!(status);
        self.data["finishedAt"] = json!(now_iso());
        self.flush();
    }
    fn id(&self) -> String {
        self.data["id"].as_str().unwrap_or_default().to_string()
    }
}

fn commit_and_push(root: &Path, message: &str) -> Result<()> {
    git(&["add", "-A"], Some(root))?;
    let staged = git(&["diff", "--cached", "--quiet"], Some(root))?.status.code() == Some(1);
    if staged {
        let has_name = !String::from_utf8_lossy(&git(&["config", "user.name"], Some(root))?.stdout).trim().is_empty();
        let mut args: Vec<&str> = vec![];
        if !has_name {
            args.extend(["-c", "user.name=codelarpers", "-c", "user.email=codelarpers@localhost"]);
        }
        args.extend(["commit", "-q", "-m", message]);
        let out = git(&args, Some(root))?;
        if !out.status.success() {
            bail!("git commit failed: {}", String::from_utf8_lossy(&out.stderr).trim());
        }
    }
    let sha = String::from_utf8_lossy(&git(&["rev-parse", "--short", "HEAD"], Some(root))?.stdout).trim().to_string();
    if staged {
        println!("Submitting changes (commit: {sha})...");
    } else {
        println!("No changes to commit (HEAD: {sha}).");
    }
    if git(&["remote", "get-url", "origin"], Some(root))?.status.success() {
        let push = git(&["push", "-q", "origin", "HEAD"], Some(root))?;
        if !push.status.success() {
            println!("{}", yellow(&format!("Couldn't push to origin (tests still run): {}", String::from_utf8_lossy(&push.stderr).trim())));
        }
    }
    println!();
    Ok(())
}

pub fn test(submit: bool, previous: bool, message: &str) -> Result<()> {
    let ctx = course_from_repo()?;
    let course = &ctx.course;
    let state = derive(course);
    if !state.setup_done {
        append_event(&course.slug, Event { cwd: Some(ctx.root.display().to_string()), ..Event::new("ping") })?;
    }
    let Some(current_id) = state.current_stage_id.clone() else {
        println!("{}", green(&format!("You've completed every stage of {}. 🎉", course.name)));
        println!("Run /codelarpers in this project again to add more stages.");
        return Ok(());
    };
    let active: Vec<&Stage> = state.active_stage_ids.iter().filter_map(|id| course.stage(id)).collect();
    let idx = active.iter().position(|s| s.id == current_id).unwrap_or(0);
    let current = active[idx];
    let mut stages = vec![current];
    if submit || previous {
        stages.extend(active[..idx].iter().rev());
    }

    if submit {
        commit_and_push(&ctx.root, message)?;
    }
    println!("Initiating test run...\n");
    let mode = if submit { "submit" } else { "test" };
    let record = Arc::new(Mutex::new(RunRecord::start(course, current, mode)?));
    let sink_record = record.clone();
    let sink: tester::Sink = Arc::new(move |l: &LogLine| sink_record.lock().unwrap().push(l));
    let log = Logger::new(false, ctx.debug, Some(sink));
    println!("{}\n", gray("Running tests. Logs should appear shortly..."));
    let result = run_tests(course, &stages, &ctx.root, &log, ctx.debug, tester::default_seed());

    let run_id = record.lock().unwrap().id();
    append_event(
        &course.slug,
        Event { mode: Some(mode.into()), passed: Some(result.passed), failed_stage: result.failed_stage.clone(), run: Some(run_id), ..Event::new("attempt").stage(&current.id) },
    )?;
    record.lock().unwrap().finish(if result.passed { "passed" } else { "failed" });
    println!();
    if !result.passed {
        println!("{}", red("Test failed. Check the logs above for details."));
        if result.tester_error {
            println!("{}", yellow("That failure is a bug in this stage's tests, not in your code. Ask the agent that wrote the course to fix it."));
        } else if result.compile_error {
            println!("{}", gray("Your code didn't compile; the [compile] lines show why."));
        }
        println!("{}", gray(&format!("Stuck? Hints and resources: {}", url(&format!("/courses/{}/stages/{}", course.slug, current.id)))));
        std::process::exit(1);
    }
    if !submit {
        println!("{}", green("Test passed. Congrats!"));
        println!("Run {} to complete stage #{}.", cyan("codelarpers submit"), current.id.to_uppercase());
        return Ok(());
    }
    let worth = stage_worth(current, &derive(course).stage(&current.id));
    append_event(&course.slug, Event { points: Some(worth.points), ..Event::new("complete").stage(&current.id) })?;
    println!("{}", green(&format!("Test passed. Congrats! Stage #{} complete: +{} pts.", current.id.to_uppercase(), worth.points)));
    match derive(course).current_stage_id.and_then(|id| course.stage(&id).cloned()) {
        Some(next) => println!(
            "\nNext up: #{} {}. Run {} or open {}",
            next.id.to_uppercase(),
            next.name,
            cyan("codelarpers task"),
            url(&format!("/courses/{}/stages/{}", course.slug, next.id))
        ),
        None => println!("{}", green(&format!("\nYou've completed {}! 🎉", course.name))),
    }
    Ok(())
}

pub fn task(stage: Option<String>, raw: bool, course_slug: Option<String>) -> Result<()> {
    let course = match course_slug {
        Some(s) => course::require_course(&s)?,
        None => course_from_repo()?.course,
    };
    let state = derive(&course);
    let active: Vec<String> = if state.active_stage_ids.is_empty() {
        course.ordered_stages().iter().map(|s| s.id.clone()).collect()
    } else {
        state.active_stage_ids.clone()
    };
    let mut id = state.current_stage_id.clone().or_else(|| active.last().cloned()).ok_or_else(|| anyhow!("this course has no stages yet"))?;
    if let Some(r) = stage {
        if let Some(n) = r.strip_prefix('+').or(r.strip_prefix('-')).and_then(|n| n.parse::<i64>().ok()) {
            let sign = if r.starts_with('-') { -1 } else { 1 };
            let pos = active.iter().position(|x| x == &id).unwrap_or(0) as i64 + sign * n;
            id = active.get(usize::try_from(pos).map_err(|_| anyhow!("no stage at {r}"))?).cloned().ok_or_else(|| anyhow!("no stage at {r}"))?;
        } else {
            id = course.stage(&r).ok_or_else(|| anyhow!("no stage \"{r}\""))?.id.clone();
        }
    }
    let s = course.stage(&id).expect("stage exists");
    let md = format!("# {} (#{})\n\n{}", s.name, s.id, course::instructions(&course, &s.id));
    if raw {
        println!("{md}");
    } else {
        println!("{}", crate::termmd::render(&md));
        println!("  {}\n", gray(&format!("Web: {}", url(&format!("/courses/{}/stages/{}", course.slug, s.id)))));
    }
    Ok(())
}

pub fn ping() -> Result<()> {
    let ctx = course_from_repo()?;
    append_event(&ctx.course.slug, Event { cwd: Some(ctx.root.display().to_string()), ..Event::new("ping") })?;
    println!("{}", green("Connection successful!"));
    println!("Linked {} to {} ({}).", tilde(&ctx.root), bold(&ctx.course.name), crate::course::language_name(&ctx.language));
    if let Some(s) = derive(&ctx.course).current_stage_id.and_then(|id| ctx.course.stage(&id).cloned()) {
        println!("Current stage: #{} {}  →  {}", s.id.to_uppercase(), s.name, url(&format!("/courses/{}/stages/{}", ctx.course.slug, s.id)));
    }
    Ok(())
}

fn progress_line(c: &Course) -> String {
    let st = derive(c);
    let cur = st.current_stage_id.as_ref().and_then(|id| c.stage(id));
    format!(
        "{} {}\n  {}/{} stages · {} pts · {} attempts{}",
        bold(&c.name),
        gray(&format!("({})", c.slug)),
        st.completed_count,
        st.active_stage_ids.len(),
        st.points,
        st.attempts,
        cur.map(|s| format!(" · current #{} {}", s.id.to_uppercase(), s.name)).unwrap_or_else(|| " · complete".into())
    )
}

pub fn status() -> Result<()> {
    println!("{}", progress_line(&course_from_repo()?.course));
    Ok(())
}

pub fn list() -> Result<()> {
    let courses = course::list_courses();
    if courses.is_empty() {
        println!("No challenges yet. Run /codelarpers in a project to create one.");
    }
    for c in courses {
        println!("{}", progress_line(&c));
    }
    Ok(())
}

/* ---------- server lifecycle ---------- */

pub fn build_id() -> String {
    let mtime = std::env::current_exe()
        .ok()
        .and_then(|p| fs::metadata(p).ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}-{mtime}", env!("CARGO_PKG_VERSION"))
}

fn health(port: u16) -> Option<serde_json::Value> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(1500))).ok()?;
    write!(s, "GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = String::new();
    s.read_to_string(&mut buf).ok()?;
    let (head, body) = buf.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.1 200") {
        return None;
    }
    serde_json::from_str(body.trim()).ok()
}

fn stop_server(port: u16) -> Result<bool> {
    let Some(h) = health(port) else { return Ok(false) };
    if h["app"] != "codelarpers" {
        bail!("port {port} is used by another program");
    }
    if let Some(pid) = h["pid"].as_u64() {
        Command::new("kill").arg(pid.to_string()).status().ok();
    }
    for _ in 0..30 {
        if health(port).is_none() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = fs::remove_file(paths::home().join("server.pid"));
    Ok(true)
}

/// Make sure a server from *this* binary is serving this home on `port`.
pub fn ensure_server(port: u16, restart: bool) -> Result<(String, bool)> {
    let base = web_url(port, "");
    if let Some(h) = health(port) {
        if h["app"] != "codelarpers" {
            bail!("port {port} is in use by another program; set CODELARPERS_PORT");
        }
        if h["home"].as_str() != Some(&paths::home().display().to_string()) {
            bail!("port {port} serves another codelarpers home ({}); set CODELARPERS_PORT", h["home"]);
        }
        if h["build"] == build_id() && !restart {
            return Ok((base, false));
        }
        stop_server(port)?;
    }
    fs::create_dir_all(paths::home())?;
    let log = OpenOptions::new().create(true).append(true).open(paths::home().join("server.log"))?;
    let mut cmd = Command::new(std::env::current_exe()?);
    cmd.args(["serve", "--port", &port.to_string()]).stdin(Stdio::null()).stdout(log.try_clone()?).stderr(log);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let child = cmd.spawn().context("starting the server")?;
    fs::write(paths::home().join("server.pid"), child.id().to_string())?;
    for _ in 0..80 {
        if health(port).is_some() {
            return Ok((base, true));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    bail!("server didn't start; see {}", paths::home().join("server.log").display())
}

pub fn serve(port: u16, detach: bool, stop: bool, status: bool, restart: bool) -> Result<()> {
    if stop {
        println!("{}", if stop_server(port)? { "Stopped." } else { "Not running." });
        return Ok(());
    }
    if status {
        match health(port) {
            Some(h) => println!("Running at {} (pid {}, build {}, home {})", web_url(port, ""), h["pid"], h["build"], h["home"]),
            None => println!("Not running."),
        }
        return Ok(());
    }
    if detach || restart {
        let (u, started) = ensure_server(port, restart)?;
        println!("{}: {u}", if started { "Started" } else { "Already running" });
        return Ok(());
    }
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(crate::server::serve(port, build_id()))
}

pub fn open(course_slug: Option<String>, print: bool) -> Result<()> {
    let port = paths::port();
    let (base, _) = ensure_server(port, false)?;
    let slug = match course_slug {
        Some(s) => Some(s),
        None => find_repo_root(&std::env::current_dir()?).and_then(|r| read_config(&r).ok()).map(|c| c.course),
    };
    let target = match slug {
        Some(s) => {
            let c = course::require_course(&s)?;
            let st = derive(&c);
            match (&st.current_stage_id, st.setup_done) {
                (Some(id), true) => format!("{base}/courses/{s}/stages/{id}"),
                _ => format!("{base}/courses/{s}/overview"),
            }
        }
        None => format!("{base}/catalog"),
    };
    println!("{target}");
    if !print {
        let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        Command::new(opener).arg(&target).stdout(Stdio::null()).stderr(Stdio::null()).status().ok();
    }
    Ok(())
}

/* ---------- dev ---------- */

pub fn dev_find(project: Option<PathBuf>, as_json: bool) -> Result<()> {
    let project = paths::absolute(&project.unwrap_or(std::env::current_dir()?));
    let canon = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let hits: Vec<Course> = course::list_courses()
        .into_iter()
        .filter(|c| c.source.project.as_ref().is_some_and(|p| canon(Path::new(p)) == canon(&project)))
        .collect();
    if as_json {
        let v: Vec<_> = hits.iter().map(|c| json!({ "slug": c.slug, "name": c.name, "kind": c.kind, "stages": c.stages.len(), "dir": c.dir })).collect();
        println!("{}", serde_json::to_string_pretty(&v)?);
    } else if hits.is_empty() {
        println!("No course for {} yet.", tilde(&project));
    } else {
        for c in hits {
            println!("{}", progress_line(&c));
        }
    }
    Ok(())
}

fn print_lint(l: &course::Lint) {
    for w in &l.warnings {
        println!("{}", yellow(&format!("  warning  {w}")));
    }
    for e in &l.errors {
        println!("{}", red(&format!("  error    {e}")));
    }
}

pub fn dev_lint(slug: &str) -> Result<()> {
    let l = course::lint(&course::require_course(slug)?);
    print_lint(&l);
    if l.errors.is_empty() {
        println!("{}", green("Lint clean."));
        Ok(())
    } else {
        bail!("{} lint error(s)", l.errors.len())
    }
}

fn tail(lines: &[LogLine], n: usize) {
    for l in &lines[lines.len().saturating_sub(n)..] {
        println!("    {}", format_line(l));
    }
}

fn prove_solution(course: &Course, lang: &str, stages: &[&Stage], repeat: u32, keep: bool) -> Result<Option<bool>> {
    let src = course.dir.join("solution").join(lang);
    if !src.is_dir() {
        return Ok(None);
    }
    for r in 0..repeat.max(1) {
        let work = repo::temp_dir("codelarpers-solution")?;
        materialise(course, lang, &src, &work)?;
        let log = Logger::new(true, false, None);
        let result = run_tests(course, stages, &work, &log, false, tester::default_seed().wrapping_add(r as u64 * 7919));
        if keep {
            println!("{}", gray(&format!("  kept {}", work.display())));
        } else {
            let _ = fs::remove_dir_all(&work);
        }
        if !result.passed {
            let run = if repeat > 1 { format!(" (run {}/{repeat})", r + 1) } else { String::new() };
            println!("{}", red(&format!("  ✗ solution/{lang} fails stage #{}{run}:", result.failed_stage.unwrap_or_default())));
            tail(&log.snapshot(), 40);
            return Ok(Some(false));
        }
    }
    let seeds = if repeat > 1 { format!(" × {repeat} seeds") } else { String::new() };
    println!("{}", green(&format!("  ✓ solution/{lang} passes {} stage(s){seeds}", stages.len())));
    Ok(Some(true))
}

/// Every near-miss must compile, pass the stages before its own, and fail its own stage on every seed.
fn prove_near_misses(course: &Course, lang: &str, stages: &[&Stage], repeat: u32, keep: bool) -> Result<bool> {
    let solution = course.dir.join("solution").join(lang);
    let seeds: Vec<u64> = (0..repeat.max(1)).map(|r| tester::default_seed().wrapping_add(r as u64 * 7919)).collect();
    let (mut caught, mut ok) = (0, true);
    for (i, stage) in stages.iter().enumerate() {
        for (name, overlay) in course::near_misses(course, &stage.id, lang) {
            let work = repo::temp_dir("codelarpers-near-miss")?;
            materialise(course, lang, &solution, &work)?;
            copy_dir(&overlay, &work)?;
            let log = Logger::new(true, false, None);
            let verdict = near_miss_verdict(course, &stages[..=i], &work, &log, &seeds);
            if keep {
                println!("{}", gray(&format!("  kept {}", work.display())));
            } else {
                let _ = fs::remove_dir_all(&work);
            }
            match verdict {
                Ok(()) => caught += 1,
                Err((msg, show_log)) => {
                    ok = false;
                    println!("{}", red(&format!("  ✗ near-miss {}/{lang}/{name} {msg}", stage.id)));
                    if show_log {
                        tail(&log.snapshot(), 20);
                    }
                }
            }
        }
    }
    if ok && caught > 0 {
        let s = if seeds.len() > 1 { format!(" × {} seeds", seeds.len()) } else { String::new() };
        println!("{}", green(&format!("  ✓ {caught} near-miss(es) for {lang} each fail only their own stage{s}")));
    }
    Ok(ok)
}

/// `stages` ends with the near-miss's own stage. Err carries the reason and whether the log helps.
fn near_miss_verdict(course: &Course, stages: &[&Stage], work: &Path, log: &Logger, seeds: &[u64]) -> Result<(), (String, bool)> {
    let (own, earlier) = stages.split_last().expect("at least the near-miss's own stage");
    if tester::compile(work, log) == Some(false) {
        return Err(("doesn't compile: a near-miss is a working program with one bug".into(), true));
    }
    for (r, &seed) in seeds.iter().enumerate() {
        let run = if seeds.len() > 1 { format!(" (seed {}/{})", r + 1, seeds.len()) } else { String::new() };
        for s in earlier {
            if !run_stage(course, s, work, log, false, seed).passed {
                return Err((format!("fails earlier stage #{}{run}: it should break only #{}", s.id, own.id), true));
            }
        }
        let outcome = run_stage(course, own, work, log, false, seed);
        if outcome.tester_error {
            return Err((format!("crashes the tester at #{}{run}: the test must fail it cleanly", own.id), true));
        }
        if outcome.passed {
            return Err((format!("passes #{}{run}: the tests miss this bug; add a case that catches it", own.id), false));
        }
    }
    Ok(())
}

fn prove_starter_fails(course: &Course, lang: &str, stages: &[&Stage]) -> Result<bool> {
    let work = repo::temp_dir("codelarpers-starter")?;
    materialise(course, lang, &course.dir.join("starters").join(lang), &work)?;
    let log = Logger::new(true, false, None);
    let compiled = tester::compile(&work, &log).unwrap_or(true);
    let mut leaks = vec![];
    if compiled {
        for s in stages {
            if run_stage(course, s, &work, &Logger::new(true, false, None), false, tester::default_seed()).passed {
                leaks.push(format!("#{}", s.id));
            }
        }
    }
    let _ = fs::remove_dir_all(&work);
    if !compiled {
        println!("{}", red(&format!("  ✗ starters/{lang} doesn't compile:")));
        tail(&log.snapshot(), 20);
        return Ok(false);
    }
    if !leaks.is_empty() {
        println!("{}", red(&format!("  ✗ starters/{lang} already passes {}: those tests demand no new code", leaks.join(", "))));
        return Ok(false);
    }
    println!("{}", green(&format!("  ✓ starters/{lang} fails all {} stage(s)", stages.len())));
    Ok(true)
}

pub fn dev_validate(slug: &str, stage: Option<String>, repeat: u32, keep: bool) -> Result<bool> {
    let course = course::require_course(slug)?;
    println!("{}", bold(&format!("Validating {} ({})", course.name, course.slug)));
    let l = course::lint(&course);
    print_lint(&l);
    if !l.errors.is_empty() {
        bail!("not valid: {} lint error(s)", l.errors.len());
    }
    let warn = if l.warnings.is_empty() { String::new() } else { format!(" ({} warnings)", l.warnings.len()) };
    println!("{}", green(&format!("  ✓ lint clean{warn}")));
    let ordered = course.ordered_stages();
    let stages: Vec<&Stage> = match &stage {
        Some(id) => {
            let i = ordered.iter().position(|s| &s.id == id).ok_or_else(|| anyhow!("no stage \"{id}\""))?;
            ordered[..=i].to_vec()
        }
        None => ordered,
    };
    let mut ok = true;
    for lang in &course.languages {
        match prove_solution(&course, lang, &stages, repeat, keep)? {
            None => println!("{}", yellow(&format!("  ! no solution/{lang}; passability unproven"))),
            Some(false) => ok = false,
            Some(true) => ok &= prove_near_misses(&course, lang, &stages, repeat, keep)?,
        }
        ok &= prove_starter_fails(&course, lang, &stages)?;
    }
    if ok {
        println!("{}", green("Valid."));
        Ok(true)
    } else {
        bail!("not valid")
    }
}

pub fn dev_try(slug: &str, dir: &Path, stage: Option<String>) -> Result<()> {
    let course = course::require_course(slug)?;
    let stages: Vec<&Stage> = match &stage {
        Some(id) => vec![course.stage(id).ok_or_else(|| anyhow!("no stage \"{id}\""))?],
        None => course.ordered_stages(),
    };
    let log = Logger::new(false, true, None);
    let r = run_tests(&course, &stages, &paths::absolute(dir), &log, true, tester::default_seed());
    if r.passed { Ok(()) } else { bail!("tests failed") }
}

pub fn dev_publish(slug: &str) -> Result<()> {
    dev_validate(slug, None, 1, false).context("fix the errors above before publishing")?;
    let course = course::require_course(slug)?;
    if course.languages.len() == 1 {
        let bare = init_repo(&course, &course.languages[0])?;
        println!("Learner repository: {}", tilde(&bare));
    } else if !repo_initialized(slug) {
        println!("Multiple languages: the repository is created when the learner picks one on the Introduction page.");
    }
    println!("Published: {}", url(&format!("/courses/{slug}/overview")));
    Ok(())
}

pub fn dev_progress(slug: &str, as_json: bool) -> Result<()> {
    let course = course::require_course(slug)?;
    let state = derive(&course);
    let rows: Vec<serde_json::Value> = course
        .ordered_stages()
        .iter()
        .map(|s| {
            let st = state.stage(&s.id);
            json!({ "id": s.id, "name": s.name, "difficulty": s.difficulty, "extension": s.extension,
                "completed": st.completed_at.is_some(), "attempts": st.attempts, "hints": st.hints,
                "examplesViewed": st.examples_viewed, "rating": st.rating, "points": st.points })
        })
        .collect();
    if as_json {
        let out = json!({ "course": slug, "intro": state.intro, "completed": state.completed_count, "points": state.points,
            "attempts": state.attempts, "streak": state.streak, "currentStageId": state.current_stage_id,
            "events": read_events(slug).len(), "stages": rows });
        println!("{}", serde_json::to_string_pretty(&out)?);
        return Ok(());
    }
    println!("{}", progress_line(&course));
    if let Some(intro) = &state.intro {
        println!("  intro: {intro}");
    }
    for r in rows {
        println!(
            "  {} #{} {:<38} {:>3} attempts  hints {}{}{}",
            if r["completed"] == true { green("✓") } else { " ".into() },
            r["id"].as_str().unwrap_or(""),
            r["name"].as_str().unwrap_or(""),
            r["attempts"],
            r["hints"],
            if r["examplesViewed"] == true { "  peeked" } else { "" },
            if r["rating"].is_null() { String::new() } else { format!("  felt {}", r["rating"]) }
        );
    }
    Ok(())
}

