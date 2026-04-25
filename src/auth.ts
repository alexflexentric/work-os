import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendApprovalPendingEmail, sendAdminApprovalNotification } from "@/lib/email";

// Static auth() export — reads sessions from DB, no provider config needed.
// Used throughout the app for session checks.
export const { auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [],
  callbacks: {
    async session({ session, user }) {
      session.userId = user.id;
      session.user.isApproved = (user as unknown as { isApproved: boolean }).isApproved;
      return session;
    },
  },
  pages: { signIn: "/" },
});

// Dynamic handler — reads provider credentials from AppConfig at request time.
// Used only by /api/auth/[...nextauth]/route.ts.
export async function buildAuthHandlers() {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  const providers = [];

  const googleClientId = config?.googleClientId ?? process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = config?.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  if (googleClientId && googleClientSecret) {
    providers.push(
      Google({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        authorization: {
          params: {
            scope: "openid email profile https://www.googleapis.com/auth/calendar",
            access_type: "offline",
            prompt: "consent",
          },
        },
      })
    );
  }

  const msClientId = config?.microsoftClientId ?? process.env.MICROSOFT_CLIENT_ID;
  const msClientSecret = config?.microsoftClientSecret ?? process.env.MICROSOFT_CLIENT_SECRET;
  const msTenantId = config?.microsoftTenantId ?? process.env.MICROSOFT_TENANT_ID ?? "common";
  if (msClientId && msClientSecret) {
    providers.push(
      MicrosoftEntraID({
        clientId: msClientId,
        clientSecret: msClientSecret,
        issuer: `https://login.microsoftonline.com/${msTenantId}/v2.0`,
        authorization: {
          params: {
            scope: "openid email profile offline_access Calendars.ReadWrite",
          },
        },
      })
    );
  }

  const { handlers } = NextAuth({
    adapter: PrismaAdapter(prisma),
    trustHost: true,
    providers,
    events: {
      async createUser({ user }) {
        if (user.email) {
          await Promise.all([
            sendApprovalPendingEmail(user.email, user.name ?? undefined),
            sendAdminApprovalNotification(user.email, user.name ?? undefined),
          ]);
        }
      },
    },
    callbacks: {
      async session({ session, user }) {
        session.userId = user.id;
        session.user.isApproved = (user as unknown as { isApproved: boolean }).isApproved;
        return session;
      },
    },
    pages: { signIn: "/" },
  });

  return handlers;
}

declare module "next-auth" {
  interface Session {
    userId: string;
    user: {
      isApproved: boolean;
    } & import("next-auth").DefaultSession["user"];
  }
}
