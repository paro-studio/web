import { Link } from "react-router-dom";
import { Instagram, Github } from "lucide-react";
import { DiscordIcon } from "@/components/prompts/brandIcons";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border mt-auto bg-background/50 backdrop-blur-sm">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-10">
          {/* Brand Column */}
          <div className="md:col-span-5 lg:col-span-4 space-y-3">
            <Link to="/" className="font-serif text-xl tracking-tight text-foreground hover:text-gold transition-colors inline-block">
              PARO
            </Link>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              The premier destination for discovering, sharing, and creating high-quality AI prompts. Join our creative community today.
            </p>
          </div>

          {/* Spacing Column */}
          <div className="hidden md:block md:col-span-1 lg:col-span-2"></div>

          {/* Quick Links */}
          <div className="md:col-span-3 lg:col-span-3 space-y-3">
            <h3 className="font-medium text-sm text-foreground tracking-wide">Explore</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/" className="hover:text-foreground transition-colors">Trending Prompts</Link>
              </li>
              <li>
                <Link to="/originals" className="hover:text-foreground transition-colors">PARO Originals</Link>
              </li>
              <li>
                <Link to="/top-creators" className="hover:text-foreground transition-colors">Top Creators</Link>
              </li>
              <li>
                <Link to="/upload" className="hover:text-foreground transition-colors">Create Prompt</Link>
              </li>
              <li>
                <Link to="/earn" className="hover:text-foreground transition-colors">Earn With PARO</Link>
              </li>
              <li>
                <Link to="/guidelines" className="hover:text-foreground transition-colors">Community Guidelines</Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Use</Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/feedback" className="hover:text-foreground transition-colors">Feedback</Link>
              </li>
            </ul>
          </div>

          {/* Social / Connect */}
          <div className="md:col-span-3 lg:col-span-3 space-y-3">
            <h3 className="font-medium text-sm text-foreground tracking-wide">Connect</h3>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/paro.prompts"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-1.5 -ml-1.5 rounded-full hover:bg-secondary transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
              <a
                href="https://discord.com/invite/zNZ3TAwy73"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-1.5 rounded-full hover:bg-secondary transition-colors"
                aria-label="Discord"
              >
                <DiscordIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
              <a
                href="https://github.com/paro-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-1.5 rounded-full hover:bg-secondary transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Follow us for daily inspiration.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>© {currentYear} Paro Studio. All rights reserved.</p>
          <p>Every image on Paro is made or edited with AI.</p>
        </div>
      </div>
    </footer>
  );
}