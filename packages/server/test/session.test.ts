import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "bun:test"
import { Effect } from "effect"
import { HttpServer } from "effect/unstable/http"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServerProcess } from "../src/process"

it.live("waits for plugin initialization before applying the selected agent model", () =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir("opencode-session-endpoint-")),
    (tmp) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(tmp.path, "opencode.json"),
            JSON.stringify({
              agents: {
                modelprobe: {
                  description: "Model resolution probe",
                  mode: "primary",
                  model: "opencode/nemotron-3.5-lightning-free",
                },
              },
            }),
          ),
        )
        const server = yield* ServerProcess.start<never, never>({
          hostname: "127.0.0.1",
          port: 0,
          password: "secret",
          app: { version: "test-version" },
          database: { path: ":memory:" },
          config: { directory: tmp.path },
          fs: { filewatcher: false },
        })
        const response = yield* Effect.promise(() =>
          fetch(new URL("/api/session", HttpServer.formatAddress(server.address)), {
            method: "POST",
            headers: {
              authorization: `Basic ${btoa("opencode:secret")}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ agent: "modelprobe", location: { directory: tmp.path } }),
          }),
        )

        expect(response.status).toBe(200)
        const body: unknown = yield* Effect.promise(() => response.json())
        if (!isRecord(body) || !isRecord(body["data"])) throw new Error("Expected a created session")
        expect(body["data"]["model"]).toEqual({
          providerID: "opencode",
          id: "nemotron-3.5-lightning-free",
          variant: "default",
        })
      }),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ),
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
