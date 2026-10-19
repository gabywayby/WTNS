"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export default function Countdown({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const router = useRouter();
  const refreshAttempts = useRef(0);
  useEffect(() => { const id = window.setTimeout(() => setMounted(true), 0); return () => window.clearTimeout(id); }, []);
  useEffect(() => {
    if (!mounted) return;
    refreshAttempts.current = 0;
    let refreshId: number | undefined;
    const tick = () => {
      const value = Math.max(0, new Date(date).getTime() - Date.now());
      setRemaining(value);
      if (value === 0 && refreshId === undefined) {
        refreshId = window.setInterval(() => {
          if (refreshAttempts.current >= 10) {
            if (refreshId !== undefined) window.clearInterval(refreshId);
            refreshId = undefined;
            return;
          }
          refreshAttempts.current += 1;
          router.refresh();
        }, 3000);
      } else if (value > 0 && refreshId !== undefined) {
        window.clearInterval(refreshId);
        refreshId = undefined;
      }
    };
    tick();
    const tickId = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(tickId);
      if (refreshId !== undefined) window.clearInterval(refreshId);
    };
  }, [date, mounted, router]);
  if (!mounted) return <div className="countdown" aria-label="Countdown loading"><span>--</span><span>--</span><span>--</span><span>--</span></div>;
  const seconds = Math.floor(remaining / 1000);
  const values = [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return <div className="countdown">{values.map((v, i) => <span key={i}><b>{String(v).padStart(2, "0")}</b><small>{["DAYS", "HRS", "MIN", "SEC"][i]}</small></span>)}</div>;
}
