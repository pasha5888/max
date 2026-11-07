
"use client";

import { useState } from "react";

export default function Consultation() {
  const [direction, setDirection] = useState("both");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");

  async function testGoogleSheets() {
    if (testing) return;

    setTesting(true);
    setResult("Проверяем подключение...");

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ test: true })
      });

      const data = await response.json();

      if (response.ok && data.ok === true) {
        setResult(
          "✅ Тестовая заявка отправлена. Проверьте Google-таблицу."
        );
      } else {
        setResult(
          "❌ Ошибка подключения. Код: " + response.status
        );
      }
    } catch {
      setResult("❌ Не удалось связаться с сервером.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section
      className="consultation section-wrap"
      id="consultation"
      aria-labelledby="consultation-title"
    >
      <div className="consultation-copy">
        <span className="eyebrow">Следующий шаг — ваш</span>

        <h2 id="consultation-title">
          Начнём<br />с разговора
        </h2>

        <p>
          Расскажите о вашей студии или планах на обучение.
          Вместе определим, с чего начать
        </p>

        <a className="contact-phone" href="tel:+79775185414">
          +7 977 518-54-14
        </a>

        <p className="messenger-note">
          Telegram и MAX по этому номеру
        </p>
      </div>

      <form
        className="lead-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset className="direction-fieldset">
          <legend>Что хотите обсудить?</legend>

          <div className="direction-options">
            {[
              ["equipment", "Оборудование"],
              ["training", "Обучение"],
              ["both", "Всё вместе"]
            ].map(([value, label]) => (
              <label
                key={value}
                className={direction === value ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-row">
          <label>
            Как к вам обращаться
            <input
              name="name"
              autoComplete="given-name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Ваше имя"
            />
          </label>

          <label>
            Телефон
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="+7 999 123-45-67"
            />
          </label>
        </div>

        <label>
          Несколько слов о задаче
          <span className="optional"> необязательно</span>

          <textarea
            name="message"
            maxLength={2000}
            rows={3}
            placeholder="Например: открываем студию, нужны оборудование и обучение команды"
          />
        </label>

        <label className="consent">
          <input type="checkbox" name="consent" required />
          <span>
            Даю согласие на обработку персональных данных.{" "}
            <a href="/privacy">Условия обработки</a>
          </span>
        </label>

        <p className="form-unavailable">
          Онлайн-заявки пока не принимаются.
          Позвоните нам или напишите в Telegram / MAX.
        </p>

        <button
          className="button form-submit"
          type="submit"
          disabled
        >
          Получить консультацию ↗
        </button>

        {/*
          Временная кнопка тестирования.
          Удалить после проверки интеграции.
        */}
        <div style={{ marginTop: "24px" }}>
          <button
            type="button"
            onClick={testGoogleSheets}
            disabled={testing}
            style={{
              padding: "12px 18px",
              background: "#143b53",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: testing ? "wait" : "pointer"
            }}
          >
            {testing
              ? "Проверяем..."
              : "Проверить Google-таблицу"}
          </button>

          <p
            role="status"
            aria-live="polite"
            style={{ marginTop: "12px" }}
          >
            {result}
          </p>
        </div>
      </form>
    </section>
  );
}
