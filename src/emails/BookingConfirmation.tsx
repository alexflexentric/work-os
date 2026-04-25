import { Html, Head, Body, Container, Text, Button, Hr } from "@react-email/components";

interface Props {
  guestName: string;
  subject: string;
  dateLabel: string;
  durationMinutes: number;
  location: string;
  teamsLink?: string | null;
  address?: string | null;
  hostName: string;
}

export default function BookingConfirmationEmail({
  guestName,
  subject,
  dateLabel,
  durationMinutes,
  location,
  teamsLink,
  address,
  hostName,
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", background: "#f9fafb" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>Meeting confirmed</Text>
          <Text>Hi {guestName}, your meeting with {hostName} has been booked.</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Subject</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>{subject}</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>When</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>{dateLabel} · {durationMinutes} min</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Where</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>
            {location === "online" ? "Online" : address ?? "TBD"}
          </Text>

          {teamsLink && (
            <Button
              href={teamsLink}
              style={{ background: "#6264a7", color: "#fff", padding: "12px 24px", borderRadius: 6, textDecoration: "none" }}
            >
              Join Microsoft Teams
            </Button>
          )}

          <Hr />
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            A calendar invite has been sent to your email. Questions?{" "}
            <a href="mailto:alex@flexentric.com">alex@flexentric.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
