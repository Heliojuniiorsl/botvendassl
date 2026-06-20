import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let database: typeof import("./image-bot-database.server");
let payments: typeof import("./image-bot-payments.server");
let testDirectory: string;

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "upmidias-payments-"));
  vi.stubEnv("IMAGE_BOT_DATABASE_PATH", join(testDirectory, "upmidias.sqlite"));
  vi.stubEnv("PUBLIC_BASE_URL", "https://example.com");
  vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "TEST-token");
  vi.resetModules();
  database = await import("./image-bot-database.server");
  payments = await import("./image-bot-payments.server");

  database.upsertImageBotUser({
    telegramUserId: 45001,
    firstName: "Cliente",
    started: true,
  });
  const settings = database.getImageBotSettings();
  database.updateImageBotSettings({
    id: settings.id,
    limit_upgrade_enabled: true,
    limit_upgrade_price: 5,
    limit_upgrade_bonus_count: 25,
    limit_upgrade_access_type: "days",
    limit_upgrade_access_days: 7,
  });
});

afterAll(() => {
  database.imageBotSqlite.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("pagamento de limite do UpMidias", () => {
  it("reutiliza o mesmo Pix durante os 15 minutos de validade", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9001,
          status: "pending",
          point_of_interaction: {
            transaction_data: {
              qr_code: "000201-pix-limite",
              qr_code_base64: "cG5n",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await payments.createImageBotLimitBoostPixOrder({
      telegramUserId: 45001,
      payerName: "Cliente Teste",
    });
    const second = await payments.createImageBotLimitBoostPixOrder({
      telegramUserId: 45001,
      payerName: "Cliente Teste",
    });

    expect(second.reused).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.order.bonus_count).toBe(25);
    expect(first.order.access_type).toBe("days");
    expect(first.order.access_days).toBe(7);
    const validityMs = Date.parse(first.order.expires_at!) - Date.now();
    expect(validityMs).toBeGreaterThanOrEqual(14 * 60_000);
    expect(validityMs).toBeLessThanOrEqual(16 * 60_000);
  });

  it("libera o beneficio uma unica vez mesmo com webhook repetido", async () => {
    const order = database.imageBotSqlite
      .prepare("SELECT * FROM limit_payment_orders WHERE telegram_user_id = ? LIMIT 1")
      .get(45001) as { id: string; amount: number };

    await payments.fulfillImageBotLimitBoostPayment({
      token: null,
      orderId: order.id,
      providerPaymentId: "9001",
      providerStatus: "accredited",
      paidAt: new Date().toISOString(),
      amount: order.amount,
    });
    const duplicate = await payments.fulfillImageBotLimitBoostPayment({
      token: null,
      orderId: order.id,
      providerPaymentId: "9001",
      providerStatus: "accredited",
      paidAt: new Date().toISOString(),
      amount: order.amount,
    });

    const boosts = database.imageBotSqlite
      .prepare("SELECT COUNT(*) AS total FROM daily_limit_boosts WHERE order_id = ?")
      .get(order.id) as { total: number };
    expect(boosts.total).toBe(1);
    expect(duplicate).toMatchObject({ alreadyPaid: true, bonusCount: 25 });

    const user = database.getImageBotUsers().find((item) => item.telegram_user_id === 45001);
    expect(user).toMatchObject({
      is_premium: true,
      active_limit_boost_count: 1,
      payment_count: 1,
      total_paid: 5,
    });
    expect(database.getImageBotPaymentHistory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: order.id,
          telegram_user_id: 45001,
          product_type: "limit_upgrade",
          status: "paid",
          bonus_count: 25,
        }),
      ]),
    );
  });

  it("cria um Pix Premium reutilizavel e libera o plano apos o pagamento", async () => {
    const plan = database.saveImageBotPremiumPlan({
      name: "Premium teste",
      description: "Plano usado no teste",
      price: 9.9,
      accessType: "days",
      accessDays: 30,
      isActive: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9100,
          status: "pending",
          point_of_interaction: {
            transaction_data: {
              qr_code: "000201-pix-premium",
              qr_code_base64: "cG5n",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await payments.createImageBotPremiumPixOrder({
      telegramUserId: 45001,
      planId: plan.id,
      payerName: "Cliente Teste",
    });
    const second = await payments.createImageBotPremiumPixOrder({
      telegramUserId: 45001,
      planId: plan.id,
      payerName: "Cliente Teste",
    });

    expect(second.reused).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await payments.fulfillImageBotPremiumPayment({
      token: null,
      orderId: first.order.id,
      providerPaymentId: "9100",
      providerStatus: "accredited",
      paidAt: new Date().toISOString(),
      amount: 9.9,
    });

    expect(database.hasActiveImageBotPremiumAccess(45001)).toBe(true);
    expect(database.getImageBotPaymentHistory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.order.id,
          product_type: "premium_plan",
          plan_name: "Premium teste",
          status: "paid",
        }),
      ]),
    );
  });
});
