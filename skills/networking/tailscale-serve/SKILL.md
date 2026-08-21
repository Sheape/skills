---
name: tailscale-serve
description: Manage a local project exposed privately over HTTPS with Tailscale Serve.
disable-model-invocation: true
---

# Tailscale serve

Run one local HTTP application and expose it only to the user's tailnet. Use the same port for the local server and Tailscale HTTPS. Port 3000 is reserved and must never be selected.

## Choose the mode

- No argument means `open`.
- `close` stops Tailscale Serve and the server started by this skill.
- `restart` runs `close`, then starts the same command on the same port.

For `close` or `restart`, reuse the port established in this conversation. If this conversation has no such port, ask the user which port they mean and wait for the answer.

## Inspect the project

Identify the existing run command and a plain application type such as `frontend`, `backend`, `API`, `docs`, or `database`. Reuse the project's scripts and installed tools.

Bind the HTTP server to `127.0.0.1` and the selected port. If Docker is the project's normal runtime, run its frontend service or container and publish only the frontend HTTP port as `127.0.0.1:<port>`; publish no backend or database ports. Keep Docker attached so the helper can stop it.

On macOS, the helper owns the server through a per-port user `launchd` job. It preserves `PATH`, `HOME`, and `TMPDIR`. Pass any other required environment values through the server command, such as `env NAME=value <command>`.

For Vite or Vite+, prefix the server command with `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<tailscale-dns-name>` so Vite accepts the HTTPS hostname. Get the DNS name with the `tailscale status` pipeline below.

If the selected service does not speak HTTP, stop and explain that Tailscale's HTTPS reverse proxy cannot serve it. Do not report a URL that will not work.

## Open

1. Confirm `tailscale`, `jq`, `lsof`, `launchctl`, and `plutil` are installed. Confirm `tailscale status --json` succeeds. If Tailscale needs authentication or HTTPS enablement, ask the user to complete it, then continue.
2. Run `bash <this-skill>/scripts/tailscale-serve.sh port` to choose an unused local and Tailscale port.
3. Build the server command with explicit `127.0.0.1` and port arguments. Pass it without shell interpolation:

   ```bash
   bash <this-skill>/scripts/tailscale-serve.sh open <type> <port> -- <server-command> <args...>
   ```

The helper starts the server under `launchd`, waits for the listener, runs `tailscale serve --bg --yes --https=<port> 127.0.0.1:<port>`, verifies the proxy, and then runs:

```bash
tailscale status --json 2>/dev/null \
  | jq -r '.Self.DNSName' \
  | sed 's/\.$//'
```

Return the helper's final line verbatim and with no added text:

```text
The <type> https://<tailscale-dns-name>:<port>
```

## Close

After resolving the port, run:

```bash
bash <this-skill>/scripts/tailscale-serve.sh close <port>
```

Report that the server and Tailscale HTTPS port were closed. Preserve every other Tailscale Serve mapping.

## Restart

After resolving the port, run:

```bash
bash <this-skill>/scripts/tailscale-serve.sh restart <port>
```

The helper reuses the recorded working directory, application type, and argument vector. Return its final `The ...` line verbatim and with no added text.
