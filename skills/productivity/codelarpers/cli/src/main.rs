mod cli;
mod course;
mod icons;
mod paths;
mod progress;
mod repo;
mod scaffold;
mod server;
mod termmd;
mod tester;
mod util;

use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

const EXAMPLES: &str = "\
EXAMPLES:
  $ codelarpers submit            # Commit changes & run tests
  $ codelarpers submit -m \"msg\"   # Commit changes & run tests with a custom commit message
  $ codelarpers test              # Run tests without committing changes
  $ codelarpers test --previous   # Run tests for all previous stages and the current stage
  $ codelarpers task              # View current stage instructions
  $ codelarpers open              # Open the web UI";

#[derive(Parser)]
#[command(
    name = "codelarpers",
    version,
    about = "CLI to interact with codelarpers, your local challenge platform",
    after_help = EXAMPLES,
    disable_help_subcommand = true
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Commit changes & run tests (passing completes the stage)
    Submit {
        /// Custom commit message
        #[arg(short, long, default_value = "codelarpers submit")]
        message: String,
    },
    /// Run tests without committing changes
    Test {
        /// Run tests for all previous stages and the current stage
        #[arg(long)]
        previous: bool,
    },
    /// View stage instructions
    Task {
        /// Stage id, or +N / -N relative to the current stage
        #[arg(long, allow_hyphen_values = true)]
        stage: Option<String>,
        /// Print the raw markdown
        #[arg(long)]
        raw: bool,
        /// Course slug (defaults to this repository's course)
        #[arg(long)]
        course: Option<String>,
    },
    /// Test the connection: link this repository to its challenge
    Ping,
    /// Show progress for this repository's challenge
    Status,
    /// List your challenges
    List,
    /// Open the web UI (starts the server if needed)
    Open {
        /// Course slug to open (defaults to this repository's course)
        course: Option<String>,
        /// Only print the URL
        #[arg(long)]
        print: bool,
    },
    /// Run the web UI server
    Serve {
        /// Run in the background (restarts a server from an older binary)
        #[arg(long)]
        detach: bool,
        /// Stop the background server
        #[arg(long)]
        stop: bool,
        /// Report whether the server is running
        #[arg(long)]
        status: bool,
        /// Restart the background server
        #[arg(long)]
        restart: bool,
        #[arg(long, env = "CODELARPERS_PORT", default_value_t = paths::DEFAULT_PORT)]
        port: u16,
    },
    /// Course authoring tools (for agents)
    #[command(subcommand)]
    Dev(Dev),
}

#[derive(Clone, Copy, ValueEnum)]
enum Kind {
    Codebase,
    Tutorial,
}

#[derive(Clone, Copy, ValueEnum)]
enum Difficulty {
    #[value(name = "very_easy", alias = "very-easy")]
    VeryEasy,
    Easy,
    Medium,
    Hard,
}

#[derive(Subcommand)]
enum Dev {
    /// Print the data directory
    Home,
    /// Courses created from a project directory
    Find {
        #[arg(long)]
        project: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// Scaffold a new course
    NewCourse {
        slug: String,
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "")]
        short: String,
        #[arg(long, value_enum)]
        kind: Kind,
        #[arg(long)]
        language: String,
        /// Absolute path of the project this course studies or was created from
        #[arg(long)]
        project: Option<PathBuf>,
        #[arg(long)]
        repository: Option<String>,
        #[arg(long)]
        commit: Option<String>,
        #[arg(long)]
        subject: Option<String>,
    },
    /// Rank logo files in a project (README images, logo/icon files) for the course icon
    FindIcon {
        /// Project directory (default: current directory)
        #[arg(long)]
        project: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// Copy an image file, or download an image URL, into the course as its icon
    SetIcon {
        course: String,
        /// Local path or http(s) URL of an svg, png, webp, jpg, gif or ico
        file: String,
        /// CSS colour for a tile behind the icon, e.g. "#ffffff" for a black logo
        #[arg(long)]
        background: Option<String>,
    },
    /// Add an extension (an optional group of stages)
    NewExtension {
        course: String,
        slug: String,
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "")]
        description: String,
    },
    /// Scaffold a new stage
    NewStage {
        course: String,
        #[arg(long)]
        name: String,
        #[arg(long, value_enum)]
        difficulty: Difficulty,
        #[arg(long)]
        extension: Option<String>,
        /// Insert after this stage id instead of appending
        #[arg(long)]
        after: Option<String>,
    },
    /// Static checks on a course's files
    Lint { course: String },
    /// Lint, prove solution/ passes every stage, and prove the starter fails every stage
    Validate {
        course: String,
        /// Only validate up to and including this stage
        #[arg(long)]
        stage: Option<String>,
        /// Run the solution with this many random seeds
        #[arg(long, default_value_t = 1)]
        repeat: u32,
        /// Keep the temporary solution checkout for inspection
        #[arg(long)]
        keep: bool,
    },
    /// Run stage tests against any directory
    Try {
        course: String,
        dir: PathBuf,
        #[arg(long)]
        stage: Option<String>,
    },
    /// Validate, then create the learner's repository
    Publish { course: String },
    /// Learner evidence: attempts, hints, ratings
    Progress {
        course: String,
        #[arg(long)]
        json: bool,
    },
}

fn main() {
    let args = Cli::parse();
    // Behave like a normal Unix tool when piped into `head` or `grep -q`. The server keeps
    // Rust's default (ignored SIGPIPE) so a closed browser socket can't kill it.
    #[cfg(unix)]
    if !matches!(args.command, Some(Command::Serve { .. })) {
        unsafe {
            libc::signal(libc::SIGPIPE, libc::SIG_DFL);
        }
    }
    let result = match args.command {
        None => {
            use clap::CommandFactory;
            Cli::command().print_help().ok();
            println!();
            Ok(())
        }
        Some(Command::Submit { message }) => cli::test(true, false, &message),
        Some(Command::Test { previous }) => cli::test(false, previous, ""),
        Some(Command::Task { stage, raw, course }) => cli::task(stage, raw, course),
        Some(Command::Ping) => cli::ping(),
        Some(Command::Status) => cli::status(),
        Some(Command::List) => cli::list(),
        Some(Command::Open { course, print }) => cli::open(course, print),
        Some(Command::Serve { detach, stop, status, restart, port }) => cli::serve(port, detach, stop, status, restart),
        Some(Command::Dev(dev)) => run_dev(dev),
    };
    if let Err(e) = result {
        eprintln!("{}", util::red(&format!("{e:#}")));
        std::process::exit(1);
    }
}

fn run_dev(dev: Dev) -> anyhow::Result<()> {
    match dev {
        Dev::Home => {
            println!("{}", paths::home().display());
            Ok(())
        }
        Dev::Find { project, json } => cli::dev_find(project, json),
        Dev::NewCourse { slug, name, short, kind, language, project, repository, commit, subject } => {
            let kind = match kind {
                Kind::Codebase => "codebase",
                Kind::Tutorial => "tutorial",
            };
            let source = course::Source {
                project: project.map(|p| paths::absolute(&p).display().to_string()),
                repository,
                commit,
                subject,
            };
            let c = scaffold::new_course(scaffold::NewCourse { slug, name, short, kind: kind.into(), language, source })?;
            println!("Created {}", c.dir.display());
            if let Some(project) = c.source.project.as_deref().filter(|_| c.kind == "codebase") {
                let found = icons::find_icons(std::path::Path::new(project));
                if !found.is_empty() {
                    println!("Logo candidates from the project (pick one with `codelarpers dev set-icon {} <file>`):", c.slug);
                    for cand in found.iter().take(3) {
                        println!("  {:>4}  {}", cand.score, cand.location);
                    }
                }
            }
            println!("Next: write overview.md, introduction.md and starters/{}/, then add stages with `codelarpers dev new-stage`.", c.languages[0]);
            Ok(())
        }
        Dev::FindIcon { project, json } => {
            let root = paths::absolute(&project.unwrap_or(std::env::current_dir()?));
            let found = icons::find_icons(&root);
            if json {
                println!("{}", serde_json::to_string_pretty(&found)?);
            } else if found.is_empty() {
                println!("No logo files found in {}. Use the technology's official logo, or leave the letter tile.", paths::tilde(&root));
            } else {
                for c in &found {
                    let size = if c.bytes > 0 { format!("{:>6} KB", c.bytes.div_ceil(1000)) } else { "remote".into() };
                    println!("{:>4}  {size}  {}  ({})", c.score, c.location, c.reason);
                }
            }
            Ok(())
        }
        Dev::SetIcon { course, file, background } => {
            let mut c = course::require_course(&course)?;
            let dest = icons::set_icon(&mut c, &file, background)?;
            println!("Icon set: {}{}", dest.display(), c.icon_background.as_ref().map(|b| format!(" on {b}")).unwrap_or_default());
            Ok(())
        }
        Dev::NewExtension { course, slug, name, description } => {
            scaffold::new_extension(&course, &slug, &name, &description)?;
            println!("Added extension \"{slug}\" to {course}.");
            Ok(())
        }
        Dev::NewStage { course, name, difficulty, extension, after } => {
            let d = match difficulty {
                Difficulty::VeryEasy => "very_easy",
                Difficulty::Easy => "easy",
                Difficulty::Medium => "medium",
                Difficulty::Hard => "hard",
            };
            let (stage, dir) = scaffold::new_stage(&course, &name, d, extension, after)?;
            println!("Added stage #{} \"{}\"\n  {}", stage.id, stage.name, dir.display());
            Ok(())
        }
        Dev::Lint { course } => cli::dev_lint(&course),
        Dev::Validate { course, stage, repeat, keep } => cli::dev_validate(&course, stage, repeat, keep).map(|_| ()),
        Dev::Try { course, dir, stage } => cli::dev_try(&course, &dir, stage),
        Dev::Publish { course } => cli::dev_publish(&course),
        Dev::Progress { course, json } => cli::dev_progress(&course, json),
    }
}
