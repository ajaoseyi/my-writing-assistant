I had three tabs open: Google Docs to write in, Grammarly to fix my grammar, and an SEO checker to see if anyone would ever find what I wrote. None of them talked to each other. All of them wanted a subscription.

So I built Refine — one editor that does all three at once.

What it does:
→ Grammar & sentence-structure correction (powered by Llama 3)
→ A self-hosted SEO + readability audit (heading hierarchy, keyword density, meta length, alt text, Flesch/Gunning Fog/SMOG scores) — no third-party SEO API, so it's free to run
→ Real-time bidirectional sync with your actual Google Doc, so you're never re-pasting between "the tool" and "the real doc"

The stack:
Client → React, TypeScript, Vite, TipTap (rich text), Socket.IO-client
Server → Node.js, Express, LangChain + Groq-hosted Llama 3, a hand-rolled rule engine with Porter stemming for the SEO checks, retext for passive-voice detection, Socket.IO + the Google Docs API for the sync

The blocker that actually humbled me: the Google Docs sync.
The app pushes an edit to the Doc. The server polls the Doc, sees a change, pushes it back as an "external change." The app applies it — which looks like a new edit — which gets pushed back to the Doc. I'd built a ping-pong match, not a sync.

The fix was teaching both sides to recognize their own echo: the server remembers the last content it pushed before its next poll, and the client suppresses change-detection for one tick after applying an incoming update. A few lines of code, an embarrassing number of hours, because the bug never crashed — it just flickered.

What I learned: the hard part of "real-time sync" isn't the network call, it's knowing whether the change you just saw is yours.

It's live and free to use: https://my-writing-assistant-production.up.railway.app/

Would love feedback from anyone who writes for a living.

#buildinpublic #webdev #typescript #ai #sideproject
