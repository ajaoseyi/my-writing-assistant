# Product Hunt Launch Copy

## ⭐ Recommended

**Name:** Refine
**Tagline:** Fire Grammarly. Fire your SEO tool. This one's free. *(52/60 chars)*

Why this works: "Refine" is the real product name (matches your repo/branding), so name recognition carries over everywhere else you post about it. The tagline does the provocation — it directly calls out the two subscriptions people are sick of paying for, and "free" closes the loop.

---

## Alternate Taglines (all ≤ 60 chars)

| Tagline | Chars |
|---|---|
| Grammarly + SEO checker + Google Docs, minus the bill | 55 |
| Stop paying 3 apps to write one paragraph | 43 |
| Your writing stack, minus the subscriptions | 45 |
| One free editor that replaces your entire writing stack | 57 |
| The last writing tool you'll ever pay for (because it's free) | 60 |
| Built because three subscriptions is one too many | 51 |

---

## Alternate Names (if you want something punchier than "Refine")

- **Tabless** — leans into "no more tab-switching between tools"
- **NoSubscribe** — blunt, anti-SaaS-fatigue branding
- **OneTab Writer** — literal, searchable, explains itself instantly
- **Refine.** — same name, just styled with a period for a sharper logo/wordmark

---

## Backup combo (more aggressive/provocative tone)

**Name:** Tabless
**Tagline:** Grammarly, Surfer SEO, and Google Docs had a baby. It's free. *(58/60 chars)*

---

## Description *(462/500 chars)*

Refine replaces three subscriptions with one editor. It corrects grammar and sentence structure with Llama 3, runs a self-hosted SEO + readability audit (heading hierarchy, keyword density, meta length, alt text, Flesch/Gunning Fog/SMOG scores) with zero third-party SEO API calls, and stays in real-time bidirectional sync with your actual Google Doc — so you're never re-pasting between "the tool" and "the real doc." No subscription, no API key, just open the link.

---

## First Comment

Hey Product Hunt! 👋

I built Refine because I had three tabs open every time I wrote anything: Google Docs to actually write, Grammarly to fix my grammar, and an SEO checker to see if anyone would ever find what I wrote. None of them talked to each other. All of them wanted a subscription.

Refine is one editor that does all three at once:
→ Grammar & sentence-structure correction, powered by Llama 3
→ A self-hosted SEO + readability audit — no third-party SEO API, so it's free to run
→ Real-time bidirectional sync with your actual Google Doc

The part that actually humbled me was the Google Docs sync. The app pushes an edit to the Doc. The server polls the Doc, sees a change, pushes it back as an "external change." The app applies it — which looks like a new edit — which gets pushed back to the Doc. I'd built a ping-pong match, not a sync.

The fix was teaching both sides to recognize their own echo: the server remembers the last content it pushed before its next poll, and the client suppresses change-detection for one tick after applying an incoming update. A few lines of code, an embarrassing number of hours — the bug never crashed, it just flickered.

It's live and free: https://my-writing-assistant-production.up.railway.app/

Would love feedback from anyone who writes for a living — and especially what you'd want next.
