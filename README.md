## Overview
🚢**copilot-share** is a VS Code extension that brings Copilot from the VS Code IDE to a local web hub, delivering a streamlined user experience through robust session/conversation operations and reliable context management. 

This extension helps you:
- Access Copilot across devices on your local network
- Easily share Copilot budget and access seamlessly with family, friends, coworkers, and teams

🚀**copilot-share** introduces the [session-oriented workflow](#session-oriented-workflow) that treats prompts and sessions as reusable, reviewable work assets—just like source code. 

This approach helps you:
- Review, refine, and share chat sessions for better outcomes
- Organize and track LLM-driven work from initial prompts, enabling an end-to-end review workflow
- Build a personal or team knowledge base for smarter reuse

⛽**copilot-share** provides additional standout features. 

- Process user prompts from multiple chat sessions concurrently
- Provide a Prompt Polish button to help users start using Copilot from draft prompts.
- PWA‑enabled webpage for native‑app‑like installation and usage

⚙️**copilot-share** operates in a simple [framework](#framework).

## Session-Oriented Workflow

Traditionally, we used code to build applications and services. Because of that, we reviewed code to ensure it matched design goals and business scenarios, and that it met expectations for runtime reliability (memory/concurrency/I/O), privacy, and network safety.

Today, prompts guide LLMs to generate code, documentation, and resource files.

In this model:
- Prompts are like source code.
- Sessions are like source files.

That means prompts and sessions should be:
- Treated as core work assets, just like code and source files.
- Reviewed with the same level of discipline used for code and source files,
  so we can confirm direction, validate objectives, find gaps early, avoid misleading outputs, and reduce the risk of accepting responses that sound convincing but are inaccurate.
- Used to build a personal knowledge base or knowledge graph—ideal for technical showcases, solution prototyping, AI-driven demonstrations, and proof-of-concept (POC) workflows, enabling smarter reuse and accelerated innovation. 

Why call it session-oriented?
- A session is a deliberate container for multiple prompts that serve one objective. This is why I call it a session-oriented workflow: it offers a structured way to manage complex projects when prompts drive LLM-based implementation.

## UI Guide Details

[View UI details](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/README.md).
