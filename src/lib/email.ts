import { Resend } from "resend";
import ApprovalPendingEmail from "@/emails/ApprovalPending";
import WelcomeEmail from "@/emails/Welcome";
import AdminApprovalNotificationEmail from "@/emails/AdminApprovalNotification";
import BookingConfirmationEmail from "@/emails/BookingConfirmation";
import BookingNotificationEmail from "@/emails/BookingNotification";

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

export async function sendBookingConfirmationEmail(
  guestEmail: string,
  opts: {
    guestName: string;
    subject: string;
    dateLabel: string;
    durationMinutes: number;
    location: string;
    teamsLink?: string | null;
    address?: string | null;
    hostName: string;
  }
) {
  await resend.emails.send({
    from: FROM,
    to: [guestEmail],
    subject: `Meeting confirmed: ${opts.subject}`,
    react: BookingConfirmationEmail({ ...opts, guestName: opts.guestName }),
  });
}

export async function sendBookingNotificationEmail(opts: {
  guestName: string;
  guestEmail: string;
  guestCompany: string;
  subject: string;
  dateLabel: string;
  durationMinutes: number;
  location: string;
  address?: string | null;
  note?: string | null;
  bookingPageName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: `New booking: ${opts.subject} — ${opts.guestName}`,
    react: BookingNotificationEmail(opts),
  });
}
