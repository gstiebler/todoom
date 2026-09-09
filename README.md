# Todoom

A browser task manager backed by a single `todo.txt` file in your Google Drive.

Live at https://gstiebler.github.io/todoom/

## Setup

1. In the Google Cloud console, create a project and enable the Google Drive API
   and the Google Picker API.
2. Create an OAuth 2.0 Client ID of type "Web application". Add these authorized
   JavaScript origins:
   - `http://localhost:5173`
   - `https://gstiebler.github.io`
3. On the OAuth consent screen, choose External, add the scope
   `https://www.googleapis.com/auth/drive.file`, and add your own Google account
   as a test user. Leave the app in Testing mode.
4. Create an API key and restrict it to the Google Picker API.
5. Copy `.env.example` to `.env` and fill in both values.
6. For deployment, add the same two values as GitHub Actions repository
   variables named `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`.

Neither value is a secret. Both are compiled into the published bundle.

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
