import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendApprovalPendingEmail } from "@/lib/email";

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

  if (config?.googleClientId && config?.googleClientSecret) {
    providers.push(
      Google({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
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

  if (config?.microsoftClientId && config?.microsoftClientSecret) {
    providers.push(
      MicrosoftEntraID({
        clientId: config.microsoftClientId,
        clientSecret: config.microsoftClientSecret,
        tenantId: config.microsoftTenantId ?? "common",
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
          await sendApprovalPendingEmail(user.email, user.name ?? undefined);
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
