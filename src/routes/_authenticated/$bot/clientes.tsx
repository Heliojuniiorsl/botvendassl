import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Clock3, Eye, KeyRound, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getCustomerDetails,
  listCustomers,
  listPlans,
  manageCustomerAccess,
  updateCustomer,
} from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/$bot/clientes")({ component: Clientes });

const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function Clientes() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCustomers);
  const detailsFn = useServerFn(getCustomerDetails);
  const plansFn = useServerFn(listPlans);
  const updateFn = useServerFn(updateCustomer);
  const accessFn = useServerFn(manageCustomerAccess);
  const { data: customers } = useSuspenseQuery(
    queryOptions({ queryKey: ["customers"], queryFn: () => listFn() as Promise<any[]> }),
  );
  const { data: plans } = useSuspenseQuery(
    queryOptions({ queryKey: ["plans"], queryFn: () => plansFn() as Promise<any[]> }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [grantPlan, setGrantPlan] = useState("");
  const details = useQuery({
    queryKey: ["customer", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => detailsFn({ data: { id: selectedId! } }) as Promise<any>,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customer", selectedId] });
  }

  const update = useMutation({
    mutationFn: (data: any) => updateFn({ data }),
    onSuccess: () => {
      refresh();
      toast.success("Cliente atualizado");
    },
    onError: (error: any) => toast.error(error.message),
  });
  const access = useMutation({
    mutationFn: (data: any) => accessFn({ data }),
    onSuccess: () => {
      refresh();
      toast.success("Acesso atualizado");
    },
    onError: (error: any) => toast.error(error.message),
  });

  function openCustomer(customer: any) {
    setSelectedId(customer.id);
    setBlocked(Boolean(customer.is_blocked));
    setGrantPlan(plans[0]?.id ?? "");
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update.mutate({
      id: selectedId,
      email: String(form.get("email") || ""),
      notes: String(form.get("notes") || ""),
      tags: String(form.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      is_blocked: blocked,
    });
  }

  const now = Date.now();
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Clientes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        CRM, acessos, compras e atividade do bot.
      </p>
      <Card className="mt-8 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Etiquetas</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Compras</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!customers.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum cliente ainda.
                </TableCell>
              </TableRow>
            )}
            {customers.map((customer) => {
              const active =
                customer.subscription_status === "active" &&
                customer.end_date &&
                Date.parse(customer.end_date) > now;
              return (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="font-medium">{customer.name ?? "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer.telegram_username
                        ? `@${customer.telegram_username}`
                        : customer.telegram_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-52 flex-wrap gap-1">
                      {customer.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{customer.plan_name ?? "—"}</TableCell>
                  <TableCell>{fmtDate(customer.end_date)}</TableCell>
                  <TableCell>{customer.purchases}</TableCell>
                  <TableCell>
                    {customer.is_blocked ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : active ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Sem acesso</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openCustomer(customer)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ficha completa do cliente</DialogTitle>
          </DialogHeader>
          {details.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {details.data && (
            <Tabs defaultValue="profile">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="profile">Cadastro</TabsTrigger>
                <TabsTrigger value="access">Acessos</TabsTrigger>
                <TabsTrigger value="orders">Compras</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-5">
                <form
                  key={details.data.customer.updated_at}
                  className="space-y-4"
                  onSubmit={saveProfile}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <UserRound className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">
                            {details.data.customer.name ?? "Sem nome"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Telegram {details.data.customer.telegram_id}
                          </div>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-xs text-muted-foreground">Última atividade</div>
                      <div className="mt-1 font-medium">
                        {fmtDate(details.data.customer.last_interaction_at)}
                      </div>
                    </Card>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail para Pix</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={details.data.customer.email ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tags">Etiquetas</Label>
                      <Input
                        id="tags"
                        name="tags"
                        defaultValue={details.data.customer.tags.join(", ")}
                        placeholder="vip, renovação, interessado"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações internas</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      rows={5}
                      defaultValue={details.data.customer.notes ?? ""}
                    />
                  </div>
                  <Card className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">Bloquear cliente</div>
                      <div className="text-xs text-muted-foreground">
                        O bot deixa de responder e campanhas não são enviadas.
                      </div>
                    </div>
                    <Switch checked={blocked} onCheckedChange={setBlocked} />
                  </Card>
                  <Button type="submit" disabled={update.isPending}>
                    {blocked ? (
                      <Ban className="mr-2 h-4 w-4" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    Salvar cadastro
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="access" className="mt-5 space-y-5">
                <Card className="p-4">
                  <h3 className="font-medium">Liberar novo acesso</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <Select value={grantPlan} onValueChange={setGrantPlan}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o plano" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="grant-days"
                      type="number"
                      min="1"
                      defaultValue="30"
                      placeholder="Dias"
                    />
                    <Button
                      onClick={() =>
                        access.mutate({
                          user_id: selectedId,
                          action: "grant",
                          plan_id: grantPlan,
                          days: Number(
                            (document.getElementById("grant-days") as HTMLInputElement)?.value ||
                              30,
                          ),
                          auto_renew: false,
                        })
                      }
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Liberar
                    </Button>
                  </div>
                </Card>
                <div className="space-y-3">
                  {details.data.subscriptions.map((subscription: any) => (
                    <Card key={subscription.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {subscription.plan_name ?? "Plano removido"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(subscription.start_date)} até {fmtDate(subscription.end_date)}
                          </div>
                        </div>
                        <Badge
                          variant={
                            subscription.status === "active" &&
                            Date.parse(subscription.end_date) > now
                              ? "default"
                              : "secondary"
                          }
                        >
                          {subscription.status}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const days = Number(prompt("Quantos dias deseja acrescentar?", "30"));
                            if (days > 0)
                              access.mutate({
                                user_id: selectedId,
                                action: "extend",
                                subscription_id: subscription.id,
                                days,
                              });
                          }}
                        >
                          <Clock3 className="mr-2 h-4 w-4" />
                          Estender
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={subscription.status === "canceled"}
                          onClick={() =>
                            confirm("Cancelar este acesso?") &&
                            access.mutate({
                              user_id: selectedId,
                              action: "cancel",
                              subscription_id: subscription.id,
                            })
                          }
                        >
                          Cancelar
                        </Button>
                        <div className="ml-auto flex items-center gap-2 text-sm">
                          <Switch
                            checked={subscription.auto_renew}
                            onCheckedChange={(value) =>
                              access.mutate({
                                user_id: selectedId,
                                action: "set_auto_renew",
                                subscription_id: subscription.id,
                                auto_renew: value,
                              })
                            }
                          />
                          Renovação automática por Pix
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="orders" className="mt-5">
                <div className="space-y-3">
                  {!details.data.orders.length && (
                    <p className="text-sm text-muted-foreground">Nenhuma compra.</p>
                  )}
                  {details.data.orders.map((order: any) => (
                    <Card key={order.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">{order.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(order.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{brl(order.amount)}</div>
                        <Badge variant={order.status === "paid" ? "default" : "secondary"}>
                          {order.status}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="history" className="mt-5">
                <div className="space-y-3">
                  {!details.data.events.length && (
                    <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
                  )}
                  {details.data.events.map((event: any) => (
                    <div key={event.id} className="flex gap-3 border-b pb-3">
                      <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{event.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(event.created_at)} · {event.type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
