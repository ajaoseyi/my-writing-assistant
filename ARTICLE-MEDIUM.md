# I Replaced Grammarly, Yoast, and a Spare Google Docs Tab With One App I Built Myself

I want to tell you about the exact moment I decided to build this. I had three tabs open: Google Docs for the actual writing, Grammarly for the grammar pass, and a Yoast-style SEO checker for the "will anyone actually find this" pass. I was tabbing between them every thirty seconds, copy-pasting paragraphs back and forth, watching three different tools disagree with each other about the same sentence. None of them talked to each other. All of them wanted a subscription.

That friction is the whole problem statement in one paragraph: writing well, writing *findable*, and writing *somewhere that matters* (your actual doc, not a tool's silo) are treated as three separate jobs. They shouldn't be. So I built Refine. A single editor that checks your grammar, scores your SEO, and stays in sync with your real Google Doc, instead of asking you to choose which tool gets your attention this hour.

## The solution, in practice

Refine is a writing assistant you paste or type a draft into, and it does three things at once instead of one thing at a time. It runs grammar and sentence-structure correction through Llama 3. It runs a self-hosted SEO audit heading hierarchy, meta title and description length, keyword density, alt text, internal linking, plus a full readability layer (Flesch Reading Ease, Flesch-Kincaid Grade, Gunning Fog, SMOG)  without sending your content to a third-party SEO API. And, because I got tired of "finish in the app, then re-paste into the doc," it syncs bidirectionally with Google Docs in real time, so the version your editor or client sees is always the version you're actually polishing.

The people I built this for are digital writers and content marketers, the people who are expected to be their own editor *and* their own SEO strategist, usually with no budget for separate tools for each. If you've ever drafted a blog post, then opened a second tab to check if your H2s are in the right order, you're exactly who this is for.

## Where it actually got hard

The grammar checker was the easy part — that's a solved problem you wrap an LLM around. The SEO layer is where I made a deliberate, harder call: instead of leaning on an LLM to "vibe check" SEO (which is fast to build and easy to get subtly wrong), I wrote seven independent rule-based checks, keyword density with actual stemming, heading hierarchy validation, meta-length math and only handed the *results* of those checks to the LLM to translate into plain-English recommendations. That meant building a real readability pipeline by hand instead of asking a model to estimate it, which is slower to ship but doesn't hallucinate a Flesch score.

The harder problem was the Google Docs sync, and I'll be honest — it broke in the most predictable way possible the first time I tried it: an infinite loop. The app pushes your edit to the Doc. The server polls the Doc, sees a change, and pushes it back to the app as an "external change." The app applies it, which looks like a new edit, which gets pushed back to the Doc. Congratulations, you've built a ping-pong match instead of a sync. Fixing it meant tracking, on both ends, "did I cause this change or did someone else," so the server remembers the last content it pushed before its next poll, and the client suppresses its own change-detection for exactly one tick after applying an incoming update. It's a small amount of code and it took me embarrassingly long to get right, because the bug only shows up as a flicker, not a crash.

The other quiet challenge was just architectural restraint: it would've been easy to let grammar, SEO, and sync all become one tangled feature. Keeping them as three things that run in parallel and report back independently rather than one thing that does everything is the only reason I can still add a fourth check without rewriting the other three.

## Two writers, and the features they actually asked for

I didn't build the SEO and sync features because I guessed people wanted them. I built them because two digital writers I roped into testing an early, grammar-only version told me, in roughly the same week, what was missing.

One of them was drafting everything in Google Docs for client approval and only pasting into my app for a final polish and asked, reasonably, why she had to paste at all instead of the tool just watching her actual doc. That conversation is the entire reason the Socket.io sync exists.

The other flagged something I hadn't even thought to check: passive voice. He pointed out that grammar tools love to ignore it because it's not *wrong*, it's just weak, and weak writing is exactly what an editor is supposed to catch. That's a different problem from "is this grammatically correct," and it's the reason the analysis pipeline grew a dedicated passive-voice pass instead of treating it as a grammar afterthought.

Both of them, independently, also asked some version of "but will Google even rank this", which is what pushed SEO from a maybe-later idea into a checkbox I built before I considered the app done. None of this came from a formal user research doc. It came from watching two people actually try to use an early version and listening to what they complained about.

## What it's actually built with

On the client: React, TypeScript, and Vite, with a TipTap rich-text editor so the SEO checks have real HTML structure to analyze instead of guessing from plain text, and Socket.IO-client keeping the doc connection alive.

On the server: Node.js and Express, with LangChain orchestrating the Groq-hosted Llama 3 calls, a hand-rolled rule engine (with Porter stemming for keyword analysis) for the SEO and readability checks, retext for passive-voice detection, Socket.IO for the real-time channel, and the Google Docs API for the sync itself.

Nothing exotic. The interesting part was never the individual pieces. It was making grammar, SEO, and a live document connection behave like one coherent tool instead of three features sharing a UI.

## It's free, and that's an engineering decision, not a pricing decision

Refine doesn't have a paywall, and that wasn't a marketing call, it's a direct result of the architecture choices above. Most SEO tools charge you per audit because they're calling a paid third-party API (Moz, Ahrefs, SEMrush) every single time you click "check." I never had to pass that cost on, because there is no third-party SEO API in this stack at all — the heading hierarchy check, the keyword density math, the four readability formulas, all of it runs as plain TypeScript on my own server. The LLM only gets called once a check is already finished, to translate a pile of numbers into a sentence a human wants to read. That's the cheapest possible use of an LLM call: not doing the analysis, just narrating it.


## The actual takeaway

If you're a digital writer, you don't need five tabs and five subscriptions to write something good *and* something findable. You need one editor that does both, and stays where you're already working. That's the whole pitch, and it's the reason I'd rather keep shipping checks into Refine than start a sixth tool.
