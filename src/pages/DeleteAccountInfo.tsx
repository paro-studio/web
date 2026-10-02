import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { DISCORD_URL, SUPPORT_EMAIL } from "./Privacy";

const DELETED = [
  "Your account and sign in",
  "Your profile, profile photo and banner",
  "Every prompt you posted, and its image",
  "Your likes, saves, ratings and follows",
  "Your reports and feedback",
];

/**
 * How to delete a Paro account, for people who do not have the app to hand.
 * Google Play requires a page like this, linked from the store listing.
 * The deleting itself happens in Settings, through the delete-account
 * Edge Function, in the app or on this website.
 */
export default function DeleteAccountInfo() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 lg:pt-32 lg:pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 text-gold uppercase text-xs font-bold tracking-widest px-3.5 py-1.5 rounded-full bg-gold/10 border border-gold/20">
              <Trash2 className="h-4 w-4" />
              <span>Your account</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-foreground">
              Delete your Paro Studio account
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              You can delete your account yourself, at any time, in the Paro app or on this website.
            </p>
          </div>

          <div className="space-y-10">
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">In the app</h2>
              <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>Open the You tab and tap the settings button.</li>
                <li>Tap Delete account.</li>
                <li>Type your username and confirm.</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">On the website</h2>
              <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed">
                <li>Sign in with the same Google account.</li>
                <li>
                  Open{" "}
                  <Link to="/settings" className="text-gold underline underline-offset-4">
                    Settings
                  </Link>{" "}
                  and choose Delete account.
                </li>
                <li>Confirm.</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">What is deleted</h2>
              <p className="text-muted-foreground leading-relaxed">
                Everything, straight away and permanently. It cannot be undone:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
                {DELETED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Nothing is kept afterwards. If you sign in again with the same Google account, you start
                a new, empty account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">Can't sign in?</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you can no longer sign in, email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold underline underline-offset-4">
                  {SUPPORT_EMAIL}
                </a>{" "}
                or ask us on our{" "}
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-gold underline underline-offset-4">
                  Discord
                </a>{" "}
                and we will delete it for you. See the{" "}
                <Link to="/privacy" className="text-gold underline underline-offset-4">
                  privacy policy
                </Link>{" "}
                for how your data is handled.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
