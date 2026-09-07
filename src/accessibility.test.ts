// @ts-expect-error - node fs in vitest environment
import fs from "node:fs";
// @ts-expect-error - node path in vitest environment
import path from "node:path";
import { describe, it, expect } from "vitest";

declare const process: { cwd: () => string };

// WCAG relative luminance calculation
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (0 <= h && h < 60) [r, g, b] = [c, x, 0];
  else if (60 <= h && h < 120) [r, g, b] = [x, c, 0];
  else if (120 <= h && h < 180) [r, g, b] = [0, c, x];
  else if (180 <= h && h < 240) [r, g, b] = [0, x, c];
  else if (240 <= h && h < 300) [r, g, b] = [x, 0, c];
  else if (300 <= h && h < 360) [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = getLuminance(...rgb1);
  const lum2 = getLuminance(...rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe("Accessibility Standards", () => {
  const cssPath = path.resolve(process.cwd(), "src/index.css");
  const indexCss = fs.readFileSync(cssPath, "utf-8");

  it("ensures dark mode borders hit at least 3:1 contrast ratio against background", () => {
    // Extract dark mode border and background
    const darkSectionMatch = indexCss.match(/\.dark\s*\{([^}]+)\}/);
    expect(darkSectionMatch).toBeTruthy();
    const darkSection = darkSectionMatch![1];

    const borderMatch = darkSection.match(/--border:\s*(\d+)\s+(\d+)%\s+(\d+)%/);
    const bgMatch = darkSection.match(/--background:\s*(\d+)\s+(\d+)%\s+(\d+)%/);

    expect(borderMatch).toBeTruthy();
    expect(bgMatch).toBeTruthy();

    const borderHsl: [number, number, number] = [
      parseInt(borderMatch![1], 10),
      parseInt(borderMatch![2], 10),
      parseInt(borderMatch![3], 10),
    ];
    const bgHsl: [number, number, number] = [
      parseInt(bgMatch![1], 10),
      parseInt(bgMatch![2], 10),
      parseInt(bgMatch![3], 10),
    ];

    const borderRgb = hslToRgb(...borderHsl);
    const bgRgb = hslToRgb(...bgHsl);
    const contrastRatio = getContrastRatio(borderRgb, bgRgb);

    expect(contrastRatio).toBeGreaterThanOrEqual(3.0);
  });

  it("includes prefers-reduced-motion block in index.css", () => {
    expect(indexCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(indexCss).toMatch(/animation-duration:\s*0\.01ms/);
    expect(indexCss).toMatch(/transition-duration:\s*0\.01ms/);
  });

  it("does not have text below 12px in source files", () => {
    const sourceFiles = import.meta.glob<string>("./**/*.{tsx,ts,css}", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const sub12pxRegex = /text-\[(?:[0-9]|1[0-1])px\]/;

    const offendingFiles: string[] = [];
    for (const [filePath, content] of Object.entries(sourceFiles)) {
      if (!filePath.includes("accessibility.test.ts") && sub12pxRegex.test(content)) {
        offendingFiles.push(filePath);
      }
    }

    expect(offendingFiles).toEqual([]);
  });
});
