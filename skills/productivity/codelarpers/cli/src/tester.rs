//! The local test harness: compile once, then run each stage's tests against the learner's program.
//!
//! Two test forms per stage (both may exist; cases run first):
//! - `tests.json`: declarative cases (args, stdin, files -> expected stdout/exit/files).
//! - a test script (`test.py`, `test.sh`, `test.mjs`, `test.js`, or executable `test`) speaking the
//!   line protocol documented in references/TESTS.md. Exit 0 = pass, 1 = fail, anything else = tester bug.

use crate::course::{self, Course, Stage};
use crate::paths;
use crate::repo::temp_dir;
use crate::util::{blue, gray, green, quote, read_json, red, shell_quote, yellow};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const PYTHON_HELPER: &str = include_str!("tester/codelarper_test.py");

#[derive(Serialize, Clone, Debug)]
pub struct LogLine {
    pub prefix: String,
    pub text: String,
    pub level: &'static str,
}

pub type Sink = Arc<dyn Fn(&LogLine) + Send + Sync>;

#[derive(Clone)]
pub struct Logger {
    pub lines: Arc<Mutex<Vec<LogLine>>>,
    quiet: bool,
    debug: bool,
    sink: Option<Sink>,
}

impl Logger {
    pub fn new(quiet: bool, debug: bool, sink: Option<Sink>) -> Self {
        Logger { lines: Arc::new(Mutex::new(vec![])), quiet, debug, sink }
    }

    pub fn line(&self, prefix: &str, text: &str, level: &'static str) {
        if level == "debug" && !self.debug {
            return;
        }
        let text = text.replace("\r\n", "\n");
        let mut parts: Vec<&str> = text.split('\n').collect();
        if parts.len() > 1 && parts.last() == Some(&"") {
            parts.pop();
        }
        for part in parts {
            let entry = LogLine { prefix: prefix.to_string(), text: part.to_string(), level };
            if let Some(sink) = &self.sink {
                sink(&entry);
            }
            if !self.quiet {
                println!("{}", format_line(&entry));
            }
            self.lines.lock().unwrap().push(entry);
        }
    }

    pub fn snapshot(&self) -> Vec<LogLine> {
        self.lines.lock().unwrap().clone()
    }
}

pub fn format_line(l: &LogLine) -> String {
    if l.prefix.is_empty() {
        return l.text.clone();
    }
    let text = match l.level {
        "command" | "heading" => blue(&l.text),
        "success" => green(&l.text),
        "error" => red(&l.text),
        "debug" => gray(&l.text),
        _ => l.text.clone(),
    };
    format!("{} {}", yellow(&format!("[{}]", l.prefix)), text)
}

pub struct ProcOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    pub timed_out: bool,
}

/// Run a process, streaming complete output lines to `on_line(is_stdout, line)` as they arrive.
pub fn run_process(
    mut cmd: Command,
    stdin: Option<Vec<u8>>,
    timeout: Duration,
    mut on_line: impl FnMut(bool, &str),
) -> std::io::Result<ProcOutput> {
    cmd.stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    if let (Some(data), Some(mut pipe)) = (stdin, child.stdin.take()) {
        thread::spawn(move || {
            let _ = pipe.write_all(&data);
        });
    }
    let (tx, rx) = mpsc::channel::<(bool, Vec<u8>)>();
    let readers: Vec<(bool, Box<dyn Read + Send>)> = vec![
        (true, Box::new(child.stdout.take().expect("piped stdout"))),
        (false, Box::new(child.stderr.take().expect("piped stderr"))),
    ];
    for (is_out, mut reader) in readers {
        let tx = tx.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => {
                        let _ = tx.send((is_out, vec![]));
                        break;
                    }
                    Ok(n) => {
                        let _ = tx.send((is_out, buf[..n].to_vec()));
                    }
                }
            }
        });
    }
    drop(tx);

    let deadline = Instant::now() + timeout;
    let mut all = [Vec::<u8>::new(), Vec::new()];
    let mut partial = [Vec::<u8>::new(), Vec::new()];
    let (mut eofs, mut status, mut timed_out, mut exited_at) = (0, None, false, None::<Instant>);
    let mut emit = |idx: usize, bytes: &[u8], partial: &mut [Vec<u8>; 2], flush: bool| {
        partial[idx].extend_from_slice(bytes);
        while let Some(pos) = partial[idx].iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = partial[idx].drain(..=pos).collect();
            on_line(idx == 0, String::from_utf8_lossy(&line[..line.len() - 1]).trim_end_matches('\r'));
        }
        if flush && !partial[idx].is_empty() {
            let line = std::mem::take(&mut partial[idx]);
            on_line(idx == 0, &String::from_utf8_lossy(&line));
        }
    };
    let mut disconnected = false;
    loop {
        if disconnected {
            thread::sleep(Duration::from_millis(5));
        } else {
            match rx.recv_timeout(Duration::from_millis(10)) {
                Ok((is_out, chunk)) => {
                    let idx = if is_out { 0 } else { 1 };
                    if chunk.is_empty() {
                        eofs += 1;
                        emit(idx, &[], &mut partial, true);
                    } else {
                        all[idx].extend_from_slice(&chunk);
                        emit(idx, &chunk, &mut partial, false);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                // Both pipes closed; keep polling until the process itself is reaped.
                Err(RecvTimeoutError::Disconnected) => disconnected = true,
            }
        }
        if status.is_none() {
            if let Some(s) = child.try_wait()? {
                status = Some(s);
                exited_at = Some(Instant::now());
            }
        }
        if status.is_some() && (eofs >= 2 || disconnected) {
            break;
        }
        // A grandchild may keep the pipes open after the program exits; don't hang on it.
        if exited_at.is_some_and(|t| t.elapsed() > Duration::from_millis(500)) {
            break;
        }
        if status.is_none() && Instant::now() > deadline {
            let _ = child.kill();
            timed_out = true;
            status = child.wait().ok();
            exited_at = Some(Instant::now());
        }
    }
    for idx in 0..2 {
        emit(idx, &[], &mut partial, true);
    }
    let text = |b: &[u8]| String::from_utf8_lossy(b).replace("\r\n", "\n");
    Ok(ProcOutput { stdout: text(&all[0]), stderr: text(&all[1]), code: status.and_then(|s| s.code()), timed_out })
}

struct Ctx<'a> {
    prefix: String,
    run_sh: PathBuf,
    log: &'a Logger,
    tmp: Vec<PathBuf>,
}

type Check = Result<(), String>;

impl Ctx<'_> {
    fn say(&self, text: &str, level: &'static str) {
        self.log.line(&self.prefix, text, level);
    }

    fn tmpdir(&mut self, files: Option<&Value>) -> Result<PathBuf, String> {
        let dir = temp_dir("codelarper-test").map_err(|e| e.to_string())?;
        self.tmp.push(dir.clone());
        if let Some(Value::Object(map)) = files {
            for (rel, content) in map {
                let path = dir.join(rel);
                if let Some(p) = path.parent() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
                fs::write(&path, content.as_str().unwrap_or_default()).map_err(|e| e.to_string())?;
            }
        }
        Ok(dir)
    }

    fn run(&self, args: &[String], cwd: &Path, stdin: Option<&str>, timeout_ms: u64) -> Result<ProcOutput, String> {
        let shown: Vec<String> = args.iter().map(|a| shell_quote(a)).collect();
        self.say(format!("$ ./your_program.sh {}", shown.join(" ")).trim_end(), "command");
        let mut cmd = Command::new(&self.run_sh);
        cmd.args(args).current_dir(cwd);
        let log = self.log.clone();
        let out = run_process(cmd, stdin.map(|s| s.as_bytes().to_vec()), Duration::from_millis(timeout_ms), |_, l| {
            log.line("your_program", l, "info")
        })
        .map_err(|e| format!("Could not start your program: {e}"))?;
        if out.timed_out {
            return Err(format!("Your program didn't exit within {}s.", timeout_ms as f64 / 1000.0));
        }
        Ok(out)
    }

    fn cleanup(&mut self) {
        for d in self.tmp.drain(..) {
            let _ = fs::remove_dir_all(d);
        }
    }
}

fn strings(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a.iter().map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect(),
        Some(Value::String(s)) => vec![s.clone()],
        _ => vec![],
    }
}

fn run_cases(ctx: &mut Ctx, cases: &[Value]) -> Check {
    for (i, c) in cases.iter().enumerate() {
        if cases.len() > 1 {
            let name = c.get("name").and_then(|n| n.as_str()).map(|n| format!(": {n}")).unwrap_or_default();
            ctx.say(&format!("Test case {}/{}{name}", i + 1, cases.len()), "info");
        }
        let cwd = ctx.tmpdir(c.get("files"))?;
        let timeout = c.get("timeout").and_then(|t| t.as_u64()).unwrap_or(10_000);
        let r = ctx.run(&strings(c.get("args")), &cwd, c.get("stdin").and_then(|s| s.as_str()), timeout)?;
        let empty = Value::Object(Default::default());
        let ex = c.get("expect").unwrap_or(&empty);
        if let Some(code) = ex.get("exitCode").and_then(|v| v.as_i64()) {
            if r.code != Some(code as i32) {
                let got = r.code.map(|c| c.to_string()).unwrap_or_else(|| "killed by a signal".into());
                return Err(format!("Expected exit code {code}, got: {got}"));
            }
        }
        if let Some(want) = ex.get("stdout").and_then(|v| v.as_str()) {
            if r.stdout != want {
                return Err(format!("Expected {} as stdout, got: {}", quote(want), quote(&r.stdout)));
            }
        }
        if let Some(lines) = ex.get("stdoutLines") {
            let want = strings(Some(lines));
            let trimmed = r.stdout.strip_suffix('\n').unwrap_or(&r.stdout);
            let got: Vec<&str> = if trimmed.is_empty() { vec![] } else { trimmed.split('\n').collect() };
            for i in 0..want.len().max(got.len()) {
                let (w, g) = (want.get(i).map(String::as_str), got.get(i).copied());
                if w != g {
                    return Err(format!(
                        "Expected line {} of stdout to be {}, got: {}",
                        i + 1,
                        w.map(quote).unwrap_or_else(|| "<end of output>".into()),
                        g.map(quote).unwrap_or_else(|| "<end of output>".into())
                    ));
                }
            }
        }
        for want in strings(ex.get("stdoutContains")) {
            if !r.stdout.contains(&want) {
                return Err(format!("Expected stdout to contain {}, got: {}", quote(&want), quote(&r.stdout)));
            }
        }
        if let Some(pat) = ex.get("stdoutMatches").and_then(|v| v.as_str()) {
            let re = regex::RegexBuilder::new(pat).multi_line(true).build().map_err(|e| format!("bad stdoutMatches regex: {e}"))?;
            if !re.is_match(&r.stdout) {
                return Err(format!("Expected stdout to match /{pat}/, got: {}", quote(&r.stdout)));
            }
        }
        if let Some(want) = ex.get("stderr").and_then(|v| v.as_str()) {
            if r.stderr != want {
                return Err(format!("Expected {} as stderr, got: {}", quote(want), quote(&r.stderr)));
            }
        }
        for want in strings(ex.get("stderrContains")) {
            if !r.stderr.contains(&want) {
                return Err(format!("Expected stderr to contain {}, got: {}", quote(&want), quote(&r.stderr)));
            }
        }
        if let Some(Value::Object(files)) = ex.get("files") {
            for (rel, want) in files {
                let path = cwd.join(rel);
                let Ok(got) = fs::read_to_string(&path) else {
                    return Err(format!("Expected file {} to exist, but it doesn't.", quote(rel)));
                };
                if let Some(w) = want.as_str() {
                    if got != w {
                        return Err(format!("Expected {} to contain {}, got: {}", quote(rel), quote(w), quote(&got)));
                    }
                }
            }
        }
    }
    Ok(())
}

pub struct StageOutcome {
    pub passed: bool,
    pub tester_error: bool,
}

pub fn ensure_python_helper() -> PathBuf {
    let dir = paths::lib_dir();
    let file = dir.join("codelarper_test.py");
    if fs::read_to_string(&file).ok().as_deref() != Some(PYTHON_HELPER) {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(&file, PYTHON_HELPER);
    }
    dir
}

fn run_script(ctx: &mut Ctx, course: &Course, stage: &Stage, script: &Path, repo_root: &Path, seed: u64, debug: bool) -> Result<(), (String, bool)> {
    let tmp = ctx.tmpdir(None).map_err(|e| (e, true))?;
    let lib = ensure_python_helper();
    let ext = script.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    let mut cmd = match ext.as_str() {
        "py" => {
            let mut c = Command::new("python3");
            c.arg(script);
            c
        }
        "sh" => {
            let mut c = Command::new("sh");
            c.arg(script);
            c
        }
        "mjs" | "js" => {
            let mut c = Command::new("node");
            c.arg(script);
            c
        }
        _ => Command::new(script),
    };
    let pythonpath = match std::env::var("PYTHONPATH") {
        Ok(p) if !p.is_empty() => format!("{}:{p}", lib.display()),
        _ => lib.display().to_string(),
    };
    cmd.current_dir(&tmp)
        .env("CODELARPER_PROGRAM", &ctx.run_sh)
        .env("CODELARPER_REPO", repo_root)
        .env("CODELARPER_STAGE", &stage.id)
        .env("CODELARPER_STAGE_DIR", course.stage_dir(&stage.id))
        .env("CODELARPER_COURSE_DIR", &course.dir)
        .env("CODELARPER_SEED", seed.to_string())
        .env("CODELARPER_TMP", &tmp)
        .env("CODELARPER_DEBUG", if debug { "1" } else { "0" })
        .env("PYTHONPATH", pythonpath)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1");
    let log = ctx.log.clone();
    let prefix = ctx.prefix.clone();
    let mut failure: Option<String> = None;
    let out = run_process(cmd, None, Duration::from_secs(180), |is_out, line| {
        if !is_out {
            return;
        }
        if let Some(rest) = line.strip_prefix("| ").or(if line == "|" { Some("") } else { None }) {
            log.line("your_program", rest, "info");
        } else if let Some(rest) = line.strip_prefix("!fail ") {
            failure = Some(rest.to_string());
            log.line(&prefix, rest, "error");
        } else if let Some(rest) = line.strip_prefix("!ok ") {
            log.line(&prefix, rest, "success");
        } else if let Some(rest) = line.strip_prefix("!debug ") {
            log.line(&prefix, rest, "debug");
        } else if line.starts_with("$ ") {
            log.line(&prefix, line, "command");
        } else {
            log.line(&prefix, line, "info");
        }
    })
    .map_err(|e| (format!("could not start test script {}: {e}", script.display()), true))?;
    match (out.timed_out, out.code) {
        (false, Some(0)) => Ok(()),
        (false, Some(1)) => Err((failure.unwrap_or_else(|| "Test script reported a failure.".into()), false)),
        _ => {
            for l in out.stderr.lines().rev().take(30).collect::<Vec<_>>().into_iter().rev() {
                ctx.say(l, "error");
            }
            let why = if out.timed_out { "timed out".to_string() } else { format!("exited with {:?}", out.code) };
            Err((format!("Tester error: {} {why} (a bug in this stage's tests, not your code)", script.display()), true))
        }
    }
}

pub fn run_stage(course: &Course, stage: &Stage, repo_root: &Path, log: &Logger, debug: bool, seed: u64) -> StageOutcome {
    let prefix = format!("tester::#{}", stage.id.to_uppercase());
    let mut ctx = Ctx { prefix: prefix.clone(), run_sh: repo_root.join(".codelarper/run.sh"), log, tmp: vec![] };
    ctx.say(&format!("Running tests for Stage #{} ({})", stage.id.to_uppercase(), stage.name), "heading");
    let dir = course.stage_dir(&stage.id);
    let mut result: Result<(), (String, bool)> = Ok(());
    let cases_file = dir.join("tests.json");
    if cases_file.is_file() {
        result = match read_json::<Value>(&cases_file) {
            Ok(v) => run_cases(&mut ctx, v.get("cases").and_then(|c| c.as_array()).map(|a| a.as_slice()).unwrap_or(&[]))
                .map_err(|m| (m, false)),
            Err(e) => Err((format!("Tester error: {e:#}"), true)),
        };
    }
    if result.is_ok() {
        if let Some(script) = course::test_script(course, &stage.id) {
            result = run_script(&mut ctx, course, stage, &script, repo_root, seed, debug);
        }
    }
    ctx.cleanup();
    match result {
        Ok(()) => {
            ctx.say("Test passed.", "success");
            StageOutcome { passed: true, tester_error: false }
        }
        Err((msg, tester_error)) => {
            // Script failures already printed their !fail line.
            let already = !tester_error && log.snapshot().last().is_some_and(|l| l.text == msg);
            if !already {
                ctx.say(&msg, "error");
            }
            ctx.say("Test failed", "error");
            StageOutcome { passed: false, tester_error }
        }
    }
}

/// Run `.codelarper/compile.sh` if present. `None` when there is nothing to compile.
pub fn compile(repo_root: &Path, log: &Logger) -> Option<bool> {
    let script = repo_root.join(".codelarper/compile.sh");
    if !script.is_file() {
        return None;
    }
    let mut cmd = Command::new("sh");
    cmd.arg(&script).current_dir(repo_root);
    let l = log.clone();
    let out = run_process(cmd, None, Duration::from_secs(900), |_, line| l.line("compile", line, "info"));
    match out {
        Ok(o) if o.code == Some(0) => {
            log.line("compile", "Compilation successful.", "success");
            Some(true)
        }
        _ => {
            log.line("compile", "Looks like your code failed to compile.", "error");
            Some(false)
        }
    }
}

#[derive(Default)]
pub struct RunResult {
    pub passed: bool,
    pub failed_stage: Option<String>,
    pub compile_error: bool,
    pub tester_error: bool,
}

pub fn default_seed() -> u64 {
    std::env::var("CODELARPER_SEED")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| crate::util::Rng::from_time().next() % 1_000_000_007)
}

/// Compile once, then run `stages` in order, stopping at the first failure.
pub fn run_tests(course: &Course, stages: &[&Stage], repo_root: &Path, log: &Logger, debug: bool, seed: u64) -> RunResult {
    let first = stages.first().map(|s| s.id.clone());
    if !repo_root.join(".codelarper/run.sh").is_file() {
        log.line("tester", "Missing .codelarper/run.sh in your repository.", "error");
        return RunResult { failed_stage: first, ..Default::default() };
    }
    match compile(repo_root, log) {
        Some(false) => return RunResult { failed_stage: first, compile_error: true, ..Default::default() },
        Some(true) => log.line("", "", "info"),
        None => {}
    }
    for stage in stages {
        let outcome = run_stage(course, stage, repo_root, log, debug, seed);
        if !outcome.passed {
            return RunResult { failed_stage: Some(stage.id.clone()), tester_error: outcome.tester_error, ..Default::default() };
        }
    }
    RunResult { passed: true, ..Default::default() }
}
