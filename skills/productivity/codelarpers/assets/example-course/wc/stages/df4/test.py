from codelarpers_test import *

for case in range(3):
    lines = [" ".join(random.words(random.int(1, 5))) for _ in range(random.int(1, 6))]
    text = "\n".join(lines) + ("\n" if random.int(0, 1) else "")
    data = text.encode()
    newlines = data.count(b"\n")
    expected = f"{newlines} {len(data.split())} {len(data)} input.txt\n"

    log(f"Test case {case + 1}/3")
    d = tmpdir({"input.txt": data})
    r = run(["input.txt"], cwd=d)
    expect_exit_code(r, 0)
    expect_stdout(r, expected)


def wc(text):
    d = tmpdir({"input.txt": text})
    r = run(["input.txt"], cwd=d)
    expect_exit_code(r, 0)
    fields = r.stdout.split()
    if len(fields) != 4 or not all(f.isdigit() for f in fields[:3]):
        fail(f"Expected \"<lines> <words> <bytes> input.txt\", got: {q(r.stdout)}")
    return [int(f) for f in fields[:3]]


def text(r):
    """Up to three lines of up to three words, possibly empty, with or without a final newline."""
    lines = [" ".join(r.words(r.int(0, 3))) for _ in range(r.int(0, 3))]
    return "\n".join(lines) + ("\n" if r.int(0, 1) else "")


def counts_add_up(a, b):
    assume(a == "" or a.endswith("\n"))  # otherwise a word can span the join
    expect_equal(wc(a + b), [x + y for x, y in zip(wc(a), wc(b))], "the counts of a + b")


law("counts of a + b = counts of a + counts of b, when a ends in a newline", lambda r: (text(r), text(r)), counts_add_up)
