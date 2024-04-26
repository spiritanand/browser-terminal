import http from "node:http";
import { log } from "@repo/logger";
import { WebSocketServer } from "ws";
import { spawn } from "node-pty";
import { createServer } from "./server";

const port = process.env.PORT || 5001;
const app = createServer();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const ptyProcess = spawn("bash", [], {
    name: "xterm-color",
    env: process.env,
  });

  ws.on("message", (message) => {
    log(`received: ${message}`);

    const data = JSON.parse(message.toString());

    if (data.type === "command") {
      ptyProcess.write(data.data);
    }
  });

  ws.on("close", () => {
    console.log("closed ws");
  });

  ptyProcess.onData((data) => {
    const message = JSON.stringify({
      type: "data",
      data,
    });

    ws.send(message);
  });
});

server.listen(port, () => {
  log(`api running on ${port}`);
});
