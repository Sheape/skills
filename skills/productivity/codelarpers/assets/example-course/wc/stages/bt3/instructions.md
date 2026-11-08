In this stage, you'll make `wc -c` count the bytes in a file.

### Bytes are not characters

<details>
<summary>Click to expand/collapse</summary>

Text files are bytes. UTF-8 encodes ASCII characters in 1 byte, but `é` takes 2 bytes and most emoji take 4. `wc -c` counts bytes, so `héllo\n` is 7, not 6.

If your program decodes the file as text before counting, it counts characters instead. Read the file in binary mode.

</details>

### Tests

```bash
$ ./your_program.sh -c input.txt
```

For `héllo\n` it expects:

```
7 input.txt
```

### Notes

- The tester includes a 4-byte emoji.
