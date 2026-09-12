import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
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

const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "Pelo menos 10 caracteres", test: (v) => v.length >= 10 },
  { label: "Uma letra maiúscula", test: (v) => /[A-ZÀ-Ý]/.test(v) },
  { label: "Uma letra minúscula", test: (v) => /[a-zà-ÿ]/.test(v) },
  { label: "Um número", test: (v) => /\d/.test(v) },
  { label: "Um símbolo (!@#$…)", test: (v) => /[^A-Za-zÀ-ÿ0-9]/.test(v) },
  { label: "Sem espaços", test: (v) => v.length > 0 && !/\s/.test(v) },
];

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
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

  const checks = useMemo(() => RULES.map((r) => ({ ...r, ok: r.test(password) })), [password]);
  const strongEnough = checks.every((c) => c.ok);
  const matches = confirm.length > 0 && password === confirm;
  const score = checks.filter((c) => c.ok).length;

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!strongEnough) {
      toast.error("Palavra-passe demasiado fraca", {
        description: "Cumpre todos os requisitos indicados.",
      });
      return;
    }
    if (!matches) {
      toast.error("As palavras-passe não coincidem");
      return;
    }
    setBusy(true);
    const { data: updated, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível atualizar", { description: error.message });
      return;
    }

    // A recuperação não dá acesso: a equipa continua a depender da aprovação do admin.
    let approved = false;
    if (updated.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", updated.user.id)
        .maybeSingle();
      approved = profile?.status === "approved";
    }
    await supabase.auth.signOut();
    setBusy(false);

    toast.success("Palavra-passe atualizada", {
      description: approved
        ? "Já podes entrar com a nova palavra-passe."
        : "Entra com a nova palavra-passe; o acesso só abre depois da aprovação do administrador.",
    });
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
              Esta ligação de recuperação já não é válida. Pede uma nova a partir da página de
              entrada.
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
          <CardDescription>
            Escolhe uma nova palavra-passe para a conta da tua equipa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">Nova palavra-passe</Label>
              <Input
                id="new-pass"
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${
                    score >= 6 ? "bg-emerald-500" : score >= 4 ? "bg-amber-500" : "bg-destructive"
                  }`}
                  style={{ width: `${(score / RULES.length) * 100}%` }}
                />
              </div>
              <ul className="space-y-1 pt-1">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={`flex items-center gap-1.5 text-xs ${
                      c.ok ? "text-emerald-500" : "text-muted-foreground"
                    }`}
                  >
                    {c.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pass">Confirmar palavra-passe</Label>
              <Input
                id="confirm-pass"
                name="confirm"
                type="password"
                required
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {confirm.length > 0 && !matches ? (
                <p className="text-xs text-destructive">As palavras-passe não coincidem.</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={busy || !strongEnough || !matches}>
              Guardar nova palavra-passe
            </Button>
            <p className="text-xs text-muted-foreground">
              Depois de mudares a palavra-passe, o acesso ao dashboard mantém-se dependente da
              aprovação do administrador.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
