import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

export default function AdminApprovalNotificationEmail({
  name,
  email,
  adminUrl,
}: {
  name?: string;
  email: string;
  adminUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", background: "#f9fafb" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>New user waiting for approval</Text>
          <Text>
            <strong>{name ?? "Someone"}</strong> ({email}) just signed up for Work OS and is waiting for your approval.
          </Text>
          <Button
            href={adminUrl}
            style={{
              background: "#000",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Review &amp; approve
          </Button>
          <Hr />
          <Text style={{ fontSize: 12, color: "#6b7280" }}>Work OS · Admin notification</Text>
        </Container>
      </Body>
    </Html>
  );
}
