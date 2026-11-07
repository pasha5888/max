
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_URL =
  "https://new-bungee-git-probungee-recovery-todaymygoodday-ux.vercel.app/api/telegram/webhook";

function allowed() {
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PROBUNGEE — Telegram Setup</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:540px;margin:60px auto;padding:24px">
<h1>PROBUNGEE</h1>
<h2>Подключение Telegram</h2>
<p>Введите отдельный пароль настройки из Vercel.</p>
<form method="POST" action="/api/telegram/setup">
<input type="password" name="key" required
  autocomplete="off" placeholder="Пароль администратора"
  style="padding:14px;width:90%;margin-bottom:16px">
<button type="submit"
  style="background:#0879ca;color:white;border:0;border-radius:8px;padding:15px 25px;cursor:pointer">
Подключить Telegram
</button>
</form>
<p>${message}</p>
<p>Эта страница временная. После подключения её нужно удалить.</p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function sameSecret(input: string, expected: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET() {
  if (!allowed()) {
    return new NextResponse("Unavailable", { status: 404 });
  }

  return page();
}

export async function POST(request: NextRequest) {
  if (!allowed()) {
    return new NextResponse("Unavailable", { status: 404 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  try {
    if (!origin || !host ||
        new URL(origin).protocol !== "https:" ||
        new URL(origin).host !== host) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const form = await request.formData();
    const supplied = String(form.get("key") || "");
    const expected = process.env.TELEGRAM_SETUP_KEY || "";

    if (expected.length < 32 ||
        supplied.length > 256 ||
        !sameSecret(supplied, expected)) {
      return page("Неверный пароль настройки.");
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId ||
        !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
      return page("Настройки Telegram неполные или секрет имеет неверный формат.");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          secret_token: secret,
          allowed_updates: ["message"],
          drop_pending_updates: false
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      }
    );

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return page("Telegram отклонил подключение. Проверьте новый токен.");
    }

    return page(
      "✅ Webhook зарегистрирован. Теперь проверьте бота в Telegram."
    );
  } catch {
    return page("Ошибка соединения. Проверьте настройки и журнал Vercel.");
  }
}
