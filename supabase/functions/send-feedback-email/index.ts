/**
 * send-feedback-email: Sends feedback submissions to parostudio2026@gmail.com
 * 
 * This function is invoked from the frontend when a user submits feedback.
 * It sends an email via Resend API to the configured recipient.
 * 
 * Environment variables (set in Supabase dashboard):
 * - RESEND_API_KEY: Your Resend API key (https://resend.com)
 * - FEEDBACK_EMAIL_FROM: Verified sender email in Resend (e.g., noreply@parostudio.com)
 * 
 * Deploy:
 * npx supabase functions deploy send-feedback-email
 * 
 * Testing locally:
 * npx supabase functions serve --env-file .env.local
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FEEDBACK_EMAIL_TO = "parostudio2026@gmail.com";

interface FeedbackEmailRequest {
  user_id: string;
  subject: string;
  message: string;
  user_email?: string;
  user_name?: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body?: Record<string, unknown>) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { ...cors, "Content-Type": "application/json" } : cors,
  });
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(204);
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  // Get environment variables
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const feedbackEmailFrom = Deno.env.get("FEEDBACK_EMAIL_FROM");

  if (!resendApiKey) {
    console.error("RESEND_API_KEY environment variable not set");
    return reply(500, { error: "Email service not configured" });
  }

  if (!feedbackEmailFrom) {
    console.error("FEEDBACK_EMAIL_FROM environment variable not set");
    return reply(500, { error: "Email sender not configured" });
  }

  // Parse request body
  let payload: FeedbackEmailRequest;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Invalid JSON payload" });
  }

  // Validate required fields
  const { user_id, subject, message } = payload;
  if (!user_id || !subject || !message) {
    return reply(400, { error: "Missing required fields: user_id, subject, message" });
  }

  // Build email subject and HTML/text content
  const emailSubject = `New PARO Feedback: ${subject}`;

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: #fff; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 600;">New PARO Feedback</h1>
      </div>
      
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #eee;">
        
        <div style="margin-bottom: 25px;">
          <h3 style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Subject</h3>
          <p style="margin: 0; font-size: 16px; font-weight: 500; color: #1a1a1a;">
            ${escapeHtml(subject)}
          </p>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Message</h3>
          <div style="background: #fff; padding: 15px; border-left: 3px solid #d4a574; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; color: #333;">
${escapeHtml(message)}
          </div>
        </div>

        <div style="border-top: 1px solid #ddd; padding-top: 20px; font-size: 12px; color: #999;">
          <p style="margin: 8px 0;">
            <strong>User ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${user_id}</code>
          </p>
          <p style="margin: 8px 0;">
            <strong>Submitted:</strong> ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "long", timeZone: "UTC" })} UTC
          </p>
          <p style="margin: 8px 0;">
            <strong>Source:</strong> PARO-STUDIO Feedback Form
          </p>
        </div>
      </div>
    </div>
  `;

  const emailText = `
New PARO Feedback

Subject: ${subject}

Message:
${message}

---
User ID: ${user_id}
Submitted: ${new Date().toISOString()}
Source: PARO-STUDIO Feedback Form
  `.trim();

  // Send email via Resend API
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: feedbackEmailFrom,
        to: [FEEDBACK_EMAIL_TO],
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        reply_to: payload.user_email || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Resend API error (${response.status}):`, errorText);
      return reply(500, { error: "Failed to send email" });
    }

    const result = await response.json();
    console.log("Email sent successfully:", result.id);

    return reply(200, {
      success: true,
      message: "Feedback email sent",
      email_id: result.id,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    return reply(500, { error: "Failed to send email" });
  }
});
