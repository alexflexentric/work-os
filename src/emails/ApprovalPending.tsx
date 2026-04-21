import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
} from "@react-email/components";

export default function ApprovalPendingEmail({ name }: { name?: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", background: "#f9fafb" }}>
        <Container style={{ maxWidth: 480, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>Hi {name ?? "there"},</Text>
          <Text>Your Work OS account has been created and is pending admin approval.</Text>
          <Text>You'll receive another email once your account is approved.</Text>
          <Hr />
          <Text style={{ fontSize: 12, color: "#6b7280" }}>
            Questions? Reply to this email or contact{" "}
            <a href="mailto:support@fafo-studio.com">support@fafo-studio.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
