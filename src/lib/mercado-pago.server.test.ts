import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPixPayment, validateMercadoPagoSignature } from "./mercado-pago.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createPixPayment", () => {
  it("retorna QR Code e envia a referencia do pedido", async () => {
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "TEST-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          status: "pending",
          point_of_interaction: {
            transaction_data: {
              qr_code: "000201-pix-copia-e-cola",
              qr_code_base64: "cG5n",
              ticket_url: "https://mercadopago.test/pix/123",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pix = await createPixPayment({
      orderId: "11111111-1111-4111-8111-111111111111",
      title: "Plano mensal",
      amount: 29.9,
      payerEmail: "cliente@example.com",
      publicBaseUrl: "https://example.com",
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(pix.qrCode).toBe("000201-pix-copia-e-cola");
    expect(pix.qrCodeBase64).toBe("cG5n");
    expect(request.payment_method_id).toBe("pix");
    expect(request.external_reference).toBe("11111111-1111-4111-8111-111111111111");
    const expiresInMs = Date.parse(request.date_of_expiration) - Date.now();
    expect(expiresInMs).toBeGreaterThanOrEqual(14 * 60_000);
    expect(expiresInMs).toBeLessThanOrEqual(16 * 60_000);
  });
});

describe("validateMercadoPagoSignature", () => {
  it("accepts an authentic, recent notification", () => {
    const secret = "webhook-secret";
    const dataId = "123456";
    const requestId = "request-abc";
    const now = Date.now();
    const ts = String(now);
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const signature = createHmac("sha256", secret).update(manifest).digest("hex");

    expect(
      validateMercadoPagoSignature({
        dataId,
        requestId,
        signature: `ts=${ts},v1=${signature}`,
        secret,
        now,
      }),
    ).toBe(true);
  });

  it("rejects stale or modified notifications", () => {
    const now = Date.now();
    expect(
      validateMercadoPagoSignature({
        dataId: "123",
        requestId: "request",
        signature: `ts=${now - 11 * 60_000},v1=invalid`,
        secret: "secret",
        now,
      }),
    ).toBe(false);
  });
});
