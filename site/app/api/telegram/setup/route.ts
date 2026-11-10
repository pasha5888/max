
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_URL =
  "https://new-bungee-git-probungee-recovery-todaymygoodday-ux.vercel.app/api/telegram/webhook";

function isPreview() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "probungee-recovery"
  );
}

function page(message = "") {
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PROBUNGEE — Telegram Setup</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:540px;margin:60px auto;padding:24px">
<h1>PROBUNGEE</h1>
<h2>Подключение Telegram</h2>
<p>Введите пароль администратора из Vercel.</p>
<form method="POST" action="/api/telegram/setup">
<input type="password" name="key" required
 autocomplete="off"
 placeholder="Пароль администратора"
 style="padding:14px;width:90%;margin-bottom:16px">
<button type="submit"
 style="background:#0879ca;color:white;border:0;border-radius:8px;padding:15px 25px;cursor:pointer">
Подключить Telegram
</button>
</form>
<p>${message}</p>
<p>Временная страница настройки.</p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

function equalSecret(input: string, expected: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}

export async function GET() {
  if (!isPreview()) {
    return new NextResponse("Unavailable", { status: 404 });
  }

  return page();
}

export async function POST(request: NextRequest) {
  if (!isPreview()) {
    return new NextResponse("Unavailable", { status: 404 });
  }

  try {
    const form = await request.formData();

    const supplied = String(form.get("key") || "");
    const expected = process.env.TELEGRAM_SETUP_KEY || "";

    if (
      expected.length < 32 ||
      supplied.length > 256 ||
      !equalSecret(supplied, expected)
    ) {
      return page("Неверный пароль администратора.");
    }

    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return page("Неверный формат токена Telegram.");
    }

    if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
      return page("Неверный формат секрета Telegram.");
    }

    if (!bypass) {
      return page(
        "Ключ Vercel Bypass недоступен. Требуется новое Preview-развёртывание."
      );
    }

    // Создаём адрес webhook с доступом через Vercel Protection.
    const webhookUrl = new URL(WEBHOOK_URL);
    webhookUrl.searchParams.set(
      "x-vercel-protection-bypass",
      bypass
    );

    const response = await fetch(
      "https://api.telegram.org/bot" + token + "/setWebhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: webhookUrl.toString(),
          secret_token: secret,
allowed_updates: ["message", "callback_query"],
          drop_pending_updates: false
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      }
    );

    const result: {
      ok?: boolean;
      error_code?: number;
    } = await response.json();

    if (!response.ok || result.ok !== true) {
      console.error(
        "Telegram webhook rejected:",
        result.error_code || response.status
      );

      return page(
        "Telegram отклонил запрос. Код: " +
        String(result.error_code || response.status)
      );
    }

    console.info("PROBUNGEE webhook registered with Vercel bypass");

    return page(
      "✅ Telegram подключён! Webhook зарегистрирован с Vercel Bypass. Отправьте /start боту @Probungee_bot."
    );

  } catch (error) {
    console.error(
      "Telegram setup failed:",
      error instanceof Error ? error.name : "Unknown"
    );

    return page(
      "Ошибка подключения. Проверьте Vercel Logs."
    );
  }
}
