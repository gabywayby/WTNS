"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type HeroSlide = { src: string; alt: string; objectPosition?: string };

export default function HeroSlideshow({ images }: { images: HeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % images.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [images.length]);

  if (!images.length) return null;

  return <div className="hero-slideshow" aria-hidden="true">
    {images.map((image, index) => <div key={image.src} className={`hero-slide-layer${index === activeIndex ? " is-active" : ""}`}>
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
