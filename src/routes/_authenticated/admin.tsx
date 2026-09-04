import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession, type TeamProfile } from "@/hooks/use-session";
import { TeamHeader } from "@/components/race/TeamHeader";
import { deleteTeam } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const title = "Administração de equipas — Team Manager 24H Karting";
const description = "Aprova ou recusa os registos das equipas que pedem acesso à aplicação.";

export const Route = createFileRoute("/_authenticated/admin")({
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
  component: AdminPage,
});

const statusLabel: Record<TeamProfile["status"], string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
};

function AdminPage() {
  const { user } = useSession();
  const { data: me } = useProfile(user?.id);
  const isAdmin = me?.isAdmin ?? false;
  const queryClient = useQueryClient();
  const removeTeam = useServerFn(deleteTeam);
  const [toDelete, setToDelete] = useState<TeamProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingChange, setPendingChange] = useState<
    { team: TeamProfile; status: "approved" | "rejected" } | null
  >(null);
  const [saving, setSaving] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["all-teams"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamProfile[];
    },
  });

  async function confirmStatus() {
    if (!pendingChange) return;
    const { team, status } = pendingChange;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ status }).eq("id", team.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível guardar", { description: error.message });
      return;
    }
    setPendingChange(null);
    toast.success(status === "approved" ? "Equipa aprovada" : "Equipa recusada", {
      description: team.team_name,
    });
    queryClient.invalidateQueries({ queryKey: ["all-teams"] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removeTeam({ data: { userId: toDelete.id } });
      toast.success("Equipa eliminada", {
        description: `${toDelete.team_name} e todos os seus dados foram removidos.`,
      });
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["all-teams"] });
    } catch (e) {
      toast.error("Não foi possível eliminar", {
        description: e instanceof Error ? e.message : "Tenta novamente.",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <TeamHeader teamName={me?.profile?.team_name} isAdmin={isAdmin} />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4">
        {!isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle>Sem acesso</CardTitle>
              <CardDescription>Esta área é só para o administrador.</CardDescription>
            </CardHeader>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar equipas…</p>
        ) : (
          (teams ?? []).map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{t.team_name}</CardTitle>
                    <CardDescription className="truncate">
                      {t.contact_name} · {t.email}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={t.status === "approved" ? "default" : t.status === "pending" ? "secondary" : "destructive"}
                  >
                    {statusLabel[t.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  size="sm"
                  disabled={t.status === "approved"}
                  onClick={() => setPendingChange({ team: t, status: "approved" })}
                >
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={t.status === "rejected"}
                  onClick={() => setPendingChange({ team: t, status: "rejected" })}
                >
                  Recusar
                </Button>
                {t.id !== user?.id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-auto"
                    onClick={() => setToDelete(t)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar equipa?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? `Vais eliminar permanentemente a equipa ${toDelete.team_name} (${toDelete.email}), incluindo a conta e todos os dados da corrida. Esta ação não pode ser anulada.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "A eliminar…" : "Eliminar equipa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
