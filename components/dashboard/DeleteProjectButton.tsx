"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";
import {
  deleteProjectAction,
  type DeleteActionState,
} from "@/app/dashboard/proyectos/nuevo/actions";

const initial: DeleteActionState = { ok: false, message: null };

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  variant?: "ghost" | "danger";
  t?: any;
}

export function DeleteProjectButton({
  projectId,
  projectName,
  variant = "ghost",
}: DeleteProjectButtonProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteProjectAction, initial);
  const [confirm, setConfirm] = useState("");

  const triggerClass =
    variant === "danger"
      ? "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-status-risk/40 bg-status-risk/5 px-3 text-xs font-medium text-status-risk hover:bg-status-risk/10"
      : "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs text-ink-soft hover:bg-status-risk/10 hover:text-status-risk";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={triggerClass}
        aria-label={`${t.delete.deleteProject} ${projectName}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {variant === "danger" ? t.delete.deleteProject : t.delete.delete}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-canvas-raised p-6 shadow-card">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-status-risk/10 text-status-risk"
              >
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="delete-title"
                  className="font-display text-lg text-ink"
                >
                  {t.delete.deleteProject}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {t.delete.deleteWarning1}{" "}
                  <span className="font-medium text-ink">{projectName}</span>{" "}
                  {t.delete.deleteWarning2}
                </p>
              </div>
            </div>

            <form action={formAction} className="mt-5 space-y-3">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="expected_name" value={projectName} />

              <label
                htmlFor="confirm_name"
                className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft"
              >
                {t.delete.typeToConfirm}
              </label>
              <input
                id="confirm_name"
                name="confirm_name"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-[15px] text-ink outline-none focus:border-status-risk focus:ring-2 focus:ring-status-risk/20"
                placeholder={projectName}
              />

              {state.message && !state.ok ? (
                <div
                  role="alert"
                  className="rounded-xl border border-status-risk/30 bg-status-risk/5 px-3 py-2 text-xs text-status-risk"
                >
                  {state.message}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm text-ink-muted hover:text-ink"
                >
                  {t.delete.cancel}
                </button>
                <DeleteSubmit disabled={confirm !== projectName} t={t} />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DeleteSubmit({ disabled, t }: { disabled: boolean; t: any }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-status-risk px-4 text-sm font-medium text-canvas transition-colors hover:bg-[#7a1414] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      )}
      {t.delete.deletePermanently}
    </button>
  );
}
