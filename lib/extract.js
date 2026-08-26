const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const DeckSchema = z.object({
  title: z.string(),
  source: z.string(),
  cards: z.array(
    z.object({
      es: z.string(),
      en: z.string(),
      note: z.string(),
      say: z.string(),
    })
  ),
  warnings: z.array(z.string()),
});

const SYSTEM = `You turn photographs of a school Spanish textbook into flashcards.

Read every vocabulary box, verb chart, and expression list visible in the photos and
produce one card per Spanish/English pair.

Rules:
- Copy both languages EXACTLY as printed, including accents (á é í ó ú ü ñ), inverted
  punctuation (¿ ¡), and any parenthetical the book prints in the English column such as
  "(formal)", "(informal)", "(all-female group)". Those parentheticals disambiguate
  otherwise-identical English, so never drop them.
- Preserve the book's fill-in notation as printed: ___ blanks, [bracketed] placeholders.
- "note": a short hint ONLY where the card is genuinely ambiguous without one (gender
  agreement, formal vs informal). Otherwise "".
- "say": how the Spanish should be read ALOUD, but ONLY when reading the "es" text
  literally would be wrong — a real word hidden in parentheses, or a slash form. For
  example "(Yo) tengo [número] años." should say "Yo tengo años.", and "Encantado/a."
  should say "Encantado. Encantada." Otherwise "".
- "title": name the set after the book's own heading for that box, prefixed with the unit
  marker if one is visible (e.g. "P · La familia"). "source": the box's label, such as
  "Vocabulario" or "Conversaciones", plus a page number if visible.
- If a page holds two clearly different kinds of content (a verb conjugation chart AND a
  noun list), prefer the one that is the larger/primary box and warn about the other.

"warnings" is where you report anything the user should know before saving. Use it for:
a list that is visibly cut off at the edge of the photo, words you could not read with
confidence, glare or blur, or a second box you did not turn into cards. An empty array
means you are confident the extraction is complete and correct. Be honest here — a silent
bad extraction is worse than a flagged one.`;

async function extractDeck(images) {
  const client = new Anthropic();

  const content = images.map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }));
  content.push({
    type: 'text',
    text: images.length > 1
      ? 'These photos are pages from the textbook. Build one card set from them.'
      : 'This is a page from the textbook. Build a card set from it.',
  });

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(DeckSchema) },
  });

  if (!response.parsed_output) throw new Error('could not read the page');
  return response.parsed_output;
}

module.exports = { extractDeck };
