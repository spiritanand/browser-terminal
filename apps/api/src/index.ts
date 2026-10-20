import http from "node:http";
import { WebSocketServer } from "ws";
import { spawn } from "node-pty";
import { createServer } from "./server";

const port = Number(process.env.PORT) || 5001;
const host = process.env.HOST || "127.0.0.1";
const app = createServer();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function parseCommand(message: string): string | undefined {
  let frame: unknown;

  try {
    frame = JSON.parse(message);
  } catch {
    return undefined;
  }

  if (
    typeof frame === "object" &&
    frame !== null &&
    "type" in frame &&
    frame.type === "command" &&
    "data" in frame &&
    typeof frame.data === "string"
  ) {
    return frame.data;
  }

  return undefined;
}

wss.on("connection", (ws) => {
  const ptyProcess = spawn("bash", [], {
    name: "xterm-color",
    env: process.env,
  });

  ws.on("message", (message) => {
    const command = parseCommand(message.toString());

    if (command !== undefined) ptyProcess.write(command);
  });

  ws.on("close", () => {
    ptyProcess.kill();
  });

  ptyProcess.onData((data) => {
    const message = JSON.stringify({
      type: "data",
      data,
    });

    ws.send(message);
  });

  ptyProcess.onExit(() => {
    ws.close();
  });
});

server.listen(port, host, () => {
  console.log(`api running on ${host}:${port}`);
});
