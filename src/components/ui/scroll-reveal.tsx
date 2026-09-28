import { ReactNode, useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: ReactNode;
}

export function ScrollReveal({ children }: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) return;

    // Fallback for environments where IntersectionObserver is unavailable,
    // such as jsdom or older browsers.
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.15,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={elementRef}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 motion-reduce:opacity-100 motion-reduce:translate-y-0"
      }`}
    >
      {children}
    </div>
  );
}
