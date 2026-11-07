
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

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Отправка заявок пока отключена'
    },
    { status: 503 }
  );
}
