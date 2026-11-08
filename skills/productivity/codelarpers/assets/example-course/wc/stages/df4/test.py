from codelarper_test import *

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
