import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

// Where people reach the team.
export const DISCORD_URL = "https://discord.com/invite/zNZ3TAwy73";
export const SUPPORT_EMAIL = "parostudio2026@gmail.com";

export const PRIVACY_UPDATED = "3 October 2026";

interface PolicySection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

/**
 * Written from what the code and database actually do, for the website and
 * the Android app together. If a feature starts collecting something new,
 * this page has to change with it.
 */
const SECTIONS: PolicySection[] = [
  {
    title: "Who we are",
    paragraphs: [
      "Paro Studio is a gallery of AI image prompts at parostudios.in, with an Android app. This policy covers both. \"We\" means the Paro Studio team.",
    ],
  },
  {
    title: "What we collect",
    paragraphs: ["Only what the service needs to work:"],
    items: [
      "Your Google account's email address, name and profile photo, when you sign in with Google. Google is the only way to sign in.",
      "What you add to your profile: your username, display name, bio, profile photo and banner.",
      "What you post: each prompt's image, title, prompt text, AI tool and tags.",
      "What you do: the prompts you like, save and rate, the people you follow, the accounts you block, and the prompts or accounts you report or feedback you send.",
      "What you type into search, sent so the search can run. It is not saved on our side.",
      "Counts of views and copies. When you are signed out, a view is counted against a one way hash of your IP address, never the address itself. When you are signed in, it is counted against your account. These records are deleted after two days.",
      "Crash and error reports from the app: what went wrong and where in the code, your phone's model and Android version, and the last few screens you opened. Never your email or anything you posted.",
    ],
  },
  {
    title: "What is public",
    paragraphs: [
      "Paro is a public gallery, so most of what you share can be seen by anyone, with or without an account:",
    ],
    items: [
      "Your profile: username, display name, bio, photos, and your follower and following counts.",
      "Your prompts: the image, title, AI tool, tags and counts. The prompt text itself is not shown on screen; signed in users can copy it.",
      "Your likes, ratings and follows, including that they came from you.",
    ],
  },
  {
    title: "What stays private",
    items: [
      "Your email address. It is never shown to anyone.",
      "Your saved prompts. Only you can see them.",
      "Who you have blocked. Only you can see that, and the other person is not told.",
      "Your reports and feedback. Only the Paro team can read them.",
    ],
  },
  {
    title: "How we use it",
    paragraphs: [
      "To run Paro: to sign you in, show your profile and prompts, count views and copies, keep to the daily posting limit, and look into reports.",
      "Crash reports are used only to find and fix problems in the app.",
      "We do not sell your data, show ads, or track you across other apps and websites.",
    ],
  },
  {
    title: "Who handles it for us",
    items: [
      "Supabase stores the database, sign in and uploaded images.",
      "Google handles sign in.",
      "Vercel hosts the website.",
      "Sentry receives the app's crash and error reports.",
    ],
    paragraphs: ["They process data only to provide those services to us."],
  },
  {
    title: "How it is protected",
    paragraphs: [
      "Everything travels between your device and our servers over an encrypted connection (HTTPS). The database only lets each person change their own profile, prompts and activity.",
    ],
  },
  {
    title: "On your phone",
    paragraphs: [
      "The app keeps a few things on your phone so it works well: your sign in, recently loaded and saved prompts so they open offline, an unfinished post as a draft, recent searches, your light or dark setting, and small notes such as having accepted the terms or which prompts you were asked to rate. Signing out removes your sign in, the saved prompts and the draft. Uninstalling the app removes all of it.",
    ],
  },
  {
    title: "How long we keep it",
    paragraphs: [
      "Your account and everything in it stay until you delete them. View and copy records are deleted after two days. Crash reports are kept by Sentry for up to 90 days.",
    ],
  },
  {
    title: "Deleting your account",
    paragraphs: [
      "You can delete your account at any time from Settings, in the app or on the website. This permanently removes your profile, prompts, images, likes, saves, ratings, follows, reports and feedback straight away.",
    ],
  },
  {
    title: "Children",
    paragraphs: [
      "Paro is for adults and is not meant for anyone under 18. We do not knowingly collect data from anyone under 18, and we delete an account if we learn it belongs to someone younger.",
    ],
  },
  {
    title: "Changes",
    paragraphs: [
      "If this policy changes, we will update it here and change the date at the top.",
    ],
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 lg:pt-32 lg:pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 text-gold uppercase text-xs font-bold tracking-widest px-3.5 py-1.5 rounded-full bg-gold/10 border border-gold/20">
              <Lock className="h-4 w-4" />
              <span>Privacy</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-foreground">
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">Last updated {PRIVACY_UPDATED}</p>
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
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For anything about your data, email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold underline underline-offset-4">
                  {SUPPORT_EMAIL}
                </a>{" "}
                or reach the team on our{" "}
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-gold underline underline-offset-4">
                  Discord
                </a>
                . For a complaint, the{" "}
                <Link to="/terms" className="text-gold underline underline-offset-4">
                  terms of use
                </Link>{" "}
                name our grievance officer. To delete your account, see{" "}
                <Link to="/delete-account" className="text-gold underline underline-offset-4">
                  how to delete your account
                </Link>
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
