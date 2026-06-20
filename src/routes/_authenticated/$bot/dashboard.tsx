import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getImageBotDashboard } from "@/lib/api/admin.functions";
import { Card } from "@/components/ui/card";
import { PanelSubnav } from "@/components/PanelSubnav";
import { useManagedBotPanel } from "@/lib/managed-bot-context";
import { useState } from "react";
import {
  TrendingUp,
  CalendarDays,
  Users,
  AlertTriangle,
  Clock,
  Images,
  Image as ImageIcon,
  Video,
} from "lucide-react";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const Route = createFileRoute("/_authenticated/$bot/dashboard")({
  component: Dashboard,
});

type ImageDashboardSection = "overview" | "categories";

const imageDashboardSections: { value: ImageDashboardSection; label: string }[] = [
  { value: "overview", label: "Resumo" },
  { value: "categories", label: "Categorias" },
];

function Dashboard() {
  const bot = useManagedBotPanel();
  return bot.kind === "images" ? <ImageBotDashboard /> : <SalesDashboard />;
}

function SalesDashboard() {
  const fn = useServerFn(getDashboard);
  const { data } = useSuspenseQuery(queryOptions({ queryKey: ["dashboard"], queryFn: () => fn() }));

  const cards = [
    { label: "Vendas do dia", value: brl(data.salesToday), icon: TrendingUp },
    { label: "Vendas do mês", value: brl(data.salesMonth), icon: CalendarDays },
    { label: "Assinantes ativos", value: String(data.activeSubscribers), icon: Users },
    {
      label: "Assinaturas vencidas",
      value: String(data.expiredSubscriptions),
      icon: AlertTriangle,
    },
    { label: "Pagamentos pendentes", value: String(data.pendingPayments), icon: Clock },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Resumo do seu negócio.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 font-display text-3xl font-semibold">{c.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ImageBotDashboard() {
  const bot = useManagedBotPanel();
  const getDashboardFn = useServerFn(getImageBotDashboard);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["image-bot-dashboard"],
      queryFn: () =>
        getDashboardFn() as Promise<{
          total: number;
          photos: number;
          videos: number;
          hetero: { total: number; photos: number; videos: number };
          trans: { total: number; photos: number; videos: number };
        }>,
      refetchInterval: 10_000,
    }),
  );
  const [activeSection, setActiveSection] = useState<ImageDashboardSection>("overview");

  const cards = [
    { label: "Mídias salvas", value: data.total, icon: Images },
    { label: "Fotos", value: data.photos, icon: ImageIcon },
    { label: "Vídeos", value: data.videos, icon: Video },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{bot.display_name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Biblioteca de file IDs do Telegram, armazenada em um banco independente.
      </p>

      <PanelSubnav
        className="mt-6"
        items={imageDashboardSections}
        active={activeSection}
        onChange={setActiveSection}
      />

      <div
        className={
          activeSection !== "overview" ? "panel-section-hidden" : "mt-6 grid gap-4 sm:grid-cols-3"
        }
      >
        {cards.map((card) => (
          <Card key={card.label} className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 font-display text-3xl font-semibold">{card.value}</div>
          </Card>
        ))}
      </div>

      <div
        className={
          activeSection !== "categories" ? "panel-section-hidden" : "mt-6 grid gap-4 md:grid-cols-2"
        }
      >
        {[
          { label: "Hétero", stats: data.hetero },
          { label: "Trans", stats: data.trans },
        ].map((category) => (
          <Card key={category.label} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Categoria</div>
                <h2 className="mt-1 font-display text-2xl font-semibold">{category.label}</h2>
              </div>
              <div className="rounded-full bg-primary/10 px-4 py-2 text-xl font-semibold text-primary">
                {category.stats.total}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" /> Fotos
                </div>
                <div className="mt-2 text-2xl font-semibold">{category.stats.photos}</div>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Video className="h-4 w-4" /> Vídeos
                </div>
                <div className="mt-2 text-2xl font-semibold">{category.stats.videos}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
