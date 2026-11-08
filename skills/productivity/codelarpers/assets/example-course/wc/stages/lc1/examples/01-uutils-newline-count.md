---
title: Lines are newline bytes
source: uutils/coreutils
path: src/uu/wc/src/count_fast.rs
lines: 198-204
commit: fabdca4194ece30843b19d722e50b67fc5177317
url: https://github.com/uutils/coreutils/blob/fabdca4194ece30843b19d722e50b67fc5177317/src/uu/wc/src/count_fast.rs#L198-L204
license: MIT
language: rust
kind: professional
---
The Rust coreutils `wc` never splits into lines: it counts `b'\n'` bytes in each buffer it reads, with a SIMD fast path when the CPU allows. That is why a final line without a newline doesn't count.

```rust
                if COUNT_LINES {
                    total.lines += if simd_allowed {
                        bytecount::count(&buf[..n], b'\n')
                    } else {
                        bytecount::naive_count(&buf[..n], b'\n')
                    };
                }
```
