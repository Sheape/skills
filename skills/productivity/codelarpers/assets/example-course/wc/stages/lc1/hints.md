## Where to start

Your program receives `["-l", "input.txt"]` as arguments. What does it need to read, and what single character decides the count?

## Narrowing it down

Count occurrences of `\n` in the file's contents instead of splitting into lines; splitting treats a trailing fragment as a line.

## Almost there

The output format is exact: `<count> <name>` followed by a newline, nothing else on stdout.
