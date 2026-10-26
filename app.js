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
  "Czech",
  "Dutch",
  "English",
  "French",
  "German",
  "Italian",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Turkish",
  "Ukrainian",
];
// The class of each field of a word: the word, its meaning and its base form.
const FIELDS = ["word", "meaning", "base"];

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
  const pasted = text.value
    .trim()
    .split("\n")
    .map((line) => line.split(/\s+/).filter(Boolean));
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
              items: {
                type: "object",
                properties: {
                  words: {
                    type: "array",
                    items: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
                  },
                  translation: { type: "string" },
                },
                required: ["words", "translation"],
              },
            },
          },
          required: ["lines"],
        },
      },
    });
    const glossed = JSON.parse(response.text).lines;
    // The schema leaves the number of words per line open, so it is checked here.
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

// A word without case and outer punctuation, to leave out base forms that equal their word.
function bare(word) {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase();
}

// Shows each line's words over the parts turned on, each padded to line up, then its translation.
function render() {
  out.replaceChildren();
  const fields = [0, showMeaning.checked && 1, showBase.checked && 2].filter(Number.isInteger);
  const stacked = fields.length > 1;
  const width = (word) => Math.max(...fields.map((f) => word[f].length));
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
              .map((word) => word[f].padEnd(width(word)))
              .join("  ")
              .trimEnd(),
          );
    });
    const translation = line.translation.split(/\s+/).filter(Boolean);
    if (showTranslation.checked && translation.length)
      for (const row of wrap(translation, (word) => word.length, 1))
        add(block, "translation", row.join(" "));
  }
  // The print style fits the longest line to the page.
  const longest = Math.max(...out.textContent.split("\n").map((line) => line.length));
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

function add(parent, className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  parent.append(node, "\n");
}
