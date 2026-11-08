In this stage, you'll make `wc -l` count the lines in a file.

### What counts as a line

<details>
<summary>Click to expand/collapse</summary>

Unix tools count a line by its terminating newline byte, `\n`. So `wc -l` is really "count the `\n` bytes".

| File contents | Lines |
| -- | -- |
| `a\nb\nc\n` | 3 |
| `a\nb` | 1 (the last line has no `\n`) |
| (empty) | 0 |

</details>

### Tests

The tester will create `input.txt` and run your program like this:

```bash
$ ./your_program.sh -l input.txt
```

For a file with three newline-terminated lines, it expects stdout to be:

```
3 input.txt
```

That is: the count, one space, the file name, and a newline.

### Notes

- A final line without a trailing `\n` is not counted. This matches POSIX `wc`.
- Debug output on stderr shows up in the test logs as `[your_program]` lines.
