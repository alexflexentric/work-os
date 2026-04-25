import { Html, Head, Body, Container, Text, Hr } from "@react-email/components";

interface Props {
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
}

export default function BookingNotificationEmail({
  guestName,
  guestEmail,
  guestCompany,
  subject,
  dateLabel,
  durationMinutes,
  location,
  address,
  note,
  bookingPageName,
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", background: "#f9fafb" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>New booking — {bookingPageName}</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Guest</Text>
          <Text style={{ margin: "0 0 2px", color: "#374151" }}>{guestName} · {guestCompany}</Text>
          <Text style={{ margin: "0 0 16px", color: "#6b7280" }}>{guestEmail}</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Subject</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>{subject}</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>When</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>{dateLabel} · {durationMinutes} min</Text>

          <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Where</Text>
          <Text style={{ margin: "0 0 16px", color: "#374151" }}>
            {location === "online" ? "Online (Teams)" : address ?? "Offline"}
          </Text>

          {note && (
            <>
              <Text style={{ margin: "0 0 4px", fontWeight: 600 }}>Notes</Text>
              <Text style={{ margin: "0 0 16px", color: "#374151" }}>{note}</Text>
            </>
          )}

          <Hr />
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            The calendar invite has been sent automatically to the guest.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
