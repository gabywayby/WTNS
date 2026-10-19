"use client";

import { type PointerEvent, type ReactNode, useRef } from "react";

export default function HeroPointer({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  function moveContent(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    contentRef.current?.style.setProperty("--pointer-x", `${x * 40}px`);
    contentRef.current?.style.setProperty("--pointer-y", `${y * 40}px`);
    const hero = event.currentTarget.closest<HTMLElement>(".hero");
    hero?.style.setProperty("--hero-pointer-x", `${x * -5}px`);
    hero?.style.setProperty("--hero-pointer-y", `${y * -5}px`);
  }

  function resetContent() {
    contentRef.current?.style.setProperty("--pointer-x", "0px");
    contentRef.current?.style.setProperty("--pointer-y", "0px");
    const hero = contentRef.current?.closest<HTMLElement>(".hero");
    hero?.style.setProperty("--hero-pointer-x", "0px");
    hero?.style.setProperty("--hero-pointer-y", "0px");
  }

  return (
    <div
      className="hero-content"
      ref={contentRef}
      onPointerMove={moveContent}
      onPointerLeave={resetContent}
    >
      {children}
    </div>
  );
}
