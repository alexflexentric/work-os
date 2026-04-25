"use client";
import { signIn } from "next-auth/react";

const btnCls =
  "w-full flex items-center justify-center gap-3 border border-[--border] rounded-lg px-4 py-2.5 text-sm font-medium text-[--foreground] hover:bg-[--muted] transition-colors";

// Google disabled — Microsoft-only. Re-enable if migrating to Google.
// const GoogleIcon = () => ( ... );

const MicrosoftIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
    <path fill="#f35325" d="M1 1h10v10H1z"/>
    <path fill="#81bc06" d="M12 1h10v10H12z"/>
    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
    <path fill="#ffba08" d="M12 12h10v10H12z"/>
  </svg>
);

export default function SignInButtons() {
  return (
    <div className="space-y-2">
      <button onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/translation" })} className={btnCls}>
        <MicrosoftIcon /> Continue with Microsoft
      </button>
      <p className="text-xs text-[--muted-foreground] mt-3">
        New accounts require admin approval before access is granted.
      </p>
    </div>
  );
}
