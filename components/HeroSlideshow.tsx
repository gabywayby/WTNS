"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type HeroSlide = { src: string; alt: string; objectPosition?: string };

export default function HeroSlideshow({ images }: { images: HeroSlide[] }) {
  const [{ activeIndex, mounted }, setSlides] = useState(() => ({
    activeIndex: 0,
    mounted: new Set([0, 1]),
  }));

  useEffect(() => {
    if (images.length < 2) return;
    const timer = window.setInterval(() => {
      setSlides((previous) => {
        const activeIndex = (previous.activeIndex + 1) % images.length;
        const mounted = new Set(previous.mounted);
        mounted.add(activeIndex);
        mounted.add((activeIndex + 1) % images.length);
        return { activeIndex, mounted };
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [images.length]);

  if (!images.length) return null;

  return <div className="hero-slideshow" aria-hidden="true">
    {images.map((image, index) => mounted.has(index) && <div key={image.src} className={`hero-slide-layer${index === activeIndex ? " is-active" : ""}`}>
      <Image
        className="hero-slide-image"
        src={image.src}
        alt={image.alt}
        fill
        priority={index === 0}
        sizes="100vw"
        quality={80}
        {...(image.objectPosition ? { style: { objectPosition: image.objectPosition } } : {})}
      />
    </div>)}
  </div>;
}
