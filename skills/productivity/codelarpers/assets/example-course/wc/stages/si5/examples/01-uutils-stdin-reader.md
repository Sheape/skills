---
title: One counting path for files and stdin
source: uutils/coreutils
path: src/uu/wc/src/wc.rs
lines: 763-775
commit: fabdca4194ece30843b19d722e50b67fc5177317
url: https://github.com/uutils/coreutils/blob/fabdca4194ece30843b19d722e50b67fc5177317/src/uu/wc/src/wc.rs#L763-L775
license: MIT
language: rust
kind: professional
---
Standard input is just another reader: uutils hands either a locked stdin or an opened file to the same `word_count_from_reader`. Your counting code shouldn't care where the bytes came from either.

```rust
fn word_count_from_input(input: &Input<'_>, settings: &Settings) -> CountResult {
    let (total, maybe_err) = match input {
        Input::Stdin(_) => word_count_from_reader(io::stdin().lock(), settings),
        Input::Path(path) => match File::open(path) {
            Ok(f) => word_count_from_reader(f, settings),
            Err(err) => return CountResult::Failure(err),
        },
    };
    match maybe_err {
        None => CountResult::Success(total),
        Some(err) => CountResult::Interrupted(total, err),
    }
}
```
