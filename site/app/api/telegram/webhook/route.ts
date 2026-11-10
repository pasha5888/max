
я готов давай сылку для перезхода где начать двигаться
Отлично! 🚀 Начинаем создание собственного калькулятора PROBUNGEE в Telegram.

Шаг 1. Открой наш файл бота в GitHub:

PROBUNGEE — Telegram Bot

Ветка: probungee-recovery

Файл: site/app/api/telegram/webhook/route.ts

Открыть файл Telegram-бота в GitHub
Дальше:

Авторизуйся в GitHub, если потребуется.

Открой файл route.ts по ссылке.

Нажми значок карандаша Edit this file.

Пока ничего не удаляй и не меняй.

Пришли скриншот открытого редактора. Мы подготовим полную замену файла, чтобы добавить меню калькулятора, анкету клиента и удобные ответы через «Ответить», не сломав уже работающего бота.

Сайт Tilda и кнопку Marquiz пока не трогаем.

Приложение пользователя
да давай так и сделаем
Отлично! На твоём скриншоте открыт именно тот файл, который нам нужен:

site/app/api/telegram/webhook/route.ts

Ветка: probungee-recovery.

Я проверил его содержимое. Сейчас там старая версия Telegram-бота, которая уже умеет принимать сообщения клиентов. Добавим новые возможности, сохранив существующую защиту webhook.

Что получим после обновления
Главное меню бота PROBUNGEE

Рассчитать зал

Рассчитать окупаемость

Обучение тренеров

Написать менеджеру

Бот будет последовательно спрашивать город, размеры зала, наличие зеркал и окон, желаемое количество тренажёров и необходимость обучения. Потом пришлёт тебе заявку, на которую можно ответить обычной функцией Telegram «Ответить».

Расчёт окупаемости будет предварительным — по вложениям, месячной выручке и расходам. Автоматически утверждать безопасное количество подвесов пока не будем: для этого мы ещё проводим измерения.

Шаг 1. Заменяем весь файл
В открытом редакторе GitHub:

Щёлкни внутри кода.

Нажми Ctrl + A.

Удали старый код и вставь весь код ниже.


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

Шаг 2. Сохраняем
После вставки нажми в правом верхнем углу GitHub Commit changes….

В окне сохранения:

Commit message: Add PROBUNGEE Telegram calculator

Branch: probungee-recovery

Выбери сохранение непосредственно в текущую ветку.

Нажми Commit changes.

Шаг 3. Проверяем публикацию
Открой Vercel — публикации PROBUNGEE.

Должна появиться новая публикация Preview со статусом Ready. Если увидишь Error, ничего повторно не меняй — покажи ошибку сборки.

После Ready открой со второго Telegram-аккаунта @Probungee_bot и отправь /start.

Должно появиться меню из четырёх кнопок. Нажми «Рассчитать зал», пройди анкету и проверь получение заявки на основном аккаунте.

Важно: это первая тестовая версия. Она не сохраняет анкеты в отдельную базу данных, а передаёт их владельцу через Telegram. Перед реальным сбором клиентских данных ещё необходимо настроить правовые документы и проверить соблюдение требований к обработке персональных данных. Поэтому кнопку на Tilda пока не переключаем.

Сейчас сделай только замену кода и Commit changes. Пришли скриншот результата — продолжим с проверкой Vercel.

Приложение пользователя
Отлично! ✅ На скриншоте вижу, что новая публикация PROBUNGEE успешно собрана.

Vercel: Ready — Preview

Проект: new-bungee

Ветка: probungee-recovery

Последний коммит: ce68ce5

Время сборки: 15 секунд

Ошибок сборки на скриншоте нет. Теперь нужно проверить, как бот работает в Telegram.

Шаг 2. Проверяем новое меню
Открой Telegram-бота со второго аккаунта, который мы используем как тестового клиента.

PROBUNGEE — Telegram-бот

Открыть @Probungee_bot
Напиши боту команду:

/start

Что должно появиться
Здравствуйте! Вас приветствует PROBUNGEE.

Мы производим оборудование для банджи-фитнеса и обучаем тренеров.

Выберите, что вас интересует.

Рассчитать зал

Рассчитать окупаемость

Обучение тренеров

Написать менеджеру

Пока не меняем кнопку на сайте Tilda. Статус Ready означает успешную сборку, но ещё не подтверждает работу Telegram.

Сейчас отправь /start со второго аккаунта и пришли скриншот ответа бота. Если меню появится, следующим шагом проверим анкету расчёта зала и получение заявки на основной аккаунт.

Приложение пользователя
но кнопки не работают просто подсвечиваются про активации
Нашёл причину! ✅ Сам бот работает, ошибка именно в настройке webhook.

Я проверил файл подключения Telegram в GitHub. Там указано:

allowed_updates: ["message"],

Это означает, что Telegram отправляет нашему боту обычные сообщения, но не отправляет нажатия на кнопки (callback_query).

Исправим это, не трогая работающий калькулятор.

Шаг 1. Открой файл настройки Telegram
Открыть setup/route.ts в GitHub
Нажми карандаш Edit.

Найди строку:

allowed_updates: ["message"],

Замени её на:

allowed_updates: ["message", "callback_query"],

Больше ничего менять не нужно.

Шаг 2. Сохрани изменения
Нажми Commit changes, сохрани в ветку probungee-recovery.

Затем открой Vercel — Deployments и проверь, что новая Preview-публикация получила статус Ready.

Шаг 3. Повторно подключим webhook
После успешной публикации открой нашу защищённую страницу:

PROBUNGEE — подключение Telegram
Введи уже созданный пароль TELEGRAM_SETUP_KEY и нажми «Подключить Telegram».

Это обновит подписку бота на события и сохранит существующую защиту Vercel. Сам пароль мне не присылай.

После успешного подключения снова открой @Probungee_bot, отправь /start и нажми «Рассчитать зал».

Теперь бот должен спросить: «В каком городе планируется использовать оборудование?»

Если получишь этот вопрос, перейдём к тестированию всей анкеты. Затем проверим ответы менеджера и только после этого будем менять кнопку на Tilda.

Начинай с первого шага — изменения одной строки в setup/route.ts.

Приложение пользователя
Приложение пользователя
Приложение пользователя
Приложение пользователя
Приложение пользователя
Отлично! 🎉 Мы успешно проверили полный цикл работы Telegram-бота PROBUNGEE.

По твоим скриншотам вижу:

 Webhook подключён — Telegram принимает и сообщения, и нажатия кнопок.

 Анкета работает — клиент указал город, размеры зала, окна и желаемое количество тренажёров.

 Заявка приходит владельцу — вижу заполненную заявку из Москвы на 8 тренажёров и обучение одного тренера.

 Ответ через «Ответить» работает — бот подтвердил отправку твоих сообщений клиенту.

 Свободная переписка работает — клиент отправил телефон, и сообщение дошло до тебя.

Таким образом, тестирование основного сценария прошло успешно.

Что я заметил и предлагаю улучшить
1. Сбор контактов. Сейчас бот получает номер телефона только тогда, когда ты вручную просишь его у клиента. Лучше сделать отдельный шаг анкеты с добровольным предоставлением номера или возможностью продолжить общение в Telegram.

2. Подбор оборудования. Клиент указал зал 5 × 6 × 3,1 м, пожелал 8 тренажёров и сообщил об окнах. Бот правильно не обещал, что все восемь поместятся. Автоматическую оценку добавим после завершения замеров рабочей зоны PROBUNGEE.

3. Юридические требования. До публичного запуска приёма контактов нужно проверить порядок обработки персональных данных в Telegram, согласие клиента и требования к хранению. Отказ от Marquiz сам по себе этого не решает.

4. Постоянная работа бота. Сейчас webhook размещён в защищённой Preview-версии Vercel. Перед промышленным запуском желательно перенести его на постоянный адрес, убрать временную страницу настройки и отозвать временный ключ обхода защиты.

Следующий этап
Я предлагаю сначала улучшить анкету клиента, а затем заменить кнопку «Рассчитать окупаемость» на сайте probungee.ru.

Для будущей версии бота сделаем удобную структуру:

Новая заявка PROBUNGEE

Город: Москва

Зал: 5 × 6 × 3,1 м

Препятствия: окна с нескольких сторон

Количество тренажёров: 8

Обучение: 1 тренер

Телефон: предоставляется по желанию

Статус: требуется проверка возможности размещения

Моя рекомендация: теперь не переписывать весь бот заново, а последовательно улучшить уже работающую систему.

Первым делом добавим в конец анкеты вопрос о способе связи с клиентом. Тогда тебе не придётся каждый раз вручную запрашивать номер телефона.

После этого займёмся интеграцией сайта Tilda и настройкой законного приёма заявок.

давай

Обработка заняла 2m 11s
хорошо

Предыдущие действия
Готово! ✅ Подготовил обновлённый файл Telegram-бота PROBUNGEE, сохранив уже работающие функции.

Теперь после вопросов о зале бот дополнительно спросит:

Как с вами связаться?

Можете оставить номер телефона или написать «Пропустить», чтобы продолжить общение только в Telegram.

Номер не будет обязательным. В итоговой заявке ты получишь все параметры помещения и выбранный клиентом способ связи.

1. Скачай готовый код
PROBUNGEE — обновлённый Telegram-бот

TypeScript · 293 строки · 15 КБ

 Скачать полный файл route.ts

Проверил синтаксис TypeScript. Полную сборку Vercel и работу в Telegram ещё предстоит проверить.

2. Установи файл в GitHub
Открыть файл бота PROBUNGEE в GitHub
Скачай файл выше и открой его в Блокноте.

Нажми Ctrl + A, затем Ctrl + C.

В GitHub нажми карандаш Edit.

Выдели весь старый код через Ctrl + A и вставь новый через Ctrl + V.

Нажми Commit changes и сохрани в ветку probungee-recovery.

Другие файлы, токены и настройки webhook не меняем.

3. Проверим работу
После появления статуса Ready в Vercel:

Со второго аккаунта открой @Probungee_bot.

Отправь /start и нажми «Рассчитать зал».

Пройди анкету до пятого вопроса.

Для первого теста напиши «Пропустить».

Проверь, что на основной аккаунт пришла полная заявка с пометкой «Только Telegram».

Затем проверим вариант с добровольным указанием номера телефона.

Пока оставляем всё в тестовой Preview-версии. Перед публичным сбором телефонов ещё проверим согласия и обработку персональных данных по требованиям РФ.

Когда сделаешь Commit, пришли скриншот Vercel — перейдём к проверке.


PROBUNGEE_telegram_webhook_route.ts
Код
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




