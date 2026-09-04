import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const signUpSchema = z.object({
  teamName: z.string().trim().min(2, "Indica o nome da equipa").max(60),
  contactName: z.string().trim().min(2, "Indica o nome do responsável").max(80),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(8, "A palavra-passe precisa de pelo menos 8 caracteres").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

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
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      teamName: form.get("teamName"),
      contactName: form.get("contactName"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { team_name: parsed.data.teamName, contact_name: parsed.data.contactName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível registar", { description: error.message });
      return;
    }
    toast.success("Registo enviado", {
      description: "A tua equipa fica à espera da aprovação do administrador.",
    });
    navigate({ to: "/dashboard", replace: true });
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
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Registar equipa</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4">
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
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <form className="space-y-4" onSubmit={handleSignUp}>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-team">Nome da equipa</Label>
                    <Input id="up-team" name="teamName" required maxLength={60} placeholder="Equipa A" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-contact">Nome do responsável</Label>
                    <Input id="up-contact" name="contactName" required maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-email">Email</Label>
                    <Input id="up-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-pass">Palavra-passe</Label>
                    <Input id="up-pass" name="password" type="password" required minLength={8} autoComplete="new-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Registar equipa
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    O acesso só fica ativo depois de o administrador aprovar o registo.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
