---
title: One struct for every count
source: uutils/coreutils
path: src/uu/wc/src/word_count.rs
lines: 9-36
commit: fabdca4194ece30843b19d722e50b67fc5177317
url: https://github.com/uutils/coreutils/blob/fabdca4194ece30843b19d722e50b67fc5177317/src/uu/wc/src/word_count.rs#L9-L36
license: MIT
language: rust
kind: professional
---
uutils keeps every count in one value and only decides what to print at the end. Adding two counts together is how it builds the `total` line for multiple files.

```rust
#[derive(Debug, Default, Copy, Clone)]
pub struct WordCount {
    pub bytes: usize,
    pub chars: usize,
    pub lines: usize,
    pub words: usize,
    pub max_line_length: usize,
}

impl Add for WordCount {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self {
            bytes: self.bytes + other.bytes,
            chars: self.chars + other.chars,
            lines: self.lines + other.lines,
            words: self.words + other.words,
            max_line_length: max(self.max_line_length, other.max_line_length),
        }
    }
}

impl AddAssign for WordCount {
    fn add_assign(&mut self, other: Self) {
        *self = *self + other;
    }
}
```
