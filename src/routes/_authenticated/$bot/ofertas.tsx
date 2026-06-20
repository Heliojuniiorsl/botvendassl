import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteOffer, listOffers, listPlans, saveOffer } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/$bot/ofertas")({ component: Ofertas });

type Offer = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  starts_at: string | null;
  ends_at: string | null;
  plan_ids: string[];
  content_ids: string[];
  is_active: boolean;
};

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const inputDate = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

function Ofertas() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOffers);
  const plansFn = useServerFn(listPlans);
  const saveFn = useServerFn(saveOffer);
  const deleteFn = useServerFn(deleteOffer);
  const { data: offers } = useSuspenseQuery(
    queryOptions({ queryKey: ["offers"], queryFn: () => listFn() as Promise<Offer[]> }),
  );
  const { data: plans } = useSuspenseQuery(
    queryOptions({ queryKey: ["plans"], queryFn: () => plansFn() as Promise<any[]> }),
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [planIds, setPlanIds] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: (data: any) => saveFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      setOpen(false);
      toast.success("Oferta salva");
    },
    onError: (error: any) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offers"] }),
    onError: (error: any) => toast.error(error.message),
  });

  function openOffer(offer: Offer | null) {
    setEditing(offer);
    setPlanIds(offer?.plan_ids ?? []);
    setOpen(true);
  }

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const starts = String(form.get("starts_at") || "");
    const ends = String(form.get("ends_at") || "");
    save.mutate({
      id: editing?.id,
      name: String(form.get("name")),
      description: String(form.get("description") || ""),
      price: Number(form.get("price")),
      starts_at: starts ? new Date(starts).toISOString() : null,
      ends_at: ends ? new Date(ends).toISOString() : null,
      plan_ids: planIds,
      content_ids: [],
      is_active: form.get("is_active") === "on",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Ofertas e combos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrupe planos com preço e prazo próprios.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openOffer(null)}>
              <Plus className="mr-2 h-4 w-4" /> Nova oferta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar oferta" : "Nova oferta"}</DialogTitle>
            </DialogHeader>
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" required defaultValue={editing?.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editing?.description ?? ""}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$)</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    defaultValue={editing?.price}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="starts_at">Início</Label>
                  <Input
                    id="starts_at"
                    name="starts_at"
                    type="datetime-local"
                    defaultValue={inputDate(editing?.starts_at)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ends_at">Fim</Label>
                  <Input
                    id="ends_at"
                    name="ends_at"
                    type="datetime-local"
                    defaultValue={inputDate(editing?.ends_at)}
                  />
                </div>
              </div>
              <Card className="space-y-3 p-4">
                <Label>Planos incluídos</Label>
                {plans.map((plan) => (
                  <label key={plan.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={planIds.includes(plan.id)}
                      onCheckedChange={() => toggle(planIds, plan.id, setPlanIds)}
                    />
                    {plan.name}
                  </label>
                ))}
              </Card>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  name="is_active"
                  defaultChecked={editing ? editing.is_active : true}
                />
                <Label htmlFor="is_active">Oferta ativa</Label>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-8 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oferta</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!offers.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma oferta cadastrada.
                </TableCell>
              </TableRow>
            )}
            {offers.map((offer) => {
              const expired = Boolean(offer.ends_at && Date.parse(offer.ends_at) < Date.now());
              return (
                <TableRow key={offer.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-primary" />
                      {offer.name}
                    </span>
                  </TableCell>
                  <TableCell>{offer.plan_ids.length}</TableCell>
                  <TableCell>{brl(offer.price)}</TableCell>
                  <TableCell>
                    {offer.ends_at
                      ? `até ${new Date(offer.ends_at).toLocaleString("pt-BR")}`
                      : "Sem prazo"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={offer.is_active && !expired ? "default" : "secondary"}>
                      {expired ? "Encerrada" : offer.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openOffer(offer)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirm("Excluir oferta?") && remove.mutate(offer.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
