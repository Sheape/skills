In this stage, you'll print all three counts when no flag is given.

### Default output

<details>
<summary>Click to expand/collapse</summary>

With no flags, `wc` prints lines, words and bytes, in that order, separated by single spaces, then the file name.

```
$ ./your_program.sh input.txt
2 5 31 input.txt
```

</details>

### Tests

The tester generates random text (different every run) and checks:

```bash
$ ./your_program.sh input.txt
<lines> <words> <bytes> input.txt
```

### Notes

- Random input means hardcoded answers won't pass. Compute every number.
- Flags from earlier stages must keep working.
