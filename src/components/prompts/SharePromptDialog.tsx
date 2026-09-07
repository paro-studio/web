import { useState } from "react";
import { Check, Link as LinkIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePromptShare } from "@/hooks/usePromptShare";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  FacebookIcon,
  GmailIcon,
  LinkedInIcon,
  PinterestIcon,
  RedditIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from "./brandIcons";

interface SharePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptId: string;
  title: string;
  imageUrl: string;
}

interface ShareTarget {
  name: string;
  icon: (props: { className?: string }) => JSX.Element;
  /** Brand tint for the tile. Omitted where the mark should follow the theme. */
  tint?: string;
  /** Builds the intent URL. Omit for targets handled by `onClick` instead. */
  href?: (ctx: { url: string; text: string; image: string }) => string;
}

const enc = encodeURIComponent;

/**
 * Order follows how people actually share a picture: chat apps first, then
 * public feeds, then the boards and long-tail.
 */
const TARGETS: ShareTarget[] = [
  {
    name: "WhatsApp",
    icon: WhatsAppIcon,
    tint: "#25D366",
    href: ({ url, text }) => `https://wa.me/?text=${enc(`${text} ${url}`)}`,
  },
  {
    name: "X",
    icon: XIcon,
    href: ({ url, text }) =>
      `https://x.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    name: "Telegram",
    icon: TelegramIcon,
    tint: "#26A5E4",
    href: ({ url, text }) =>
      `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    name: "Facebook",
    icon: FacebookIcon,
    tint: "#0866FF",
    href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    name: "Pinterest",
    icon: PinterestIcon,
    tint: "#BD081C",
    href: ({ url, text, image }) =>
      `https://www.pinterest.com/pin/create/button/?url=${enc(url)}&media=${enc(image)}&description=${enc(text)}`,
  },
  {
    name: "Reddit",
    icon: RedditIcon,
    tint: "#FF4500",
    href: ({ url, text }) =>
      `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`,
  },
  {
    name: "LinkedIn",
    icon: LinkedInIcon,
    tint: "#0A66C2",
    href: ({ url }) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  {
    // Gmail's compose URL rather than a mailto: link. A mailto depends on the
    // machine having a mail handler registered, and a common Chrome-on-macOS
    // setup registers mailto to Chrome while Chrome itself handles nothing —
    // so the click silently does nothing. This opens in the browser either
    // way, and Paro accounts are Google accounts.
    name: "Gmail",
    icon: GmailIcon,
    tint: "#EA4335",
    href: ({ url, text }) =>
      `https://mail.google.com/mail/?view=cm&fs=1&su=${enc(text)}&body=${enc(url)}`,
  },
];

/**
 * Instagram is deliberately absent: it has no web share intent, so the tile
 * could only ever copy the link — which the Copy button already does.
 */

export function SharePromptDialog({
  open,
  onOpenChange,
  promptId,
  title,
  imageUrl,
}: SharePromptDialogProps) {
  const { promptUrl, copyPromptLink, sharePrompt } = usePromptShare();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  const url = promptUrl(promptId);
  const text = `${title} — a prompt on Paro Studio`;

  const handleCopy = async () => {
    const ok = await copyPromptLink(promptId);
    if (!ok) return;

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openTarget = (target: ShareTarget) => {
    const href = target.href?.({ url, text, image: imageUrl });
    if (!href) return;

    // A separate tab, so the feed the user was browsing stays where it was.
    window.open(href, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  const handleNativeShare = async () => {
    await sharePrompt(promptId, title);
    onOpenChange(false);
  };

  // The OS share sheet is worth offering on a phone, where it reaches apps the
  // web cannot. On desktop it opens AirDrop and Notes, so it is left out.
  const showNativeShare = isMobile && typeof navigator !== "undefined" && !!navigator.share;

  const body = (
    // min-w-0 is load-bearing: DialogContent is a CSS grid, whose items refuse
    // to shrink below min-content by default. Without it the widest tile label
    // sets the width and every row spills past the panel edge.
    <div className="flex flex-col gap-5 min-w-0">
      {/* What they are about to send */}
      <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-sm min-w-0">
        <img
          src={imageUrl}
          alt=""
          className="h-14 w-14 rounded-sm object-cover flex-shrink-0"
          loading="lazy"
        />
        <div className="min-w-0">
          <p className="font-serif text-base leading-tight text-truncate-2">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Paro Studio</p>
        </div>
      </div>

      {/* Destinations — eight targets land as two even rows of four on desktop,
          and three rows of three on mobile once "More" joins them. */}
      <div className={cn("grid gap-y-4 gap-x-1", isMobile ? "grid-cols-3" : "grid-cols-4")}>
        {TARGETS.map((target) => {
          const Icon = target.icon;

          return (
            <button
              key={target.name}
              onClick={() => openTarget(target)}
              className="flex flex-col items-center gap-1.5 group min-w-0"
            >
              <span
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
                  // Untinted marks ride on the theme so they stay legible in
                  // both — X in particular is pure black on its own.
                  target.tint ? "text-white" : "bg-foreground text-background"
                )}
                style={target.tint ? { backgroundColor: target.tint } : undefined}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="w-full text-center truncate text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {target.name}
              </span>
            </button>
          );
        })}

        {showNativeShare && (
          <button
            onClick={handleNativeShare}
            className="flex flex-col items-center gap-1.5 group min-w-0"
          >
            <span className="h-12 w-12 rounded-full bg-secondary border border-border flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <MoreHorizontal className="h-5 w-5 text-foreground" />
            </span>
            <span className="w-full text-center truncate text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              More
            </span>
          </button>
        )}
      </div>

      {/* Copy link */}
      <div className="flex items-center gap-2 p-1.5 pl-3 bg-secondary/50 rounded-sm border border-border min-w-0">
        <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
          {url}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex-shrink-0 px-4 py-2 text-sm font-medium rounded-sm transition-colors",
            copied
              ? "bg-gold/20 text-foreground"
              : "bg-gold text-gold-foreground hover:bg-gold/90"
          )}
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Copied
            </span>
          ) : (
            "Copy"
          )}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-8">
          <DrawerHeader className="px-0 pb-2 text-left">
            <DrawerTitle className="font-serif text-xl font-normal">Share</DrawerTitle>
            <DrawerDescription className="sr-only">
              Send this prompt to another app or copy its link
            </DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/50">
        <DialogHeader className="pb-1">
          <DialogTitle className="font-serif text-xl font-normal">Share</DialogTitle>
          <DialogDescription className="sr-only">
            Send this prompt to another app or copy its link
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
