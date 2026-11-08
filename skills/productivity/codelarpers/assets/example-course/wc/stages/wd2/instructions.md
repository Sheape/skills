In this stage, you'll make `wc -w` count the words in a file.

### What counts as a word

<details>
<summary>Click to expand/collapse</summary>

A word is a maximal run of non-whitespace bytes. Whitespace is space, tab, newline, carriage return, vertical tab and form feed. Runs of whitespace separate words; they don't create empty words.

`"  leading   and trailing  \n"` has 3 words.

</details>

### Tests

```bash
$ ./your_program.sh -w input.txt
```

For `hello world\n` it expects:

```
2 input.txt
```

The tester also checks tabs, repeated spaces and blank lines.

### Notes

- `-l` from the previous stage must keep working.
