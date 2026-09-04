import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const title = "Nova palavra-passe — Team Manager 24H Karting";
const description = "Define uma nova palavra-passe para recuperares o acesso à tua equipa.";

export const Route = createFileRoute("/reset-password")({
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
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Fallback: a recovery session may already be active
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const timer = window.setTimeout(() => setReady((v) => v ?? false), 4000);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) {
      toast.error("A palavra-passe precisa de pelo menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As palavras-passe não coincidem");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível atualizar", { description: error.message });
      return;
    }
    toast.success("Palavra-passe atualizada", { description: "Já podes entrar com a nova palavra-passe." });
    navigate({ to: "/auth", replace: true });
  }

  if (ready === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <p className="text-sm text-muted-foreground">A validar a ligação de recuperação…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Ligação inválida ou expirada</CardTitle>
            <CardDescription>
              Esta ligação de recuperação já não é válida. Pede uma nova a partir da página de entrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" asChild>
              <Link to="/auth">Voltar ao login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Definir nova palavra-passe</CardTitle>
          <CardDescription>Escolhe uma nova palavra-passe para a conta da tua equipa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">Nova palavra-passe</Label>
              <Input id="new-pass" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pass">Confirmar palavra-passe</Label>
              <Input id="confirm-pass" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Guardar nova palavra-passe
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
