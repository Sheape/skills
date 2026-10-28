# Paid and live calls

A **paid call** spends money or quota, or reaches a production service: model and search APIs, payment, email, third-party registries. A **cassette** is one recorded request and response, replayed so a trace that needed it once costs nothing again.

For each paid call on the scenario's path, in order:

1. **Replay.** Look in `cassettes/<provider>/` for a recording of the same request (endpoint and inputs). A match is free.
2. **Substitute.** Look for a free stand-in the project already has: a fake provider, test fixtures, a sandbox mode. Use it when the node's logic does not hinge on the real response's content, and say so.
3. **Ask.** Otherwise estimate: calls on the path × units per call (tokens, requests, tasks) × the provider's current price, looked up now, with its source. Include any spend cap the project enforces. Put the total, the basis and the free alternative to the user, and run a paid call only on their clear yes.
4. **Record.** On a yes, capture each call at the project's HTTP seam into `cassettes/<provider>/<scenario>-<n>.json`:

   ```json
   {"request": {"method": "", "url": "", "body": {}}, "response": {"status": 200, "body": {}},
    "cost_usd": 0.0, "recorded": "<ISO time>", "commit": "<snapshot>"}
   ```

   Strip auth headers, keys, cookies and tokens before writing. Run with the project's own secret loader (e.g. `doppler run --`), never with keys pasted into a command.
5. **Note the seam.** Write into `harness.md` where calls are captured and how cassettes are fed back in (the project's fake, a local mock server, a stub in the worktree), so the next run replays without rediscovery.

Collect a replayed run with `collect --source cassette` and a recorded live one with `--source live`, so the annotations carry where their values came from.
