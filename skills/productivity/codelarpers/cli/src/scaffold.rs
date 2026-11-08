//! `codelarper dev new-*`: course, extension and stage skeletons with build plumbing per language.

use crate::course::{self, Course, DIFFICULTIES, Extension, KINDS, Source, Stage, language_name};
use crate::paths;
use crate::util::{stage_code, today, write_file};
use anyhow::{Result, bail};
use serde_json::{Map, json};
use std::fs;
use std::path::{Path, PathBuf};

struct Kit {
    entry: &'static str,
    files: Vec<(&'static str, String)>,
    compile: Option<String>,
    run: String,
}

fn kit(slug: &str, lang: &str) -> Kit {
    let build = format!("/tmp/codelarper-build-{slug}-{lang}");
    let bin = format!("codelarper-{slug}");
    match lang {
        "rust" => Kit {
            entry: "src/main.rs",
            files: vec![
                ("Cargo.toml", format!("[package]\nname = \"{bin}\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[dependencies]\n")),
                ("src/main.rs", "use std::env;\n\nfn main() {\n    // Debug output goes to stderr; it shows up in the test logs.\n    eprintln!(\"Logs from your program will appear here!\");\n\n    let args: Vec<String> = env::args().collect();\n    eprintln!(\"Unknown command: {:?}\", &args[1..]);\n    std::process::exit(1);\n}\n".into()),
                (".gitignore", "target/\n".into()),
            ],
            compile: Some(format!("cargo build --release --quiet --target-dir={build} --manifest-path \"$(dirname \"$0\")/../Cargo.toml\"")),
            run: format!("exec {build}/release/{bin} \"$@\""),
        },
        "go" => Kit {
            entry: "app/main.go",
            files: vec![
                ("go.mod", format!("module {bin}\n\ngo 1.24\n")),
                ("app/main.go", "package main\n\nimport (\n\t\"fmt\"\n\t\"os\"\n)\n\nfunc main() {\n\t// Debug output goes to stderr; it shows up in the test logs.\n\tfmt.Fprintln(os.Stderr, \"Logs from your program will appear here!\")\n\tfmt.Fprintf(os.Stderr, \"Unknown command: %v\\n\", os.Args[1:])\n\tos.Exit(1)\n}\n".into()),
            ],
            compile: Some(format!("cd \"$(dirname \"$0\")/..\"\ngo build -o {build}/program ./app")),
            run: format!("exec {build}/program \"$@\""),
        },
        "python" => Kit {
            entry: "app/main.py",
            files: vec![
                ("app/main.py", "import sys\n\n\ndef main():\n    # Debug output goes to stderr; it shows up in the test logs.\n    print(\"Logs from your program will appear here!\", file=sys.stderr)\n    print(f\"Unknown command: {sys.argv[1:]}\", file=sys.stderr)\n    sys.exit(1)\n\n\nif __name__ == \"__main__\":\n    main()\n".into()),
                (".gitignore", "__pycache__/\n".into()),
            ],
            compile: None,
            run: "exec python3 -u \"$(dirname \"$0\")/../app/main.py\" \"$@\"".into(),
        },
        "javascript" => Kit {
            entry: "app/main.js",
            files: vec![
                ("app/main.js", "// Debug output goes to stderr; it shows up in the test logs.\nconsole.error(\"Logs from your program will appear here!\");\n\nconst args = process.argv.slice(2);\nconsole.error(`Unknown command: ${JSON.stringify(args)}`);\nprocess.exit(1);\n".into()),
                ("package.json", format!("{{\n  \"name\": \"{bin}\",\n  \"private\": true,\n  \"type\": \"module\"\n}}\n")),
                (".gitignore", "node_modules/\n".into()),
            ],
            compile: None,
            run: "exec node \"$(dirname \"$0\")/../app/main.js\" \"$@\"".into(),
        },
        "typescript" => Kit {
            entry: "app/main.ts",
            files: vec![
                ("app/main.ts", "// Node 23.6+ runs TypeScript directly by stripping types.\n// Debug output goes to stderr; it shows up in the test logs.\nconsole.error(\"Logs from your program will appear here!\");\n\nconst args: string[] = process.argv.slice(2);\nconsole.error(`Unknown command: ${JSON.stringify(args)}`);\nprocess.exit(1);\n".into()),
                ("package.json", format!("{{\n  \"name\": \"{bin}\",\n  \"private\": true,\n  \"type\": \"module\"\n}}\n")),
                (".gitignore", "node_modules/\n".into()),
            ],
            compile: None,
            run: "exec node --no-warnings \"$(dirname \"$0\")/../app/main.ts\" \"$@\"".into(),
        },
        "c" => Kit {
            entry: "app/main.c",
            files: vec![("app/main.c", "#include <stdio.h>\n\nint main(int argc, char **argv) {\n    // Debug output goes to stderr; it shows up in the test logs.\n    fprintf(stderr, \"Logs from your program will appear here!\\n\");\n    fprintf(stderr, \"Unknown command\\n\");\n    return 1;\n}\n".into())],
            compile: Some(format!("mkdir -p {build}\ncc -O2 -Wall -o {build}/program \"$(dirname \"$0\")\"/../app/*.c")),
            run: format!("exec {build}/program \"$@\""),
        },
        "cpp" => Kit {
            entry: "app/main.cpp",
            files: vec![("app/main.cpp", "#include <iostream>\n\nint main(int argc, char **argv) {\n    // Debug output goes to stderr; it shows up in the test logs.\n    std::cerr << \"Logs from your program will appear here!\" << std::endl;\n    std::cerr << \"Unknown command\" << std::endl;\n    return 1;\n}\n".into())],
            compile: Some(format!("mkdir -p {build}\nc++ -std=c++20 -O2 -Wall -o {build}/program \"$(dirname \"$0\")\"/../app/*.cpp")),
            run: format!("exec {build}/program \"$@\""),
        },
        other => Kit {
            entry: "(your choice)",
            files: vec![],
            compile: Some(format!("# Build your {} program here. It runs from the repository root.", language_name(other))),
            run: format!("echo \"Edit .codelarper/run.sh to start your {} program\" >&2\nexit 1", language_name(other)),
        },
    }
}

fn script(what: &str, body: &str) -> String {
    format!(
        "#!/bin/sh\n#\n# {what}\n#\n# The tester runs .codelarper/compile.sh once from the repository root, then\n# .codelarper/run.sh for every test from a temporary working directory.\n\nset -e\n\n{body}\n"
    )
}

pub fn write_starter(dir: &Path, course: &Course, lang: &str) -> Result<()> {
    let k = kit(&course.slug, lang);
    for (rel, content) in &k.files {
        write_file(&dir.join(rel), content, false)?;
    }
    if let Some(c) = &k.compile {
        write_file(&dir.join(".codelarper/compile.sh"), &script("Compiles your program. Runs once per test run.", c), true)?;
    }
    write_file(&dir.join(".codelarper/run.sh"), &script("Runs your program. Must work from any working directory.", &k.run), true)?;
    let compile_line = if k.compile.is_some() { "\"$dir/.codelarper/compile.sh\"\n" } else { "" };
    write_file(
        &dir.join("your_program.sh"),
        &format!(
            "#!/bin/sh\n#\n# Use this script to run your program LOCALLY: ./your_program.sh <args>\n#\n# It mirrors .codelarper/compile.sh and .codelarper/run.sh, which the tester uses.\n\nset -e\n\ndir=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n{compile_line}exec \"$dir/.codelarper/run.sh\" \"$@\"\n"
        ),
        true,
    )?;
    write_file(
        &dir.join("README.md"),
        &format!(
            "# {name} — {lang_name}\n\nThis repository is your workspace for the **{name}** challenge on codelarpers.\n\nYour program's entry point is `{entry}`.\n\n1. `codelarper task` prints the current stage's instructions (or open the web UI with `codelarper open`).\n2. Implement the stage. `./your_program.sh <args>` runs your program locally.\n3. `codelarper test` runs the current stage's tests without committing.\n4. `codelarper submit` commits your work and runs the tests. Passing completes the stage.\n\nFailing is part of the method: read the test log, form a hypothesis, change one thing, rerun.\n",
            name = course.name,
            lang_name = language_name(lang),
            entry = k.entry
        ),
        false,
    )?;
    Ok(())
}

pub struct NewCourse {
    pub slug: String,
    pub name: String,
    pub short: String,
    pub kind: String,
    pub language: String,
    pub source: Source,
}

pub fn new_course(n: NewCourse) -> Result<Course> {
    if n.slug.is_empty() || !n.slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        bail!("slug must be kebab-case, e.g. rustc-lexer");
    }
    if !KINDS.contains(&n.kind.as_str()) {
        bail!("--kind must be one of {}", KINDS.join(", "));
    }
    let dir = paths::course_dir(&n.slug);
    if dir.exists() {
        bail!("course \"{}\" already exists at {}", n.slug, dir.display());
    }
    let course = Course {
        slug: n.slug.clone(),
        name: n.name.clone(),
        short: n.short,
        kind: n.kind,
        languages: vec![n.language.clone()],
        created: today(),
        icon: None,
        icon_background: None,
        source: n.source,
        extensions: vec![],
        stages: vec![],
        extra: Map::new(),
        dir: dir.clone(),
    };
    fs::create_dir_all(dir.join("stages"))?;
    course.save()?;
    write_file(
        &dir.join("overview.md"),
        "<One paragraph: what the subject is and what the learner will have built by the end.>\n\n<One paragraph: \"Along the way, you'll learn about ...\".>\n\n## What exactly will I build?\n\n<The finished artifact, concretely: commands it supports, inputs it reads, outputs it prints.>\n\n## What exactly will I learn?\n\n<The internals the stages force the learner to confront.>\n\n## Why should I build such a project?\n\n<Why reimplementing beats reading for this subject.>\n\n## What are the prerequisites for this challenge?\n\n<Language proficiency and background knowledge assumed.>\n",
        false,
    )?;
    write_file(
        &dir.join("introduction.md"),
        &format!(
            "Welcome to the **{}** challenge!\n\n<Two or three sentences: the subject, and what the learner will build.>\n\nEach stage asks you to implement one small piece and checks it with tests you run locally. Reading won't pass them: you'll write the code, watch it fail, and fix it until it passes.\n",
            n.name
        ),
        false,
    )?;
    write_starter(&dir.join("starters").join(&n.language), &course, &n.language)?;
    write_starter(&dir.join("solution").join(&n.language), &course, &n.language)?;
    Ok(course)
}

pub fn new_extension(course_slug: &str, slug: &str, name: &str, description: &str) -> Result<()> {
    let mut course = course::require_course(course_slug)?;
    if course.extensions.iter().any(|e| e.slug == slug) {
        bail!("extension \"{slug}\" already exists");
    }
    course.extensions.push(Extension { slug: slug.into(), name: name.into(), description: description.into() });
    course.save()
}

pub fn new_stage(course_slug: &str, name: &str, difficulty: &str, extension: Option<String>, after: Option<String>) -> Result<(Stage, PathBuf)> {
    let mut course = course::require_course(course_slug)?;
    if !DIFFICULTIES.contains(&difficulty) {
        bail!("--difficulty must be one of {}", DIFFICULTIES.join(", "));
    }
    if let Some(ext) = &extension {
        if !course.extensions.iter().any(|e| &e.slug == ext) {
            bail!("no extension \"{ext}\"; add it with `codelarper dev new-extension`");
        }
    }
    let taken: Vec<String> = course.stages.iter().map(|s| s.id.clone()).collect();
    let stage = Stage { id: stage_code(&taken), name: name.into(), difficulty: difficulty.into(), extension, extra: Map::new() };
    match after {
        Some(a) => {
            let Some(i) = course.stages.iter().position(|s| s.id == a) else { bail!("no stage \"{a}\" to insert after") };
            course.stages.insert(i + 1, stage.clone());
        }
        None => course.stages.push(stage.clone()),
    }
    course.save()?;
    let dir = course.stage_dir(&stage.id);
    write_file(
        &dir.join("instructions.md"),
        "In this stage, you'll <One capability, one sentence>.\n\n### <Concept the learner needs>\n\n<details>\n<summary>Click to expand/collapse</summary>\n\n<Teach the concept: what it is, its exact format or rules, a worked example. Explain, never solve.>\n\n</details>\n\n### Tests\n\nThe tester will run your program like this:\n\n```bash\n$ ./your_program.sh <command> <args>\n```\n\nIt'll expect stdout to be:\n\n```\n<exact expected output>\n```\n\n### Notes\n\n- <Edge cases and gotchas.>\n- <Where the real implementation lives, e.g. `path/to/file.rs` in the studied codebase.>\n",
        false,
    )?;
    write_file(
        &dir.join("hints.md"),
        "## Where to start\n\n<A nudge: the question to ask or the concept to revisit. No code.>\n\n## Narrowing it down\n\n<The specific rule, format detail, or API the learner is probably missing.>\n\n## Almost there\n\n<The gotcha most attempts trip on.>\n",
        false,
    )?;
    write_file(&dir.join("resources.md"), "- [<Title>](<url>) — <why it helps for this stage>\n", false)?;
    let tests = json!({ "cases": [{ "name": "<what this case proves>", "args": ["<command>"], "files": {}, "expect": { "exitCode": 0, "stdout": "<expected>\n" } }] });
    write_file(&dir.join("tests.json"), &format!("{}\n", serde_json::to_string_pretty(&tests)?), false)?;
    fs::create_dir_all(dir.join("examples"))?;
    Ok((stage, dir))
}
