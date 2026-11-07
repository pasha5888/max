
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const secret = process.env.LEADS_WEBHOOK_SECRET;

  const isPreview =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF ===
      'probungee-recovery';

  const validUrl = Boolean(
    scriptUrl &&
    /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/
      .test(scriptUrl)
  );

  return NextResponse.json(
    {
      ready: Boolean(isPreview && validUrl && secret),
      googleScriptConfigured: validUrl,
      webhookSecretConfigured: Boolean(secret),
      testOnly: true
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}


export async function POST(request: Request) {
  const isPreview =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF ===
      'probungee-recovery';

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const secret = process.env.LEADS_WEBHOOK_SECRET;

  if (!isPreview || !scriptUrl || !secret) {
    return NextResponse.json(
      { ok: false, error: 'Test unavailable' },
      { status: 503 }
    );
  }

  // Проверяем, что запрос пришёл с тестового сайта.
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    if (
      !origin ||
      !host ||
      new URL(origin).protocol !== 'https:' ||
      new URL(origin).host !== host
    ) {
      return NextResponse.json(
        { ok: false, error: 'Origin rejected' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (body?.test !== true) {
      return NextResponse.json(
        { ok: false, error: 'Test only' },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        secret,
        name: 'Тест PROBUNGEE',
        phone: '0000000000',
        direction: 'both',
        message: 'Тестовая отправка из Vercel'
      }),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      throw new Error('Google Script HTTP error');
    }

    const result = await response.json();

    if (result?.ok !== true) {
      throw new Error('Google Script rejected request');
    }

    return NextResponse.json({
      ok: true,
      testOnly: true
    });

  } catch (error) {
    console.error('Test delivery error', error);

    return NextResponse.json(
      { ok: false, error: 'Test delivery failed' },
      { status: 502 }
    );
  }
}

