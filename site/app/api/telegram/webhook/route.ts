import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type User = { id: number; first_name?: string; username?: string; is_bot?: boolean };
type Message = {
  message_id: number;
  chat: { id: number; type: string };
  from?: User;
  text?: string;
  reply_to_message?: Message;
};
type Update = {
  message?: Message;
  callback_query?: { id: string; data?: string; message?: Message };
};

const preview = () =>
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "probungee-recovery";

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing bot token");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error("Telegram API failure", method, response.status);
    throw new Error("Telegram request failed");
  }
  return result;
}

function send(chatId: string, text: string, extra: Record<string, unknown> = {}) {
  return telegram("sendMessage", { chat_id: chatId, text: text.slice(0, 4096), ...extra });
}

const menu = {
  inline_keyboard: [
    [{ text: "🏢 Рассчитать зал", callback_data: "equipment" }],
    [{ text: "📊 Рассчитать окупаемость", callback_data: "roi" }],
    [{ text: "🎓 Обучение тренеров", callback_data: "training" }],
    [{ text: "💬 Написать менеджеру", callback_data: "manager" }],
  ],
};

function showMenu(id: string) {
  return send(
    id,
    "Здравствуйте! Вас приветствует PROBUNGEE.\n\n" +
      "Мы производим оборудование для банджи-фитнеса и обучаем тренеров.\n\n" +
      "Выберите интересующий раздел:",
    { reply_markup: menu }
  );
}

// Для анкеты используем штатный Telegram Reply: данные предыдущих шагов
// находятся в тексте сообщения, на которое клиент отвечает.
function ask(id: string, prompt: string) {
  return send(id, prompt, { reply_markup: { force_reply: true, selective: true } });
}

function field(text: string, label: string) {
  const line = text.split("\n").find((s) => s.startsWith(label + ": "));
  return line ? line.slice(label.length + 2).trim() : "";
}

function nums(s: string) {
  return (s.match(/\d+(?:[.,]\d+)?/g) || []).map((v) => Number(v.replace(",", ".")));
}

function clientInfo(message: Message) {
  const name = message.from?.first_name || "Клиент";
  const username = message.from?.username ? "@" + message.from.username : "не указан";
  return `Имя: ${name.slice(0, 80)}\nUsername: ${username}\nChat ID: ${message.chat.id}`;
}

function notifyAdmin(adminId: string, message: Message, description: string) {
  return send(
    adminId,
    "Новое сообщение PROBUNGEE\n\n" + clientInfo(message) +
      "\n\n" + description.slice(0, 3000) +
      "\n\n↩️ Нажмите «Ответить» на это уведомление и напишите клиенту."
  );
}

function repliedClientId(message: Message): string | null {
  const old = message.reply_to_message;
  if (!old?.from?.is_bot || !old.text?.startsWith("Новое сообщение PROBUNGEE\n")) return null;
  const found = old.text.match(/^Chat ID: (\d+)$/m);
  return found ? found[1] : null;
}

function roomSummary(prompt: string) {
  return (
    "ЗАЯВКА НА ПОДБОР ОБОРУДОВАНИЯ\n\n" +
    "Город: " + field(prompt, "Город") + "\n" +
    "Размеры: " + field(prompt, "Размеры") + " м\n" +
    "Препятствия: " + field(prompt, "Препятствия") + "\n" +
    "Пожелания: " + field(prompt, "Пожелания")
  );
}

async function questionnaire(adminId: string, msg: Message, text: string): Promise<boolean> {
  const prompt = msg.reply_to_message?.text || "";
  if (!msg.reply_to_message?.from?.is_bot || !prompt) return false;
  const id = String(msg.chat.id);
  const answer = text.trim();
  if (!answer) return false;

  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 1/5")) {
    await ask(id, "PROBUNGEE | ЗАЛ | 2/5\nГород: " + answer.slice(0, 100) +
      "\n\nНапишите длину, ширину и высоту зала в метрах через пробел.\nНапример: 10 8 3,5");
    return true;
  }
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 2/5")) {
    const values = nums(answer);
    if (values.length !== 3 || values.some((x) => !Number.isFinite(x) || x <= 0 || x > 100)) {
      await ask(id, prompt + "\n\nОшибка: введите три положительных числа, например: 10 8 3,5");
      return true;
    }
    await ask(id, "PROBUNGEE | ЗАЛ | 3/5\nГород: " + field(prompt, "Город") +
      "\nРазмеры: " + values.join(" × ") +
      "\n\nЕсть ли зеркала, окна, колонны или другие препятствия? Где они находятся?\n" +
      "Например: зеркало спереди, окно справа. Если нет — напишите «нет».");
    return true;
  }
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 3/5")) {
    await ask(id, "PROBUNGEE | ЗАЛ | 4/5\nГород: " + field(prompt, "Город") +
      "\nРазмеры: " + field(prompt, "Размеры") +
      "\nПрепятствия: " + answer.slice(0, 350).replace(/\n/g, " ") +
      "\n\nСколько тренажёров хотите купить и сколько тренеров обучить?\n" +
      "Например: 8 тренажёров, 2 тренера. Можно написать «нужен подбор».");
    return true;
  }
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 4/5")) {
    await ask(id, "PROBUNGEE | ЗАЛ | 5/5\nГород: " + field(prompt, "Город") +
      "\nРазмеры: " + field(prompt, "Размеры") +
      "\nПрепятствия: " + field(prompt, "Препятствия") +
      "\nПожелания: " + answer.slice(0, 350).replace(/\n/g, " ") +
      "\n\nПоследний шаг: как с вами связаться?\n\n" +
      "Можно добровольно указать номер телефона или написать «Пропустить», " +
      "чтобы общаться только здесь, в Telegram.\n" +
      "Номер нужен только для связи по вашему запросу.");
    return true;
  }
  if (prompt.startsWith("PROBUNGEE | ЗАЛ | 5/5")) {
    const skip = /^(пропустить|нет|telegram|телеграм|без телефона)$/i.test(answer);
    const cleaned = answer.replace(/[\s()\-]/g, "");
    if (!skip && !/^\+?\d{10,15}$/.test(cleaned)) {
      await ask(id, prompt + "\n\nВведите телефон в формате +79991234567 либо «Пропустить».");
      return true;
    }
    const contact = skip ? "Только Telegram (телефон не предоставлен)" : answer;
    await notifyAdmin(adminId, msg, roomSummary(prompt) + "\nСпособ связи: " + contact);
    await send(id, "Спасибо! Заявка направлена специалисту PROBUNGEE.\n\n" +
      "Предварительный подбор обсудим после проверки конструкции креплений и зон движения. " +
      "Можно продолжить общение здесь, в Telegram.", { reply_markup: menu });
    return true;
  }

  if (prompt.startsWith("PROBUNGEE | ОКУПАЕМОСТЬ")) {
    const input = answer.split(";").map((part) => part.trim().replace(/\s/g, ""));
    const valid = input.length === 3 && input.every((p) => /^\d+(?:[.,]\d+)?$/.test(p));
    const values = input.map((p) => Number(p.replace(",", ".")));
    if (!valid || values.some((x) => !Number.isFinite(x) || x < 0 || x > 1e12) || values[0] <= 0) {
      await ask(id, prompt + "\n\nВведите три суммы через точку с запятой, например: 600000; 200000; 120000");
      return true;
    }
    const [investment, revenue, costs] = values;
    const profit = revenue - costs;
    const money = (v: number) => Math.round(v).toLocaleString("ru-RU") + " ₽";
    const payback = profit > 0 ? (investment / profit).toFixed(1) + " мес." : "невозможно рассчитать";
    const report = "ПРЕДВАРИТЕЛЬНАЯ ОКУПАЕМОСТЬ\n" +
      "Вложения: " + money(investment) + "\nВыручка/мес: " + money(revenue) +
      "\nРасходы/мес: " + money(costs) + "\nУсловный результат/мес: " + money(profit) +
      "\nПростая окупаемость: " + payback;
    await notifyAdmin(adminId, msg, report);
    await send(id, report + "\n\nЭто упрощённая оценка, не учитывающая налоги, сезонность, " +
      "изменение загрузки, кредиты и дополнительные вложения. Не гарантия доходности.",
      { reply_markup: menu });
    return true;
  }
  if (prompt.startsWith("PROBUNGEE | ОБУЧЕНИЕ")) {
    await notifyAdmin(adminId, msg, "ЗАЯВКА НА ОБУЧЕНИЕ\n" + answer.slice(0, 1800));
    await send(id, "Спасибо! Запрос передан специалисту. Ответим здесь, в Telegram.", { reply_markup: menu });
    return true;
  }
  return false;
}

export async function GET() {
  return NextResponse.json({
    ready: preview() && Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
      Boolean(process.env.TELEGRAM_CHAT_ID) && Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    mode: "preview",
  });
}

export async function POST(request: NextRequest) {
  if (!preview()) return new NextResponse("Unavailable", { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const adminId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!adminId || !process.env.TELEGRAM_BOT_TOKEN) {
    return new NextResponse("Not configured", { status: 503 });
  }

  let update: Update;
  try { update = (await request.json()) as Update; }
  catch { return new NextResponse("Invalid JSON", { status: 400 }); }

  try {
    const callback = update.callback_query;
    if (callback) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      const chat = callback.message?.chat;
      if (!chat || chat.type !== "private") return NextResponse.json({ ok: true });
      const id = String(chat.id);
      if (id === adminId) await send(adminId, "Меню для клиентов. Чтобы ответить, выберите «Ответить» на уведомлении.");
      else if (callback.data === "equipment") await ask(id, "PROBUNGEE | ЗАЛ | 1/5\n\nВ каком городе планируется использовать оборудование?");
      else if (callback.data === "roi") await ask(id, "PROBUNGEE | ОКУПАЕМОСТЬ\n\n" +
        "Напишите три суммы в рублях через точку с запятой:\n" +
        "1. Первоначальные вложения\n2. Выручка за месяц\n3. Расходы за месяц\n" +
        "Например: 600000; 200000; 120000");
      else if (callback.data === "training") await ask(id, "PROBUNGEE | ОБУЧЕНИЕ\n\n" +
        "Напишите город, сколько тренеров нужно обучить и когда планируете начать.");
      else if (callback.data === "manager") await send(id, "Напишите вопрос обычным сообщением. Специалист ответит здесь.");
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message || message.chat.type !== "private") return NextResponse.json({ ok: true });
    const id = String(message.chat.id);
    const text = message.text?.trim() || "";

    if (id === adminId) {
      const target = repliedClientId(message);
      if (target) {
        if (!text) await send(adminId, "Пока поддерживаются только текстовые ответы.");
        else if (target !== adminId) {
          await send(target, text);
          await send(adminId, "✅ Ответ клиенту отправлен.");
        }
      } else if (text.startsWith("/reply")) {
        const match = text.match(/^\/reply\s+(\d+)\s+([\s\S]+)$/);
        if (!match) await send(adminId, "Формат: /reply ID_клиента текст ответа");
        else if (match[1] !== adminId) {
          await send(match[1], match[2].trim());
          await send(adminId, "✅ Ответ клиенту отправлен.");
        }
      } else if (text.startsWith("/start")) {
        await send(adminId, "PROBUNGEE: панель владельца активна. Для ответа нажмите «Ответить» на уведомление клиента.");
      } else if (text) {
        await send(adminId, "Чтобы ответить, выберите «Ответить» на уведомлении клиента.");
      }
      return NextResponse.json({ ok: true });
    }

    if (text === "/cancel" || text === "/menu" || text === "/start") {
      await showMenu(id);
      return NextResponse.json({ ok: true });
    }
    if (text === "/start calc") {
      await ask(id, "PROBUNGEE | ЗАЛ | 1/5\n\nВ каком городе планируется использовать оборудование?");
      return NextResponse.json({ ok: true });
    }
    if (text === "/start roi") {
      await ask(id, "PROBUNGEE | ОКУПАЕМОСТЬ\n\nНапишите вложения; выручку в месяц; расходы в месяц, " +
        "например: 600000; 200000; 120000");
      return NextResponse.json({ ok: true });
    }
    if (await questionnaire(adminId, message, text)) return NextResponse.json({ ok: true });

    if (text) {
      await notifyAdmin(adminId, message, text);
      await send(id, "Спасибо! Сообщение получено. Специалист PROBUNGEE ответит здесь.");
    } else await send(id, "Пока поддерживаются текстовые сообщения. Напишите вопрос текстом.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook processing failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
