# Code Review Graph Setup

This repo uses `code-review-graph` to provide graph-aware context for AI code review and impact analysis.

## Install

Use Python 3.10+.

```bash
python -m pip install --user code-review-graph
python -m code_review_graph install
```

The installer auto-detects supported platforms and writes MCP/tooling rules for this repository.

## Build and Check

```bash
python -m code_review_graph build
python -m code_review_graph status
```

Expected output includes node, edge, and file counts.

## Common Commands

```bash
python -m code_review_graph detect-changes --brief
python -m code_review_graph update
```

## MCP Server Command (Host-Managed)

```bash
python -m code_review_graph serve
```

Do not run `serve` manually in an interactive terminal unless you are wiring a client transport yourself. It is a stdio MCP server entrypoint and is expected to wait for a host process (for example, VS Code MCP). If you stop it with Ctrl+C, stack traces like `CancelledError`/`KeyboardInterrupt` are expected.

## Repo Notes

- Graph data is stored in `.code-review-graph/graph.db`.
- Local VS Code MCP wiring is in `.vscode/mcp.json`.
- Claude/Cursor/OpenCode MCP config files are generated at install time.

## Troubleshooting

If `code-review-graph` is not found in PATH on Windows, use the Python module form shown above (`python -m code_review_graph ...`) instead of the executable shim.

If `python -m code_review_graph serve` exits with `CancelledError` after Ctrl+C, this is normal for manual invocation and does not indicate a broken installation.
