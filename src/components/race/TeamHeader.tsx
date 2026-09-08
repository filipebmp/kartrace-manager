import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldCheck, Radio, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function TeamHeader({
  teamName,
  isAdmin,
  kartsFeature,
  teamFeature,
}: {
  teamName?: string | undefined;
  isAdmin?: boolean | undefined;
  kartsFeature?: boolean | undefined;
  teamFeature?: boolean | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b border-border bg-sidebar/80 px-4 py-3 backdrop-blur">
      <div className="min-w-0">
        <Link to="/" className="block">
          <h1 className="truncate font-display text-lg font-bold uppercase tracking-[0.12em]">
            Team Manager <span className="text-primary">24H</span>
          </h1>
          {teamName ? <p className="truncate text-xs text-muted-foreground">{teamName}</p> : null}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </Button>
        ) : null}
        {isAdmin || kartsFeature ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/staff-queue">
              <Radio className="size-4" />
              <span className="hidden sm:inline">Karts</span>
            </Link>
          </Button>
        ) : null}
        <Badge variant="outline" className="hidden sm:inline-flex">
          Sessão iniciada
        </Badge>
        <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
