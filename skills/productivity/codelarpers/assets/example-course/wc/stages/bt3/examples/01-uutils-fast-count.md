---
title: Counting bytes and lines straight from a read buffer
source: uutils/coreutils
path: src/uu/wc/src/count_fast.rs
lines: 172-210
commit: fabdca4194ece30843b19d722e50b67fc5177317
url: https://github.com/uutils/coreutils/blob/fabdca4194ece30843b19d722e50b67fc5177317/src/uu/wc/src/count_fast.rs#L172-L210
license: MIT
language: rust
kind: professional
---
The Rust rewrite of coreutils never decodes text for `-c` or `-l`: it reads raw chunks, adds the chunk length for bytes, and counts `\n` bytes for lines. Your Python version can do the same thing on one `bytes` object.

```rust
pub(crate) fn count_bytes_chars_and_lines_fast<
    R: Read,
    const COUNT_BYTES: bool,
    const COUNT_CHARS: bool,
    const COUNT_LINES: bool,
>(
    handle: &mut R,
) -> (WordCount, Option<io::Error>) {
    let mut total = WordCount::default();
    let buf: &mut [u8] = &mut AlignedBuffer::default().data;
    let policy = SimdPolicy::detect();
    let simd_allowed = wc_simd_allowed(policy);
    loop {
        match handle.read(buf) {
            Ok(0) => return (total, None),
            Ok(n) => {
                if COUNT_BYTES {
                    total.bytes += n;
                }
                if COUNT_CHARS {
                    total.chars += if simd_allowed {
                        bytecount::num_chars(&buf[..n])
                    } else {
                        bytecount::naive_num_chars(&buf[..n])
                    };
                }
                if COUNT_LINES {
                    total.lines += if simd_allowed {
                        bytecount::count(&buf[..n], b'\n')
                    } else {
                        bytecount::naive_count(&buf[..n], b'\n')
                    };
                }
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => (),
            Err(e) => return (total, Some(e)),
        }
    }
}
```
