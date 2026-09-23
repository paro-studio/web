import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { DiscordIcon } from "@/components/prompts/brandIcons";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import {
  ShieldCheck,
  HeartHandshake,
  ShieldAlert,
  Ban,
  Lock,
  Sparkles,
  Bot,
  MessageSquare,
  UserX,
  Flag,
  Gavel,
  Users,
  MessageSquarePlus,
  LucideIcon,
} from "lucide-react";

interface GuidelineSection {
  id: number;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  items?: string[];
  badge?: string;
  paragraph?: string;
  listHeader?: string;
  footerParagraphs?: string[];
  callout?: string;
  closingNote?: string;
  isFeatured?: boolean;
}

const GUIDELINE_SECTIONS: GuidelineSection[] = [
  {
    id: 1,
    icon: HeartHandshake,
    title: "1. Be Respectful",
    subtitle: "Treat everyone with respect, even when you disagree.",
    items: [
      "No harassment, bullying, or personal attacks.",
      "Don't target people based on who they are or what they believe.",
      "Disagree with ideas, not people.",
      "Don't intentionally provoke or humiliate others.",
    ],
  },
  {
    id: 2,
    icon: ShieldAlert,
    title: "2. Keep Content Safe & Appropriate",
    subtitle: "Don't post content that could seriously harm or exploit others.",
    items: [
      "No threats or encouragement of violence.",
      "No sexual content involving minors.",
      "No exploitation or abuse.",
      "No content intended to facilitate serious wrongdoing.",
      "Don't share someone's private or sensitive information without their permission.",
    ],
  },
  {
    id: 3,
    icon: Ban,
    title: "3. Don't Spam",
    subtitle: "Help keep Paro useful for everyone.",
    items: [
      "Don't repeatedly post the same content.",
      "Don't flood discussions with irrelevant messages.",
      "Don't use Paro primarily for unsolicited advertising or promotion.",
      "Don't manipulate engagement through fake accounts, bots, or coordinated activity.",
    ],
  },
  {
    id: 4,
    icon: Lock,
    title: "4. Respect Privacy",
    subtitle: "Think before sharing information about yourself or someone else.",
    items: [
      "Don't post private contact information, passwords, addresses, or other sensitive information.",
      "Don't share private conversations or personal information without permission.",
      "If you accidentally share sensitive information, remove it as soon as possible.",
    ],
  },
  {
    id: 5,
    icon: Sparkles,
    title: "5. Share Original & Honest Content",
    subtitle: "Give credit where it's due.",
    items: [
      "Don't claim someone else's work as your own.",
      "Don't intentionally misrepresent someone else's content.",
      "When appropriate, credit the original creator or source.",
      "Don't use Paro to distribute stolen or unauthorized content.",
    ],
  },
  {
    id: 6,
    icon: Bot,
    title: "6. Use AI Responsibly",
    subtitle: "Paro is a place to explore and share AI-powered ideas.",
    items: [
      "Don't use AI to create content intended to harass, deceive, or harm others.",
      "Don't present generated information as fact when accuracy matters without verifying it.",
      "Be transparent when context makes it important to know that content was AI-generated.",
      "Don't use AI as an excuse to violate these guidelines.",
    ],
  },
  {
    id: 7,
    icon: MessageSquare,
    title: "7. Keep Discussions Constructive",
    subtitle: "Paro works best when people can learn from each other.",
    items: [
      "Ask questions.",
      "Share useful feedback.",
      "Explain your reasoning when helpful.",
      "Avoid unnecessary arguments and hostile discussions.",
      "Assume good intentions where possible.",
    ],
  },
  {
    id: 8,
    icon: UserX,
    title: "8. Don't Manipulate the Community",
    subtitle: "Everyone should have a fair chance to participate.",
    items: [
      "Don't use bots or automated accounts to manipulate votes, comments, or visibility.",
      "Don't create multiple accounts to evade restrictions or artificially boost content.",
      "Don't coordinate fake engagement.",
      "Don't deliberately exploit bugs or platform systems to gain an unfair advantage.",
    ],
  },
  {
    id: 9,
    icon: Flag,
    title: "9. Report Problems",
    subtitle: "See something that violates these guidelines?",
    badge: "Report it.",
    paragraph:
      "When you report content, provide enough information for the Paro team to understand the issue. Please don't use reports to target people simply because you disagree with them.",
  },
  {
    id: 10,
    icon: Gavel,
    title: "10. Enforcement",
    subtitle:
      "When content or behavior violates these guidelines, Paro may take action depending on the situation.",
    listHeader: "This can include:",
    items: [
      "Removing content.",
      "Limiting access to certain features.",
      "Issuing warnings.",
      "Temporarily suspending accounts.",
      "Permanently banning accounts.",
    ],
    footerParagraphs: [
      "Serious violations may result in immediate action.",
      "We consider the context, severity, and history of behavior when making moderation decisions.",
    ],
  },
  {
    id: 11,
    icon: Users,
    title: "11. Help Us Build Paro",
    subtitle:
      "Community guidelines aren't just about rules, they're about the kind of community we want to create.",
    callout:
      "Be curious. Be respectful. Share useful things. Give credit. Help others.",
    closingNote: "Thanks for being part of Paro.",
    isFeatured: true,
  },
];

export default function CommunityGuidelines() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 lg:pt-32 lg:pb-24 relative overflow-hidden">
        {/* Background Decorative Ambient Blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] pointer-events-none opacity-30 mix-blend-screen" />
        <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] bg-gold/10 rounded-full blur-[140px] pointer-events-none opacity-20 mix-blend-screen" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative z-10">
          {/* Header Section */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 text-gold uppercase text-xs font-bold tracking-widest px-3.5 py-1.5 rounded-full bg-gold/10 border border-gold/20">
              <ShieldCheck className="h-4 w-4" />
              <span>Community Standards</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-foreground">
              Paro Community Guidelines
            </h1>

            <p className="text-lg sm:text-xl font-medium text-gold/90">
              Welcome to Paro! 👋
            </p>

            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed pt-1">
              Paro is a community built around sharing ideas, prompts, creativity, and knowledge. These guidelines help keep Paro a welcoming, useful, and respectful place for everyone.
            </p>
          </div>

          {/* Guidelines Grid */}
          <div className="space-y-6 sm:space-y-8">
            {GUIDELINE_SECTIONS.map((section) => {
              const Icon = section.icon;

              if (section.isFeatured) {
                return (
                  <ScrollReveal key={section.id}>
                    <Card
                      className="bg-gradient-to-br from-card/80 to-gold/5 backdrop-blur-md border-gold/30 p-6 sm:p-8 rounded-xl shadow-md text-center space-y-4"
                    >
                    <div className="h-12 w-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto text-gold">
                      <Icon className="h-6 w-6" />
                    </div>

                    <h2 className="text-xl sm:text-2xl font-serif font-semibold text-foreground">
                      {section.title}
                    </h2>

                    <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
                      {section.subtitle}
                    </p>

                    {section.callout && (
                      <div className="p-4 sm:p-5 rounded-lg bg-gold/10 border border-gold/20 max-w-2xl mx-auto">
                        <p className="text-gold font-semibold text-base sm:text-lg tracking-wide">
                          {section.callout}
                        </p>
                      </div>
                    )}

                    {section.closingNote && (
                      <p className="text-foreground font-serif text-lg pt-2">
                        {section.closingNote}
                      </p>
                    )}
                    </Card>
                  </ScrollReveal>
                );
              }

              return (
                <ScrollReveal key={section.id}>
                  <Card
                    className="bg-card/60 backdrop-blur-md border-border/60 p-6 sm:p-8 rounded-xl shadow-sm hover:border-gold/30 transition-all duration-300"
                  >
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    <div className="h-12 w-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0 text-gold">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-serif font-semibold text-foreground">
                          {section.title}
                        </h2>
                        <p className="text-sm sm:text-base font-medium text-muted-foreground mt-1">
                          {section.subtitle}
                        </p>
                      </div>

                      {section.badge && (
                        <div className="inline-block px-3 py-1 bg-destructive/10 border border-destructive/20 text-destructive font-bold text-sm rounded-md">
                          {section.badge}
                        </div>
                      )}

                      {section.paragraph && (
                        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed pt-1">
                          {section.paragraph}
                        </p>
                      )}

                      {section.listHeader && (
                        <p className="text-sm font-medium text-foreground">
                          {section.listHeader}
                        </p>
                      )}

                      {section.items && section.items.length > 0 && (
                        <ul className="space-y-2 pt-1 text-muted-foreground text-sm sm:text-base">
                          {section.items.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.footerParagraphs &&
                        section.footerParagraphs.map((para, idx) => (
                          <p
                            key={idx}
                            className={`text-sm sm:text-base text-muted-foreground leading-relaxed ${
                              idx === 0 ? "pt-1" : ""
                            }`}
                          >
                            {para}
                          </p>
                        ))}
                    </div>
                  </div>
                  </Card>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Questions & Help Footer Section */}
          <Card className="mt-8 sm:mt-10 bg-card/40 backdrop-blur-md border-border/80 p-6 sm:p-8 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
              <div className="space-y-1.5 max-w-xl">
                <h3 className="text-lg sm:text-xl font-serif font-semibold text-foreground">
                  Have questions or feedback?
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If you have questions about these guidelines, suggestions for improvement, or need to reach out to our team, we're here to help.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <Link
                  to="/feedback"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 text-sm font-medium transition-colors"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span>Send Feedback</span>
                </Link>
                <a
                  href="https://discord.com/invite/zNZ3TAwy73"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-sm font-medium transition-colors"
                >
                  <DiscordIcon className="h-4 w-4" />
                  <span>Join Discord</span>
                </a>
              </div>
            </div>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}

