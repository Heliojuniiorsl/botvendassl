import { getManagedBotToken } from "@/lib/bot-manager.server";
import {
  getDueImageBotPremiumExpiryReminders,
  getImageBotPremiumPlans,
  getImageBotSettings,
  markImageBotPremiumExpiryReminderSent,
  releaseImageBotPremiumExpiryReminder,
} from "@/lib/image-bot-database.server";
import { sendMessageWithToken } from "@/lib/telegram.server";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderReminderText(
  template: string,
  values: Record<"nome" | "plano" | "dias" | "data", string>,
) {
  const rendered = Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    template,
  );
  return escapeHtml(rendered);
}

export async function runImageBotPremiumExpiryReminders(now = new Date()) {
  const token = getManagedBotToken("images");
  if (!token) return { processed: 0, sent: 0, failed: 0 };

  const settings = getImageBotSettings();
  const reminders = getDueImageBotPremiumExpiryReminders(now);
  const plans = getImageBotPremiumPlans({ activeOnly: true });
  const keyboard = plans.map((plan) => [
    {
      text: plan.name.slice(0, 64),
      callback_data: `ipremium:plan:${plan.id}`,
    },
  ]);
  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    if (!markImageBotPremiumExpiryReminderSent(reminder, now)) continue;
    const expiresAt = new Date(reminder.expires_at);
    const daysRemaining = Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000),
    );
    const text = renderReminderText(settings.premium_expiry_warning_message, {
      nome: reminder.first_name?.trim() || "cliente",
      plano: reminder.plan_name,
      dias: String(daysRemaining),
      data: new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(expiresAt),
    });

    try {
      await sendMessageWithToken(
        token,
        reminder.telegram_user_id,
        text,
        keyboard.length ? keyboard : undefined,
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      releaseImageBotPremiumExpiryReminder(reminder);
      console.warn("[image-premium-expiry-reminder]", reminder.telegram_user_id, error);
    }
  }

  return { processed: reminders.length, sent, failed };
}
