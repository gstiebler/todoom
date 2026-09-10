# Todoom

A browser task manager backed by a single `todo.txt` file in your Google Drive.
After you connect Google Drive, Todoom finds or creates the file automatically
in the visible My Drive root using the narrow `drive.file` permission.

Live at https://gstiebler.github.io/todoom/

## Setup

1. In the Google Cloud console, create a project and enable the Google Drive API.
2. Create an OAuth 2.0 Client ID of type "Web application". Add these authorized
   JavaScript origins:
   - `http://localhost:5173`
   - `https://gstiebler.github.io`
3. On the OAuth consent screen, choose External, add the scope
   `https://www.googleapis.com/auth/drive.file`, and add your own Google account
   as a test user. Leave the app in Testing mode.
4. Copy `.env.example` to `.env` and fill in the client ID.
5. For deployment, add the same value as a GitHub Actions repository variable
   named `VITE_GOOGLE_CLIENT_ID`.

The client ID is not a secret. It is compiled into the published bundle. No API
key or client secret is required.

## Development

    npm install
    npm run dev
    npm test
    npm run e2e

## Format

Todoom follows the todo.txt format, plus two common extensions:

- `due:YYYY-MM-DD` sets a due date.
- `rec:1w` repeats a task one week after completion. `rec:+1w` repeats it one
  week after the previous due date instead. Units are `d`, `w`, `m`, `y`.

Completing a task moves its priority into a `pri:` pair so it can be restored.
"Archive completed" moves finished tasks into `done.txt` beside `todo.txt`.
