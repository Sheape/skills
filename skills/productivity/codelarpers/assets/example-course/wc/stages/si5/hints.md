## Where to start

How does your program decide where its input comes from? What should it do when there is no file argument at all?

## Narrowing it down

`sys.stdin.buffer.read()` returns the piped bytes; the counting code doesn't need to change.
