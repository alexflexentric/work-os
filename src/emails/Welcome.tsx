import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

export default function WelcomeEmail({ name }: { name?: string }) {
  const url = process.env.NEXTAUTH_URL ?? "https://work-os.fafo-studio.com";
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", background: "#f9fafb" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>Welcome, {name ?? "there"}!</Text>
          <Text>Your Work OS account has been approved. You can now sign in.</Text>
          <Button
            href={url}
            style={{ background: "#0ea5e9", color: "#fff", padding: "12px 24px", borderRadius: 6, textDecoration: "none" }}
          >
            Open Work OS
          </Button>
          <Hr />
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            Questions? Contact{" "}
            <a href="mailto:support@fafo-studio.com">support@fafo-studio.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
