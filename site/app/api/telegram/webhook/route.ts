
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TgUser = {
  id: number;
  first_name?: string;
  username?: string;
  is_bot?: boolean;
};

type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  reply_to_message?: TgMessage;
};

type TgUpdate = {
  message?: TgMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TgMessage;
  };
};

const isPreview = () =>
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "probungee-recovery";

async function telegram(
  method: string,
  data: Record<string, unknown>
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing bot token");

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
    throw new Error(
      `Telegram ${method} failed: ${response.status}`
    );
  }

  return result;
}

async function send(
  chatId: string,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
    ...extra,
  });
}

const menu = {
  inline_keyboard: [
    [{
      text: "🏢 Рассчитать зал",
      callback_data: "equipment",
    }],
    [{
      text: "📊 Рассчитать окупаемость",
      callback_data: "roi",
    }],
    [{
      text: "🎓 Обучение тренеров",
      callback_data: "training",
    }],
    [{
      text: "💬 Написать менеджеру",
      callback_data: "manager",
    }],
  ],
};

async function showMenu(chatId: string) {
  await send(
    chatId,
    "Здравствуйте! Вас приветствует PROBUNGEE.\n\n" +
    "Мы производим оборудование для банджи-фитнеса " +
    "и обучаем тренеров.\n\n" +
    "Выберите, что вас интересует.",
    { reply_markup: menu }
  );
}

// Анкета работает без дополнительной базы данных.
// Telegram сохраняет предыдущий вопрос в reply_to_message.
async function ask(chatId: string, prompt: string) {
  await send(chatId, prompt, {
    reply_markup: {
      force_reply: true,
      selective: true,
    },
  });
}

function field(source: string, label: string) {
  const line = source
    .split("\n")
    .find((s) => s.startsWith(label + ": "));

  return line
    ? line.slice(label.length + 2).trim()
    : "";
}

function numbers(input: string): number[] {
  return (
    input.match(/\d+(?:[.,]\d+)?/g) || []
  ).map((x) => Number(x.replace(",", ".")));
}

async function notifyAdmin(
  adminId: string,
  message: TgMessage,
  description: string
) {
  const name = message.from?.first_name || "Клиент";
  const username = message.from?.username
    ? "@" + message.from.username
    : "не указан";

  await send(
    adminId,
    "Новое сообщение PROBUNGEE\n\n" +
    "Имя: " + name.slice(0, 80) + "\n" +
    "Username: " + username + "\n" +
    "Chat ID: " + message.chat.id + "\n\n" +
    description.slice(0, 3000) + "\n\n" +
    "↩️ Нажмите «Ответить» на это уведомление " +
    "и напишите клиенту."
  );
}

function getRepliedClientId(message: TgMessage) {
  const replied = message.reply_to_message;

  if (
    !replied?.from?.is_bot ||
    !replied.text?.startsWith(
      "Новое сообщение PROBUNGEE\n"
    )
  ) {
    return null;
  }

  const match = replied.text.match(
    /^Chat ID: (\d+)$/m
  );

  return match ? match[1] : null;
}

async function handleQuestionnaire(
  adminId: string,
  message: TgMessage,
  text: string
): Promise<boolean> {
  const reply = message.reply_to_message;

  if (!reply?.from?.is_bot || !reply.text) {
    return false;
  }

  const prompt = reply.text;
  const chatId = String(message.chat.id);
  const answer = text.trim();

  if (!answer) return false;

  // ПОДБОР ОБОРУДОВАНИЯ: ГОРОД
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 1/4")) {
    await ask(
      chatId,
      "PROBUNGEE | ЗАЛ | 2/4\n" +
      "Город: " + answer.slice(0, 100) + "\n\n" +
      "Укажите длину, ширину и высоту зала " +
      "в метрах через пробел.\n" +
      "Например: 10 8 3,5"
    );
    return true;
  }

  // ПОДБОР ОБОРУДОВАНИЯ: РАЗМЕРЫ
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 2/4")) {
    const values = numbers(answer);

    if (
      values.length !== 3 ||
      values.some(
        (v) => !Number.isFinite(v) || v <= 0 || v > 100
      )
    ) {
      await ask(
        chatId,
        prompt + "\n\nВведите три положительных " +
        "числа, например: 10 8 3,5"
      );
      return true;
    }

    const room = values.join(" × ");

    await ask(
      chatId,
      "PROBUNGEE | ЗАЛ | 3/4\n" +
      "Город: " + field(prompt, "Город") + "\n" +
      "Размеры: " + room + "\n\n" +
      "Есть ли зеркала, окна, колонны " +
      "или другие препятствия?\n" +
      "На каких стенах они расположены?\n\n" +
      "Например: зеркало спереди, окно справа.\n" +
      "Если нет — напишите «нет»."
    );
    return true;
  }

  // ПОДБОР ОБОРУДОВАНИЯ: ПРЕПЯТСТВИЯ
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 3/4")) {
    await ask(
      chatId,
      "PROBUNGEE | ЗАЛ | 4/4\n" +
      "Город: " + field(prompt, "Город") + "\n" +
      "Размеры: " + field(prompt, "Размеры") + "\n" +
      "Препятствия: " + answer.slice(0, 350) +
      "\n\nСколько тренажёров хотите приобрести " +
      "и сколько тренеров необходимо обучить?\n\n" +
      "Например: 8 тренажёров, 2 тренера.\n" +
      "Или напишите «нужен подбор»."
    );
    return true;
  }

  // ПОДБОР ОБОРУДОВАНИЯ: ЗАЯВКА
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 4/4")) {
    const summary =
      "ЗАЯВКА НА ПОДБОР ОБОРУДОВАНИЯ\n\n" +
      "Город: " + field(prompt, "Город") + "\n" +
      "Размеры: " + field(prompt, "Размеры") + " м\n" +
      "Препятствия: " +
      field(prompt, "Препятствия") + "\n" +
      "Пожелания: " + answer.slice(0, 350);

    await notifyAdmin(adminId, message, summary);

    await send(
      chatId,
      "Спасибо! Данные вашего зала переданы " +
      "специалисту PROBUNGEE.\n\n" +
      "Мы предварительно оценим количество " +
      "тренажёров. Окончательное размещение " +
      "возможно после проверки креплений " +
      "и зон движения.\n\n" +
      "Вы можете написать дополнительные вопросы " +
      "прямо здесь.",
      { reply_markup: menu }
    );

    return true;
  }

  // ПРЕДВАРИТЕЛЬНАЯ ОКУПАЕМОСТЬ
  if (
    prompt.startsWith(
      "PROBUNGEE | ОКУПАЕМОСТЬ"
    )
  ) {
    const values = numbers(answer);

    if (
      values.length !== 3 ||
      values.some(
        (v) => !Number.isFinite(v) || v < 0 || v > 1e12
      ) ||
      values[0] <= 0 ||
      answer.includes("-")
    ) {
      await ask(
        chatId,
        prompt + "\n\nПример: 600000; 200000; 120000"
      );
      return true;
    }

    const [investment, revenue, expenses] = values;
    const monthly = revenue - expenses;

    const format = (v: number) =>
      Math.round(v).toLocaleString("ru-RU") + " ₽";

    const payback =
      monthly > 0
        ? (investment / monthly).toFixed(1) + " мес."
        : "не рассчитывается при нулевой " +
          "или отрицательной прибыли";

    const summary =
      "ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ ОКУПАЕМОСТИ\n\n" +
      "Первоначальные вложения: " +
      format(investment) + "\n" +
      "Выручка в месяц: " + format(revenue) + "\n" +
      "Расходы в месяц: " + format(expenses) + "\n" +
      "Условный результат в месяц: " +
      format(monthly) + "\n" +
      "Простая окупаемость: " + payback;

    await notifyAdmin(adminId, message, summary);

    await send(
      chatId,
      summary +
      "\n\nЭто упрощённый расчёт при неизменных " +
      "показателях. Не учитываются налоги, " +
      "сезонность, изменение загрузки, кредиты " +
      "и дополнительные вложения.\n\n" +
      "Результат не является гарантией доходности.",
      { reply_markup: menu }
    );

    return true;
  }

  // ОБУЧЕНИЕ ТРЕНЕРОВ
  if (
    prompt.startsWith(
      "PROBUNGEE | ОБУЧЕНИЕ"
    )
  ) {
    await notifyAdmin(
      adminId,
      message,
      "ЗАЯВКА НА ОБУЧЕНИЕ\n\n" +
      answer.slice(0, 1800)
    );

    await send(
      chatId,
      "Спасибо! Запрос на обучение передан " +
      "специалисту PROBUNGEE.\n" +
      "Мы ответим вам здесь.",
      { reply_markup: menu }
    );

    return true;
  }

  return false;
}

export async function GET() {
  return NextResponse.json({
    ready:
      isPreview() &&
      Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
      Boolean(process.env.TELEGRAM_CHAT_ID) &&
      Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    mode: "preview",
  });
}

export async function POST(request: NextRequest) {
  if (!isPreview()) {
    return new NextResponse(
      "Unavailable",
      { status: 503 }
    );
  }

  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  const received = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );

  if (!expected || received !== expected) {
    return new NextResponse(
      "Forbidden",
      { status: 403 }
    );
  }

  const adminId =
    process.env.TELEGRAM_CHAT_ID?.trim();

  if (!adminId || !process.env.TELEGRAM_BOT_TOKEN) {
    return new NextResponse(
      "Not configured",
      { status: 503 }
    );
  }

  let update: TgUpdate;

  try {
    update = await request.json();
  } catch {
    return new NextResponse(
      "Invalid JSON",
      { status: 400 }
    );
  }

  try {
    // ==================================
    // НАЖАТИЯ КНОПОК В TELEGRAM
    // ==================================

    const callback = update.callback_query;

    if (callback) {
      const chat = callback.message?.chat;

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
      });

      if (!chat || chat.type !== "private") {
        return NextResponse.json({ ok: true });
      }

      const chatId = String(chat.id);

      if (chatId === adminId) {
        await send(
          adminId,
          "Меню предназначено для клиентов. " +
          "Для ответа используйте «Ответить»."
        );
      } else if (callback.data === "equipment") {
        await ask(
          chatId,
          "PROBUNGEE | ЗАЛ | 1/4\n\n" +
          "В каком городе планируется " +
          "использовать оборудование?"
        );
      } else if (callback.data === "roi") {
        await ask(
          chatId,
          "PROBUNGEE | ОКУПАЕМОСТЬ\n\n" +
          "Напишите через точку с запятой " +
          "три суммы в рублях:\n\n" +
          "1. Первоначальные вложения\n" +
          "2. Ожидаемая выручка за месяц\n" +
          "3. Ежемесячные расходы\n\n" +
          "Пример: 600000; 200000; 120000"
        );
      } else if (callback.data === "training") {
        await ask(
          chatId,
          "PROBUNGEE | ОБУЧЕНИЕ\n\n" +
          "Напишите ваш город, сколько тренеров " +
          "нужно обучить и когда планируете начать."
        );
      } else if (callback.data === "manager") {
        await send(
          chatId,
          "Напишите ваш вопрос обычным сообщением. " +
          "Специалист PROBUNGEE получит его " +
          "и ответит вам здесь."
        );
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================
    // ТЕКСТОВЫЕ СООБЩЕНИЯ
    // ==================================

    const message = update.message;

    if (!message || message.chat.type !== "private") {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text?.trim() || "";

    // ==================================
    // ВЛАДЕЛЕЦ PROBUNGEE
    // ==================================

    if (chatId === adminId) {
      const targetId = getRepliedClientId(message);

      if (targetId) {
        if (!text) {
          await send(
            adminId,
            "Пока поддерживается ответ текстом."
          );
        } else if (targetId !== adminId) {
          await send(targetId, text);

          await send(
            adminId,
            "✅ Ответ клиенту отправлен."
          );
        }

        return NextResponse.json({ ok: true });
      }

      // Запасная команда /reply
      if (text.startsWith("/reply")) {
        const match = text.match(
          /^\/reply\s+(\d+)\s+([\s\S]+)$/
        );

        if (!match) {
          await send(
            adminId,
            "Формат: /reply ID_клиента текст"
          );
        } else if (match[1] !== adminId) {
          await send(match[1], match[2].trim());

          await send(
            adminId,
            "✅ Ответ клиенту отправлен."
          );
        }
      } else if (text.startsWith("/start")) {
        await send(
          adminId,
          "PROBUNGEE: панель владельца активна.\n\n" +
          "Чтобы ответить клиенту, нажмите «Ответить» " +
          "на его уведомление."
        );
      } else if (text) {
        await send(
          adminId,
          "Нажмите «Ответить» на уведомление " +
          "клиента или используйте /reply ID текст."
        );
      }

      return NextResponse.json({ ok: true });
    }

    // ==================================
    // КЛИЕНТЫ PROBUNGEE
    // ==================================

    if (
      text.startsWith("/start") ||
      text === "/menu"
    ) {
      if (text === "/start calc") {
        await ask(
          chatId,
          "PROBUNGEE | ЗАЛ | 1/4\n\n" +
          "В каком городе планируется " +
          "использовать оборудование?"
        );
      } else if (text === "/start roi") {
        await ask(
          chatId,
          "PROBUNGEE | ОКУПАЕМОСТЬ\n\n" +
          "Напишите через точку с запятой " +
          "три суммы в рублях:\n" +
          "Вложения; выручка в месяц; " +
          "расходы в месяц.\n\n" +
          "Например: 600000; 200000; 120000"
        );
      } else {
        await showMenu(chatId);
      }

      return NextResponse.json({ ok: true });
    }

    if (text === "/cancel") {
      await showMenu(chatId);
      return NextResponse.json({ ok: true });
    }

    // Ответы на вопросы анкеты
    if (
      await handleQuestionnaire(
        adminId,
        message,
        text
      )
    ) {
      return NextResponse.json({ ok: true });
    }

    // Обычное сообщение клиента
    if (text) {
      await notifyAdmin(adminId, message, text);

      await send(
        chatId,
        "Спасибо! Сообщение получено.\n" +
        "Специалист PROBUNGEE ответит вам здесь."
      );
    } else {
      await send(
        chatId,
        "Пока поддерживаются текстовые сообщения.\n" +
        "Напишите ваш вопрос текстом."
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error(
      "Telegram webhook processing failed",
      error instanceof Error
        ? error.message
        : "unknown"
    );

    return NextResponse.json(
      { ok: false },
      { status: 502 }
    );
  }
}
