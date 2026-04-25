import { Resend } from "resend";
import ApprovalPendingEmail from "@/emails/ApprovalPending";
import WelcomeEmail from "@/emails/Welcome";
import AdminApprovalNotificationEmail from "@/emails/AdminApprovalNotification";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = "Work OS <work-os@flexentric.com>";
const ADMIN_EMAIL = "alex@flexentric.com";

export async function sendApprovalPendingEmail(email: string, name?: string) {
  await resend.emails.send({
    from: FROM,
    to: [email],
    subject: "Work OS — your account is pending approval",
    react: ApprovalPendingEmail({ name }),
  });
}

export async function sendAdminApprovalNotification(email: string, name?: string) {
  const adminUrl = `${process.env.NEXTAUTH_URL ?? "https://work-os.flexentric.com"}/admin`;
  await resend.emails.send({
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: `Work OS — ${name ?? email} is waiting for approval`,
    react: AdminApprovalNotificationEmail({ name, email, adminUrl }),
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
