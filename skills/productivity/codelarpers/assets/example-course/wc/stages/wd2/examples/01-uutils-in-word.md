---
title: Words are transitions out of whitespace
source: uutils/coreutils
path: src/uu/wc/src/wc.rs
lines: 643-658
commit: fabdca4194ece30843b19d722e50b67fc5177317
url: https://github.com/uutils/coreutils/blob/fabdca4194ece30843b19d722e50b67fc5177317/src/uu/wc/src/wc.rs#L643-L658
license: MIT
language: rust
kind: professional
---
Instead of splitting, uutils walks the text once and keeps one bit of state, `in_word`. A word is counted at the moment a non-space character follows whitespace, so runs of spaces never produce empty words. Note the POSIX whitespace set: tab through carriage return, plus space.

```rust
    for ch in text.chars() {
        if SHOW_WORDS {
            let is_space = if is_posixly_correct {
                matches!(ch, '\t'..='\r' | ' ')
            } else {
                ch.is_whitespace()
            };

            if is_space {
                *in_word = false;
            } else if !(*in_word) {
                // This also counts control characters! (As of GNU coreutils 9.5)
                *in_word = true;
                total.words += 1;
            }
        }
```
