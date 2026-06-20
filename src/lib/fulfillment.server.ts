import {
  createChatJoinRequestInvite,
  editMessageCaption,
  editMessageText,
  revokeChatInviteLink,
  sendDocument,
  sendMessage,
  sendPhoto,
  sendVideo,
  type InlineKeyboard,
} from "./telegram.server";
import { sqlite, type localDb } from "./database.server";
import { randomUUID } from "node:crypto";

type AnyClient = typeof localDb;

async function resolvePrivateMedia(database: AnyClient, value: string) {
  if (!value.startsWith("private://")) return value;
  const path = value.slice("private://".length);
  const { data, error } = await database.storage.from("bot-media").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Falha ao gerar link temporário do conteúdo");
  return data.signedUrl;
}

export function isDeliverableMediaReference(value: string | null | undefined): value is string {
  if (!value) return false;
  return value.startsWith("private://") || /^https:\/\//i.test(value);
}

export function isTelegramAccessLink(value: string) {
  return /^https:\/\/(?:www\.)?t\.me\//i.test(value);
}

type PurchaseSection = "plans" | "offers" | "contents";

export function postPurchaseKeyboard(section: PurchaseSection, accessUrl?: string): InlineKeyboard {
  const keyboard: InlineKeyboard = [];
  if (accessUrl) keyboard.push([{ text: "🔓 Entrar no canal", url: accessUrl }]);
  keyboard.push([{ text: "🛍️ Comprar novamente", callback_data: `${section}_new` }]);
  keyboard.push([{ text: "🏠 Menu inicial", callback_data: "menu_new" }]);
  if (section !== "offers") keyboard.push([{ text: "Ver ofertas", callback_data: "offers_new" }]);
  return keyboard;
}

async function getSecureChannelInvite(input: {
  orderId: string;
  userId: string;
  telegramUserId: number;
  chatId: number;
  productName: string;
}) {
  const existing = sqlite
    .prepare(
      `SELECT invite_link, expires_at
       FROM telegram_access_grants
       WHERE order_id = ? AND chat_id = ? AND status = 'pending'`,
    )
    .get(input.orderId, input.chatId) as { invite_link: string; expires_at: string } | undefined;
  if (existing && Date.parse(existing.expires_at) > Date.now()) return existing.invite_link;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const invite = await createChatJoinRequestInvite(
    input.chatId,
    `Pedido ${input.orderId.slice(0, 8)}`,
    expiresAt,
  );
  try {
    sqlite
      .prepare(
        `INSERT INTO telegram_access_grants
          (id, order_id, user_id, telegram_user_id, chat_id, invite_link, product_name,
           status, expires_at, approved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)
         ON CONFLICT(order_id, chat_id) DO UPDATE SET
           telegram_user_id = excluded.telegram_user_id,
           invite_link = excluded.invite_link,
           product_name = excluded.product_name,
           status = 'pending',
           expires_at = excluded.expires_at,
           approved_at = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        input.orderId,
        input.userId,
        input.telegramUserId,
        input.chatId,
        invite.invite_link,
        input.productName,
        expiresAt.toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      );
  } catch (error) {
    await revokeChatInviteLink(input.chatId, invite.invite_link).catch(() => undefined);
    throw error;
  }
  return invite.invite_link;
}

export async function resendPurchasedContentAccess(
  database: AnyClient,
  input: { userId: string; contentId: string },
) {
  const purchase = sqlite
    .prepare(
      `SELECT o.id AS order_id, u.telegram_id, c.title, c.type, c.file_url, c.access_chat_id
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN contents c ON c.id = o.content_id
       WHERE o.user_id = ? AND o.content_id = ? AND o.status = 'paid'
       ORDER BY o.created_at DESC
       LIMIT 1`,
    )
    .get(input.userId, input.contentId) as
    | {
        order_id: string;
        telegram_id: number;
        title: string;
        type: "foto" | "video" | "pacote";
        file_url: string | null;
        access_chat_id: number | null;
      }
    | undefined;

  if (!purchase) throw new Error("Acesso comprado nao encontrado");

  if (purchase.access_chat_id) {
    const inviteLink = await getSecureChannelInvite({
      orderId: purchase.order_id,
      userId: input.userId,
      telegramUserId: purchase.telegram_id,
      chatId: purchase.access_chat_id,
      productName: purchase.title,
    });
    await sendMessage(
      purchase.telegram_id,
      `<b>Acesso reenviado</b>\n\nToque abaixo para solicitar entrada em <b>${purchase.title}</b>. O convite expira em 24 horas.`,
      postPurchaseKeyboard("contents", inviteLink),
    );
    return { ok: true, type: "channel" };
  }

  if (!isDeliverableMediaReference(purchase.file_url)) {
    throw new Error("Conteudo pago sem entrega valida");
  }

  if (isTelegramAccessLink(purchase.file_url)) {
    await sendMessage(
      purchase.telegram_id,
      `<b>Acesso reenviado</b>\n\nSeu acesso a <b>${purchase.title}</b> esta abaixo.`,
      postPurchaseKeyboard("contents", purchase.file_url),
    );
    return { ok: true, type: "link" };
  }

  const mediaUrl = await resolvePrivateMedia(database, purchase.file_url);
  const caption = `<b>Conteudo reenviado</b>\n\n<b>${purchase.title}</b>`;
  if (purchase.type === "video")
    await sendVideo(purchase.telegram_id, mediaUrl, caption, postPurchaseKeyboard("contents"));
  else if (purchase.type === "pacote")
    await sendDocument(purchase.telegram_id, mediaUrl, caption, postPurchaseKeyboard("contents"));
  else await sendPhoto(purchase.telegram_id, mediaUrl, caption, postPurchaseKeyboard("contents"));

  return { ok: true, type: "media" };
}

export async function resendPlanAccess(input: { userId: string; planId: string }) {
  const now = new Date().toISOString();
  const access = sqlite
    .prepare(
      `SELECT o.id AS order_id, u.telegram_id, p.name, p.access_chat_id
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       JOIN plans p ON p.id = s.plan_id
       JOIN orders o ON o.user_id = s.user_id AND o.status = 'paid'
       LEFT JOIN offers f ON f.id = o.offer_id
       WHERE s.user_id = ? AND s.plan_id = ? AND s.status = 'active' AND s.end_date > ?
         AND (
           o.plan_id = s.plan_id
           OR EXISTS (
             SELECT 1 FROM json_each(COALESCE(f.plan_ids, '[]'))
             WHERE json_each.value = s.plan_id
           )
         )
       ORDER BY o.created_at DESC
       LIMIT 1`,
    )
    .get(input.userId, input.planId, now) as
    | {
        order_id: string;
        telegram_id: number;
        name: string;
        access_chat_id: number | null;
      }
    | undefined;
  if (!access) throw new Error("Plano ativo nao encontrado");
  if (!access.access_chat_id) throw new Error("Grupo VIP nao configurado neste plano");

  const inviteLink = await getSecureChannelInvite({
    orderId: access.order_id,
    userId: input.userId,
    telegramUserId: access.telegram_id,
    chatId: access.access_chat_id,
    productName: access.name,
  });
  await sendMessage(
    access.telegram_id,
    `<b>Novo convite para ${access.name}</b>\n\nUse o link individual abaixo com esta mesma conta. O convite expira em 24 horas.`,
    postPurchaseKeyboard("plans", inviteLink),
  );
  return { ok: true };
}

export async function fulfillOrder(
  database: AnyClient,
  input: {
    orderId: string;
    providerPaymentId: string;
    providerStatus: string;
    paidAt: string | null;
    amount: number;
  },
) {
  const { error: confirmError } = await database.rpc("confirm_mercado_pago_payment", {
    p_order_id: input.orderId,
    p_provider_payment_id: input.providerPaymentId,
    p_provider_status: input.providerStatus,
    p_paid_at: input.paidAt,
    p_amount: input.amount,
  });
  if (confirmError) throw new Error(confirmError.message);

  const { data: claimed, error: claimError } = await database.rpc("claim_order_delivery", {
    p_order_id: input.orderId,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { alreadyDelivered: true };

  try {
    const { data: order, error: orderError } = await database
      .from("orders")
      .select(
        "id, user_id, plan_id, content_id, offer_id, users(telegram_id), plans(name, access_chat_id), contents(title, type, file_url, access_chat_id), offers(name, plan_ids, content_ids)",
      )
      .eq("id", input.orderId)
      .single();
    if (orderError || !order) throw new Error("Pedido não encontrado após confirmação");

    const customer = order.users as unknown as { telegram_id: number } | null;
    if (!customer?.telegram_id) throw new Error("Cliente sem Telegram vinculado");
    const purchaseSection: PurchaseSection = order.offer_id
      ? "offers"
      : order.plan_id
        ? "plans"
        : "contents";

    const deliverContent = async (
      content: {
        title: string;
        type: "foto" | "video" | "pacote";
        file_url: string | null;
        access_chat_id: number | null;
      },
      includeNavigation = true,
    ) => {
      if (content.access_chat_id) {
        const inviteLink = await getSecureChannelInvite({
          orderId: order.id,
          userId: order.user_id,
          telegramUserId: customer.telegram_id,
          chatId: content.access_chat_id,
          productName: content.title,
        });
        await sendMessage(
          customer.telegram_id,
          `✅ <b>Pagamento confirmado!</b>\n\nSeu acesso a <b>${content.title}</b> foi liberado. Toque abaixo e solicite a entrada com esta mesma conta do Telegram. O convite expira em 24 horas.`,
          includeNavigation
            ? postPurchaseKeyboard(purchaseSection, inviteLink)
            : [[{ text: "🔓 Solicitar entrada", url: inviteLink }]],
        );
        return;
      }
      if (!isDeliverableMediaReference(content.file_url)) {
        throw new Error("Conteudo pago sem arquivo de entrega valido");
      }
      if (isTelegramAccessLink(content.file_url)) {
        throw new Error(`Configure o ID do canal no conteudo ${content.title}`);
      }
      const mediaUrl = await resolvePrivateMedia(database, content.file_url);
      const caption = `✅ <b>Pagamento confirmado!</b>\n\nSeu conteúdo: <b>${content.title}</b>`;
      const keyboard = includeNavigation ? postPurchaseKeyboard(purchaseSection) : undefined;
      if (content.type === "video")
        await sendVideo(customer.telegram_id, mediaUrl, caption, keyboard);
      else if (content.type === "pacote")
        await sendDocument(customer.telegram_id, mediaUrl, caption, keyboard);
      else await sendPhoto(customer.telegram_id, mediaUrl, caption, keyboard);
    };

    const deliveredPlanChats = new Set<string>();
    const deliverPlanAccess = async (plan: {
      name: string;
      access_chat_id: number | string | null;
    }) => {
      if (!plan.access_chat_id) {
        throw new Error(`Configure o ID do grupo VIP no plano ${plan.name}`);
      }
      const chatKey = String(plan.access_chat_id);
      if (deliveredPlanChats.has(chatKey)) return;
      deliveredPlanChats.add(chatKey);
      const inviteLink = await getSecureChannelInvite({
        orderId: order.id,
        userId: order.user_id,
        telegramUserId: customer.telegram_id,
        chatId: Number(plan.access_chat_id),
        productName: plan.name,
      });
      await sendMessage(
        customer.telegram_id,
        `✅ <b>Pagamento confirmado!</b>\n\nSeu acesso a <b>${plan.name}</b> foi liberado. Use o convite individual abaixo com esta mesma conta do Telegram. O link expira em 24 horas.`,
        postPurchaseKeyboard(purchaseSection, inviteLink),
      );
    };

    if (order.plan_id) {
      const plan = order.plans as unknown as {
        name: string;
        access_chat_id: number | string | null;
      } | null;
      if (!plan) throw new Error("Plano pago nao encontrado");
      await deliverPlanAccess(plan);
    }

    if (order.content_id) {
      const content = order.contents as unknown as {
        title: string;
        type: "foto" | "video" | "pacote";
        file_url: string | null;
        access_chat_id: number | null;
      } | null;
      if (!content) throw new Error("Conteudo pago nao encontrado");
      await deliverContent(content);
    }

    if (order.offer_id) {
      const offer = order.offers as unknown as {
        name: string;
        plan_ids: string[];
        content_ids: string[];
      } | null;
      if (!offer) throw new Error("Oferta paga nao encontrada");
      for (const planId of offer.plan_ids) {
        const { data: plan } = await database
          .from("plans")
          .select("name, access_chat_id")
          .eq("id", planId)
          .single();
        if (plan) {
          await deliverPlanAccess(plan as { name: string; access_chat_id: number | string | null });
        }
      }
      await sendMessage(
        customer.telegram_id,
        `🎁 <b>Combo liberado:</b> ${offer.name}`,
        postPurchaseKeyboard("offers"),
      );
    }

    const { error: deliveryError } = await database
      .from("orders")
      .update({ delivery_sent_at: new Date().toISOString(), delivery_claimed_at: null })
      .eq("id", input.orderId);
    if (deliveryError) throw new Error(deliveryError.message);
    const payment = sqlite
      .prepare(
        `SELECT telegram_chat_id, telegram_message_id, telegram_message_type
         FROM payments WHERE order_id = ?`,
      )
      .get(input.orderId) as
      | {
          telegram_chat_id: number | null;
          telegram_message_id: number | null;
          telegram_message_type: string | null;
        }
      | undefined;
    if (payment?.telegram_chat_id && payment.telegram_message_id) {
      const confirmation =
        "✅ <b>Pagamento confirmado!</b>\n\nSeu acesso foi enviado em uma nova mensagem.";
      try {
        if (payment.telegram_message_type === "photo") {
          await editMessageCaption(
            payment.telegram_chat_id,
            payment.telegram_message_id,
            confirmation,
          );
        } else {
          await editMessageText(
            payment.telegram_chat_id,
            payment.telegram_message_id,
            confirmation,
          );
        }
      } catch (error) {
        console.error("[pix-message-update]", error);
      }
    }
    return { ok: true };
  } catch (error) {
    await database.from("orders").update({ delivery_claimed_at: null }).eq("id", input.orderId);
    throw error;
  }
}
