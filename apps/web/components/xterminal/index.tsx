"use client";

import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:5001";

function XTerminal() {
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal();
    const ws = new WebSocket(wsUrl);

    term.open(terminalRef.current);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "data") term.write(data.data);
    };

    const input = term.onData((data) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: "command",
          data,
        }),
      );
    });

    return () => {
      input.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  return <div ref={terminalRef}></div>;
}

export default XTerminal;
