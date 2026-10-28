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
STATUSES = ("known", "edge", "unknown")
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


def body(path, signature):
    """(start, end, text) of the one definition whose first line is `signature`, else None."""
    comment = COMMENT.get(path.suffix, "//")
    lines = code_lines(path.read_text(), comment)
    matches = [i for i, line in enumerate(lines) if line.strip() == signature.strip()]
    if len(matches) != 1:
        return None
    start = matches[0]
    end = indent_end(lines, start) if path.suffix == ".py" else brace_end(lines, start)
    if end is None:
        return None
    text = "\n".join(line.rstrip() for line in lines[start:end + 1] if line.strip())
    return start + 1, end + 1, text


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def current(state):
    return load(state / "current.json", {})


def relative(root, state, file):
    """FILE as a path from the repository root, whether given from the worktree or the repo."""
    path = Path(file)
    if not path.is_absolute():
        return file
    tree = current(state).get("worktree")
    for base in ([Path(tree)] if tree else []) + [root]:
        if path.is_relative_to(base):
            return str(path.relative_to(base))
    die(f"{file} is outside the repository and its worktree")


def snapshot_file(root, state, rel):
    """The snapshot's copy of REL without probes: pristine, else worktree, else repo."""
    tree = current(state).get("worktree")
    for candidate in [state / "pristine" / rel] + ([Path(tree) / rel] if tree else []) + [root / rel]:
        if candidate.exists():
            return candidate
    die(f"{rel} not found")


# ---------- state commands ----------

def cmd_dir(args):
    print(state_dir(repo_root()))


def cmd_hash(args):
    root = repo_root()
    state = state_dir(root)
    path = snapshot_file(root, state, relative(root, state, args.file))
    lines = code_lines(path.read_text(), COMMENT.get(path.suffix, "//"))
    signature = lines[args.line - 1].strip()
    found = body(path, signature)
    if not found:
        die(f"could not find one body for {signature!r} in {path}")
    print(json.dumps({"signature": signature, "start": found[0], "end": found[1], "hash": digest(found[2])}))


def cmd_mark(args):
    root = repo_root()
    state = state_dir(root)
    progress = load(state / "progress.json", {})
    rel = relative(root, state, args.file)
    path = snapshot_file(root, state, rel)
    lines = code_lines(path.read_text(), COMMENT.get(path.suffix, "//"))
    signature = lines[args.line - 1].strip()
    found = body(path, signature)
    if not found:
        die(f"could not find one body for {signature!r} in {rel}")
    entry = progress.get(args.symbol, {"history": []})
    entry.update({
        "status": args.status,
        "evidence": args.evidence,
        "file": rel,
        "signature": signature,
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
    counts = {}
    for symbol, entry in sorted(progress.items()):
        path = base / entry["file"]
        found = body(path, entry["signature"]) if path.exists() else None
        if not found:
            verdict = "missing"
        elif digest(found[2]) != entry["hash"]:
            verdict = f"stale ({entry['status']} before)"
        else:
            verdict = entry["status"]
        counts[verdict.split()[0]] = counts.get(verdict.split()[0], 0) + 1
        where = f"{entry['file']}:{found[0]}" if found else entry["file"]
        print(f"{verdict:22} {symbol}  {where}  — {entry['evidence']}")
    summary = ", ".join(f"{n} {k}" for k, n in sorted(counts.items())) or "nothing marked yet"
    print(f"\n{summary}\nstate: {state}")
    if current(state):
        print(f"current: {json.dumps(current(state), ensure_ascii=False)}")


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
    """Zed settings for the worktree: inlay hints show every binding's and chain step's type,
    and hovering a type shows its whole definition (rust-analyzer stops at 5 fields by default)."""
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


def cmd_worktree(args):
    root = repo_root()
    state = state_dir(root)
    tree = state / "worktree"
    head = git("rev-parse", "HEAD", cwd=root)
    dirty = [] if args.head else dirty_paths(root)
    fingerprint = hashlib.sha256()
    for status, rel in dirty:
        fingerprint.update(f"{status} {rel}\n".encode())
        if (root / rel).is_file():
            fingerprint.update((root / rel).read_bytes())
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
    for _, rel in dirty:
        source, target = root / rel, tree / rel
        if source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif not source.exists() and target.exists():
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
#   call      {file, line, label, args, call, before?}    a pure call's arguments → result
#   stages    {file, line, after, label, stages: [{line, label, expr?}], expr?}
#                                                          a chain, stage by stage
#   card      {file, line, card, from: "path:line"}       a type's definition, drawn above LINE
#   inferred  {file, line, label, inferred, why}          a value the run could not show
#   patch     {file, before|after, patch}                 a line the probe run needs (e.g. a derive)

STAGE = {".rs": '.inspect(|value| eprintln!("{tag} {id} {{:?}}", &({expr})))'}
CALL = {
    ".rs": 'eprintln!("{tag} {id} {{:?}} → {{:?}}", &({args}), &({call}));',
    ".py": '__import__("sys").stderr.write("{tag} {id} " + repr({args}) + " → " + repr({call}) + "\\n")',
}


def kind(probe):
    for key in ("card", "patch", "stages", "call", "inferred"):
        if key in probe:
            return key
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
    if found in ("card", "inferred"):
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
        probe["id"] = f"p{index}"
    touched = 0
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
    for raw in Path(args.log).read_text(errors="replace").splitlines():
        index = raw.find(TAG + " ")
        if index < 0:
            continue
        probe_id, _, value = raw[index + len(TAG) + 1:].partition(" ")
        if probe_id == boundary:
            seen += 1
        if boundary is None or seen == segment:
            hits.setdefault(probe_id, []).append(value)
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


def card_rows(root, state, value):
    rel, _, line = value["from"].rpartition(":")
    path = snapshot_file(root, state, rel)
    lines = code_lines(path.read_text(), COMMENT.get(path.suffix, "//"))
    found = body(path, lines[int(line) - 1])
    if not found:
        die(f"could not read the definition at {value['from']}")
    rows = found[2].splitlines()
    margin = min(len(indent_of(row)) for row in rows)
    return [re.sub(r"\bpub(\([^)]*\))? ", "", row[margin:]) for row in rows], f"{Path(rel).name}:{found[0]}"


def render(root, state, value, source, opts):
    """('inline', chip) or ('box', rows) for one traced value."""
    label = value.get("label") or value.get("expr") or value.get("card") or "value"
    icon = SOURCE_ICON.get(source or "", "")
    found = value["kind"]
    if found == "card":
        rows, where = card_rows(root, state, value)
        return "box", boxed(f"◆ {value['card']}", rows, opts.width, where)
    if found == "inferred":
        chip = f"⟦{INFERRED} {label} = {value['inferred']}⟧"
        why = value.get("why")
        if cells(chip) <= opts.inline and not why:
            return "inline", chip
        rows = pretty(value["inferred"], opts.width) + ([f"┄ inferred: {why}"] if why else [])
        return "box", boxed(f"{INFERRED} {label}", rows, opts.width)
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
        return "inline", f"⟦{UNREACHED} {label}: not reached⟧"
    if len(hits) == 1:
        chip = f"⟦{OBSERVED} {label} = {hits[0]}⟧" if found == "value" else f"⟦{OBSERVED} {label}: {hits[0]}⟧"
        if cells(chip) <= opts.inline:
            return "inline", chip + (f" {icon}" if icon else "")
        if found == "call":
            arguments, _, result = hits[0].partition(" → ")
            rows = [f"in  ┊ {arguments}"] + [f"{'out' if i == 0 else '   '} ┊ {row}" for i, row in enumerate(pretty(result, opts.width - 6))]
        else:
            rows = pretty(hits[0], opts.width)
        return "box", boxed(f"{OBSERVED} {label}", capped(rows, opts.rows), opts.width, icon)
    return "box", boxed(f"{OBSERVED} {label} ×{len(hits)}", table(hits, opts.rows), opts.width, icon)


def cmd_annotate(args):
    root = repo_root()
    state = state_dir(root)
    tree = worktree_or_die(state)
    files, cards = {}, set()
    for name in args.scenario:
        trace = load(state / "traces" / f"{name}.json", None)
        if not trace:
            die(f"no trace named {name!r} in {state / 'traces'}")
        for value in trace["values"]:
            if not args.full_ids:
                value = json.loads(short_ids(json.dumps(value, ensure_ascii=False)))
            if value["kind"] == "card":
                if (value["file"], value["card"]) in cards:
                    continue  # one card per type when several scenarios are drawn
                cards.add((value["file"], value["card"]))
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
            # Cards and values probed `before` a line sit above it; the rest under their statement.
            if value["kind"] == "card" or (value["kind"] == "value" and value.get("before")):
                at = (value.get("before") or value["line"]) - 1
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


def cmd_restore(args):
    state = state_dir(repo_root())
    tree = worktree_or_die(state)
    pristine = state / "pristine"
    restored = 0
    for keep in pristine.rglob("*") if pristine.exists() else []:
        if keep.is_file():
            shutil.copy2(keep, tree / keep.relative_to(pristine))
            restored += 1
    print(f"restored {restored} files in {tree}")


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
    p = sub.add_parser("hash", help="locate and hash the definition starting at FILE:LINE")
    p.add_argument("file")
    p.add_argument("line", type=int)
    p.set_defaults(run=cmd_hash)
    p = sub.add_parser("mark", help="record SYMBOL's status; LINE is its definition's first line")
    p.add_argument("symbol")
    p.add_argument("file", help="path from the repository root, or absolute in the repo or worktree")
    p.add_argument("line", type=int)
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
    p.set_defaults(run=cmd_annotate)
    sub.add_parser("restore", help="put every touched worktree file back to its snapshot").set_defaults(run=cmd_restore)
    sub.add_parser("clean", help="remove the worktree, keeping all state").set_defaults(run=cmd_clean)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
