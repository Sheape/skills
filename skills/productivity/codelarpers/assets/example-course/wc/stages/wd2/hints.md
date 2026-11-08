## Where to start

Which characters separate words, and what happens when two separators sit next to each other?

## Narrowing it down

Splitting on a single space produces empty strings between repeated spaces. Look for a split that treats any run of whitespace as one separator.

## Almost there

`\f` (form feed) and `\r` are whitespace too.
