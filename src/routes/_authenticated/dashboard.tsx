import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Gauge, Settings, Users, Clock } from "lucide-react";
import { KartIcon } from "@/components/race/KartIcon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveDashboard } from "@/components/race/LiveDashboard";
import { PlanPanel } from "@/components/race/PlanPanel";
import { DriversPanel } from "@/components/race/DriversPanel";
import { SettingsPanel } from "@/components/race/SettingsPanel";
import { KartsPanel } from "@/components/race/KartsPanel";
import { TeamHeader } from "@/components/race/TeamHeader";
import { RaceProvider } from "@/lib/race/store";
import { useProfile, useSession } from "@/hooks/use-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const title = "Dashboard da equipa — Team Manager 24H Karting";
const description = "Turnos, boxes, lastro e tempos em tempo real na área privada da tua equipa.";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useSession();
  const { data, isLoading } = useProfile(user?.id);
  const profile = data?.profile ?? null;
  const isAdmin = data?.isAdmin ?? false;
  const approved = profile?.status === "approved";

  return (
    <div className="min-h-screen bg-background pb-10">
      <TeamHeader
        teamName={profile?.team_name}
        isAdmin={isAdmin}
        kartsFeature={profile?.karts_feature ?? false}
        teamFeature={profile?.team_feature ?? true}
      />

      <main className="w-full px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : !approved ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                {profile?.status === "rejected" ? "Registo recusado" : "Registo à espera de aprovação"}
              </CardTitle>
              <CardDescription>
                {profile?.status === "rejected"
                  ? "O administrador não aprovou este registo. Fala com ele para saber mais."
                  : "Assim que o administrador aprovar a tua equipa, terás acesso ao dashboard completo."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Equipa: <span className="text-foreground">{profile?.team_name}</span>
              <br />
              Responsável: <span className="text-foreground">{profile?.contact_name}</span>
            </CardContent>
          </Card>
        ) : (
          <RaceProvider>
            <Tabs defaultValue="live">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="live" aria-label="Corrida">
                  <Gauge className="size-4" />
                  <span className="hidden sm:inline">Corrida</span>
                </TabsTrigger>
                <TabsTrigger value="plan" aria-label="Plano">
                  <CalendarClock className="size-4" />
                  <span className="hidden sm:inline">Plano</span>
                </TabsTrigger>
                <TabsTrigger value="drivers" aria-label="Pilotos">
                  <Users className="size-4" />
                  <span className="hidden sm:inline">Pilotos</span>
                </TabsTrigger>
                <TabsTrigger value="karts" aria-label="Karts">
                  <KartIcon className="size-4" />
                  <span className="hidden sm:inline">Karts</span>
                </TabsTrigger>
                <TabsTrigger value="settings" aria-label="Regras">
                  <Settings className="size-4" />
                  <span className="hidden sm:inline">Regras</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="live" className="mt-4">
                <LiveDashboard />
              </TabsContent>
              <TabsContent value="plan" className="mt-4">
                <PlanPanel />
              </TabsContent>
              <TabsContent value="drivers" className="mt-4">
                <DriversPanel />
              </TabsContent>
              <TabsContent value="karts" className="mt-4">
                <KartsPanel />
              </TabsContent>
              <TabsContent value="settings" className="mt-4">
                <SettingsPanel />
              </TabsContent>
            </Tabs>
          </RaceProvider>
        )}
      </main>
    </div>
  );
}
