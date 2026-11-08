import re
import sys


def counts(data: bytes) -> dict:
    return {"-l": data.count(b"\n"), "-w": len(re.split(rb"\s+", data.strip())), "-c": len(data)}


def main():
    flags = [a for a in sys.argv[1:] if a.startswith("-") and len(a) > 1]
    names = [a for a in sys.argv[1:] if a not in flags]
    if names:
        with open(names[0], "rb") as f:
            data = f.read()
    else:
        data = sys.stdin.buffer.read()
    found = counts(data)
    values = [found[f] for f in flags] if flags else [found["-l"], found["-w"], found["-c"]]
    print(" ".join(map(str, values)) + (f" {names[0]}" if names else ""))


if __name__ == "__main__":
    main()
