import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeedbackForm } from "@/components/profile/FeedbackForm";
import { Card } from "@/components/ui/card";
import { Mail, Sparkles } from "lucide-react";

export default function Feedback() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />

            {/* Main content wrapper with top padding to clear fixed navbar */}
            <main className="flex-1 pt-24 pb-16 lg:pt-32 lg:pb-24 flex flex-col justify-center relative overflow-hidden">

                {/* Abstract Background Blobs - Adjusted positioning */}
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none opacity-40 mix-blend-screen" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none opacity-40 mix-blend-screen" />

                <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">

                        {/* Left Column: Content */}
                        <div className="space-y-8 lg:pr-8 text-center lg:text-left order-first">
                            <div className="space-y-6">
                                <div className="inline-flex items-center justify-center lg:justify-start gap-2 text-primary/80 uppercase text-xs font-bold tracking-widest px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit mx-auto lg:mx-0">
                                    <Sparkles className="h-3 w-3" />
                                    <span>Get in Touch</span>
                                </div>
                                <h1 className="text-4xl sm:text-5xl lg:text-7xl font-serif font-bold tracking-tight text-foreground leading-[1.1]">
                                    We'd love to <br className="hidden lg:block" /> hear from you.
                                </h1>
                                <p className="text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                                    Your feedback helps us build a better creative community. Whether you have a feature request, found a bug, or just want to say hi, we are all ears.
                                </p>
                            </div>

                            <div className="hidden lg:flex flex-col gap-4 pt-4">
                                <div className="flex flex-col gap-3 p-5 rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm hover:bg-card/60 transition-colors w-full">
                                    <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-foreground flex items-center justify-center">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-base text-foreground">Email Us</h3>
                                        <p className="text-muted-foreground text-sm mt-1">
                                            <a href="mailto:support@parostudios.in" className="hover:underline hover:text-foreground transition-colors">
                                                support@parostudios.in
                                            </a>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Form */}
                        <div className="w-full max-w-xl mx-auto lg:ml-auto">
                            <div className="relative group">
                                {/* Card Glow Effect */}
                                <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary/20 via-primary/10 to-secondary/20 rounded-2xl blur-lg opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />

                                <Card className="relative w-full bg-card/60 backdrop-blur-md border-white/10 shadow-2xl rounded-2xl p-6 sm:p-8 lg:p-10">
                                    <div className="mb-8 text-center lg:text-left">
                                        <h2 className="text-2xl font-serif font-semibold mb-2">Send a Message</h2>
                                        <p className="text-sm text-muted-foreground">Fill out the form below and we'll get back to you.</p>
                                    </div>
                                    <FeedbackForm />
                                </Card>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
