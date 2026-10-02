/**
 * Supabase Feedback Service
 * Handles feedback submissions from /feedback
 * 
 * Flow:
 * 1. Form validates client-side (Zod)
 * 2. submitFeedback() stores in database
 * 3. sendFeedbackEmail() invokes Edge Function
 * 4. Edge Function calls Resend API
 * 5. Email sent to parostudio2026@gmail.com
 * 
 * Environment Requirements:
 * - Supabase project with send-feedback-email Edge Function deployed
 * - RESEND_API_KEY: set in Supabase function secrets
 * - FEEDBACK_EMAIL_FROM: set in Supabase function secrets
 */

import type { PostgrestError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './client';

export interface SubmitFeedbackData {
  user_id: string;
  subject: string;
  message: string;
}

interface SendEmailRequest {
  user_id: string;
  subject: string;
  message: string;
  user_email?: string;
  user_name?: string;
}

/**
 * Submit a piece of feedback.
 *
 * The `feedback` table is insert only. There is no select policy, so there is
 * deliberately no function here to read submissions back. Read them in the
 * Supabase dashboard.
 */
export async function submitFeedback(
  data: SubmitFeedbackData,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('feedback').insert({
    user_id: data.user_id,
    subject: data.subject.trim(),
    message: data.message.trim(),
  });

  if (error) {
    console.error('Error submitting feedback:', error);
    return { error };
  }

  return { error: null };
}

/**
 * Send feedback email via Supabase Edge Function
 * 
 * This is called after successful database insertion.
 * Email is sent to parostudio2026@gmail.com via Resend API.
 * 
 * On error, we don't fail the entire operation—the feedback is already
 * in the database. We return the error so the UI can show a message
 * but the form submission is considered successful.
 */
export async function sendFeedbackEmail(
  data: SendEmailRequest,
): Promise<{ error: string | null }> {
  try {
    const { data: response, error } = await supabase.functions.invoke(
      'send-feedback-email',
      {
        body: data,
      }
    );

    if (error) {
      console.error('Error calling send-feedback-email function:', error);

      // Extract user-friendly error message
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (typeof body?.error === 'string' && body.error) {
            return { error: body.error };
          }
        } catch {
          // Not JSON, fall through
        }
      }

      return { error: 'Failed to send email notification' };
    }

    if (response?.success) {
      console.log('Feedback email sent:', response.email_id);
      return { error: null };
    }

    console.warn('Unexpected response from send-feedback-email:', response);
    return { error: null }; // Don't fail UX if email service has issues
  } catch (err) {
    console.error('Error invoking send-feedback-email:', err);
    return { error: null }; // Don't fail UX if email service is down
  }
}
