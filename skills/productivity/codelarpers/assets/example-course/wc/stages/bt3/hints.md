## Where to start

Is your count coming out lower than expected on non-ASCII input? What does `open()` do to the bytes by default?

## Narrowing it down

`open(path, "rb")` gives you `bytes`; `len()` of that is the byte count.
