
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TgMessage = {
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
};

type TgUpdate = {
  message?: TgMessage;
  update_id?: number;
};

const isRecoveryPreview = () =>
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "probungee-recovery";

async function telegram(method: string, data: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing Telegram token");

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error("Telegram API request failed");
  }

  return result;
}

export async function GET() {
  return NextResponse.json({
    ready:
      isRecoveryPreview() &&
      Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
      Boolean(process.env.TELEGRAM_CHAT_ID) &&
      Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    mode: "preview",
  });
}

export async function POST(request: NextRequest) {
  if (!isRecoveryPreview()) {
    return new NextResponse("Unavailable", { status: 503 });
  }

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );

  if (!expected || received !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const adminId = process.env.TELEGRAM_CHAT_ID;
  if (!adminId || !process.env.TELEGRAM_BOT_TOKEN) {
    return new NextResponse("Not configured", { status: 503 });
  }

  let update: TgUpdate;

  try {
    update = await request.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const message = update.message;
  if (!message || message.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const text = message.text?.trim() || "";

  try {
    // Команды владельца.
    if (chatId === adminId) {
      if (text.startsWith("/reply ")) {
        const match = text.match(/^\/reply\s+(\d+)\s+([\s\S]+)$/);

        if (!match) {
          await telegram("sendMessage", {
            chat_id: adminId,
            text: "Формат: /reply ID_клиента текст ответа",
          });
          return NextResponse.json({ ok: true });
        }

        const targetId = match[1];
        const replyText = match[2].trim();

        if (targetId === adminId || !replyText) {
          return NextResponse.json({ ok: true });
        }

        await telegram("sendMessage", {
          chat_id: targetId,
          text: replyText.slice(0, 4096),
        });

        await telegram("sendMessage", {
          chat_id: adminId,
          text: "Ответ клиенту отправлен.",
        });
      } else if (text === "/start") {
        await telegram("sendMessage", {
          chat_id: adminId,
          text: "PROBUNGEE: панель владельца активна.",
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Сообщения от клиентов.
    if (text === "/start") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "Здравствуйте! Вас приветствует PROBUNGEE.\n" +
          "Мы производим оборудование для банджи-фитнеса " +
          "и обучаем тренеров.\n\n" +
          "Напишите ваш вопрос. Мы ответим вам здесь.",
      });

      return NextResponse.json({ ok: true });
    }

    const name = message.from?.first_name || "Клиент";
    const username = message.from?.username
      ? "@" + message.from.username
      : "не указан";

    const clientText = text ||
      "Клиент отправил сообщение без текстового содержимого";

    await telegram("sendMessage", {
      chat_id: adminId,
      text:
        "Новое сообщение PROBUNGEE\n\n" +
        "Имя: " + name.slice(0, 100) + "\n" +
        "Username: " + username + "\n" +
        "Chat ID: " + chatId + "\n\n" +
        clientText.slice(0, 2500) + "\n\n" +
        "Ответить: /reply " + chatId + " Ваш ответ",
    });

    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        "Спасибо! Ваше сообщение получено. " +
        "Представитель PROBUNGEE ответит вам.",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook processing failed", error);
    return NextResponse.json(
      { ok: false },
      { status: 502 }
    );
  }
}
