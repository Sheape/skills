[wc](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/wc.html) counts the lines, words and bytes in its input. In this challenge you'll build your own `wc` that handles files and piped input.

Along the way, you'll learn what a "line" and a "word" really are to Unix tools, why bytes and characters differ, and how to read input as a stream.

## What exactly will I build?

A `wc` clone that supports `-l`, `-w` and `-c`, prints all three counts by default, and reads standard input when no file is given.

## What exactly will I learn?

How Unix tools define lines (newline-terminated), words (runs of non-whitespace), and bytes versus UTF-8 characters, and how to read binary input safely.

## Why should I build such a project?

`wc` looks trivial until the edge cases bite: a file without a trailing newline, a multibyte character, a run of tabs. Getting each one right by hand is how the definitions stick.

## What are the prerequisites for this challenge?

Basic Python: reading files, `sys.argv`, and printing.
