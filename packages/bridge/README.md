# Obsidion Bridge WebSocket Relay Server

A standalone, self-hostable WebSocket **bridge** — a transparent relay that lets two
end-to-end-encrypted peers (a *creator* and a *joiner*) talk to each other through a
shared bridge id. It speaks the [Obsidion Bridge](https://github.com/zkpassport) wire protocol.

The server never decrypts anything — it only routes encrypted JSON frames between the
connections that share a bridge id, injects the sender's origin, and caches encrypted messages so a
reconnecting client can replay what it missed.

Built on **Bun** (`Bun.serve` + `bun:sqlite`). The datastore is behind an interface so the
SQLite backend can be swapped for anything else.

## Features

| Feature | Description |
| --- | --- |
| **Bridge routing** | Connect with `?id=<bridgeId>` (or legacy `?topic=`). All connections sharing an id form a room; messages are relayed to every peer **except** the sender. |
| **Origin injection** | The sender's `Origin` header is stamped onto every relayed/stored message. |
| **Origin on connect (`ooc`)** | A joiner connecting with `&ooc` is sent the bridge's stored origin (the first connection's origin) so it can verify who it's talking to. |
| **Message on connect (`moc`)** | A base64 message in `&moc=` is decoded and relayed on connect as if the client had just sent it — used to deliver the joiner's handshake to the creator in the connection request itself, saving a round-trip (no separate post-connect send). |
| **Message replay** | A client that reconnects sends `{"method":"replay","params":{"timestamp":<ms>}}` and the server resends everything cached for that bridge since that time, then `{"status":"replay_complete","count":N}`. One replay per connection. The request can also ride in `moc` to replay on connect (saving a round-trip). |
| **Message caching + TTL** | Non-`nocache` messages are stored (default 7-day TTL) for replay. `nocache` frames (e.g. ping/pong) are relayed but never stored. |
| **IP rate limiting** | Per-IP hourly/monthly connection and message limits (configurable, can be disabled). |
| **Ping/pong** | Pass-through keep-alive (peers ping each other through the relay). |

## Quick start

```bash
bun install
bun run start            # listens on ws://0.0.0.0:8080 by default
```

Point the Obsidion Bridge client at it:

```ts
import { Bridge } from "@obsidion/bridge"

const creator = await Bridge.create({ bridgeUrl: "ws://localhost:8080" })
const joiner  = await Bridge.join(creator.connectionString, { bridgeUrl: "ws://localhost:8080" })
```

## Configuration (environment variables)

| Var | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_PATH` | `bridge.sqlite` | SQLite file (use `:memory:` for ephemeral) |
| `MESSAGE_TTL_MS` | `604800000` (7d) | Replay retention window |
| `REPLAY_LIMIT` | `100` | Max messages returned per replay |
| `PRUNE_INTERVAL_MS` | `3600000` (1h) | Expired-message cleanup interval |
| `TRUST_PROXY` | `false` | Use the left-most `X-Forwarded-For` entry as the client IP for rate limiting. Enable **only** behind a trusted reverse proxy/LB that sets it (otherwise clients can spoof their IP). When off, the socket peer address is used. |
| `RATE_LIMIT_ENABLED` | `true` | Toggle IP rate limiting |
| `MAX_CONNECTIONS_PER_HOUR` | `1000` | Per-IP connection limit (hour) |
| `MAX_CONNECTIONS_PER_MONTH` | `30000` | Per-IP connection limit (month) |
| `MAX_MESSAGES_PER_HOUR` | `1000` | Per-IP message limit (hour) |
| `MAX_MESSAGES_PER_MONTH` | `50000` | Per-IP message limit (month) |

Verbose logging: `DEBUG=bridge:server bun run start` (or `DEBUG=bridge:*`).

## Project layout

```
server/
  index.ts            CLI entry point
  server.ts           Bun.serve wiring (upgrade, rate-limit gating, lifecycle)
  bridge.ts           Core relay/protocol logic (transport-agnostic)
  ratelimit.ts        Per-IP rate limiter (interface + in-memory impl)
  config.ts           Env-driven configuration
  datastore/
    index.ts          DataStore interface + StoredMessage type
    sqlite.ts         bun:sqlite backend (default)
    memory.ts         in-memory backend (tests / fallback)
acceptance/
  src/                Vendored Obsidion Bridge client (verbatim — needed to run the tests)
  tests/              Vendored Obsidion Bridge test suite (verbatim — the acceptance spec)
  setup.real.ts       Preload that boots this server and points the client at it
examples/
  replay-demo.ts      Protocol-level demonstration/verification of replay
```

### Swapping the datastore

Implement the `DataStore` interface in `server/datastore/index.ts` (5 methods) and pass an
instance to `startServer({ store })`. `SqliteDataStore` is the default; `MemoryDataStore`
is used by the test harness.

## Testing

The acceptance suite is the **verbatim** Obsidion Bridge client test suite. It runs in two modes:

```bash
bun run test:mock    # acceptance suite against the in-memory mock (sanity check of the vendored suite)
bun run test:real    # acceptance suite against THIS server (the real acceptance test)
bun run test:replay  # dedicated Message Replay test suite (see below)
bun run test         # test:real + test:replay
```

`test:real` sets `USE_REAL_BRIDGE_SERVER=1` and preloads `acceptance/setup.real.ts`, which
boots the server on an ephemeral port and transparently rewrites the client's WebSocket
endpoint to it — the test files themselves are never modified. All tests pass in both modes.

### Message Replay tests

`tests/replay.test.ts` covers replay at three layers: DataStore unit tests (both backends),
protocol tests over a real WebSocket, and an end-to-end test through the real Obsidion client.
By default each test spins up an in-process server.

To run the protocol- and client-level tests against an **external** bridge instead, set
`BRIDGE_URL`:

```bash
# Validate replay against the real staging bridge
BRIDGE_URL=wss://bridge-staging.zkpassport.id bun test tests/replay.test.ts

# ...or against any locally-running instance
bun run start &                                   # e.g. ws://localhost:8080
BRIDGE_URL=ws://localhost:8080 bun test tests/replay.test.ts
```

When `BRIDGE_URL` is set, the server is **not** started in-process and the local-only tests
are skipped automatically: the DataStore unit tests, the configurable replay-limit test, the
"no timestamp" test (it asserts this server's specific handling of a timestamp-less replay,
which a remote may not share), and the connection-count-based e2e test (it needs in-process
introspection). Each test uses a fresh random bridge id so runs never collide on the shared
remote server. Note: this opens real connections to, and stores real (short-TTL) messages on,
the target — and counts against its rate limits.

Against the AWS staging endpoint specifically, the suite can show intermittent failures that
are **backend/transport properties, not bridge-logic issues** (the replay behaviour itself is
verified — connect to it directly and you'll see correct `replay_complete` / `replay_already_requested`):
its fronting layer occasionally closes a socket with a WebSocket compression error
(`1002 "Invalid compressed data"`) under connection churn, and the `one replay per connection`
test is stricter than its serverless backend can guarantee (see [behaviour notes](#behaviour-notes)).

There is also a standalone protocol-level demo:

```bash
bun run examples/replay-demo.ts
```

## Protocol reference

Connection URL: `ws://host:port/?id=<bridgeId>&v=1[&moc=<base64>][&ooc]`

Frames are JSON. The server only special-cases two `method`s; everything else is relayed
opaquely (with `origin` injected, and cached unless `nocache`):

- `{"method":"replay","params":{"timestamp":<ms>}}` → server replays cached messages, then
  `{"status":"replay_complete","count":N}`. Errors: `{"error":"invalid_timestamp"|"replay_already_requested",...}`.
- `{"jsonrpc":"2.0","method":"ooc","params":{"origin":"..."}}` → server→client only, in response to `&ooc`.

## Behaviour notes

A few behaviours worth calling out:

- **`replay` without a `params.timestamp`** is rejected with `invalid_timestamp` and never
  relayed — the reserved `replay` method is server-only and is never forwarded to peers.
- **Replay never returns expired messages.** Reads filter on the message TTL (default 7 days),
  so a message past its TTL is never replayed even if it hasn't been pruned from storage yet.
- **A missing `Origin` header is treated as `"none"`** and the sender's origin is always
  injected into relayed/stored messages, so a peer can never forge the `origin` field a
  joiner verifies against.
- **One replay per connection is enforced deterministically.** The `replay_requested` flag is
  in-process connection state, set synchronously (check-and-set on a single event loop) before
  any I/O, so even two replay frames arriving back-to-back can never both run.
