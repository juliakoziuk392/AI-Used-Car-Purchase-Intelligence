@AGENTS.md
## Rules for Automatic Task Delegation
- Evaluate the incoming user request. If the task is straightforward (e.g., writing simple unit tests, boilerplate code, formatting, or adding basic comments/docstrings), DO NOT write the code yourself.
- **CRITICAL (Automation):** Instead of stopping, you must AUTOMATICALLY invoke the `codex-dispatch` tool (or the active Codex plugin tool) to execute this task directly.
- Pass a clear, precise instruction to the Codex tool specifying what needs to be done and which files to modify.
- Once Codex finishes executing the task, review the changes, confirm completion, and report back to the user (e.g., "I detected this as a simple task and automatically had Codex handle it. Here are the changes...").

## Execution Restrictions
- **CRITICAL:** DO NOT run any commands that restart, reload, or rebuild Docker containers, local servers, or development environments. Leave server management entirely to the user.
- **CRITICAL:** DO NOT execute any Git commands to commit (`git commit`) or push (`git push`) changes to the repository under any circumstances. All version control actions must be performed manually by the user.

