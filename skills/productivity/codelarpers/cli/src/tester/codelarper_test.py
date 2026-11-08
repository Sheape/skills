"""Helpers for codelarper stage test scripts (test.py).

The harness runs a stage's test.py with this module on PYTHONPATH. Everything here
prints the codelarper line protocol on stdout:

    plain text      -> [tester::#ID] text
    "$ cmd"         -> [tester::#ID] $ cmd          (command style)
    "| text"        -> [your_program] text
    "!ok text"      -> [tester::#ID] text           (green)
    "!fail text"    -> [tester::#ID] text           (red; the failure reason)
    "!debug text"   -> shown only with debug: true

Exit 0 = stage passed, exit 1 = learner's code failed, anything else = bug in the test.

    from codelarper_test import *

    d = tmpdir({"input.txt": "a b c\\n"})
    r = run(["count", "input.txt"], cwd=d)
    expect_exit_code(r, 0)
    expect_stdout(r, "3\\n")
"""

import atexit
import json
import os
import random as _random
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback

PROGRAM = os.environ.get("CODELARPER_PROGRAM", "./your_program.sh")
STAGE = os.environ.get("CODELARPER_STAGE", "")
STAGE_DIR = os.environ.get("CODELARPER_STAGE_DIR", ".")
COURSE_DIR = os.environ.get("CODELARPER_COURSE_DIR", ".")
REPO = os.environ.get("CODELARPER_REPO", ".")
SEED = int(os.environ.get("CODELARPER_SEED", "0") or 0) or int(time.time())
DEBUG = os.environ.get("CODELARPER_DEBUG") == "1"

_lock = threading.Lock()
_tmpdirs = []
_children = []

WORDS = [
    "apple", "banana", "blueberry", "cherry", "grape", "mango", "orange", "pear", "pineapple", "raspberry",
    "strawberry", "watermelon", "lemon", "lime", "kiwi", "peach", "plum", "fig", "date", "coconut",
    "badger", "otter", "falcon", "lynx", "heron", "walrus", "panda", "koala", "gecko", "moose",
]


def _emit(marker, text):
    with _lock:
        for line in str(text).split("\n"):
            sys.stdout.write(f"{marker}{line}\n")
        sys.stdout.flush()


def log(text):
    _emit("", text)


def ok(text):
    _emit("!ok ", text)


def debug(text):
    if DEBUG:
        _emit("!debug ", text)


def fail(message):
    """Stop the test: the learner's program is wrong. Prints the reason and exits 1."""
    _emit("!fail ", message)
    _cleanup()
    os._exit(1)


def q(value):
    """Quote like the rest of the tester: JSON string with escapes visible; bytes as b'...'."""
    if isinstance(value, (bytes, bytearray)):
        return repr(bytes(value))
    return json.dumps(value)


class Random(_random.Random):
    """Seeded by CODELARPER_SEED. int(a, b) includes both ends; string() defaults to a-z."""

    def word(self):
        return self.choice(WORDS)

    def words(self, n):
        return self.sample(WORDS, n)

    def string(self, length, alphabet="abcdefghijklmnopqrstuvwxyz"):
        return "".join(self.choice(alphabet) for _ in range(length))

    def int(self, a, b):
        return self.randint(a, b)

    def pick(self, items):
        return self.choice(items)


random = Random(SEED)


def tmpdir(files=None):
    """A fresh scratch directory, optionally pre-filled with {relative_path: str|bytes}."""
    d = tempfile.mkdtemp(prefix="codelarper-")
    _tmpdirs.append(d)
    for rel, content in (files or {}).items():
        path = os.path.join(d, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(content if isinstance(content, bytes) else str(content).encode())
    return d


class Result:
    def __init__(self, stdout, stderr, exit_code, cwd):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code
        self.cwd = cwd

    def __repr__(self):
        return f"Result(exit_code={self.exit_code}, stdout={self.stdout!r}, stderr={self.stderr!r})"


def _pump(stream, sink):
    for raw in iter(stream.readline, b""):
        sink.append(raw)
        _emit("| ", raw.decode("utf-8", "replace").rstrip("\r\n"))
    stream.close()


def _show(args):
    return ("$ ./your_program.sh " + " ".join(shlex.quote(str(a)) for a in args)).rstrip()


def run(args=(), cwd=None, stdin=None, env=None, timeout=10, quiet=False, binary=False):
    """Run the learner's program to completion. Returns Result(stdout, stderr, exit_code, cwd).

    stdout/stderr are str (UTF-8, invalid bytes replaced, CRLF -> LF) unless binary=True,
    which returns the raw bytes. stdin may be str or bytes. quiet=True hides the $ line.
    """
    cwd = cwd or tmpdir()
    if not quiet:
        _emit("", _show(args))
    proc = subprocess.Popen(
        [PROGRAM, *map(str, args)],
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={**os.environ, **(env or {})},
    )
    out, err = [], []
    threads = [threading.Thread(target=_pump, args=(proc.stdout, out)), threading.Thread(target=_pump, args=(proc.stderr, err))]
    for t in threads:
        t.daemon = True
        t.start()
    if stdin is not None:
        try:
            proc.stdin.write(stdin if isinstance(stdin, bytes) else str(stdin).encode())
        except BrokenPipeError:
            pass
    try:
        proc.stdin.close()
    except BrokenPipeError:
        pass
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        fail(f"Your program didn't exit within {timeout}s.")
    for t in threads:
        t.join(timeout=1)
    if binary:
        return Result(b"".join(out), b"".join(err), proc.returncode, cwd)
    decode = lambda chunks: b"".join(chunks).decode("utf-8", "replace").replace("\r\n", "\n")
    return Result(decode(out), decode(err), proc.returncode, cwd)


class Process:
    """A long-running learner program (servers, REPLs). Output streams to the log."""

    def __init__(self, args, cwd=None, env=None):
        self.cwd = cwd or tmpdir()
        _emit("", _show(args))
        self.proc = subprocess.Popen(
            [PROGRAM, *map(str, args)],
            cwd=self.cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env={**os.environ, **(env or {})},
        )
        _children.append(self.proc)
        self._chunks = []
        self._thread = threading.Thread(target=_pump, args=(self.proc.stdout, self._chunks), daemon=True)
        self._thread.start()

    def output(self):
        return b"".join(self._chunks).decode("utf-8", "replace")

    def write(self, data):
        self.proc.stdin.write(data if isinstance(data, bytes) else str(data).encode())
        self.proc.stdin.flush()

    def wait_for_output(self, pattern, timeout=5):
        deadline = time.time() + timeout
        while time.time() < deadline:
            text = self.output()
            if (pattern.search(text) if hasattr(pattern, "search") else pattern in text):
                return text
            if self.proc.poll() is not None:
                fail(f"Your program exited before printing {q(str(getattr(pattern, 'pattern', pattern)))}.")
            time.sleep(0.02)
        fail(f"Expected output matching {q(str(getattr(pattern, 'pattern', pattern)))} within {timeout}s.")

    def kill(self):
        if self.proc.poll() is None:
            self.proc.kill()
        self.proc.wait()


def spawn(args=(), cwd=None, env=None):
    return Process(args, cwd, env)


def wait_for_port(port, timeout=5, host="127.0.0.1"):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection((host, port), timeout=0.2).close()
            return
        except OSError:
            time.sleep(0.05)
    fail(f"Your program never started listening on port {port}.")


class Connection:
    def __init__(self, sock):
        self.sock = sock
        self.buffer = b""

    def send(self, data):
        self.sock.sendall(data if isinstance(data, bytes) else str(data).encode())

    def read(self, until=None, nbytes=None, timeout=5):
        """Read until `until` (bytes/str/compiled regex) appears, or `nbytes` arrive. Consumes and returns bytes."""
        if isinstance(until, str):
            until = until.encode()
        deadline = time.time() + timeout
        while True:
            end = -1
            if nbytes is not None:
                end = nbytes if len(self.buffer) >= nbytes else -1
            elif hasattr(until, "search"):
                m = until.search(self.buffer)
                end = m.end() if m else -1
            elif until is not None:
                i = self.buffer.find(until)
                end = i + len(until) if i >= 0 else -1
            elif self.buffer:
                end = len(self.buffer)
            if end >= 0:
                out, self.buffer = self.buffer[:end], self.buffer[end:]
                return out
            remaining = deadline - time.time()
            what = q(until.decode() if isinstance(until, bytes) else str(getattr(until, "pattern", nbytes)))
            if remaining <= 0:
                fail(f"Expected to receive {what} within {timeout}s. Got: {q(self.buffer)}")
            self.sock.settimeout(remaining)
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                continue
            if not chunk:
                fail(f"Connection closed before receiving {what}. Got: {q(self.buffer)}")
            self.buffer += chunk

    def close(self):
        self.sock.close()


def connect(port, timeout=5, host="127.0.0.1"):
    wait_for_port(port, timeout, host)
    return Connection(socket.create_connection((host, port), timeout=timeout))


def expect_exit_code(r, code):
    if r.exit_code != code:
        fail(f"Expected exit code {code}, got: {r.exit_code}")


def expect_stdout(r, expected):
    if r.stdout != expected:
        fail(f"Expected {q(expected)} as stdout, got: {q(r.stdout)}")


def expect_stdout_lines(r, lines):
    got = r.stdout[:-1].split("\n") if r.stdout.endswith("\n") else r.stdout.split("\n")
    if got == [""]:
        got = []
    want = [str(l) for l in lines]
    for i in range(max(len(got), len(want))):
        g = got[i] if i < len(got) else None
        w = want[i] if i < len(want) else None
        if g != w:
            fail(f"Expected line {i + 1} of stdout to be {q(w) if w is not None else '<end of output>'}, got: {q(g) if g is not None else '<end of output>'}")


def expect_stdout_bytes(r, expected):
    """For run(..., binary=True): exact byte comparison."""
    if bytes(r.stdout) != bytes(expected):
        fail(f"Expected {q(expected)} as stdout, got: {q(r.stdout)}")


def expect_stdout_contains(r, text):
    if text not in r.stdout:
        fail(f"Expected stdout to contain {q(text)}, got: {q(r.stdout)}")


def expect_stdout_matches(r, pattern):
    if not re.search(pattern, r.stdout, re.M):
        fail(f"Expected stdout to match /{pattern}/, got: {q(r.stdout)}")


def expect_stderr_contains(r, text):
    if text not in r.stderr:
        fail(f"Expected stderr to contain {q(text)}, got: {q(r.stderr)}")


def expect_file(path, content=None):
    if not os.path.exists(path):
        fail(f"Expected file {q(os.path.basename(path))} to exist, but it doesn't.")
    if content is not None:
        with open(path, "rb") as f:
            got = f.read()
        want = content if isinstance(content, bytes) else str(content).encode()
        if got != want:
            fail(f"Expected {q(os.path.basename(path))} to contain {q(want)}, got: {q(got)}")


def expect_equal(actual, expected, label="value"):
    if actual != expected:
        fail(f"Expected {label} to be {q(expected) if isinstance(expected, str) else expected!r}, got: {q(actual) if isinstance(actual, str) else actual!r}")


def oracle(cmd, cwd=None, stdin=None, env=None, timeout=30):
    """Run a reference command (e.g. the real tool) to compute expected output. Not logged as your_program."""
    p = subprocess.run(cmd, cwd=cwd, input=stdin.encode() if isinstance(stdin, str) else stdin, capture_output=True, env={**os.environ, **(env or {})}, timeout=timeout)
    return Result(p.stdout.decode("utf-8", "replace"), p.stderr.decode("utf-8", "replace"), p.returncode, cwd)


def _cleanup():
    for p in _children:
        try:
            if p.poll() is None:
                p.kill()
        except Exception:
            pass
    for d in _tmpdirs:
        shutil.rmtree(d, ignore_errors=True)


def _excepthook(kind, value, tb):
    traceback.print_exception(kind, value, tb, file=sys.stderr)
    _cleanup()
    os._exit(3)


atexit.register(_cleanup)
sys.excepthook = _excepthook
debug(f"seed {SEED}")
