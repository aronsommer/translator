// Copyright (C) 2026 Aron Sommer. See LICENSE file for full license details.

import { GoogleGenAI } from "https://cdn.jsdelivr.net/npm/@google/genai@2.27.0/+esm";

// Each model with its settings; the first is the default.
const MODELS = {
  "gemini-3.5-flash-lite": { temperature: 0 },
  "gemini-3.6-flash": {},
};
// Characters per output line, so it fits the output box on a desktop screen.
const WIDTH = 96;
const LANGUAGES = [
  "Arabic",
  "Chinese (Simplified, 简体中文)",
  "Chinese (Traditional, 繁體中文)",
  "Czech",
  "Dutch",
  "English",
  "French",
  "German",
  "Hindi",
  "Italian",
  "Japanese",
  "Korean",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Turkish",
  "Ukrainian",
];
// The class of each field of a word: the word, its meaning and its base form.
const FIELDS = ["word", "meaning", "base"];
// Scripts written without spaces between words, which are split by a dictionary instead.
const SPACELESS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
// A character two columns wide.
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/u;
// A character without width of its own, like a mark above or below a letter.
const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}]/u;
// A run of text in scripts the monospace fonts lack, so a fallback font draws it.
const FALLBACK =
  /((?:(?:[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]|[\u3000-\u303f\uff01-\uff60\uffe0-\uffe6])\p{M}*)+)/u;

const $ = (id) => document.getElementById(id);
const [
  form,
  text,
  target,
  model,
  go,
  key,
  copy,
  print,
  status,
  out,
  showMeaning,
  showBase,
  showTranslation,
] = [
  "form",
  "text",
  "target",
  "model",
  "go",
  "key",
  "copy",
  "print",
  "status",
  "out",
  "showMeaning",
  "showBase",
  "showTranslation",
].map($);

// Prefixed, as other apps on the same github.io origin share the storage.
const store = {
  get: (name) => localStorage.getItem(`translator:${name}`),
  set: (name, value) => localStorage.setItem(`translator:${name}`, value),
};

// The last translated lines, each as its words and translation; an empty line of the text is null.
let lines = JSON.parse(store.get("lines")) ?? [];

target.append(...LANGUAGES.map((language) => new Option(language)));
target.value = store.get("target") ?? "German";
key.value = store.get("apiKey") ?? "";
text.value = store.get("text") ?? "";
target.onchange = () => store.set("target", target.value);
key.onchange = () => store.set("apiKey", key.value.trim());
text.oninput = () => store.set("text", text.value);
model.append(...Object.keys(MODELS).map((name) => new Option(name)));
// A stored model that is no longer offered falls back to the default.
if (store.get("model") in MODELS) model.value = store.get("model");
model.onchange = () => store.set("model", model.value);
// Each part of the translation keeps its stored choice, else its default in the page.
for (const box of [showTranslation, showMeaning, showBase]) {
  const stored = store.get(box.id);
  if (stored !== null) box.checked = stored === "1";
  box.onchange = () => {
    store.set(box.id, box.checked ? "1" : "");
    render();
  };
}
render();

// Cmd/Ctrl+Enter in the text field translates.
text.onkeydown = (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.requestSubmit();
};

copy.onclick = async () => {
  await navigator.clipboard.writeText(out.textContent);
  status.textContent = "Copied";
  // Cleared after a moment, unless another message has replaced it.
  setTimeout(() => {
    if (status.textContent === "Copied") status.textContent = "";
  }, 2000);
};

print.onclick = () => window.print();

form.onsubmit = async (event) => {
  event.preventDefault();
  if (!key.value.trim()) {
    status.textContent = "Enter a Gemini API key first";
    return;
  }
  go.disabled = true;
  status.textContent = "Translating …";
  // Counts the seconds, so a slow answer does not look like a hang.
  let seconds = 0;
  const timer = setInterval(() => (status.textContent = `Translating … ${++seconds} s`), 1000);
  lines = [];
  render();
  // Each line as its words, so the words shown are exactly the ones pasted.
  const pasted = text.value.trim().split("\n").map(split);
  const filled = pasted.filter((words) => words.length);
  try {
    const ai = new GoogleGenAI({ apiKey: key.value.trim() });
    const response = await ai.models.generateContent({
      model: model.value,
      contents: JSON.stringify(filled),
      config: {
        ...MODELS[model.value],
        systemInstruction: `The text is a JSON array of lines, each an array of its words. For each line, list every word in order as [word, meaning, base form]: the word as given, its literal meaning in ${target.value} in that context with the word's punctuation, and its dictionary form in the text's language. Then translate the line into natural ${target.value}.`,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            lines: {
              type: "array",
              minItems: filled.length,
              maxItems: filled.length,
              // Each line gets exactly as many entries as it has words.
              prefixItems: filled.map((words) => ({
                type: "object",
                properties: {
                  words: {
                    type: "array",
                    minItems: words.length,
                    maxItems: words.length,
                    items: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                  },
                  translation: { type: "string" },
                },
                required: ["words", "translation"],
              })),
            },
          },
          required: ["lines"],
        },
      },
    });
    const glossed = JSON.parse(response.text).lines;
    // A safeguard, should the model not keep to the schema.
    if (filled.some((words, i) => glossed[i]?.words.length !== words.length))
      throw new Error("The meanings do not match the words, please try again");
    // Writing each word keeps the model's meanings on the right words, but the pasted words are shown.
    lines = pasted.map((words) => {
      if (!words.length) return null;
      const line = glossed.shift();
      return {
        words: words.map((word, i) => {
          const [, meaning, base] = line.words[i];
          return [word, meaning, bare(base) === bare(word) ? "" : base];
        }),
        translation: line.translation,
      };
    });
    store.set("lines", JSON.stringify(lines));
    render();
    status.textContent = "";
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
  }
  clearInterval(timer);
  go.disabled = false;
};

// Splits a line at spaces, and text in scripts without spaces into its words, each keeping its punctuation.
function split(line) {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      if (!SPACELESS.test(token)) return [token];
      const words = [];
      let lead = "";
      // Opening marks and currency signs go with the next word, other punctuation with the last.
      for (const { segment, isWordLike } of segmenter.segment(token)) {
        if (isWordLike) {
          words.push(lead + segment);
          lead = "";
        } else if (words.length && !/^[\p{Ps}\p{Pi}\p{Sc}]/u.test(segment))
          words[words.length - 1] += segment;
        else lead += segment;
      }
      // A token of punctuation only stays a word.
      if (lead) words.push(lead);
      return words;
    });
}

// A word without case and outer punctuation, to leave out base forms that equal their word.
function bare(word) {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase();
}

// Shows each line's words over the parts turned on, each padded to line up, then its translation.
function render() {
  out.replaceChildren();
  const fields = [0, showMeaning.checked && 1, showBase.checked && 2].filter(Number.isInteger);
  const stacked = fields.length > 1;
  const width = (word) => Math.max(...fields.map((f) => columns(word[f])));
  for (const line of lines) {
    // An empty line in the text stays an extra gap.
    if (!line) {
      out.append("\n");
      continue;
    }
    if ((stacked || showTranslation.checked) && out.childNodes.length) out.append("\n");
    // The style keeps each line with its rows on one printed page.
    const block = out.appendChild(document.createElement("span"));
    block.className = "block";
    wrap(line.words, width, 2).forEach((row, r) => {
      if (r && stacked) block.append("\n");
      for (const f of fields)
        // An empty row, like one without base forms, is left out.
        if (row.some((word) => word[f]))
          add(
            block,
            FIELDS[f],
            row
              .map((word) => word[f] + " ".repeat(width(word) - columns(word[f])))
              .join("  ")
              .trimEnd(),
          );
    });
    const translation = line.translation.split(/\s+/).filter(Boolean);
    if (showTranslation.checked && translation.length)
      for (const row of wrap(translation, columns, 1)) add(block, "translation", row.join(" "));
  }
  // The print style fits the longest line to the page.
  const longest = Math.max(...out.textContent.split("\n").map(columns));
  out.style.setProperty("--chars", longest);
}

// Splits items into rows of at most WIDTH characters, with gap spaces between items.
function wrap(items, width, gap) {
  const rows = [[]];
  let used = 0;
  for (const item of items) {
    if (rows.at(-1).length && used + gap + width(item) > WIDTH) {
      rows.push([]);
      used = 0;
    }
    used += (rows.at(-1).length ? gap : 0) + width(item);
    rows.at(-1).push(item);
  }
  return rows;
}

// The number of monospace columns a text takes.
function columns(text) {
  let count = 0;
  for (const char of text) count += WIDE.test(char) ? 2 : ZERO_WIDTH.test(char) ? 0 : 1;
  return count;
}

function add(parent, className, text) {
  const node = document.createElement("span");
  node.className = className;
  // Text from a fallback font gets a box of its columns, so the text after it stays on the grid.
  text.split(FALLBACK).forEach((part, i) => {
    if (i % 2 === 0) return node.append(part);
    const box = node.appendChild(document.createElement("span"));
    box.className = "fallback";
    box.style.width = `${columns(part)}ch`;
    box.textContent = part;
  });
  parent.append(node, "\n");
}
