# Todoom

A browser task manager backed by a single `todo.txt` file in your Google Drive.
After you connect Google Drive, Todoom finds or creates the file automatically
in the visible My Drive root using the narrow `drive.file` permission.

Sign-in runs through a small Cloudflare Worker that serves the app and holds
the Google refresh token in an encrypted, `HttpOnly` cookie, so a session lasts
as long as the cookie rather than the one-hour access token. The Worker is
stateless: there is no database.

## Setup

1. In the Google Cloud console, create a project and enable the Google Drive API.
2. Create an OAuth 2.0 Client ID of type "Web application" with these
   authorized **redirect URIs**:
   - `http://127.0.0.1:8787/auth/callback`
   - `https://<your-worker-domain>/auth/callback`
3. On the OAuth consent screen, choose External and add the scope
   `https://www.googleapis.com/auth/drive.file`. Publish the app: `drive.file`
   is non-sensitive, so no verification review is needed, and leaving it in
   Testing expires every refresh token after 7 days.
4. Copy `.env.example` to `.dev.vars` and fill in the client id, client secret,
   and any long random string as the session secret.
5. For deployment, set the same three as Worker secrets:

       npx wrangler secret put GOOGLE_CLIENT_ID
       npx wrangler secret put GOOGLE_CLIENT_SECRET
       npx wrangler secret put SESSION_SECRET

Unlike the browser-only version this replaces, the client **secret** is a real
secret. It lives only in `.dev.vars` (git-ignored) and in Worker secrets, and
never reaches the browser.

`SESSION_SECRET` encrypts the refresh token inside the cookie. Changing it
signs every user out.

## Development

    npm install
    npm run dev         # UI only, no sign-in
    npm run dev:worker  # full stack on http://127.0.0.1:8787
    npm test
    npm run e2e
    npm run deploy      # build + wrangler deploy

## Format

Todoom follows the todo.txt format, plus two common extensions:

- `due:YYYY-MM-DD` sets a due date.
- `rec:1w` repeats a task one week after completion. `rec:+1w` repeats it one
  week after the previous due date instead. Units are `d`, `w`, `m`, `y`.

Completing a task moves its priority into a `pri:` pair so it can be restored.
"Archive completed" moves finished tasks into `done.txt` beside `todo.txt`.
