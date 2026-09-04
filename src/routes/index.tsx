import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Gauge, Settings, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { LiveDashboard } from "@/components/race/LiveDashboard";
import { PlanPanel } from "@/components/race/PlanPanel";
import { DriversPanel } from "@/components/race/DriversPanel";
import { SettingsPanel } from "@/components/race/SettingsPanel";
import { RaceProvider } from "@/lib/race/store";

const title = "Team Manager 24H Karting";
const description =
  "Gestão de equipa em corridas de resistência de karts: turnos, lastro e tempos de condução em tempo real.";

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
  component: Index,
});

function Index() {
  return (
    <RaceProvider>
      <div className="min-h-screen bg-background pb-10">
        <header className="border-b border-border bg-sidebar/80 px-4 py-3 backdrop-blur">
          <h1 className="font-display text-lg font-bold uppercase tracking-[0.12em]">
            Team Manager <span className="text-primary">24H</span>
          </h1>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-4">
          <Tabs defaultValue="live">
            <TabsList className="grid w-full grid-cols-4">
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
            <TabsContent value="settings" className="mt-4">
              <SettingsPanel />
            </TabsContent>
          </Tabs>
        </main>
        <Toaster />
      </div>
    </RaceProvider>
  );
}
