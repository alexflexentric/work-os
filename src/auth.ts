import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendApprovalPendingEmail } from "@/lib/email";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
      checks: ["pkce"],
    }),
  ],
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
  pages: {
    signIn: "/",
  },
});

declare module "next-auth" {
  interface Session {
    userId: string;
    user: {
      isApproved: boolean;
    } & import("next-auth").DefaultSession["user"];
  }
}
