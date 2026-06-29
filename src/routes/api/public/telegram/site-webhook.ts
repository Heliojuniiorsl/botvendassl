import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

import {
  getCriaBotToken,
  getCriaBotWebhookSecret,
  isDuplicateCriaBotUpdate,
  linkCriaBotUserByCode,
  sendCriaBotMessage,
} from "@/lib/site-bot.server";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export const Route = createFileRoute("/api/public/telegram/site-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = getCriaBotToken();
        if (!token) return new Response("CRIABOT_TOKEN nao configurado", { status: 503 });

        const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        const expectedSecret = getCriaBotWebhookSecret(token);
        if (!incomingSecret || !safeEqual(incomingSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 500_000) return new Response("Payload muito grande", { status: 413 });

        const update = await request.json();
        const updateId = Number(update.update_id);
        if (isDuplicateCriaBotUpdate(updateId)) {
          return Response.json({ ok: true, duplicate: true });
        }

        const message = update.message;
        const chatId = Number(message?.chat?.id);
        const chatType = String(message?.chat?.type ?? "");
        const text = String(message?.text ?? "");
        const user = message?.from;

        if (!message || chatType !== "private" || !Number.isFinite(chatId) || !user?.id) {
          return Response.json({ ok: true });
        }

        const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
        const code = startMatch?.[1]?.trim().split(/\s+/)[0] ?? "";

        if (!code) {
          await sendCriaBotMessage(
            chatId,
            "Abra este bot pelo botao dentro do painel CriaBot para vincular sua conta.",
          );
          return Response.json({ ok: true, linked: false });
        }

        const result = await linkCriaBotUserByCode({ code, chatId, user });
        if (!result.ok) {
          await sendCriaBotMessage(
            chatId,
            "Esse link expirou ou ja foi usado. Volte ao painel CriaBot e abra o bot oficial novamente.",
          );
          return Response.json({ ok: true, linked: false, reason: result.reason });
        }

        const linked = result.linked_user;
        const name =
          [linked?.first_name, linked?.last_name].filter(Boolean).join(" ").trim() ||
          linked?.username ||
          `ID ${linked?.telegram_user_id}`;

        await sendCriaBotMessage(
          chatId,
          `Conta vinculada com sucesso.\n\nUsuario: <b>${escapeHtml(name)}</b>\nID Telegram: <code>${linked?.telegram_user_id}</code>\n\nAgora volte ao Site CriaBot. Para continuar a criação do bot.`,
        );

        return Response.json({ ok: true, linked: true });
      },
    },
  },
});
