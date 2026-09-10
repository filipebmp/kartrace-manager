import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_MS = 60_000; // atualiza no máximo 1x por minuto

function useLastSeenHeartbeat() {
  useEffect(() => {
    let lastSent = 0;
    let sending = false;

    const touch = async () => {
      const now = Date.now();
      if (sending || now - lastSent < HEARTBEAT_MS) return;
      sending = true;
      lastSent = now;
      try {
        await supabase.rpc("touch_last_seen");
      } catch {
        /* ignora falhas pontuais */
      } finally {
        sending = false;
      }
    };

    void touch();
    const onActivity = () => void touch();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const interval = window.setInterval(() => void touch(), HEARTBEAT_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
    };
  }, []);
}

function AuthenticatedLayout() {
  useLastSeenHeartbeat();
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
