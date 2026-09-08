"use client";
import { useEffect, useRef, useState } from "react";
import { RealtimeBridge, type SpokenTurn } from "@/lib/voice/realtime-bridge/browser";
import { classifyBargeInTranscript } from "@/components/metrix-tab/voice/useVoiceExperienceOrchestrator";

export default function MetrixRealtimePage() {
  const audio = useRef<HTMLAudioElement>(null);
  const bridge = useRef<RealtimeBridge | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Konuşmaya hazır");
  const [turns, setTurns] = useState<SpokenTurn[]>([]);
  useEffect(() => () => bridge.current?.close(), []);
  function stop() { bridge.current?.close(); bridge.current = null; setActive(false); }
  function start() {
    if (!audio.current) return;
    stop(); setTurns([]); setActive(true);
    bridge.current = new RealtimeBridge(audio.current, { turns: setTurns, status: setStatus, classify: classifyBargeInTranscript }, {
      singleTurnAcceptance: process.env.NODE_ENV === "development"
        && new URLSearchParams(window.location.search).get("acceptance") === "single-turn",
    });
    void bridge.current.start();
  }
  return <main className="mx-auto max-w-2xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">METRIX ile konuş</h1>
    <p role="status">{status}</p>
    <audio ref={audio} autoPlay />
    <div className="flex gap-4">
      <button className="rounded border px-4 py-2" onClick={active ? () => { stop(); setStatus("Oturum kapandı"); } : start}>{active ? "Durdur" : "Başlat"}</button>
      <a href="/" onClick={stop}>Standart sohbete dön</a>
    </div>
    {turns.map(turn => <section key={turn.turnId} className="space-y-2">
      <p><strong>Siz:</strong> {turn.user}</p>
      {turn.assistant && <p><strong>METRIX:</strong> {turn.assistant}{turn.interrupted && " (söz kesildi)"}</p>}
    </section>)}
  </main>;
}
