import sys


def main():
    # Debug output goes to stderr; it shows up in the test logs.
    print("Logs from your program will appear here!", file=sys.stderr)
    print(f"Unknown command: {sys.argv[1:]}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
