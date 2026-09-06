"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: "neutral" | "success" | "danger";
}

interface ToastContextValue {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be called within a <ToastProvider>.");
  return ctx;
}

const toneClasses = {
  neutral: "border-slate-200 bg-white",
  success: "border-emerald-200 bg-emerald-50",
  danger: "border-red-200 bg-red-50",
};

function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "pointer-events-auto animate-[toast-in_150ms_ease-out] rounded-lg border p-3 shadow-md",
            toneClasses[toast.tone ?? "neutral"],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs text-slate-600">{toast.description}</p>}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
