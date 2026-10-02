import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { submitFeedback, sendFeedbackEmail } from "@/services/supabase/feedback";
import { getErrorMessage } from "@/lib/errors";

// The upper bounds sit just under the check constraints on public.feedback.
// The database ones are the real limit, since the anon key lets anyone post
// straight past this form; these exist so a long message fails here with a
// readable message instead of as a raw Postgres error.
const formSchema = z.object({
    subject: z.string().min(2, {
        message: "Subject must be at least 2 characters.",
    }).max(200, {
        message: "Subject must be under 200 characters.",
    }),
    message: z.string().min(10, {
        message: "Message must be at least 10 characters.",
    }).max(5000, {
        message: "Message must be under 5000 characters.",
    }),
});

interface FeedbackFormProps {
    className?: string;
}

export function FeedbackForm({ className }: FeedbackFormProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 1. Define your form.
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            subject: "",
            message: "",
        },
    });

    // 2. Define a submit handler.
    async function onSubmit(values: z.infer<typeof formSchema>) {
        // /feedback sits behind ProtectedRoute, so this should not happen. If
        // it somehow does, say so rather than failing the insert on RLS.
        if (!user) {
            toast({
                variant: "destructive",
                title: "You are signed out",
                description: "Sign in again to send feedback.",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            // Step 1: Insert feedback into database
            const { error: dbError } = await submitFeedback({
                user_id: user.id,
                subject: values.subject,
                message: values.message,
            });

            if (dbError) {
                toast({
                    variant: "destructive",
                    title: "Could not send feedback",
                    description: getErrorMessage(dbError, "Please try again."),
                });
                return;
            }

            // Step 2: Send email notification (non-blocking)
            // If email fails, we still show success since the feedback was saved to the database
            const { error: emailError } = await sendFeedbackEmail({
                user_id: user.id,
                subject: values.subject,
                message: values.message,
                user_email: user.email,
            });

            if (emailError) {
                // Log warning but don't fail UX—feedback is already saved
                console.warn('Email notification failed:', emailError);
            }

            toast({
                title: "Feedback sent!",
                description: "Thank you for your feedback. We appreciate it!",
            });
            form.reset();
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className={cn("w-full", className)}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Subject</FormLabel>
                                <FormControl>
                                    <Input placeholder="What's this about?" {...field} className="bg-background/50 border-white/10 focus:border-white/20 transition-all duration-300" />
                                </FormControl>
                                <FormDescription>
                                    Briefly describe the topic of your feedback.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Message</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Tell us more details..."
                                        className="resize-none min-h-[150px] bg-background/50 border-white/10 focus:border-white/20 transition-all duration-300"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={isSubmitting} className="w-full h-12 text-base font-medium transition-all duration-300 hover:scale-[1.02]">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            "Submit Feedback"
                        )}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
