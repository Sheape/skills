In this stage, you'll read standard input when no file name is given.

### Standard input

<details>
<summary>Click to expand/collapse</summary>

`printf 'a b\n' | wc -l` has no file argument, so `wc` reads its standard input instead. With no file there is no name to print, so the output is just the counts.

Read stdin as bytes (`sys.stdin.buffer`), for the same reason you read files in binary mode.

</details>

### Tests

```bash
$ printf 'apple\nbanana\n' | ./your_program.sh -l
2
$ printf 'one two\n' | ./your_program.sh
1 2 8
```

### Notes

- No trailing space when there is no file name.
