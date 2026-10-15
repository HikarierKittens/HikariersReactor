/** Game presentation is text-only. Also cleans legacy emoji in imported history. */
export function stripEmoji(text: string): string {
  return text
    .replace(/[#*0-9]\uFE0F?\u20E3/gu, '')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, '')
    .trim();
}
