// Sends ONE real email through the same code the app uses:
//   npx tsx --env-file=.env.local scripts/try-send.ts <your-own-address>
import { buildEmail, checkProfessorEmail } from "../lib/accommodation";
import { FROM, SendError, sendEmail } from "../lib/send-email";

async function main() {
  const to = checkProfessorEmail(process.argv[2]);
  if (!to.ok) throw new Error(to.message);
  const body =
    "Dear Professor,\n\nThis is a test of the AccessBridge accommodation email. It checks <b>escaping</b> & delivery.\nNo action is needed.\n\nThank you,\nAccessBridge test";
  const email = buildEmail(body, to.value);
  console.error("from:", FROM, "-> to:", to.value);
  try {
    const id = await sendEmail({ to: to.value, replyTo: to.value, ...email, idempotencyKey: `try-send-${Date.now()}` });
    console.log("sent, Resend id:", id);
  } catch (e) {
    console.error("FAILED", e instanceof SendError ? [e.userMessage, e.detail] : e);
    process.exit(1);
  }
}
main();
