"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { error: null };

interface LoginFormProps {
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="redirect" value={redirectTo} />

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-xs font-medium uppercase tracking-[0.14em] text-ink-soft"
        >
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="nombre@constructora.co"
          className="h-12 w-full rounded-xl border border-line bg-canvas-raised px-4 text-[15px] text-ink shadow-soft outline-none transition-colors placeholder:text-ink-soft focus:border-ink/40 focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-xs font-medium uppercase tracking-[0.14em] text-ink-soft"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-12 w-full rounded-xl border border-line bg-canvas-raised px-4 text-[15px] text-ink shadow-soft outline-none transition-colors placeholder:text-ink-soft focus:border-ink/40 focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          className="rounded-xl border border-status-risk/30 bg-status-risk/5 px-4 py-3 text-sm text-status-risk"
        >
          {state.error}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-canvas transition-colors hover:bg-[#1a1a1c] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <>
          <span>Iniciar sesión</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </>
      )}
    </button>
  );
}
