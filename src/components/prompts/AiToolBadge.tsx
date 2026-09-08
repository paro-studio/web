import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdobeIcon, GeminiIcon, MetaIcon, OpenAIIcon } from "./toolIcons";

/** Covers both the plain SVG components in toolIcons and lucide's forwardRef ones. */
type ToolIcon = React.ComponentType<{ className?: string }>;

interface ToolPresentation {
  /** Short enough to sit beside a creator name on a narrow card. */
  label: string;
  icon?: ToolIcon;
  /** Used where no vector mark exists and a glyph would not read at 14px. */
  emoji?: string;
}

/**
 * How each AI tool is shown on a feed card.
 *
 * Keys are the exact strings stored in `prompts.ai_tool` (see lib/aiTools.ts) —
 * changing one here only changes presentation, but a key that no longer matches
 * silently falls through to the neutral treatment below.
 *
 * Only four of the tools have an official mark. Midjourney, Stable Diffusion
 * and Leonardo have none, so they carry the neutral icon and lean on their
 * label — which is why the label is never dropped.
 */
const PRESENTATION: Record<string, ToolPresentation> = {
  // Nano Banana began as a community codename on LMArena that Google adopted,
  // so it has no published mark of its own. The Gemini logo is technically
  // correct and reads as the wrong product; a drawn banana silhouette is an
  // unreadable hook at this size. The emoji is the one thing that reads.
  "NANO BANANA (Gemini)": { label: "Nano Banana", emoji: "🍌" },
  "DALL-E 3 (ChatGPT)": { label: "DALL·E", icon: OpenAIIcon },
  "Meta AI": { label: "Meta AI", icon: MetaIcon },
  Firefly: { label: "Firefly", icon: AdobeIcon },
  Midjourney: { label: "Midjourney", icon: Sparkles },
  "Stable Diffusion": { label: "SD", icon: Sparkles },
  "Leonardo AI": { label: "Leonardo", icon: Sparkles },
};

interface AiToolBadgeProps {
  /** The raw value from `prompts.ai_tool`; may be a custom name. */
  tool: string;
  className?: string;
}

export function AiToolBadge({ tool, className }: AiToolBadgeProps) {
  const [showFull, setShowFull] = useState(false);
  // "Other" lets people type anything, so an unknown name is expected, not a bug.
  const { label, icon: Icon, emoji } = PRESENTATION[tool] ?? { label: tool, icon: Sparkles };
  const displayText = showFull ? tool : label;

  return (
    // The full name is findable via title tooltip on desktop, via tap/click
    // toggle on touch devices, and via aria-label for assistive tech.
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowFull((prev) => !prev);
      }}
      className={cn(
        "flex items-center gap-1 min-w-0 text-left cursor-pointer hover:text-foreground transition-colors",
        className
      )}
      title={tool}
      aria-label={`AI tool: ${tool}`}
      aria-expanded={showFull}
    >
      {emoji ? (
        <span aria-hidden="true" className="flex-shrink-0 text-xs leading-none">
          {emoji}
        </span>
      ) : (
        Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span className="truncate">{displayText}</span>
    </button>
  );
}
