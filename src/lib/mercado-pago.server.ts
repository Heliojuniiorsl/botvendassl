import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.mercadopago.com";

function getAccessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
  return token;
}

async function mercadoPagoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(`Mercado Pago: ${payload.message ?? `HTTP ${response.status}`}`);
  }
  return payload;
}

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

export async function createPixPayment(input: {
  orderId: string;
  externalReference?: string;
  title: string;
  amount: number;
  payerEmail: string;
  payerName?: string | null;
  publicBaseUrl: string;
  expirationMinutes?: number;
}) {
  const baseUrl = input.publicBaseUrl.replace(/\/$/, "");
  const expirationMinutes = Math.min(Math.max(input.expirationMinutes ?? 15, 5), 24 * 60);
  const result = await mercadoPagoFetch<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.orderId },
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.title.slice(0, 120),
      payment_method_id: "pix",
      external_reference: input.externalReference ?? input.orderId,
      notification_url: `${baseUrl}/api/public/payments/webhook?source_news=webhooks`,
      date_of_expiration: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
      payer: {
        email: input.payerEmail,
        first_name: (input.payerName || "Cliente").slice(0, 60),
      },
    }),
  });
  const transaction = result.point_of_interaction?.transaction_data;
  if (!transaction?.qr_code) throw new Error("Mercado Pago nao retornou o codigo Pix");
  return {
    paymentId: String(result.id),
    status: result.status,
    qrCode: transaction.qr_code,
    qrCodeBase64: transaction.qr_code_base64 ?? "",
    ticketUrl: transaction.ticket_url ?? "",
  };
}

export async function createPaymentPreference(input: {
  orderId: string;
  title: string;
  description?: string | null;
  amount: number;
  publicBaseUrl: string;
}) {
  const baseUrl = input.publicBaseUrl.replace(/\/$/, "");
  const result = await mercadoPagoFetch<{
    id: string;
    init_point: string;
    sandbox_init_point: string;
  }>("/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.orderId },
    body: JSON.stringify({
      items: [
        {
          id: input.orderId,
          title: input.title.slice(0, 120),
          description: input.description?.slice(0, 250),
          currency_id: "BRL",
          quantity: 1,
          unit_price: Number(input.amount.toFixed(2)),
        },
      ],
      external_reference: input.orderId,
      notification_url: `${baseUrl}/api/public/payments/webhook?source_news=webhooks`,
      back_urls: {
        success: `${baseUrl}/pagamento?status=success`,
        pending: `${baseUrl}/pagamento?status=pending`,
        failure: `${baseUrl}/pagamento?status=failure`,
      },
      auto_return: "approved",
    }),
  });

  return {
    preferenceId: result.id,
    paymentUrl: getAccessToken().startsWith("TEST-")
      ? result.sandbox_init_point
      : result.init_point,
  };
}

export function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoFetch<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

export function validateMercadoPagoSignature(input: {
  dataId: string;
  requestId: string;
  signature: string;
  secret: string;
  now?: number;
}) {
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  const timestamp = Number(ts);
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs((input.now ?? Date.now()) - timestampMs) > 10 * 60_000
  ) {
    return false;
  }

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
