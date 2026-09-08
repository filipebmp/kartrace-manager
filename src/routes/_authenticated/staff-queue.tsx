import { createFileRoute } from "@tanstack/react-router";
import { TeamHeader } from "@/components/race/TeamHeader";
import { StaffQueuePanel } from "@/components/race/StaffQueuePanel";
import { useProfile, useSession } from "@/hooks/use-session";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const title = "Gestão de karts — Team Manager 24H Karting";
const description =
  "Sorteio de karts entre equipas: fila de espera, Vermelha e Azul, em tempo real.";

export const Route = createFileRoute("/_authenticated/staff-queue")({
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
  component: StaffQueuePage,
});

function StaffQueuePage() {
  const { user } = useSession();
  const { data } = useProfile(user?.id);
  const isAdmin = data?.isAdmin ?? false;
  const kartsFeature = data?.profile?.karts_feature ?? false;

  return (
    <div className="min-h-screen bg-background pb-10">
      <TeamHeader
        teamName={data?.profile?.team_name}
        isAdmin={isAdmin}
        kartsFeature={kartsFeature}
      />
      <main className="w-full space-y-3 px-4 py-4">
        {!isAdmin && !kartsFeature ? (
          <Card>
            <CardHeader>
              <CardTitle>Sem acesso</CardTitle>
              <CardDescription>
                A gestão do sorteio de karts é só para o staff do evento.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <StaffQueuePanel />
        )}
      </main>
    </div>
  );
}
