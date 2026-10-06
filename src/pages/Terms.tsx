import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { DISCORD_URL, SUPPORT_EMAIL } from "./Privacy";

export const TERMS_UPDATED = "7 October 2026";

// The named person complaints go to. Indian law requires a platform where
// people post to publish one, with the response times stated on this page.
const GRIEVANCE_OFFICER = "Akshat Patil";

interface TermsSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

/**
 * The terms people accept before posting, for the website and the Android app
 * together. Google Play requires apps with user posts to have them. The rules
 * on what may be posted live in the Community Guidelines; this page links
 * there instead of repeating them in full.
 */
const SECTIONS: TermsSection[] = [
  {
    title: "The short version",
    paragraphs: [
      "Paro Studio is a public gallery of AI image prompts at parostudios.in, with an Android app. These terms cover both. \"We\" means the Paro Studio team.",
      "Every image on Paro is made or edited with AI, and is posted by the people who use Paro, not by us.",
      "By signing in, posting or copying a prompt, you agree to these terms and to the Community Guidelines. If you do not agree, please do not use Paro.",
    ],
  },
  {
    title: "Who can use Paro",
    items: [
      "Paro is for adults. You must be at least 18 years old to use it.",
      "Anyone can browse without an account. Copying, liking, saving, following, rating, reporting and posting need one.",
    ],
  },
  {
    title: "Your account",
    items: [
      "You sign in with your Google account. Keep it secure; you are responsible for what is done with your Paro account.",
      "One person, one account. Do not pretend to be someone else, and do not pick a username that misleads people about who you are.",
      "The verified badge is given by the Paro team. It cannot be bought or requested through the app.",
    ],
  },
  {
    title: "What you post",
    items: [
      "You keep the rights to the images and prompts you post.",
      "By posting, you give Paro permission to store, show and share them on the website and in the app, for as long as they stay posted.",
      "Prompts are posted to be copied. Any signed in user can copy a prompt you post and use it to make their own images. Do not post a prompt you want to keep to yourself.",
      "Only post images you made, and prompts you wrote or have the right to share.",
      "If an image shows a real person, that person must be you, or must have agreed to it being posted.",
      "Your posts, profile, likes, ratings and follows are public. The privacy policy explains what is public and what is not.",
    ],
  },
  {
    title: "What is not allowed",
    paragraphs: ["The Community Guidelines set out the rules in full. In short, do not post:"],
    items: [
      "Nudity or sexually explicit images.",
      "Any sexual content involving minors. We report it and remove the account.",
      "Graphic or gory violence, threats, or encouragement of violence.",
      "AI images of a real person without their consent, and any image of a real person that is sexual, humiliating or made to mislead.",
      "Harassment, bullying or hate towards a person or group.",
      "Someone else's work as your own, or anything that breaks copyright.",
      "Other people's private information.",
      "Spam, fake engagement, or anything illegal.",
    ],
  },
  {
    title: "Reports and removal",
    items: [
      "Any signed in user can report a prompt or an account, and block an account so its prompts stop appearing for them. The Paro team reviews every report.",
      "We may remove any post, and suspend or delete any account, that breaks these terms or the Community Guidelines. We can do this without warning when the content is harmful.",
      "If you think we removed something by mistake, write to us and we will look again.",
    ],
  },
  {
    title: "Using prompts you copy",
    items: [
      "A prompt will not give the same image every time. Results depend on the AI tool and can differ from the picture shown.",
      "The AI tools have their own terms. You are responsible for following them, and for what you make and share.",
      "Ratings and counts come from other users. We do not check each prompt ourselves.",
    ],
  },
  {
    title: "Leaving",
    paragraphs: [
      "You can delete your account at any time from Settings, in the app or on the website. That permanently removes your profile, prompts and images.",
    ],
  },
  {
    title: "No guarantees",
    paragraphs: [
      "Paro is provided as it is. We work to keep it running and safe, but we do not promise it will always be available or free of mistakes, and we may change or stop parts of it.",
      "As far as the law allows, the Paro Studio team is not liable for losses that come from using Paro, from content other users post, or from images made with prompts copied here.",
    ],
  },
  {
    title: "Changes",
    paragraphs: [
      "If these terms change, we will update them here and change the date at the top. Using Paro after a change means you accept the new terms.",
    ],
  },
];

const linkClass = "text-gold underline underline-offset-4";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 lg:pt-32 lg:pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 text-gold uppercase text-xs font-bold tracking-widest px-3.5 py-1.5 rounded-full bg-gold/10 border border-gold/20">
              <ScrollText className="h-4 w-4" />
              <span>Terms</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-foreground">
              Terms of Use
            </h1>
            <p className="text-sm text-muted-foreground">Last updated {TERMS_UPDATED}</p>
          </div>

          <div className="space-y-10">
            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-serif text-foreground">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="text-muted-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">Complaints and grievance officer</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have a complaint about something posted on Paro, or about how Paro is run, write to our
                grievance officer, as provided for under India's Information Technology Rules, 2021:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>Name: {GRIEVANCE_OFFICER}</li>
                <li>
                  Email:{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                    {SUPPORT_EMAIL}
                  </a>
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Include a link to the prompt or profile and say what is wrong. We acknowledge every complaint
                within 24 hours and resolve it within 15 days.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                If an image shows you nude or in a sexual way, or is an AI image that impersonates you, tell us
                and we act on it within 24 hours. You can also report any prompt or account from its menu, in
                the app or on the website.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">Related pages and contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                Read the{" "}
                <Link to="/guidelines" className={linkClass}>
                  Community Guidelines
                </Link>{" "}
                and the{" "}
                <Link to="/privacy" className={linkClass}>
                  privacy policy
                </Link>
                . For questions, or to ask us to look again at something we removed, email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                or reach the team on our{" "}
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Discord
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
