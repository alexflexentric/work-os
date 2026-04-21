import { Resend } from "resend";
import ApprovalPendingEmail from "@/emails/ApprovalPending";
import WelcomeEmail from "@/emails/Welcome";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = "Work OS <support@fafo-studio.com>";

export async function sendApprovalPendingEmail(email: string, name?: string) {
  await resend.emails.send({
    from: FROM,
    to: [email],
    subject: "Work OS — your account is pending approval",
    react: ApprovalPendingEmail({ name }),
  });
}

export async function sendWelcomeEmail(email: string, name?: string) {
  await resend.emails.send({
    from: FROM,
    to: [email],
    subject: "Welcome to Work OS",
    react: WelcomeEmail({ name }),
  });
}
