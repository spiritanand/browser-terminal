# browser-terminal

A real bash shell in a browser tab, in about 120 lines of TypeScript. xterm.js runs in a Next.js page and talks over a single WebSocket to a Node server that spawns one pseudo-terminal per connection with node-pty. It is the core loop behind the terminals in browser IDEs and cloud shells.

> [!CAUTION]
> Demo code, not a deployable service. Starting the API gives an **unauthenticated shell on your machine** to anyone who can reach its port, and it listens on every network interface. Run it only on a network you trust and stop it when you are done. See [Security](#security).

[![Watch the demo: How to create a Terminal inside your browser](https://img.youtube.com/vi/0lK4lqzT-fI/maxresdefault.jpg)](https://www.youtube.com/watch?v=0lK4lqzT-fI)

Video walkthrough: [How to create a Terminal inside your browser](https://www.youtube.com/watch?v=0lK4lqzT-fI)

## How it works

Every WebSocket connection gets its own `bash` process attached to a pseudo-terminal (80x24, `TERM=xterm-color`). Key presses travel up, raw terminal output travels down, and xterm.js renders the ANSI stream. The entire protocol is two JSON text frames:

| Direction | Frame | What happens |
| --- | --- | --- |
| browser to server | `{"type":"command","data":"<keystrokes>"}` | `ptyProcess.write(data)`. One frame per key press, Enter is `"\r"`. Any other `type` is ignored. |
| server to browser | `{"type":"data","data":"<raw pty output>"}` | `term.write(data)`. ANSI codes and CRLF included, chunk boundaries are arbitrary. |

```mermaid
sequenceDiagram
    autonumber
    participant T as xterm.js (browser)
    participant S as Node server (Express + ws)
    participant P as node-pty
    participant B as bash
    Note over T,S: one WebSocket, JSON text frames
    T->>S: WebSocket connect
    S->>P: spawn("bash") with name "xterm-color" and the server env
    P->>B: start shell on a pseudo-terminal
    B-->>P: prompt
    P-->>S: onData(chunk)
    S-->>T: {"type":"data","data":"bash-3.2$ "}
    Note over T: term.write(data)
    Note over T: key press fires term.onKey
    T->>S: {"type":"command","data":"l"}
    S->>P: ptyProcess.write("l")
    P->>B: raw keystroke
    B-->>P: echo and output, ANSI codes included
    P-->>S: onData(chunk)
    S-->>T: {"type":"data","data":"l"}
```

The shell echoes what you type, which is why the character you pressed comes back as a `data` frame before any command output does. The frame contents in the diagram are examples: the prompt depends on the bash version and startup files on the server, and newer bash versions (5.3 in testing) put a bracketed-paste escape sequence (`\x1b[?2004h`) in front of it.

## Tech stack

- **Web:** Next.js 14 (app router), React 18, `@xterm/xterm` 5.5
- **API:** Node.js, Express 4, `ws` 8, `node-pty` 1.0, bundled to a single file with tsup
- **Tooling:** TypeScript, pnpm 9 workspaces, Turborepo 1.13

## Prerequisites

- **Node.js 22** (tested with 22.16.0). `package.json` says `>=18`, but Node 24 cannot compile node-pty 1.0.0, and on Node 20 `next build` crashes unless the WebSocket server is reachable during the build (see [Client lifecycle](#known-limitations-and-roadmap)).
- **pnpm 9.0.6.** It is pinned through `packageManager` in the root `package.json`, so with Corepack enabled `pnpm` resolves to that version inside the repo.
- **A C/C++ toolchain, `make` and Python 3.** node-pty is compiled from source during install. Tested on macOS (Apple Silicon) with the Xcode Command Line Tools.
- **`bash` on the `PATH`** of the machine that runs the API.

## Getting started

```sh
git clone https://github.com/spiritanand/browser-terminal.git
cd browser-terminal
nvm install 22 && nvm use 22   # or: fnm install 22 && fnm use 22
corepack enable                # pnpm now resolves to the pinned 9.0.6 inside the repo
pnpm install                   # compiles node-pty from source
```

If `pnpm install` ends in a wall of C++ errors from `node-pty`, followed by `gyp ERR! build error` and `ELIFECYCLE Command failed with exit code 1`, check `node --version`. Node 24 fails exactly this way.

`pnpm install` also rewrites `pnpm-lock.yaml`: it drops a stale `@repo/logger` entry (three lines under `apps/api`) and, on some runs, rewrites a few `eslint-plugin-import` peer suffixes. Either diff is expected. Until the fix is committed, `pnpm install --frozen-lockfile` fails with `ERR_PNPM_OUTDATED_LOCKFILE`.

Next, point the client at your local API. The WebSocket URL is hard-coded and the host it names no longer resolves, so edit `apps/web/components/xterminal/index.tsx`, line 8:

```diff
-const ws = new WebSocket("wss://ws1.khela.pro");
+const ws = new WebSocket("ws://localhost:5001");
```

> [!WARNING]
> The first command below starts the unauthenticated shell server. Read [Security](#security) before you run it.

Start the two apps, each in its own terminal.

Terminal 1, the API (Express + WebSocket server on port 5001). Wait for `api running on 5001`:

```sh
pnpm --filter api dev
```

Terminal 2, the web app (Next.js on <http://localhost:3000>). Wait for `Ready in`:

```sh
pnpm --filter web dev
```

Stop both with Ctrl+C. When the API process exits, every `bash` it spawned exits with it.

Open <http://localhost:3000>. A black terminal box with a `bash` prompt appears (for example `bash-3.2$`, it depends on the bash the server finds). Click inside the box, then type: nothing is focused on load, so key presses before the click are ignored. A black box with no prompt usually means the WebSocket did not connect. Check that the API is running and that the URL you edited matches its port; the error shows up only in the browser console.

`curl http://localhost:5001/status` returns `{"ok":true}` when the API is up. To test the shell path without a browser (Node 22 has a built-in `WebSocket`):

```sh
node -e 'const ws=new WebSocket("ws://localhost:5001");ws.onmessage=(e)=>console.log(e.data);ws.onopen=()=>setTimeout(()=>ws.send(JSON.stringify({type:"command",data:"echo hello && exit\r"})),500);setTimeout(()=>process.exit(0),2000)'
```

It should print a prompt frame, the echoed command, and a frame containing `hello`. The trailing `exit` ends the shell, so the check leaves no `bash` process behind.

Both apps read `PORT`. Set it per command rather than exporting it, because an exported `PORT` would apply to both apps at once. If you move the API (`PORT=5187 pnpm --filter api dev`), put the same port in the WebSocket URL you edited above (`ws://localhost:5187`), otherwise the page shows an empty terminal.

At the root, `pnpm build` and `pnpm typecheck` pass. `pnpm lint` and `pnpm test` do not yet (see the roadmap).

## Project structure

```text
apps/
  api/
    src/index.ts                     HTTP + WebSocket server, one bash PTY per connection
    src/server.ts                    Express app: GET /status, plus a leftover GET /message/:name
    Dockerfile                       does not build yet, see the roadmap
  web/
    app/page.tsx                     renders the terminal
    components/xterminal/index.tsx   xterm.js instance, WebSocket client, key handler
packages/                            starter leftovers, not imported by either app
```

The repo was scaffolded from the Turborepo kitchen-sink starter. Neither app imports anything from `packages/` (`@repo/ui`, `@repo/logger`, `@repo/jest-presets`, `@repo/eslint-config`, `@repo/typescript-config`), although `pnpm build` still builds `ui` and `logger`. The one remaining link is the Jest preset `@repo/jest-presets/node` named in `apps/api/package.json`; it is not a declared dependency and only resolves through pnpm hoisting. Tailwind is configured in `apps/web` but no utility classes are used.

## Security

> [!CAUTION]
> The API hands an **unauthenticated interactive shell** to anyone who can open a WebSocket to it. Do not deploy it publicly as is.

- The shell runs as the user who started the server and inherits its whole environment (`env: process.env`), secrets included.
- There is no authentication and no `Origin` check, and CORS is wide open, so a web page you visit could connect to an instance running on your machine.
- `server.listen(port)` is called without a host, so it listens on every network interface, not only localhost.
- One malformed WebSocket frame crashes the server process for everyone: anything that is not valid JSON (unguarded `JSON.parse`), and also the valid JSON value `null`.

Run it only on a machine and network you trust, preferably inside a throwaway VM or container, and stop it when you are done.

## Known limitations and roadmap

- [ ] **Auth and exposure.** Add authentication, an `Origin` allow-list, and bind to `127.0.0.1` by default.
- [ ] **PTY cleanup.** `ws.on("close")` only logs, so every closed tab leaves a `bash` process running until the server exits. Shell exit is not reported either: typing `exit` leaves a dead terminal on an open socket.
- [ ] **Malformed frames.** Guard `JSON.parse` and check that the parsed value is a non-null object, so bad input cannot take the server down.
- [ ] **Resize.** The PTY is fixed at 80x24 and xterm.js renders a fixed-size box. There is no fit addon and no resize message, so full-screen programs such as vim are laid out for 80x24.
- [ ] **Input.** Keys are forwarded with `term.onKey`, one frame per key press, so paste and IME input never reach the shell. `term.onData` would fix that.
- [ ] **Client lifecycle.** Read the WebSocket URL from an environment variable, and create the terminal and socket inside the component instead of at module scope. Today the effect cleanup closes that module-scope socket, so `reactStrictMode` has to stay off: with it on, React's dev-only remount closes the socket before it connects and the terminal never shows a prompt. The same module is also evaluated by the Next.js server, which opens a socket of its own: the first page load after `next dev` starts spawns two shells (later loads spawn one), and `next build` opens one while prerendering. On Node 20 that server-side socket crashes `next build` whenever it cannot connect, which is always the case with the committed URL. There is no reconnect.
- [ ] **Docker.** `docker build apps/api` fails at `pnpm install`: Corepack in `node:21.7.3` downloads a pnpm release it cannot run, because `apps/api/package.json` has no `packageManager` field. The image also never runs a build, so `dist/` is only there if you built locally first (`.dockerignore` excludes just `node_modules`, so `COPY . .` picks up a local `dist/`).
- [ ] **Repo hygiene.** Commit the lockfile fix, pin Node (`.nvmrc`, tighter `engines`), remove the starter packages (together with the `@repo/jest-presets/node` Jest preset that `apps/api/package.json` still points at), make `pnpm lint` and `pnpm test` pass (empty `apps/api/.eslintrc.js`, no API tests), and replace the `Create Next App` page metadata.

This is a small demo that accompanies the video above, not production software. Issues and pull requests are welcome.
