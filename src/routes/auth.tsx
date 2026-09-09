import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { requestPasswordReset } from "@/lib/auth.functions";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const title = "Entrar — Team Manager 24H Karting";
const description = "Área reservada das equipas: entra ou regista a tua equipa para aceder ao plano de corrida.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});


function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const sendReset = useServerFn(requestPasswordReset);
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [blockedFor, setBlockedFor] = useState(0);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (blockedFor <= 0) return;
    const id = window.setInterval(() => setBlockedFor((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [blockedFor]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("not confirmed")) {
        setPendingEmail(String(form.get("email") ?? "").trim());
        toast.error("Email por confirmar", { description: "Confirma o email antes de entrares." });
        return;
      }
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function resendConfirmation() {
    if (!pendingEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setBusy(false);
    if (error) toast.error("Não foi possível reenviar", { description: error.message });
    else toast.success("Email reenviado");
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!z.string().email().safeParse(email).success) {
      toast.error("Indica um email válido");
      return;
    }
    if (blockedFor > 0) {
      toast.error("Demasiados pedidos", { description: `Tenta novamente em ${formatWait(blockedFor)}.` });
      return;
    }
    setBusy(true);
    let result: { ok: boolean; retryAfterSeconds: number };
    try {
      result = await sendReset({
        data: { email, redirectTo: `${window.location.origin}/reset-password` },
      });
    } catch {
      setBusy(false);
      toast.error("Não foi possível enviar", { description: "Tenta novamente daqui a pouco." });
      return;
    }
    setBusy(false);
    if (!result.ok) {
      setBlockedFor(result.retryAfterSeconds);
      toast.error("Demasiados pedidos de recuperação", {
        description: `Por segurança, este email fica bloqueado durante ${formatWait(result.retryAfterSeconds)}.`,
      });
      return;
    }
    toast.success("Email enviado", {
      description: "Se a conta existir, vais receber uma ligação para definires uma nova palavra-passe.",
    });
    setForgot(false);
  }

  if (forgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Recuperar palavra-passe</CardTitle>
            <CardDescription>
              Indica o email da tua equipa. Enviamos uma ligação segura para definires uma nova palavra-passe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleReset}>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" name="email" type="email" required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || blockedFor > 0}>
                {blockedFor > 0
                  ? `Bloqueado — tenta em ${formatWait(blockedFor)}`
                  : "Enviar ligação de recuperação"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Por segurança, são permitidos até 5 pedidos por hora para o mesmo email.
              </p>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setForgot(false)}>
                Voltar ao login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pendingEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Confirma o teu email</CardTitle>
            <CardDescription>
              Enviámos uma mensagem para <strong>{pendingEmail}</strong>. Clica na ligação para confirmares o
              endereço e depois entra na tua conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Depois da confirmação, o acesso ao dashboard só fica ativo quando o administrador aprovar a equipa.
            </p>
            <Button variant="outline" className="w-full" onClick={resendConfirmation} disabled={busy}>
              Reenviar email de confirmação
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPendingEmail(null)}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-center font-display text-lg font-bold uppercase tracking-[0.12em]">
          Team Manager <span className="text-primary">24H</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Área das equipas</CardTitle>
            <CardDescription>Cada equipa vê apenas a sua própria estratégia.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Registo temporariamente desativado: apenas o administrador pode criar equipas. */}
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-1.5">
                <Label htmlFor="in-email">Email</Label>
                <Input id="in-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="in-pass">Palavra-passe</Label>
                <Input id="in-pass" name="password" type="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Entrar
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setForgot(true)}
              >
                Esqueci-me da palavra-passe
              </button>
            </form>
            <Button variant="ghost" className="mt-4 w-full" asChild>
              <Link to="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
