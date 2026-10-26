# Translator

Paste text in a language that separates words with spaces and get every word with its literal meaning and base form right below it, followed by a natural translation of each line, ready to copy or print. Each of the three can be shown or hidden.

## How it works

The app is a static page without a backend. Your browser talks directly to the Gemini API through the official `@google/genai` SDK, loaded from a CDN, using your own API key. The key is stored only in your browser.

The page splits each line into its words at the spaces, so the words shown are exactly the ones pasted. A single request gives each word its meaning in context and its base form, and each line its natural translation; the page checks that every word got a meaning. A base form is only shown where it differs from its word. The page lines everything up under its word in plain monospaced text, so the alignment survives copying. Lines too long for the screen continue in a new row. You can choose between `gemini-3.5-flash-lite`, which is fast, and `gemini-3.6-flash`, a larger, slower model.

## License

Copyright (C) 2026 Aron Sommer.

This project is licensed under the GNU Affero General Public License v3.0 or later. See the [LICENSE](LICENSE) file for full details.
