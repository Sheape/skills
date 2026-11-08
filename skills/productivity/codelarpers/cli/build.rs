//! Embed the built web UI (`../web/dist`, or `$CODELARPER_WEB_DIST`) into the binary.
//! Without a built UI the binary still compiles, serving a page that says how to build it.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const PLACEHOLDER: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>codelarpers</title></head>
<body style="font-family:system-ui;background:#030712;color:#e5e7eb;padding:48px">
<h1>codelarpers UI is not built into this binary</h1>
<p>Build it with <code>pnpm --dir web install &amp;&amp; pnpm --dir web build</code>, then rebuild the CLI.</p>
</body></html>"#;

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn main() {
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("web");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist = env::var("CODELARPER_WEB_DIST").map(PathBuf::from).unwrap_or_else(|_| manifest.join("../web/dist"));
    println!("cargo:rerun-if-env-changed=CODELARPER_WEB_DIST");
    println!("cargo:rerun-if-changed={}", dist.display());
    let _ = fs::remove_dir_all(&out);
    if dist.join("index.html").is_file() {
        copy_dir(&dist, &out);
    } else {
        fs::create_dir_all(&out).unwrap();
        fs::write(out.join("index.html"), PLACEHOLDER).unwrap();
        println!("cargo:warning=web/dist not found; embedding a placeholder UI");
    }
}
