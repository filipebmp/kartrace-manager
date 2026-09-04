import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(255),
  redirectTo: z.string().trim().url().max(500),
});

export interface ResetRequestResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/**
 * Public endpoint: throttled password-reset request.
 * Always returns a neutral result so it cannot be used to enumerate accounts.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<ResetRequestResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: gate, error: gateError } = await supabaseAdmin.rpc(
      "register_password_reset_attempt",
      { _email: email },
    );
    if (gateError) {
      console.error("reset rate-limit check failed", gateError.message);
      return { ok: false, retryAfterSeconds: 60 };
    }

    const result = (gate ?? {}) as { allowed?: boolean; retry_after_seconds?: number };
    if (!result.allowed) {
      return { ok: false, retryAfterSeconds: Math.max(1, result.retry_after_seconds ?? 60) };
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) console.error("reset email failed", error.message);

    return { ok: true, retryAfterSeconds: 0 };
  });
