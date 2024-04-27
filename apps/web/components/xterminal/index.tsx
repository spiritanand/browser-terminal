"use client";

import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

const term = new Terminal();
const ws = new WebSocket("wss://ws1.khela.pro");

function XTerminal() {
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "data") term.write(data.data);
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    term.open(terminalRef.current);

    term.onKey((e) => {
      ws.send(
        JSON.stringify({
          type: "command",
          data: e.key,
        }),
      );
    });
  }, [terminalRef]);

  return <div ref={terminalRef}></div>;
}

export default XTerminal;
