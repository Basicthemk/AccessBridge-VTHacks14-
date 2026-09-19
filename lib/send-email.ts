import { Resend } from "resend";

/**
 * Sender. Until a domain is verified in Resend, only Resend's test address works, and it
 * can deliver only to the email address that owns the Resend account. Set EMAIL_FROM to
 * an address on a verified domain (for example "AccessBridge <requests@yourdomain.com>")
 * to reach professors.
 */
export const FROM = process.env.EMAIL_FROM || "AccessBridge <onboarding@resend.dev>";

/** False while the sender is still Resend's test address, which can't reach professors. */
export const senderVerified = () => Boolean(process.env.EMAIL_FROM?.trim());

if (!senderVerified()) {
  console.warn(
    "[email] EMAIL_FROM is not set. Sending from onboarding@resend.dev, which only delivers to the Resend account owner. " +
      "Emails to professors will be rejected until a domain is verified in Resend and EMAIL_FROM is set."
  );
}

export class SendError extends Error {
  constructor(public userMessage: string, public detail?: string) {
    super(userMessage);
  }
}

export async function sendEmail(opts: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new SendError("Email sending isn’t set up yet: the server has no email key.");
  const resend = new Resend(apiKey);
  const { idempotencyKey, ...message } = opts;
  const { data, error } = await resend.emails.send({ from: FROM, ...message }, { idempotencyKey });
  if (error || !data) {
    const detail = error ? `${error.name}: ${error.message}` : "no response data";
    const status = error?.statusCode ?? 0;
    if (status === 403 || (error?.name === "validation_error" && /verify a domain|own email/i.test(error.message)))
      throw new SendError(
        "The email service will only deliver to the account owner until a sending domain is verified. This is a setup problem on our side.",
        detail
      );
    if (status === 429) throw new SendError("Too many emails were sent just now. Wait a minute, then try again.", detail);
    if (status === 401) throw new SendError("The email service rejected our key. This is a setup problem on our side.", detail);
    if (status === 422 || status === 400) throw new SendError("The email service rejected the message or address. Check the address and try again.", detail);
    throw new SendError("The email service had a problem, so nothing was sent. Try again in a moment.", detail);
  }
  return data.id;
}
