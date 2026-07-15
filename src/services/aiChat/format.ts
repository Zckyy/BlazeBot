const DISCORD_CHUNK_LIMIT = 1_900;

export function splitDiscordMessage(text: string, limit = DISCORD_CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf(' ', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return balanceCodeFences(chunks);
}

function balanceCodeFences(chunks: string[]): string[] {
  let openFence = '';
  return chunks.map((chunk, index) => {
    let current = chunk;
    if (openFence) current = `${openFence}\n${current}`;

    const fences = [...current.matchAll(/```([^\n`]*)/g)];
    const isOpen = fences.length % 2 === 1;
    if (isOpen && index < chunks.length - 1) {
      const language = fences[fences.length - 1]?.[1] ?? '';
      openFence = `\`\`\`${language}`;
      current = `${current}\n\`\`\``;
    } else {
      openFence = '';
    }
    return current;
  });
}
