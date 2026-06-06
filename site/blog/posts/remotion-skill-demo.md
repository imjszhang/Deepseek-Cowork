---
title: "When I Taught AI to Use Remotion: Zero to Tutorial Video in 30 Minutes"
date: 2026-01-28
---

# When I Taught AI to Use Remotion: Zero to Tutorial Video in 30 Minutes

[Remotion](https://www.remotion.dev/) is a pretty cool framework—making videos with React. Yes, the same React you use for websites, now for creating videos. Code controls animations, timing, rendering. A programmer's way of making videos.

But honestly, Remotion's learning curve is steep. Frames, `useCurrentFrame()`, `interpolate()`... just reading the docs is overwhelming.

Until I discovered a fun approach: **teach the AI first, then let it do the work**.

## How It Started

That day I opened DeepSeek Cowork and casually asked:

> **Me**: "What skills do you have?"

AI listed a bunch of capabilities. But I wanted to try something new:

> **Me**: "Install this skill: `npx skills add https://github.com/remotion-dev/skills --skill remotion-best-practices`"

With just that one line, AI got to work. It git cloned the `remotion-best-practices` skill—30+ best practice files, covering everything from animations to rendering:

- **composition-best-practices.tsx** - Composition best practices
- **animation-best-practices.tsx** - Animation best practices
- **performance-best-practices.tsx** - Performance optimization guide
- **audio-best-practices.tsx** - Audio handling tips
- **render-best-practices.tsx** - Rendering recommendations

The moment it finished installing, AI had "learned" Remotion.

## Making AI Create Its Own Demo Video

> **Me**: "Tell me more about this remotion skill"

AI explained every file in detail. Then I had an idea:

> **Me**: "Use this remotion skill to make a demo video introducing this skill"

A bit meta, right? Using the Remotion skill to make a video about the Remotion skill. AI jumped right in—setting up the project structure, writing components, designing animations.

## Bugs and Fixes

### Windows Being Windows

> **Me**: "Test the npm install command in remotion-demo, see if npm works"

Error. npm not found. I thought about it:

> **Me**: "Could this be a Windows environment issue?"

That woke AI up. On Windows, you need the full path:

```bash
D:\nvm4w\nodejs\npm.cmd install
```

Problem solved. Moving on.

### The API Version Trap

> **Me**: "Run npm start to launch the dev server"

Another error. AI figured it out—Remotion 4.0 changed the API:

```typescript
// Old way (deprecated)
import { Config } from 'remotion';
Config.Rendering.setImageFormat('jpeg');

// New way
import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
```

AI fixed it on its own. Refreshed the browser, video preview appeared!

### From 30 Seconds to 2 Minutes

> **Me**: "Optimize this video, make it a quality tutorial"

That got AI excited. The 30-second demo became a 2-minute full tutorial. 600+ lines of code in the `TutorialVideo` component, 8 chapters:

1. **Intro to Remotion** - What's a React video framework
2. **Core Concepts** - Composition, Sequence, useCurrentFrame
3. **Animation System** - interpolate() and spring()
4. **Performance** - Frame rate, resolution, caching
5. **Audio Handling** - Track sync and volume control
6. **Render Output** - Formats and compression
7. **Best Practices** - 30 golden rules
8. **Looking Ahead** - The future of Remotion

AI also built a `CodeDisplay` component—syntax highlighting with cursor animations. Teaching mode: engaged.

### Those Weird Errors

A few more bugs popped up during development. AI handled them all:

**interpolate doesn't take color strings:**

```typescript
// This throws an error
interpolate(frame, [0, 30], [0, "#ff0000"])

// Use numbers instead
interpolate(frame, [0, 30], [0, 360]) // hue value
```

**Missing component imports:**

AI caught that `Root.tsx` was missing imports and added them.

**Render API changed again:**

Remotion 4.0's `render()` method couldn't be called directly. AI switched to CLI commands.

## The Final Step: Exporting

> **Me**: "How do I export this as mp4?"

AI generated the render command:

```bash
npx remotion render TutorialVideo "output/remotion-tutorial.mp4" \
  --props-file="video-props.json"
```

Then came the wait. Watching the progress bar crawl forward, frame by frame. 3600 frames, 30fps. Finally, a 16.9 MB MP4 file.

**Done.**

## Looking Back

What did I do?

- Asked a few questions
- Said a few things
- Waited for AI to work

What did AI do?

- Learned Remotion
- Set up the project
- Wrote 600+ lines of code
- Fixed a bunch of bugs
- Rendered the video

That's the magic of conversational development. No memorizing commands, no digging through docs. Say what you're thinking, AI executes.

## The Final Product

A professional Remotion tutorial video:

- **Duration**: 2 minutes (3600 frames, 30fps)
- **Resolution**: 1920×1080
- **Size**: 16.9 MB
- **Format**: MP4 (H.264)
- **Tech Stack**: Remotion 4.x, React, TypeScript

From "teaching AI Remotion" to "getting a finished video"—all through conversation.

![Remotion Tutorial Video](../assets/TutorialVideo-10s.gif)

## Final Thoughts

This experience made me realize that AI isn't just a Q&A tool. It can be a real development partner. You teach it new skills, it does the work, and you solve problems together.

Next time I need to learn a new framework, I probably won't start with the docs. I'll just ask:

> "Do you know this? If not, I'll teach you."

---

Want to try conversational development?

- **Website**: [deepseek-cowork.com](https://deepseek-cowork.com)
- **GitHub**: [DeepSeek Cowork](https://github.com/imjszhang/Deepseek-Cowork)
- **Follow me**: [@imjszhang](https://x.com/imjszhang)
