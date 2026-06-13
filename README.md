# Copilot Share

Copilot Share helps a host safely share VS Code Copilot access and usage budgets across devices on your local network through a web hub, and provides a [session-oriented workflow](#session-oriented-workflow) that treats sessions as reusable and reviewable assets with built-in search, summary, clone, export, and import features.

## Why Copilot Share

- LAN-first by design: no cloud relay required.
- Fast setup: start sharing from the status bar and open a web URL.
- Session-oriented workflow: organize prompts and outcomes by task.
- Built for review and reuse: summarize, clone, export, import, and search.
- Optional access control mode: protect chat APIs with an access code.

## 60-Second Quick Start

1. Install `Copilot Share` from VS Code Marketplace.
2. Click the status bar item (`Copilot Share`) and select `Start Sharing`.
3. Click `Open Local Web` for the host machine, or click `Copy Public URL` for another LAN device.
4. If access control is enabled, enter the access code on the web page.
5. Start chatting and managing work in sessions.

## Quick Demo

1. **Quick Start**

Click the status bar item (`Copilot Share`), select `Start Sharing`, and launch the web hub in seconds.

Demo video: [Quick Start](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/quick-start.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/quick-start.gif" alt="Quick Start Demo" width="760" />


2. **Prompt Polishing: Less Prompt Effort, Better AI Results**

Start with a simple, raw prompt and polish it in one click to produce a clearer, richer, and more actionable instruction for your AI agent.

See the full benchmark and examples in [ai_agent_speed_up_via_prompt_optimization.md](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/promotion/ai_agent_speed_up_via_prompt_optimization.md).

Demo video: [Less Prompt Effort, Better AI Results](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/ai_agent_speed_up_via_prompt_optimization2.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/ai_agent_speed_up_via_prompt_optimization2.gif" alt="Prompt Polishing Demo" width="760" />

3. **Message Contextual Menus: More Message Operations**

Right-click a message bubble to open the contextual menu, then copy, favorite, delete, or retry messages with one click.

Demo video: [Message Contextual Menus](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/message-contextual-menus.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/message-contextual-menus.gif" alt="Message Contextual Menus" width="760" />

4. **Session Summary:**

Generate a concise summary of the current session to surface key topics, critical points, and next actions while reducing chat noise.

Demo video: [Session Summary](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-summary.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-summary.gif" alt="Session Summary" width="760" />

5. **Session Search: Improve session usage, allow reuse and thus saving tokens**

Find matching content in the current session or across all sessions to speed up reuse and reduce repeated prompting.

Demo video: [Session Search](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-search.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-search.gif" alt="Session Search" width="760" />


6. **Session Export and Import: Rebuild and Review Sessions Across Devices**

Export sessions as Markdown for backup and sharing, then import them to quickly rebuild context on another device.

Demo video: [Session Rebuild](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-rebuild.gif)

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/session-rebuild.gif" alt="Session Rebuild" width="760" />

## Best For

- Developers who want Copilot on a second screen while coding.
- Teams and workshops sharing one Copilot-enabled VS Code host.
- Session-based AI workflows that need search, summary, and exportable artifacts.
- LAN-only environments that prefer local control and low setup friction.

## Why Try Copilot Share

1. 🤗 Use Copilot on phones, tablets, laptops, and other devices on the same local network without setting up a cloud relay.
2. 🏖️ Share Copilot access and usage budgets with teammates, family members, or workshop participants.
3. 🚀 Session-oriented workflow that treats prompts and responses as reusable assets, with search, summary, clone, export, and import built in.
4. ✍️ Built-in Prompt Polish Button: Refine draft prompts before sending for clearer, higher-quality results.
5. 🧏‍♂️ Access control mode: When enabled, protect chat APIs with a bearer access code.
6. 🧠 Build a reusable knowledge base from long-running chats and break large work into manageable, session-based tasks.

## Session-Oriented Workflow

Traditionally, code was used to build applications and services. AI changes this by making prompts the primary way to generate code, documentation, and resource files.

🦄 In this model:
- Prompts are like source code.
- Sessions are like source files.

♨️ That means prompts and sessions should be:
- Treated as core work assets, just like code and source files.
- Reviewed with the same discipline used for code so you can confirm direction, validate requirements, surface gaps early, and reduce the risk of misleading AI-generated outputs.

😜 Why call it session-oriented?
- A session is a focused container for prompts that work toward a single objective.
- A large project can be broken into smaller tasks, which can be further broken down into subtasks. Every task across all levels can be tracked in its own session. This creates a practical end-to-end session-driven workflow to manage structured multi-stage Copilot tasks.


## Detailed Workflow

Use [60-Second Quick Start](#60-second-quick-start) to get connected first, then use this checklist for day-to-day work:

1. Install the extension from the VS Code Marketplace.
2. Create or open a session in the web hub.
3. Send prompts, retry prompts, and polish drafts when needed.
4. Search within one session or across all sessions.
5. Summarize noisy chat history into focused outcomes.
6. Export or share sessions as Markdown for review and reuse.

## Screenshots

- [Control Menu](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/control-menu-window-combined.png) (start/stop sharing, URLs, access code):

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/control-menu-window-combined.png" alt="Copilot Share control menu" style="display: block; width: min(100%, 460px); height: auto; margin-top: 0.5rem; border: 1px solid #d0d7de; border-radius: 8px;" />

- [Web hub UI modules](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/web-hub-ui-modules-annotation.drawio.png):

<img src="https://github.com/warlordy/vscode-extension-copilot-share/blob/main/src/doc/readme/web-hub-ui-modules-annotation.drawio.png" alt="Copilot Share web hub modules" style="display: block; width: min(100%, 980px); height: auto; margin-top: 0.5rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff;" />

## Architecture Snapshot

- VS Code extension backend hosts a local HTTP server.
- Web frontend runs in a browser and calls local APIs.
- Chat requests are forwarded to VS Code Copilot models.
- Optional access control uses bearer access code checks for protected routes.

## Security and Networking Notes

- LAN-first design: no cloud relay required.
- Server binds to a LAN-capable host address.
- Access control can be enabled at share start.


## Documentation

- 🏃 UI guide and detailed operations: [ui-guide-details.md](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/ui-guide-details.md)
- 🎯 Extension architecture and implementation notes: [.github/copilot-instructions.md](https://github.com/warlordy/vscode-extension-copilot-share/blob/main/.github/copilot-instructions.md)

## Feedback and Issues

Ideas, bugs, and workflow suggestions are welcome:

- Issues: https://github.com/warlordy/vscode-extension-copilot-share/issues
- Repository: https://github.com/warlordy/vscode-extension-copilot-share
