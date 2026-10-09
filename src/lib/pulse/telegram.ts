import { TELEGRAM_API_ORIGIN, TELEGRAM_FETCH_TIMEOUT_MS } from '@/consts/pulse';

/**
 * Thin Telegram Bot API client (spec 027 technical §8). Server-side only.
 * Throws on any failure; the message never contains the bot token.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  html: string,
): Promise<void> {
  const redact = (text: string): string => text.split(token).join('<token>');
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Telegram request failed: ${redact(message)}`);
  }
  if (!response.ok) {
    let description = '';
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'description' in body) {
        description = String((body as { description: unknown }).description);
      }
    } catch {
      // Non-JSON error body: the status alone is enough.
    }
    throw new Error(
      `Telegram HTTP ${response.status}${description ? `: ${redact(description)}` : ''}`,
    );
  }
}
