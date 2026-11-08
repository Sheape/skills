#!/usr/bin/env python3
"""State, snapshot worktree, probes and annotations for the understand skill.

Run from anywhere inside the repository being understood (or its worktree).
`understand.py <command> --help` lists each command's arguments.
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

TAG = "@understand"
STATUSES = ("known", "edge", "unknown", "skipped")
COMMENT = {
    ".rs": "//", ".ts": "//", ".tsx": "//", ".js": "//", ".jsx": "//", ".mjs": "//",
    ".go": "//", ".java": "//", ".kt": "//", ".swift": "//", ".c": "//", ".cc": "//",
    ".cpp": "//", ".h": "//", ".cs": "//", ".dart": "//", ".scala": "//", ".zig": "//",
    ".py": "#", ".rb": "#", ".sh": "#", ".ex": "#", ".exs": "#",
    ".sql": "--", ".lua": "--", ".hs": "--",
}
PROBE = {
    ".rs": 'eprintln!("{tag} {id} {{:?}}", &({expr}));',
    ".py": '__import__("sys").stderr.write("{tag} {id} " + repr({expr}) + "\\n")',
    ".ts": 'console.error("{tag} {id}", JSON.stringify({expr}));',
    ".tsx": 'console.error("{tag} {id}", JSON.stringify({expr}));',
    ".js": 'console.error("{tag} {id}", JSON.stringify({expr}));',
    ".jsx": 'console.error("{tag} {id}", JSON.stringify({expr}));',
    ".mjs": 'console.error("{tag} {id}", JSON.stringify({expr}));',
    ".rb": 'warn "{tag} {id} #{{({expr}).inspect}}"',
}
# Every glyph inside a box is one cell wide in JetBrains Mono, Nerd Font Propo
# included; Nerd icons are not, so they only ever follow a box's last corner.
OBSERVED, INFERRED, UNREACHED = "●", "○", "⊘"
SOURCE_ICON = {"cassette": "󰧔", "live": "󰇁"}


def die(message):
    print(f"understand: {message}", file=sys.stderr)
    sys.exit(1)


def git(*args, cwd=None, check=True):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        die(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout.strip()


def repo_root():
    root = git("rev-parse", "--show-toplevel", check=False)
    if not root:
        die("not inside a git repository")
    # Inside the snapshot worktree, resolve back to the repository it snapshots.
    common = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=root))
    return common.parent if common.name == ".git" else Path(root)


def repo_slug(root):
    remote = git("remote", "get-url", "origin", cwd=root, check=False)
    match = re.match(r"^(?:[a-z+]+://)?(?:[^@/]+@)?([^:/]+)[:/](.+?)(?:\.git)?/?$", remote)
    if match:
        return Path(match.group(1), *match.group(2).split("/"))
    digest = hashlib.sha256(str(root).encode()).hexdigest()[:8]
    return Path("local", f"{root.name}-{digest}")


def state_dir(root):
    base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state")
    path = base / "understand" / repo_slug(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def load(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


# ---------- bodies and hashes ----------

def is_annotation_line(line, comment):
    stripped = line.strip()
    return any(stripped.startswith(f"{comment} {corner}") for corner in "╭│╰")


def strip_annotation(line, comment):
    index = line.find(f"  {comment} ⟦")
    return line[:index].rstrip() if index >= 0 else line


def code_lines(text, comment):
    return [strip_annotation(line, comment) for line in text.splitlines() if not is_annotation_line(line, comment)]


def brace_end(lines, start):
    """Index of the line closing the first brace block opened at or after `start`."""
    depth, opened, raw, quote = 0, False, None, None
    for index in range(start, len(lines)):
        line, col = lines[index], 0
        while col < len(line):
            rest = line[col:]
            if raw:
                if rest.startswith(raw):
                    col += len(raw)
                    raw = None
                else:
                    col += 1
                continue
            if quote:
                if rest[0] == "\\":
                    col += 2
                    continue
                if rest[0] == quote:
                    quote = None
                col += 1
                continue
            if rest.startswith("//"):
                break
            raw_open = re.match(r'r(#*)"', rest)
            if raw_open and (col == 0 or not line[col - 1].isalnum()):
                raw = '"' + raw_open.group(1)
                col += len(raw_open.group(0))
                continue
            char_literal = re.match(r"'(\\.|[^\\'])'", rest)
            if char_literal:
                col += len(char_literal.group(0))
                continue
            if rest[0] in "\"`":
                quote = rest[0]
            elif rest[0] == "{":
                depth += 1
                opened = True
            elif rest[0] == "}":
                depth -= 1
                if opened and depth == 0:
                    return index
            col += 1
    return None


def indent_end(lines, start):
    indent = len(lines[start]) - len(lines[start].lstrip())
    end = start
    for index in range(start + 1, len(lines)):
        line = lines[index]
        if line.strip() and len(line) - len(line.lstrip()) <= indent:
            break
        if line.strip():
            end = index
    return end


def body(path, signature, near=None):
    """(start, end, text) of the definition whose first line is `signature`, else None.
    Several matches (`pub fn new() -> Self {` in two impls) resolve to the one nearest line NEAR."""
    comment = COMMENT.get(path.suffix, "//")
    lines = code_lines(path.read_text(), comment)
    matches = [i for i, line in enumerate(lines) if line.strip() == signature.strip()]
    if not matches or (len(matches) > 1 and near is None):
        return None
    start = min(matches, key=lambda i: abs(i + 1 - near)) if near else matches[0]
    end = indent_end(lines, start) if path.suffix == ".py" else brace_end(lines, start)
    if end is None:
        return None
    text = "\n".join(line.rstrip() for line in lines[start:end + 1] if line.strip())
    return start + 1, end + 1, text


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def current(state):
    return load(state / "current.json", {})


def snapshot_file(root, state, rel):
    """The snapshot's copy of REL without probes: pristine, else worktree, else repo."""
    tree = current(state).get("worktree")
    for candidate in [state / "pristine" / rel] + ([Path(tree) / rel] if tree else []) + [root / rel]:
        if candidate.exists():
            return candidate
    die(f"{rel} not found")


# ---------- inventory ----------
#
# Every function in the repository, found by pattern rather than a parser: enough to count
# coverage and name functions the way the map does (`<path>::<Type>::<fn>`), not to compile.

SOURCE = {".rs", ".py", ".go", ".ts", ".tsx", ".js", ".jsx", ".mjs"}
TEST_DIRS = {"tests", "test", "__tests__", "testdata", "fixtures", "benches", "e2e", "testing"}
CI_DIRS = {".github", ".gitlab", ".circleci", ".buildkite", "ci"}
TEST_FILE = re.compile(r"^test_.*\.py$|_test\.(py|go)$|^conftest\.py$|\.(test|spec)\.[cm]?[jt]sx?$")
TOOLING = re.compile(r"(^|/)(build\.rs|setup\.py|noxfile\.py|[\w.-]+\.config\.[cm]?[jt]s)$")
GENERATED = re.compile(r"\.d\.ts$|\.gen\.|(^|/)generated/|_pb2\.py$|\.pb\.go$")
VISIBILITY = r"(?:pub(?:\([^)]*\))?\s+)?"
RS_FN = re.compile(rf'^\s*{VISIBILITY}(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)')
RS_IMPL = re.compile(r"^\s*(?:unsafe\s+)?impl\b(.*)$")
RS_TRAIT = re.compile(rf"^\s*{VISIBILITY}(?:unsafe\s+)?trait\s+(\w+)")
RS_MOD = re.compile(rf"^\s*{VISIBILITY}mod\s+(\w+)\s*\{{")
RS_TEST_ATTR = re.compile(r"#\[(?:[\w:]+::)?test\b|#\[cfg\(test\)\]")
PY_DEF = re.compile(r"^(\s*)(?:async\s+)?(def|class)\s+(\w+)")
GO_FUNC = re.compile(r"^func\s+(?:\(\s*(?:\w+\s+)?\*?\s*(\w+)[^)]*\)\s*)?(\w+)")
# Top level only: a closure inside a function is part of that function, not one more to learn.
JS_FN = re.compile(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)")
JS_ARROW = re.compile(r"^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?"
                      r"(?:function\b|(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]+?)?=>|\w+\s*=>|\(\{?\s*$)")
JS_CLASS = re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)")
JS_METHOD = re.compile(r"^\s+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*(\w+)\s*(?:<[^>]*>)?\(.*\{\s*$")
JS_KEYWORDS = {"if", "for", "while", "switch", "catch", "return", "function", "constructor"}


def file_scope(rel):
    """Why REL is outside the default scope ('test', 'ci', 'generated', 'tooling'), or None."""
    parts = Path(rel).parts
    if any(part in CI_DIRS for part in parts[:-1]):
        return "ci"
    if GENERATED.search(rel):
        return "generated"
    if TOOLING.search(rel):
        return "tooling"
    if any(part in TEST_DIRS for part in parts[:-1]) or TEST_FILE.search(parts[-1]):
        return "test"
    return None


def attributes_above(lines, index):
    """The attribute and comment lines stacked directly above LINES[index]."""
    out = []
    while index > 0 and lines[index - 1].strip().startswith(("#[", "//", "@", "#![")):
        index -= 1
        out.append(lines[index].strip())
    return out


def has_body(lines, index):
    """False for a declaration without a body (a trait method, an extern fn)."""
    depth = 0
    for line in lines[index:index + 40]:
        for ch in line.split("//")[0]:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif depth == 0 and ch in "{;":
                return ch == "{"
    return False


def impl_type(rest):
    """`Tenant` from the text after `impl` in `impl<S> FromRequestParts<S> for Tenant<Member> {`."""
    rest = rest.split(" where ")[0].rstrip(" {")
    if rest.startswith("<"):
        depth = 0
        for i, ch in enumerate(rest):
            depth += {"<": 1, ">": -1}.get(ch, 0)
            if depth == 0:
                rest = rest[i + 1:]
                break
    rest = rest.split(" for ")[-1]
    match = re.match(r"[&\s]*(?:dyn\s+|mut\s+)?([\w:]+)", rest)
    return match.group(1).split("::")[-1] if match else "?"


def containers(lines, patterns):
    """(start, end, name, test) for each brace block opened by a line matching PATTERNS."""
    out = []
    for index, line in enumerate(lines):
        for pattern, naming in patterns:
            match = pattern.match(line)
            if match:
                end = brace_end(lines, index)
                if end is not None:
                    test = any(RS_TEST_ATTR.search(attr) for attr in attributes_above(lines, index))
                    out.append((index, end, naming(match), test))
                break
    return out


def functions(path, rel):
    """Every function defined in PATH: [{name, line, signature, test}], lines as `code_lines` counts them."""
    suffix = path.suffix
    lines = code_lines(path.read_text(errors="replace"), COMMENT.get(suffix, "//"))
    out = []

    def add(index, parts, test):
        out.append({"name": "::".join(parts), "line": index + 1, "signature": lines[index].strip(), "test": test})

    if suffix == ".rs":
        blocks = containers(lines, [
            (RS_IMPL, lambda m: impl_type(m.group(1))),
            (RS_TRAIT, lambda m: m.group(1)),
            (RS_MOD, lambda m: m.group(1)),
        ])
        for index, line in enumerate(lines):
            match = RS_FN.match(line)
            if not match or not has_body(lines, index):
                continue
            around = [b for b in blocks if b[0] < index <= b[1]]
            test = any(b[3] or b[2] == "tests" for b in around) or any(
                RS_TEST_ATTR.search(attr) for attr in attributes_above(lines, index))
            add(index, [b[2] for b in around] + [match.group(1)], test)
    elif suffix == ".py":
        stack = []
        for index, line in enumerate(lines):
            match = PY_DEF.match(line)
            if not match:
                continue
            indent, what, name = len(match.group(1)), match.group(2), match.group(3)
            stack = [entry for entry in stack if entry[0] < indent]
            names = [entry[1] for entry in stack]
            if what == "def":
                test = name.startswith("test_") or any(n.startswith("Test") for n in names) or any(
                    "fixture" in attr for attr in attributes_above(lines, index))
                add(index, names + [name], test)
            stack.append((indent, name))
    elif suffix == ".go":
        for index, line in enumerate(lines):
            match = GO_FUNC.match(line)
            if match:
                name = match.group(2)
                test = bool(re.match(r"(Test|Benchmark|Example|Fuzz)[A-Z_]", name))
                add(index, [p for p in (match.group(1), name) if p], test)
    else:
        classes = containers(lines, [(JS_CLASS, lambda m: m.group(1))])
        for index, line in enumerate(lines):
            match = JS_FN.match(line) or JS_ARROW.match(line)
            around = [c for c in classes if c[0] < index <= c[1]]
            if not match and around:
                method = JS_METHOD.match(line)
                match = method if method and method.group(1) not in JS_KEYWORDS else None
            if match:
                add(index, [c[2] for c in around] + [match.group(1)], False)
    seen = {}
    for entry in out:  # the same name twice in one file (two impls of `fmt`) gets #2, #3
        seen[entry["name"]] = seen.get(entry["name"], 0) + 1
        if seen[entry["name"]] > 1:
            entry["name"] += f"#{seen[entry['name']]}"
    return out


def source_files(root):
    listed = git("ls-files", "--cached", "--others", "--exclude-standard", "-z", cwd=root)
    return sorted(rel for rel in listed.split("\0") if rel and Path(rel).suffix in SOURCE and (root / rel).is_file())


def split_symbol(symbol):
    rel, _, name = symbol.partition("::")
    if not name:
        die(f"{symbol!r} is not <path from repo root>::<item>")
    return rel, name


def resolve(root, state, symbol, path=None):
    """The inventory entry for SYMBOL, read from PATH (default: the snapshot's copy of its file)."""
    rel, name = split_symbol(symbol)
    path = path or snapshot_file(root, state, rel)
    found = [entry for entry in functions(path, rel) if entry["name"] == name]
    return found[0] if found else None


def scope_rules(state):
    return load(state / "scope.json", {"exclude": [], "include": []})


def in_scope(rel, rules, tests):
    """None when REL counts toward coverage, else the reason it does not."""
    import fnmatch
    if any(fnmatch.fnmatch(rel, glob) for glob in rules["include"]):
        return None
    if any(fnmatch.fnmatch(rel, glob) for glob in rules["exclude"]):
        return "excluded"
    reason = file_scope(rel)
    return None if reason == "test" and tests else reason


def marks(root, state, progress, path_of):
    """symbol -> status, with 'stale' when the body changed since it was marked."""
    out = {}
    for symbol, entry in progress.items():
        path = path_of(entry["file"])
        found = body(path, entry["signature"], entry.get("line")) if path.exists() else None
        if not found:
            out[symbol] = "missing"
        elif digest(found[2]) != entry["hash"]:
            out[symbol] = "stale"
        else:
            out[symbol] = entry["status"]
    return out


BOX_OF = {"known": "[x]", "edge": "[~]", "skipped": "[-]", "stale": "[!]"}


# ---------- state commands ----------

def cmd_dir(args):
    print(state_dir(repo_root()))


def located(root, state, symbol):
    """(rel, path, inventory entry, body) for SYMBOL in the snapshot, or die."""
    rel, _ = split_symbol(symbol)
    path = snapshot_file(root, state, rel)
    entry = resolve(root, state, symbol, path)
    found = entry and body(path, entry["signature"], entry["line"])
    if not found:
        die(f"no function {symbol!r}: `coverage --list {rel}` prints the names in that file")
    return rel, path, entry, found


def cmd_hash(args):
    root = repo_root()
    state = state_dir(root)
    _, _, entry, found = located(root, state, args.symbol)
    print(json.dumps({"signature": entry["signature"], "start": found[0], "end": found[1], "hash": digest(found[2])}))


def cmd_mark(args):
    root = repo_root()
    state = state_dir(root)
    progress = load(state / "progress.json", {})
    rel, _, entry_found, found = located(root, state, args.symbol)
    entry = progress.get(args.symbol, {"history": []})
    entry.update({
        "status": args.status,
        "evidence": args.evidence,
        "file": rel,
        "signature": entry_found["signature"],
        "line": entry_found["line"],
        "hash": digest(found[2]),
        "commit": current(state).get("commit") or git("rev-parse", "HEAD", cwd=root),
        "updated": datetime.date.today().isoformat(),
    })
    entry["history"].append({"on": entry["updated"], "status": args.status, "evidence": args.evidence})
    progress[args.symbol] = entry
    save(state / "progress.json", progress)
    print(f"{args.status}: {args.symbol} ({rel}:{found[0]}-{found[1]})")


def cmd_status(args):
    root = repo_root()
    state = state_dir(root)
    progress = load(state / "progress.json", {})
    base = Path(args.tree) if args.tree else root
    verdicts = marks(root, state, progress, lambda rel: base / rel)
    counts = {}
    for symbol, entry in sorted(progress.items()):
        verdict = verdicts[symbol]
        counts[verdict] = counts.get(verdict, 0) + 1
        shown = f"stale ({entry['status']} before)" if verdict == "stale" else verdict
        print(f"{shown:22} {symbol}  — {entry['evidence']}")
    summary = ", ".join(f"{n} {k}" for k, n in sorted(counts.items())) or "nothing marked yet"
    print(f"\n{summary}\nstate: {state}")
    if current(state):
        print(f"current: {json.dumps(current(state), ensure_ascii=False)}")


def bar(part, whole, width=12):
    filled = round(width * part / whole) if whole else 0
    return "█" * filled + "░" * (width - filled)


def cmd_coverage(args):
    root = repo_root()
    state = state_dir(root)
    rules = scope_rules(state)
    if args.exclude or args.include:
        rules["exclude"] = sorted(set(rules["exclude"]) | set(args.exclude or []))
        rules["include"] = sorted(set(rules["include"]) | set(args.include or []))
        save(state / "scope.json", rules)
    progress = load(state / "progress.json", {})
    verdicts = marks(root, state, progress, lambda rel: root / rel)
    groups, outside, listed = {}, {}, []
    for rel in source_files(root):
        reason = in_scope(rel, rules, args.tests)
        for entry in functions(root / rel, rel):
            why = reason or ("test" if entry["test"] and not args.tests else None)
            if why:
                outside[why] = outside.get(why, 0) + 1
                continue
            symbol = f"{rel}::{entry['name']}"
            status = verdicts.get(symbol, "unknown")
            key = rel if args.by == "file" else str(Path(rel).parent)
            group = groups.setdefault(key, {})
            group[status] = group.get(status, 0) + 1
            if args.list is not None and rel.startswith(args.list):
                listed.append((BOX_OF.get(status, "[ ]"), symbol, entry["line"]))
    total = {}
    for group in groups.values():
        for status, n in group.items():
            total[status] = total.get(status, 0) + n
    counted = sum(total.values()) - total.get("skipped", 0)
    known = total.get("known", 0)
    width = max([len(key) for key in groups] + [10])
    if args.list is not None:
        for box, symbol, line in listed:
            print(f"{box} {symbol} :{line}")
        groups = {}
    else:
        print(f"{'':{width}}  known  edge  stale  left  total")
    for key in sorted(groups):
        g = groups[key]
        n = sum(g.values()) - g.get("skipped", 0)
        left = n - g.get("known", 0) - g.get("edge", 0) - g.get("stale", 0)
        print(f"{key:{width}}  {g.get('known', 0):5}  {g.get('edge', 0):4}  {g.get('stale', 0):5}  {left:4}  {n:5}  {bar(g.get('known', 0), n)}")
    share = f"{100 * known / counted:.1f}%" if counted else "n/a"
    out = ", ".join(f"{n} {why}" for why, n in sorted(outside.items())) or "none"
    print(f"\ncoverage: {known}/{counted} functions known ({share}); {total.get('edge', 0)} edge, "
          f"{total.get('stale', 0)} stale, {total.get('skipped', 0)} skipped")
    print(f"out of scope: {out} (scope.json: exclude {rules['exclude'] or '[]'}, include {rules['include'] or '[]'})")


# ---------- worktree ----------

def dirty_paths(root):
    out = subprocess.run(
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        cwd=root, capture_output=True, text=True, check=True,
    ).stdout
    entries, paths, index = out.split("\0"), [], 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if not entry:
            continue
        if "R" in entry[:2] or "C" in entry[:2]:
            index += 1  # the next entry is the rename source
        paths.append((entry[:2], entry[3:]))
    return paths


def merge(into, extra):
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(into.get(key), dict):
            merge(into[key], value)
        else:
            into.setdefault(key, value)
    return into


def show_types(tree):
    """Zed settings for TREE: inlay hints show every binding's and chain step's type, and hovering
    a type shows its whole definition (rust-analyzer stops at 5 fields by default)."""
    settings = tree / ".zed" / "settings.json"
    wanted = {
        "inlay_hints": {"enabled": True, "show_type_hints": True, "show_parameter_hints": True, "show_other_hints": True},
        "lsp": {"rust-analyzer": {"initialization_options": {"hover": {"show": {"fields": 100, "enumVariants": 100}}}}},
    }
    lines = settings.read_text().splitlines() if settings.exists() else []
    header = [line for line in lines if line.lstrip().startswith("//")]
    try:
        current_settings = json.loads("\n".join(line for line in lines if not line.lstrip().startswith("//")) or "{}")
    except json.JSONDecodeError:
        print(f"understand: could not read {settings}; set inlay hints and hover fields in Zed by hand", file=sys.stderr)
        return
    settings.parent.mkdir(parents=True, exist_ok=True)
    body_text = json.dumps(merge(current_settings, wanted), indent=2)
    settings.write_text("\n".join(header + [body_text]) + "\n")


def real_content(root, state, rel):
    """REL as the user wrote it, without anything `annotate --checkout` drew into it; None if absent."""
    backup = state / "checkout" / rel
    if backup.exists():
        return backup.read_bytes() or None
    path = root / rel
    if not path.is_file():
        return None
    if path.suffix not in COMMENT:
        return path.read_bytes()
    text = path.read_text(errors="replace")
    clean = "\n".join(code_lines(text, COMMENT[path.suffix])) + "\n"
    return (clean if clean.strip() != text.strip() else text).encode()


def cmd_worktree(args):
    root = repo_root()
    state = state_dir(root)
    tree = state / "worktree"
    head = git("rev-parse", "HEAD", cwd=root)
    dirty = []
    for status, rel in [] if args.head else dirty_paths(root):
        content = real_content(root, state, rel)
        committed = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=root, capture_output=True).stdout
        if content is not None and content.strip() == committed.strip():
            continue  # only drawn on: the user's code is HEAD's
        dirty.append((status, rel, content))
    fingerprint = hashlib.sha256()
    for status, rel, content in dirty:
        fingerprint.update(f"{status} {rel}\n".encode() + (content or b""))
    snapshot = f"{head}+{fingerprint.hexdigest()[:8]}" if dirty else head
    now = current(state)
    if tree.exists() and now.get("commit") == snapshot and not args.fresh:
        show_types(tree)
        print(f"worktree: {tree}\nsnapshot: {snapshot} (unchanged)")
        return
    if tree.exists():
        git("worktree", "remove", "--force", str(tree), cwd=root, check=False)
        shutil.rmtree(tree, ignore_errors=True)
    git("worktree", "prune", cwd=root)
    git("worktree", "add", "--detach", str(tree), head, cwd=root)
    for _, rel, content in dirty:
        target = tree / rel
        if content is not None:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        elif target.exists():
            target.unlink()
    shutil.rmtree(state / "pristine", ignore_errors=True)
    show_types(tree)
    now.update({"worktree": str(tree), "commit": snapshot})
    save(state / "current.json", now)
    print(f"worktree: {tree}")
    print(f"snapshot: {snapshot}" + (f" ({len(dirty)} uncommitted paths copied in)" if dirty else ""))


def worktree_or_die(state):
    tree = current(state).get("worktree")
    if not tree or not Path(tree).exists():
        die("no worktree yet: run `understand.py worktree` first")
    return Path(tree)


def pristine_copy(state, tree, rel):
    """The unprobed, unannotated snapshot file, saved the first time anything touches it."""
    keep = state / "pristine" / rel
    if not keep.exists():
        keep.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tree / rel, keep)
    return keep


# ---------- probes and traces ----------
#
# Probe kinds, told apart by their keys:
#   value     {file, line, label, expr, after?|before?}   what a binding holds
#   call      {file, line, label, callee, args, call, before?}
#                                                          a pure call, evaluated again by the probe
#             {file, line, label, callee, args, result, after}
#                                                          a call with effects: ARGS printed above LINE,
#                                                          RESULT (the binding it fills) below AFTER;
#                                                          a "template" applies to the RESULT line
#   stages    {file, line, after, label, stages: [{line, label, expr?}], expr?}
#                                                          a chain, stage by stage
#   inferred  {file, line, label, inferred, why}          a value the run could not show
#   patch     {file, before|after, patch}                 a line the probe run needs (e.g. a derive)
#
# CALLEE names the called function as the map does (`<path>::<item>`); the drawing points at it
# with its line and mark, so the call reads as a door to that function.

STAGE = {".rs": '.inspect(|value| eprintln!("{tag} {id} {{:?}}", &({expr})))'}
CALL = {
    ".rs": 'eprintln!("{tag} {id} {{:?}} → {{:?}}", &({args}), &({call}));',
    ".py": '__import__("sys").stderr.write("{tag} {id} " + repr({args}) + " → " + repr({call}) + "\\n")',
}


def kind(probe):
    for key in ("patch", "stages", "call", "result", "inferred"):
        if key in probe:
            return "call" if key == "result" else key
    return "value"


def indent_of(line):
    return line[: len(line) - len(line.lstrip())]


def template_for(probe, table, suffix):
    template = probe.get("template") or table.get(suffix)
    if not template:
        die(f"no {kind(probe)} template for {suffix}: give the probe a \"template\"")
    return template


def insertions(probe, lines, suffix):
    """(index, text) pairs: TEXT goes in before LINES[index]."""
    found = kind(probe)
    if found == "inferred":
        return []
    if found == "patch":
        at = probe["before"] - 1 if probe.get("before") else probe["after"]
        return [(at, indent_of(lines[(probe.get("before") or probe["after"]) - 1]) + probe["patch"])]
    if found == "stages":
        out = []
        for number, stage in enumerate(probe["stages"]):
            text = template_for(probe, STAGE, suffix).format(tag=TAG, id=f"{probe['id']}s{number}", expr=stage.get("expr", "value"))
            out.append((stage["line"], indent_of(lines[stage["line"] - 1]) + text))
        if "expr" in probe:
            text = template_for({}, PROBE, suffix).format(tag=TAG, id=probe["id"], expr=probe["expr"])
            out.append((probe["after"], indent_of(lines[probe["line"] - 1]) + text))
        return out
    if found == "call" and "result" in probe:
        line, after = probe["line"], probe["after"]
        args = template_for({}, PROBE, suffix).format(tag=TAG, id=f"{probe['id']}a", expr=probe["args"])
        result = template_for(probe, PROBE, suffix).format(tag=TAG, id=f"{probe['id']}r", expr=probe["result"])
        return [(line - 1, indent_of(lines[line - 1]) + args), (after, indent_of(lines[line - 1]) + result)]
    if found == "call":
        before = probe.get("before") or probe["line"]
        text = template_for(probe, CALL, suffix).format(tag=TAG, id=probe["id"], args=probe["args"], call=probe["call"])
        return [(before - 1, indent_of(lines[before - 1]) + text)]
    text = template_for(probe, PROBE, suffix).format(tag=TAG, id=probe["id"], expr=probe["expr"])
    reference = lines[(probe.get("before") or probe["line"]) - 1]
    at = probe["before"] - 1 if probe.get("before") else (probe.get("after") or probe["line"])
    return [(at, indent_of(reference) + text)]


def cmd_probe(args):
    root = repo_root()
    state = state_dir(root)
    tree = worktree_or_die(state)
    spec = json.loads(Path(args.spec).read_text())
    probes = spec["probes"]
    for index, probe in enumerate(probes):
        if "card" in probe:
            die(f"probe {index} is a card: types are left to the language server, drop it from {args.spec}")
        probe["id"] = f"p{index}"
    touched = 0
    pristine = state / "pristine"
    for keep in pristine.rglob("*") if pristine.exists() else []:
        # Files an earlier spec probed go back to clean, so no stale probe prints under a reused id.
        if keep.is_file() and str(keep.relative_to(pristine)) not in {p["file"] for p in probes}:
            shutil.copy2(keep, tree / keep.relative_to(pristine))
    for rel in {p["file"] for p in probes}:
        lines = pristine_copy(state, tree, rel).read_text().splitlines()
        planned = []
        for probe in (p for p in probes if p["file"] == rel):
            planned += insertions(probe, lines, Path(rel).suffix)
        # Bottom-up, and at one index in reverse, so every insert lands where planned.
        for sequence, (at, text) in sorted(enumerate(planned), key=lambda e: (e[1][0], e[0]), reverse=True):
            lines.insert(at, text)
        (tree / rel).write_text("\n".join(lines) + "\n")
        touched += len(planned)
    save(state / "probes.json", {"scenario": spec.get("scenario"), "probes": probes})
    print(f"inserted {touched} lines for {len(probes)} probes under {tree}")


def cmd_collect(args):
    root = repo_root()
    state = state_dir(root)
    plan = load(state / "probes.json", None)
    if not plan:
        die("no probes.json: run `understand.py probe` first")
    boundary, segment = None, None
    if args.segment:
        label, _, number = args.segment.rpartition(":")
        matches = [p["id"] for p in plan["probes"] if kind(p) == "value" and p.get("label") == label]
        if not matches or not number.isdigit():
            die(f"--segment wants LABEL:N with LABEL one of the value probes' labels, got {args.segment!r}")
        boundary, segment = matches[0], int(number)
    hits, seen = {}, 0
    effectful = {p["id"] for p in plan["probes"] if kind(p) == "call" and "result" in p}
    for raw in Path(args.log).read_text(errors="replace").splitlines():
        index = raw.find(TAG + " ")
        if index < 0:
            continue
        probe_id, _, value = raw[index + len(TAG) + 1:].partition(" ")
        if probe_id == boundary:
            seen += 1
        if boundary is None or seen == segment:
            hits.setdefault(probe_id, []).append(value)
            # A call with effects prints its arguments and its result from two lines; pair them in
            # log order, so a call that never reached its result line (an early return, a let-else)
            # keeps its arguments with ⊘ instead of borrowing the next call's result.
            if probe_id[-1:] == "a" and probe_id[:-1] in effectful:
                hits.setdefault(probe_id[:-1], []).append(value + f" → {UNREACHED}")
            elif probe_id[-1:] == "r" and probe_id[:-1] in effectful:
                calls = hits.setdefault(probe_id[:-1], [])
                if calls and calls[-1].endswith(f" → {UNREACHED}"):
                    calls[-1] = calls[-1][: -len(UNREACHED)] + value
                else:
                    calls.append(f"? → {value}")
    scenario = args.scenario or plan.get("scenario") or "scenario"
    values = []
    for probe in plan["probes"]:
        found = kind(probe)
        if found == "patch":
            continue
        value = {k: v for k, v in probe.items() if k not in ("id", "template")} | {"kind": found}
        if found == "stages":
            value["stages"] = [
                stage | {"hits": hits.get(f"{probe['id']}s{number}", [])}
                for number, stage in enumerate(probe["stages"])
            ]
        if found in ("value", "call") or (found == "stages" and "expr" in probe):
            value["hits"] = hits.get(probe["id"], [])
        values.append(value)
    trace = {
        "scenario": scenario,
        "commit": current(state).get("commit"),
        "recorded": datetime.datetime.now().isoformat(timespec="seconds"),
        "command": args.command,
        "source": args.source,
        "values": values,
    }
    save(state / "traces" / f"{scenario}.json", trace)
    probed = [v for v in values if v["kind"] in ("value", "call", "stages")]
    silent = [v for v in probed if not v.get("hits") and not any(s["hits"] for s in v.get("stages", []))]
    print(f"trace {scenario}: {len(probed) - len(silent)}/{len(probed)} probes fired -> {state / 'traces' / (scenario + '.json')}")
    for value in silent:
        print(f"  not reached: {value['file']}:{value['line']} {value.get('label') or value.get('expr')}")


# ---------- rendering ----------

def cells(text):
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 0 if unicodedata.combining(ch) else 1 for ch in text)


def clip(text, width):
    if cells(text) <= width:
        return text
    out = ""
    for ch in text:
        if cells(out + ch) > width - 1:
            break
        out += ch
    return out + "…"


PAIRS = {"(": ")", "[": "]", "{": "}"}
PACK = 28  # widest field that may share a line with its neighbours
UUID = re.compile(r"\b([0-9a-f]{4})[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}([0-9a-f]{4})\b")


def short_ids(text):
    """UUIDs as their first and last four digits: still matchable across boxes, a fraction of the width."""
    return UUID.sub(r"\1…\2", text)


def lex(text):
    out, i = [], 0
    while i < len(text):
        ch = text[i]
        if ch == '"':
            j = i + 1
            while j < len(text) and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(("atom", text[i:j + 1]))
            i = j + 1
        elif ch in PAIRS:
            out.append(("open", ch))
            i += 1
        elif ch in ")]}":
            out.append(("close", ch))
            i += 1
        elif ch == ",":
            out.append(("comma", ch))
            i += 1
        else:
            j = i
            while j < len(text) and text[j] not in '"([{)]},':
                j += 1
            out.append(("atom", text[i:j]))
            i = j
    return out


def parse(tokens, pos=0):
    """Items of one bracket level: each item is a list of str atoms and (open, items) groups."""
    items = [[]]
    while pos < len(tokens):
        kind_, value = tokens[pos]
        pos += 1
        if kind_ == "open":
            inner, pos = parse(tokens, pos)
            items[-1].append((value, inner))
        elif kind_ == "close":
            break
        elif kind_ == "comma":
            items.append([])
        elif value.strip():
            items[-1].append(value.strip())
    return [item for item in items if item], pos


def joiner(before, node):
    if isinstance(before, str) and isinstance(node, tuple) and (node[0] == "{" or before.endswith((":", "=>", "→"))):
        return " "
    if isinstance(before, tuple) and isinstance(node, str):
        return "" if node.startswith((".", "?")) else " "
    return "" if isinstance(node, tuple) else " "


def flat(item):
    out, before = "", None
    for node in item:
        piece = node if isinstance(node, str) else group_flat(node)
        out += (joiner(before, node) if before is not None else "") + piece
        before = node
    return out


def group_flat(group):
    open_, items = group
    inner = ", ".join(flat(item) for item in items)
    if open_ == "{" and inner:
        return "{ " + inner + " }"
    return open_ + inner + PAIRS[open_]


def layout(item, width, indent=0):
    """Lines for ITEM, breaking its last group open when it does not fit."""
    text = flat(item)
    if cells(text) + indent <= width or not any(isinstance(node, tuple) for node in item):
        return [" " * indent + text]
    last = max(i for i, node in enumerate(item) if isinstance(node, tuple))
    head = flat(item[:last])
    open_, items = item[last]
    head = head + (joiner(item[last - 1], item[last]) if last else "") + open_
    tail = PAIRS[open_] + (flat(item[last + 1:]) if last + 1 < len(item) else "")
    if len(items) == 1 and isinstance(items[0][-1], tuple):
        # Hug a lone wrapped group: `Some(RunRef {` … `})` rather than a level per bracket.
        inner = layout(items[0], width - cells(head) - cells(tail), indent)
        inner[0] = " " * indent + head + inner[0].lstrip()
        inner[-1] += tail
        return inner
    lines, packing = [" " * indent + head], False
    for number, child in enumerate(items):
        # A list shows its first element's whole shape and the rest one per line.
        if open_ == "[" and number > 0:
            child_lines = [" " * (indent + 2) + flat(child)]
        else:
            child_lines = layout(child, width, indent + 2)
        child_lines[-1] += ","
        short = len(child_lines) == 1 and cells(child_lines[0].strip()) <= PACK and open_ != "["
        # Short fields share a line (`fit: None, event: None,`) so whole values fit a box.
        if short and packing and cells(lines[-1]) + 1 + cells(child_lines[0].strip()) <= width:
            lines[-1] += " " + child_lines[0].strip()
        else:
            lines += child_lines
        packing = short
    return lines + [" " * indent + tail]


def pretty(value, width):
    items, _ = parse(lex(value))
    if len(items) != 1:
        return [value]
    return layout(items[0], width)


def boxed(header, rows, width, after=""):
    inner = max([cells(row) for row in rows] + [cells(header) + 2])
    inner = min(inner, width)
    rows = [clip(row, inner) for row in rows]
    header = clip(header, inner - 2)
    top = f"╭─{header} " + "─" * (inner - cells(header)) + "╮"
    middle = [f"│ {row}{' ' * (inner - cells(row))} │" for row in rows]
    bottom = "╰" + "─" * (inner + 2) + "╯" + (f" {after}" if after else "")
    return [top, *middle, bottom]


def capped(rows, limit):
    if len(rows) <= limit:
        return rows
    return rows[: limit - 1] + [f"┄ {len(rows) - limit + 1} more lines in the trace file"]


def table(hits, limit):
    number = len(str(len(hits)))
    shown = hits if len(hits) <= limit else hits[: limit - 1]
    rows = [f"{i:>{number}} ┊ {hit}" for i, hit in enumerate(shown, 1)]
    if len(shown) < len(hits):
        rows.append(f"{'…':>{number}} ┊ {len(hits) - len(shown)} more")
    return rows


def pointer(root, state, value, opts):
    """`▸ list.rs:341 [ ]`: where a call's callee lives and how well the user knows it."""
    symbol = value.get("callee")
    if not symbol:
        return ""
    entry = resolve(root, state, symbol)
    where = f"{Path(split_symbol(symbol)[0]).name}:{entry['line']}" if entry else f"{symbol} (not found)"
    return f"▸ {where} {BOX_OF.get(opts.marks.get(symbol), '[ ]')}"


def io_rows(hit, width, number=None):
    """A call's arguments and result as `in ┊` and `out ┊` rows, the result laid out whole."""
    arguments, _, result = hit.partition(" → ")
    lead = f"{number} " if number is not None else ""
    pad = " " * len(lead)
    rows = [f"{lead}in  ┊ {row}" if i == 0 else f"{pad}    ┊ {row}"
            for i, row in enumerate(pretty(arguments.strip(), width - 6 - len(lead)) if arguments.strip() else [])]
    rows += [f"{lead if not rows else pad}out ┊ {row}" if i == 0 else f"{pad}    ┊ {row}"
             for i, row in enumerate(pretty(result, width - 6 - len(lead)))]
    return rows


def render(root, state, value, source, opts):
    """('inline', chip) or ('box', rows) for one traced value."""
    label = value.get("label") or value.get("expr") or "value"
    icon = SOURCE_ICON.get(source or "", "")
    found = value["kind"]
    after = " ".join(part for part in (pointer(root, state, value, opts), icon) if part)
    if found == "inferred":
        chip = f"⟦{INFERRED} {label} = {value['inferred']}⟧"
        why = value.get("why")
        if cells(chip) <= opts.inline and not why:
            return "inline", chip + (f" {after}" if after else "")
        rows = pretty(value["inferred"], opts.width) + ([f"┄ inferred: {why}"] if why else [])
        return "box", boxed(f"{INFERRED} {label}", rows, opts.width, after)
    if found == "stages":
        rows = []
        for stage in value["stages"]:
            rows.append(stage["label"])
            rows += [f"  ┊ {hit}" for hit in stage["hits"]] or [f"  ┊ {UNREACHED} nothing passed"]
        if value.get("hits"):
            rows += ["= " + line for line in pretty(value["hits"][0], opts.width - 2)]
        return "box", boxed(f"{OBSERVED} {label}, stage by stage", capped(rows, opts.rows), opts.width, icon)
    hits = value["hits"]
    if not hits:
        return "inline", f"⟦{UNREACHED} {label}: not reached⟧" + (f" {after}" if after else "")
    if len(hits) == 1:
        arguments, _, result = hits[0].partition(" → ")
        if found == "value":
            chip = f"⟦{OBSERVED} {label} = {hits[0]}⟧"
        elif arguments.strip():
            chip = f"⟦{OBSERVED} {label}: {arguments.strip()} → {result}⟧"
        else:
            chip = f"⟦{OBSERVED} {label} → {result}⟧"
        if cells(chip) <= opts.inline:
            return "inline", chip + (f" {after}" if after else "")
        rows = io_rows(hits[0], opts.width) if found == "call" else pretty(hits[0], opts.width)
        return "box", boxed(f"{OBSERVED} {label}", capped(rows, opts.rows), opts.width, after)
    if found == "call":
        rows = []
        for number, hit in enumerate(hits, 1):
            rows += io_rows(hit, opts.width, f"{number:>{len(str(len(hits)))}}")
        return "box", boxed(f"{OBSERVED} {label} ×{len(hits)}", capped(rows, opts.rows), opts.width, after)
    return "box", boxed(f"{OBSERVED} {label} ×{len(hits)}", table(hits, opts.rows), opts.width, after)


def cmd_annotate(args):
    root = repo_root()
    state = state_dir(root)
    tree = worktree_or_die(state)
    files = {}
    args.marks = marks(root, state, load(state / "progress.json", {}), lambda rel: snapshot_file(root, state, rel))
    for name in args.scenario:
        trace = load(state / "traces" / f"{name}.json", None)
        if not trace:
            die(f"no trace named {name!r} in {state / 'traces'}")
        for value in trace["values"]:
            if not args.full_ids:
                value = json.loads(short_ids(json.dumps(value, ensure_ascii=False)))
            if value["kind"] == "card":
                continue  # traces from before cards were dropped
            files.setdefault(value["file"], []).append((value, trace.get("source")))
    for rel, values in files.items():
        lines = pristine_copy(state, tree, rel).read_text().splitlines()
        comment = COMMENT.get(Path(rel).suffix, "//")
        chips, boxes = {}, {}
        for value, source in values:
            drawn_kind, drawn = render(root, state, value, source, args)
            if drawn_kind == "inline":
                chips.setdefault(value["line"], []).append(drawn)
                continue
            # Values probed `before` a line sit above it; the rest under their statement.
            if value["kind"] == "value" and value.get("before"):
                at = value["before"] - 1
            else:
                at = value.get("after") or value["line"]
            boxes.setdefault(at, (value["line"], []))[1].extend(drawn)
        for line, drawn in chips.items():
            lines[line - 1] = lines[line - 1].rstrip() + f"  {comment} " + " ".join(drawn)
        for at in sorted(boxes, reverse=True):
            anchor, rows = boxes[at]
            indent = indent_of(lines[anchor - 1])
            lines[at:at] = [f"{indent}{comment} {row}" for row in rows]
        (tree / rel).write_text("\n".join(lines) + "\n")
    for probe in load(state / "probes.json", {}).get("probes", []):
        if probe["file"] not in files:
            shutil.copy2(pristine_copy(state, tree, probe["file"]), tree / probe["file"])
    print(f"annotated {sum(map(len, files.values()))} values in {len(files)} files under {tree}")
    for rel in files:
        print(f"  {tree / rel}")
    if args.checkout:
        to_checkout(root, state, tree, set(files))


def same_code(path, snapshot):
    """True when PATH differs from SNAPSHOT by annotations at most."""
    comment = COMMENT.get(path.suffix, "//")
    return path.exists() and code_lines(path.read_text(), comment) == code_lines(snapshot.read_text(), comment)


def to_checkout(root, state, tree, drawn):
    """Draw into the user's checkout too: each probed file gets its annotated (or clean) copy,
    but only where the user has not changed its code since the snapshot."""
    pristine = state / "pristine"
    for keep in sorted(pristine.rglob("*")):
        if not keep.is_file():
            continue
        rel = str(keep.relative_to(pristine))
        if not same_code(root / rel, keep):
            print(f"  skipped {rel}: its code changed since the snapshot; run `worktree` and annotate again")
            continue
        shutil.copy2(tree / rel if rel in drawn else keep, root / rel)
    backup = state / "checkout" / ".zed" / "settings.json"
    settings = root / ".zed" / "settings.json"
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(settings.read_text() if settings.exists() else "")
    show_types(root)
    print(f"drew into the checkout {root}; `restore --checkout` takes it out")


def cmd_restore(args):
    root = repo_root()
    state = state_dir(root)
    tree = worktree_or_die(state)
    pristine = state / "pristine"
    restored = 0
    for keep in pristine.rglob("*") if pristine.exists() else []:
        if keep.is_file():
            shutil.copy2(keep, tree / keep.relative_to(pristine))
            restored += 1
            main = root / keep.relative_to(pristine)
            if args.checkout and same_code(main, keep):
                shutil.copy2(keep, main)
    print(f"restored {restored} files in {tree}" + (" and the checkout" if args.checkout else ""))
    backup = state / "checkout" / ".zed" / "settings.json"
    if args.checkout and backup.exists():
        settings = root / ".zed" / "settings.json"
        if backup.read_text():
            settings.write_text(backup.read_text())
        elif settings.exists():
            settings.unlink()
        shutil.rmtree(state / "checkout")


def cmd_clean(args):
    root = repo_root()
    state = state_dir(root)
    tree = state / "worktree"
    if tree.exists():
        git("worktree", "remove", "--force", str(tree), cwd=root, check=False)
        shutil.rmtree(tree, ignore_errors=True)
    git("worktree", "prune", cwd=root)
    shutil.rmtree(state / "pristine", ignore_errors=True)
    now = current(state)
    now.pop("worktree", None)
    save(state / "current.json", now)
    print(f"removed {tree}; map, progress, traces and cassettes kept in {state}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("dir", help="print this repository's state directory").set_defaults(run=cmd_dir)
    p = sub.add_parser("status", help="every marked function: its status, or stale when its body changed")
    p.add_argument("--tree", help="check against this checkout instead of the repository")
    p.set_defaults(run=cmd_status)
    p = sub.add_parser("coverage", help="how much of the repository's code is known, by directory or file")
    p.add_argument("--by", choices=("dir", "file"), default="dir")
    p.add_argument("--list", metavar="PATH", help="list every in-scope function under PATH with its mark")
    p.add_argument("--tests", action="store_true", help="count test functions too, this once")
    p.add_argument("--exclude", action="append", metavar="GLOB", help="keep files matching GLOB out of scope (saved)")
    p.add_argument("--include", action="append", metavar="GLOB", help="bring files matching GLOB into scope (saved)")
    p.set_defaults(run=cmd_coverage)
    p = sub.add_parser("hash", help="locate and hash SYMBOL's definition")
    p.add_argument("symbol", help="<path from repo root>::<item>, as `coverage --list` prints it")
    p.set_defaults(run=cmd_hash)
    p = sub.add_parser("mark", help="record SYMBOL's status")
    p.add_argument("symbol", help="<path from repo root>::<item>, as `coverage --list` prints it")
    p.add_argument("--status", choices=STATUSES, required=True)
    p.add_argument("--evidence", required=True, help="the check and the user's answer, in a few words")
    p.set_defaults(run=cmd_mark)
    p = sub.add_parser("worktree", help="snapshot the working tree, uncommitted changes included, into the worktree")
    p.add_argument("--head", action="store_true", help="snapshot HEAD only")
    p.add_argument("--fresh", action="store_true", help="rebuild even if the snapshot is unchanged")
    p.set_defaults(run=cmd_worktree)
    p = sub.add_parser("probe", help="insert the probes in SPEC into the worktree")
    p.add_argument("spec", help='JSON {"scenario", "probes": [...]}; the probe kinds are listed above cmd_probe in this script')
    p.set_defaults(run=cmd_probe)
    p = sub.add_parser("collect", help="read probe output from LOG into traces/<scenario>.json")
    p.add_argument("log")
    p.add_argument("--scenario")
    p.add_argument("--command", help="the command that produced LOG, kept for reruns")
    p.add_argument("--segment", help="LABEL:N keeps only the Nth stretch starting at probe LABEL, e.g. one request of several")
    p.add_argument("--source", choices=("run", "cassette", "live"), default="run")
    p.set_defaults(run=cmd_collect)
    p = sub.add_parser("annotate", help="draw the values of SCENARIO(s) into the worktree")
    p.add_argument("scenario", nargs="+")
    p.add_argument("--width", type=int, default=88, help="widest box interior, in cells")
    p.add_argument("--rows", type=int, default=32, help="most rows in one box")
    p.add_argument("--inline", type=int, default=56, help="widest value kept on its own line")
    p.add_argument("--full-ids", action="store_true", help="draw UUIDs whole instead of as 01a1…6571")
    p.add_argument("--checkout", action="store_true", help="also draw into the user's checkout where its code is unchanged")
    p.set_defaults(run=cmd_annotate)
    p = sub.add_parser("restore", help="put every touched worktree file back to its snapshot")
    p.add_argument("--checkout", action="store_true", help="also take the drawing out of the user's checkout")
    p.set_defaults(run=cmd_restore)
    sub.add_parser("clean", help="remove the worktree, keeping all state").set_defaults(run=cmd_clean)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
