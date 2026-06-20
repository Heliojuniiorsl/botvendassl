import { createFileRoute } from "@tanstack/react-router";

import { requireAdminSession } from "@/lib/auth.server";
import { getManagedBotToken } from "@/lib/bot-manager.server";
import { getImageBotMediaById } from "@/lib/image-bot-database.server";
import { fetchTelegramFileWithToken } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/admin/image-bot-media/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          requireAdminSession();
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const media = getImageBotMediaById(params.id);
        if (!media) return new Response("Not found", { status: 404 });

        const token = getManagedBotToken("images");
        if (!token) return new Response("Bot de imagens não configurado", { status: 503 });

        try {
          const file = await fetchTelegramFileWithToken(
            token,
            media.file_id,
            request.headers.get("range"),
          );
          const headers = new Headers({
            "Content-Type": file.headers.get("content-type") ?? "application/octet-stream",
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": file.headers.get("accept-ranges") ?? "bytes",
          });
          for (const name of ["content-length", "content-range"]) {
            const value = file.headers.get(name);
            if (value) headers.set(name, value);
          }
          return new Response(file.body, {
            status: file.status,
            headers: {
              ...Object.fromEntries(headers.entries()),
            },
          });
        } catch (error) {
          console.warn(`[image-bot-media-preview:${media.id}]`, error);
          return new Response("Preview unavailable", { status: 502 });
        }
      },
    },
  },
});
