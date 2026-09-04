import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Gauge, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

const title = "Team Manager 24H Karting";
const description =
  "Gestão de equipa em corridas de resistência de karts: turnos, lastro e tempos de condução em tempo real, com área privada por equipa.";

export const Route = createFileRoute("/")({
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
  component: Landing,
});

function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="font-display text-lg font-bold uppercase tracking-[0.12em]">
            Team Manager <span className="text-primary">24H</span>
          </h1>
          <Button asChild size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <h2 className="font-display text-3xl font-bold uppercase leading-tight tracking-tight">
          Estratégia de resistência, equipa a equipa
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Plano de turnos, boxes, lastro e avisos do regulamento em tempo real. Cada equipa tem a sua
          área privada e só vê a sua própria estratégia.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/auth">Entrar na área da equipa</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">Registar equipa</Link>
          </Button>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          <li className="rounded-lg border border-border p-4">
            <Gauge className="size-5 text-primary" />
            <p className="mt-2 font-semibold">Corrida ao vivo</p>
            <p className="text-sm text-muted-foreground">Turno atual, próxima box e tempos restantes.</p>
          </li>
          <li className="rounded-lg border border-border p-4">
            <Users className="size-5 text-primary" />
            <p className="mt-2 font-semibold">Pilotos e lastro</p>
            <p className="text-sm text-muted-foreground">Pesos, lastro sugerido e confirmação na troca.</p>
          </li>
          <li className="rounded-lg border border-border p-4">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-2 font-semibold">Acesso validado</p>
            <p className="text-sm text-muted-foreground">Só equipas aprovadas pelo administrador entram.</p>
          </li>
        </ul>
      </main>
    </div>
  );
}
