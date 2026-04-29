## Table of Contents

- [Overview](#overview)
- [Session-Oriented Workflow](#session-oriented-workflow)
- [Framework](#framework)
  - [1. Deployment Architecture and Data Flow (Client-Host Topology)](#1-deployment-architecture-and-data-flow-client-host-topology)
  - [2. Runtime Request Sequence (Open Web -> Verify Access Code -> Chat)](#2-runtime-request-sequence-open-web---verify-access-code---chat)
- [Install Extension](#install-extension)
- [Host and Manage the Web Hub](#host-and-manage-the-web-hub)
   - [1. Open Control Menu Dialog](#1-open-control-menu-dialog)
   - [2. Control Menu Description](#2-control-menu-description)
   - [3. Start the Web Hub](#3-start-the-web-hub)
   - [4. Stop the Web Hub](#4-stop-the-web-hub)
   - [5. Use the Web Hub](#5-use-the-web-hub)
      - [5.1 Launch Web Hub](#51-launch-web-hub)
      - [5.2 Global Controls](#52-global-controls)
      - [5.3 Session List Interactions](#53-session-list-interactions)
      - [5.4 Current Session Interactions](#54-current-session-interactions)
- [Usage Example](#usage-example)
   - [1. Share the Web Hub](#1-share-the-web-hub)
   - [2. Use Copilot in the Web Hub](#2-use-copilot-in-the-web-hub)
      - [2.1 Session Operations](#21-session-operations)
      - [2.2 Conversation Operations](#22-conversation-operations)

## Overview
**copilot-share** is a VS Code extension that brings Copilot from the VS Code IDE to a local web hub, delivering a streamlined user experience with reliable session operations and context management.

It can be accessed across devices on the same local area network (LAN) as the host device running VS Code IDE.
You can also share it with family, friends, coworkers, and team members.

More importantly, copilot-share introduces a [session-oriented workflow](#session-oriented-workflow) designed to help teams use Copilot and other LLM products more effectively.

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

Why call it session-oriented:
- A session is a deliberate container for multiple prompts that serve one objective. This is why I call it a session-oriented workflow: it offers a structured way to manage complex projects when prompts drive LLM-based implementation.

## Framework

### 1. Deployment Architecture and Data Flow (Client-Host Topology)

<img src="src/doc/readme/framework-deployment-dataflow.drawio.png" alt="Deployment architecture and data flow" style="display: block; width: min(100%, 760px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 8px; background: #ffffff;" />

### 2. Runtime Request Sequence (Open Web -> Verify Access Code -> Chat)

```mermaid
sequenceDiagram
  autonumber
  participant U as User (Browser)
  participant W as Web App
  participant S as copilot-share Server
  participant L as VS Code Copilot

  U->>W: Open Local/Public Web URL
  W->>S: GET /api/server-info
  S-->>W: Server status and access-control mode

  alt Access control enabled
    U->>W: Enter access code
    W->>S: POST /api/access-code/verify
    S-->>W: Verification result
    W->>W: Store access code for API calls
  else Access control disabled
    W->>W: Continue without access code
  end

  U->>W: Send chat prompt
  W->>S: POST /api/chat (Bearer access code if enabled)
  S->>L: Forward prompt to Copilot model
  L-->>S: Model response (normal or stream)
  S-->>W: Chat response
  W-->>U: Render assistant output
```

## Install Extension
1. Install copilot-share by clicking the VS Code extensions icon (<img src="src/doc/readme/vscode-extensions-icon.png" alt="vscode-extensions-icon" style="height: 1.2em; vertical-align: -0.15em;" />) and searching for `copilot share`.
2. After installation completes, the status bar will show the extension icon (<img src="src/doc/readme/status-bar-icon.png" alt="status-bar-icon" style="height: 1.2em; vertical-align: -0.15em;" />).

## Host and Manage the Web Hub

### 1. Open Control Menu Dialog

- Click the extension icon (<img src="src/doc/readme/status-bar-icon.png" alt="status-bar-icon" style="height: 1.2em; vertical-align: -0.15em;" />) in the status bar to open the control menu window.
<img src="src/doc/readme/control-menu-window-combined.png" alt="control-menu-window" style="display: block; width: min(100%, 420px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 8px;" />

### 2. Control Menu Description

| Menu                 | Purpose |
|----------------------|---------|
| Http Service         | Show the web hub status: running state, port in use, and access control status.|
| Start Sharing        | Start the web hub access control toggled on or off.|
| Stop Sharing         | Stop the web hub.|
| Open Local Web       | Open the web hub at the local URL (`http://127.0.0.1:***/`).|
| Copy Local URL       | Copy the local web hub URL.|
| Open Public Web      | Open the web hub using its LAN-accessible public URL.|
| Copy Public URL      | Copy the public URL and show a QR code for quick access on another device.|
| Regenerate Access Code | Generate a new access code for the web hub.|
| Copy Access Code     | Copy the current access code.|
| Set Access Code      | Manually set the access code.|
| Set Status Bar Icons | Select the status bar icons for the extension.|

### 3. Start the Web Hub

- Click `Start Sharing` in the control menu to start the web hub. 
   - copilot-share lets you enable or disable the access control for local network (LAN) usage.
   <img src="src/doc/readme/control-menu-access-control.png" alt="control-menu-access-control" style="display: block; width: min(100%, 520px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 8px;" />

### 4. Stop the Web Hub
- Click `Stop Sharing` in the control menu to shut down the web hub. 


### 5. Use the Web Hub

#### 5.1 Launch Web Hub on Host Device

1. Click `Open Local Web` or `Open Public Web` in the control menu to use Copilot in a browser on your host device. 
   - Web Hub UI: 
   <img src="src/doc/readme/web-hub-ui-modules-annotation.drawio.png" alt="Web Hub UI modules overview" style="display: block; width: min(100%, 980px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />

#### 5.2 Global Controls

1. UI Buttons
   - <img src="src/doc/readme/web-ui-global-controls.drawio.png" alt="web-ui-global-controls" style="display: block; width: min(100%, 280px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />

2. More Actions
   - <img src="src/doc/readme/web-ui-global-controls-more-action.png" alt="web-ui-global-controls-more-action" style="display: block; width: min(100%, 260px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />

3. Button Purpose Description

| Button               | Purpose |
|----------------------|---------|
| Collapse Sidebar     | Toggle the sidebar between expanded and collapsed views to focus your workspace.|
| Create New Session   | Start a new chat session with Copilot.|
| Search All Sessions  | Find matching text across every session in one search.|
| More Actions         | Open the More Actions menu for additional workspace controls.|
| Share All Sessions   | Export conversations from all sessions to individual Markdown files and download them as a single ZIP package for sharing and review.|
| Import A Session     | Import a Markdown session file to restore a previous conversation and metadata.|
| Export All Sessions  | Export conversations and metadata from all sessions to individual Markdown files and download them as a single ZIP package for local backup, rebuild, review and transfer.|
| Copy Public URL      | Copy the LAN-accessible web hub URL for quick sharing to other devices.|
| Open Public URL      | Open the LAN-accessible web hub URL in your browser.|

#### 5.3 Session List Interactions

1. UI Buttons
   - <img src="src/doc/readme/web-ui-session-list-item.drawio.png" alt="web-ui-session-list-item" style="display: block; width: min(100%, 300px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
2. More Actions
   - <img src="src/doc/readme/web-ui-session-list-item-more-action.png" alt="web-ui-session-list-item-more-action" style="display: block; width: min(100%, 280px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
3. Button Purpose Description

| Button         | Purpose |
|----------------|---------|
| Pin Session    | Pin/Unpin this session to the top of the session list for quick access.|
| Lock Session   | Lock/Unlock this session to prevent accidental updates or edits.|
| More Actions   | Open the More Actions menu for additional session-list options.|
| Rename Session | Give this session a clearer, more meaningful name.|
| Clone Session  | Duplicate this session with its full context for fast reuse.|
| Delete Session | Permanently remove this session when it is no longer needed.|

#### 5.4 Current Session Interactions

1. UI Buttons
   - <img src="src/doc/readme/web-ui-current-session-buttons.drawio.png" alt="web-ui-current-session-buttons" style="display: block; width: min(100%, 460px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
2. More Actions
   - <img src="src/doc/readme/web-ui-current-session-buttons-more-actions.png" alt="web-ui-current-session-buttons-more-actions" style="display: block; width: min(100%, 460px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
3. Session Summary Dialog
   - <img src="src/doc/readme/web-ui-current-session-summary-dialog.drawio.png" alt="web-ui-current-session-summary-dialog" style="display: block; width: min(100%, 400px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
4. Input Area
   - <img src="src/doc/readme/web-ui-current-session-input-area.drawio.png" alt="web-ui-current-session-input-area" style="display: block; width: min(100%, 560px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
5. More Input Actions
   - <img src="src/doc/readme/web-ui-current-session-input-area-more-actions.png" alt="web-ui-current-session-input-area-more-actions" style="display: block; width: min(100%, 200px); height: auto; margin-top: 0.45rem; border: 1px solid #d0d7de; border-radius: 10px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);" />
6. Button Description

| Button         | Purpose |
|----------------|---------|
| Open Session Summary Dialog | Open the Session Summary dialog to generate and manage summary results.|
| Search Current Session | Search for matching text within the current session.|
| Share Session   | Export the current session conversation as a Markdown file for sharing and review.|
| Enter Full Screen | Enter or exit full-screen mode for a more focused workspace.|
| More Actions    | Open the More Actions menu for additional session options.|
| Copy Session    | Copy the current session conversation to the clipboard for quick sharing.|
| Export Session  | Export the current session conversation and metadata as a Markdown file for backup, rebuild, review, or transfer.|
| Clear Session   | Clear the current session conversation, metadata, and context.|
| Clear Context   | Clear only the current session context while keeping messages intact.|
| Back To Session | Close the summary dialog and return to the current session header.|
| Summarize Session Messages | Generate a concise summary of the current session to surface key topics and critical points, removing redundant noise.|
| Open Summary in Mini Window | Open summary results in a compact mini window.|
| Copy Summary    | Copy summary results to the clipboard.|
| Share Summary   | Export current summary results as a Markdown file for sharing and review.|
| Clear Summary   | Clear the current summary results.|
| Drag to resize input area | Drag to increase or decrease the input area height.|
| More Input Actions | Open the More Actions menu for additional input options.|
| Input Tips      | Show prompt-writing tips while you type.|
| Model Picker    | Show available models and let you choose one.|
| Polish Prompt   | Refine the original prompt so it guides Copilot more effectively.|
| Copy Original Prompt | Copy the original user prompt.|
| Send Prompt     | Send the current prompt to the backend.|
| Enable Prompt Suggestions | Enable suggestions based on similar historical prompts while you type.|

## Usage Example

### 1. Share the Web Hub

1. Click `Copy Public URL` in the control menu to access the web hub across devices or share it with family, friends, and team members on the same LAN.
   - This action also provides a QR code image for quick access. 

### 2. Use Copilot in the Web Hub
Access the web hub to use Copilot through a session-oriented workflow.

#### 2.1 Session Operations
1. Easily locate sessions from the session list. 
2. Reorder sessions by dragging with a mouse on PC, or by long-pressing and swiping on mobile. 
3. Search messages within the current session or across all sessions. 
4. Manage each session lifecycle and state: create, rename, delete, pin, and lock. 
5. Export a session (conversation and metadata) and import it later to rebuild across devices. 
6. Copy a session conversation to the clipboard, or share it as an MD file for review.
7. Clone a session for reuse. 
8. Summarize a session and manage the summary to reduce chat noise and focus on key outcomes. 
9. Clear a session's conversation and context, or clear only the context, for flexible session clear. 
10. Rebuild a session's context. 

#### 2.2 Conversation Operations
1. Right-click a message bubble for either a prompt or an agent response to open context menus for copy, share, retry, favorite, and multi-selection actions.
2. Enable historical prompt search to quickly find and reuse similar previous prompts while typing a new one.
3. Polish the original prompt to use LLMs more efficiently with a structured input.
4. Select LLM models based on your needs. 
