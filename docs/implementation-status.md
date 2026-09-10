# Todoom implementation handoff

Last updated: 2026-09-09 (America/Vancouver)

## Current state

- Public repository: <https://github.com/gstiebler/todoom>
- Repository visibility: public
- Default branch: `main`
- Local `main`: contains all completed implementation and documentation work
- Remote `origin/main`: `c91e0ce`
- Implementation worktree: `.worktrees/todoom-impl`
- Implementation branch: `todoom-impl`
- Latest tested code commit: `6487e5a` (`fix: use Node 20 compatible jsdom`)

All tracked work from `todoom-impl` has been consolidated into local `main`.
Local `main` is three commits ahead of `origin/main`: the Node 20 CI fix, the
initial handoff document, and this consolidation update. Nothing after
`c91e0ce` has been pushed.

## Implemented product behavior

Todoom uses only the non-sensitive Google Drive scope:

```text
https://www.googleapis.com/auth/drive.file
```

After OAuth authorization, it finds or creates `todo.txt` automatically in the
visible My Drive root. It stores the selected file reference under the single
local-storage key `todoom.rootFileRef`. `done.txt` is created beside `todo.txt`
when completed tasks are first archived.

Google Picker has been removed. The app does not require the Picker API, a
Google API key, or a client secret. Deployment requires only the public OAuth
client ID in `VITE_GOOGLE_CLIENT_ID`.

## Verification completed locally

The latest code commit `6487e5a` was verified with:

- `npm test`: 177 tests passed across 14 files.
- `npm run build`: passed.
- `npx playwright test`: 7 Chromium tests passed.
- `jsdom`: pinned to `^26.1.0`, whose Node engine requirement is `>=18`.

## GitHub Actions failure and fix

The first deployment run failed:

- Run ID: `34423310238`
- URL: <https://github.com/gstiebler/todoom/actions/runs/34423310238>
- Failure: the Node 20 runner could not initialize `jsdom@30.0.1` and its
  Undici dependency (`webidl.util.markAsUncloneable is not a function`).

Commit `6487e5a` pins jsdom to the Node-20-compatible `26.x` release. This fix
has passed all local unit, build, and browser checks and is present on local
`main`, but it has not been pushed.

## Deployment state

- GitHub Pages is not enabled. The Pages API currently returns HTTP 404.
- No GitHub Actions repository variables are configured.
- `VITE_GOOGLE_CLIENT_ID` is not available in the local `.env` or process
  environment.
- The published Pages URL is therefore not live yet.
- A real-Google manual test remains: authorize Drive, confirm automatic
  creation of `todo.txt` in My Drive root, add a task, reload, verify
  persistence, and archive a completed task into `done.txt`.

## Resume sequence

Obtain the OAuth 2.0 Web application client ID first. Its authorized JavaScript
origins must include `http://localhost:5173` and
`https://gstiebler.github.io`.

Then, from the main worktree at
`/Users/guistiebler/Documents/Projetos/todoom`:

```bash
gh variable set VITE_GOOGLE_CLIENT_ID --repo gstiebler/todoom --body "CLIENT_ID"
gh api -X POST repos/gstiebler/todoom/pages -f build_type=workflow
git push origin main
gh run watch --repo gstiebler/todoom
```

If enabling Pages returns HTTP 409, it is already configured and the sequence
can continue. After the workflow succeeds, verify
<https://gstiebler.github.io/todoom/> and complete the real-Google manual test.

## Remaining review note

`npm audit` reports five advisories in the Vite/Vitest development toolchain.
`npm audit --omit=dev` reports zero runtime vulnerabilities. Addressing all
development advisories requires major-version upgrades and was intentionally
left outside this release.
