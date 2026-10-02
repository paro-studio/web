import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  /** Passed through to the first image for LCP optimisation */
  priority?: boolean;
  /** Extra class applied to the outer wrapper */
  className?: string;
}

const HOVER_AUTOPLAY_INTERVAL = 2000; // 2 seconds between transitions when hovering
const FADE_DURATION_MS = 400;

/**
 * ImageCarousel – autoplay on hover only.
 *
 * - 1 image → plain <img>, no controls.
 * - 2-4 images → cross-fade with dot indicators and arrows.
 *
 * Autoplay: starts when hovering, cycles 1→2→3→4→1... every 2s, stops when cursor leaves.
 */
export function ImageCarousel({ images, alt, priority = false, className }: ImageCarouselProps) {
  const validImages = images.filter(Boolean);
  const count = validImages.length;

  const [activeIdx, setActiveIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [imageHovered, setImageHovered] = useState(false); // Only true when hovering the image itself
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect touch device on mount
  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
    window.addEventListener('touchstart', checkTouch, { once: true });
    return () => window.removeEventListener('touchstart', checkTouch);
  }, []);

  const goTo = (nextIdx: number) => {
    if (nextIdx === activeIdx) return;
    setPrevIdx(activeIdx);
    setFading(true);

    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setPrevIdx(null);
      setFading(false);
      setActiveIdx(nextIdx);
    }, FADE_DURATION_MS);
  };

  const goNext = () => goTo((activeIdx + 1) % count);
  const goPrev = () => goTo((activeIdx - 1 + count) % count);

  // Autoplay when hovering the image: cycles forward every 2 seconds
  useEffect(() => {
    if (count <= 1 || !imageHovered) {
      // Stop autoplay
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
      return;
    }

    // Start autoplay
    autoplayTimerRef.current = setInterval(() => {
      setActiveIdx((cur) => {
        const next = (cur + 1) % count;
        setPrevIdx(cur);
        setFading(true);

        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          setPrevIdx(null);
          setFading(false);
        }, FADE_DURATION_MS);

        return next;
      });
    }, HOVER_AUTOPLAY_INTERVAL);

    return () => {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    };
  }, [count, imageHovered]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    };
  }, []);

  // Touch / swipe support
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      if (dx < 0) goNext();
      else goPrev();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Single-image fast path.
  if (count <= 1) {
    return (
      <img
        src={validImages[0] ?? ""}
        alt={alt}
        className={cn("w-full h-full object-contain", className)}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden",
        "flex items-center justify-center",
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Image stack - only this area triggers autoplay */}
      <div 
        className="relative w-full h-full flex items-center justify-center"
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        {validImages.map((src, idx) => {
          const isActive = idx === activeIdx;
          const isPrev = idx === prevIdx;
          const visible = isActive || (fading && isPrev);

          return (
            <img
              key={src}
              src={src}
              alt={`${alt} – image ${idx + 1} of ${count}`}
              loading={priority && idx === 0 ? "eager" : "lazy"}
              style={{
                opacity: isActive ? 1 : 0,
                position: "absolute",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                transition: visible ? "opacity 400ms ease-in-out" : "none",
                visibility: visible ? "visible" : "hidden",
              }}
            />
          );
        })}
      </div>

      {/* Left arrow - always visible on touch devices, hover-visible on desktop */}
      <button
        type="button"
        aria-label="Previous image"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          goPrev();
        }}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
        className={cn(
          "absolute left-2 top-1/2 -translate-y-1/2 z-20",
          "w-7 h-7 rounded-full",
          "bg-black/40 hover:bg-black/65",
          "flex items-center justify-center",
          "text-white",
          "transition-opacity duration-200",
          // Always visible on touch devices, hidden on desktop unless hovering image
          isTouchDevice ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          !isTouchDevice && imageHovered && "opacity-100"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Right arrow - always visible on touch devices, hover-visible on desktop */}
      <button
        type="button"
        aria-label="Next image"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          goNext();
        }}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 z-20",
          "w-7 h-7 rounded-full",
          "bg-black/40 hover:bg-black/65",
          "flex items-center justify-center",
          "text-white",
          "transition-opacity duration-200",
          // Always visible on touch devices, hidden on desktop unless hovering image
          isTouchDevice ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          !isTouchDevice && imageHovered && "opacity-100"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Dot indicators */}
      {count > 1 && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/30"
          aria-label="Image indicators"
          onMouseEnter={(e) => e.stopPropagation()}
          onMouseLeave={(e) => e.stopPropagation()}
        >
          {validImages.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to image ${idx + 1}`}
              onMouseEnter={(e) => {
                e.stopPropagation();
                goTo(idx);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goTo(idx);
              }}
              className={cn(
                "rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
                idx === activeIdx
                  ? "w-2 h-2 bg-white"
                  : "w-1.5 h-1.5 bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
