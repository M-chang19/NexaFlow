# NexaFlow

NexaFlow is a local-first React workspace for projects, tasks, notes, and AI-assisted problem solving. Vite compiles the React app in `src\`, and the Node API in `server\server.js` stores workspace state in `data\nexaflow.json`.

## Project structure

- `src\` — React app and styles
- `server\` — local Node.js API
- `public\` — PWA icon, manifest, and offline worker
- `data\` — local workspace data
- `dist\` — generated production build
- Root files — app entry point, package/Vite configuration, Docker setup, and documentation

Tasks support editing, priorities, tags, due dates, subtasks, daily/weekly/monthly recurrence, and timed reminders. Use the Kanban board to move tasks, Calendar to review due dates, global search to find tasks/projects/notes/conversation messages, and Activity to review workspace changes. Project detail pages group related tasks, notes, progress, and activity. The focus timer supports 25- and 50-minute sessions linked to tasks.

Projects can be grouped into user-named folders. The Projects, My tasks, Kanban board, Notes, and Activity pages include search or filtering controls to help find and sort workspace items.

NexaFlow can be installed as a PWA from a supported browser and caches the application shell for offline use. Workspace changes made while the local API is unavailable are stored in the browser and synced when it reconnects. A save is only marked synced when the server confirms the latest local copy, so a newer edit made during a sync remains queued. Browser reminders require an open NexaFlow tab; missed reminders are checked when the app is opened again. Browsers do not provide reliable scheduled notifications after every app tab is closed without a push-notification service.

The interface uses brief page and card entrance motion with subtle hover and press feedback. Animations are disabled when the operating system requests reduced motion.

The landing page and workspace adapt automatically to the browser's available screen width. On phones and smaller tablets, the workspace uses a slide-out navigation drawer and touch-sized header controls; wider screens use the expanded laptop layout. On iPhone and iPad, add NexaFlow to the Home Screen for a full-screen app-like view.

On the first visit to an empty workspace, NexaFlow offers a short guide, an optional sample workspace, or a blank start. Sample items can be removed from Settings. Press `Ctrl+K` (or `Command+K` on Mac) to search, `Alt+Shift+T` to create a task, `Alt+Shift+P` to create a project, `Alt+Shift+N` to create a note, and `?` to view shortcuts. Common task status changes and deletions can be undone from the confirmation toast.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

Check that Node.js is available in a newly opened terminal:

```powershell
node --version
npm --version
```

## Development

From the project directory:

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). One command starts both the Vite JSX server and local data API. Keep the terminal open while using the app. Do not open `index.html` directly from File Explorer; React JSX requires Vite.

The root URL shows the NexaFlow introduction. Open [http://127.0.0.1:5173/workspace](http://127.0.0.1:5173/workspace) to use the workspace directly.

## Production

The built site is included in `dist\` for deployments that serve the checked-in production output. When changing the app, regenerate it with `npm run build` and commit the updated `dist\` files along with the source changes.

```powershell
npm run build
npm start
```

Open [http://127.0.0.1:4317/](http://127.0.0.1:4317/) for the NexaFlow introduction, or [http://127.0.0.1:4317/workspace](http://127.0.0.1:4317/workspace) to go directly to the workspace.

## Docker

Start Docker Desktop, then run from the project directory:

```powershell
docker compose up --build -d
docker compose ps
```

Open [http://127.0.0.1:4317/](http://127.0.0.1:4317/) for the NexaFlow introduction, or [http://127.0.0.1:4317/workspace](http://127.0.0.1:4317/workspace) to go directly to the workspace. The service is published only on this computer, and workspace data is kept in the persistent `nexaflow-data` Docker volume.

To stop the service, run `docker compose down`. The volume and its data are preserved; to remove them, run `docker compose down --volumes`.

## Configure AI

NexaFlow supports OpenAI-compatible chat-completions endpoints. Set the key in the same PowerShell terminal used to start the app:

```powershell
$env:NEXAFLOW_AI_API_KEY = "your-provider-api-key"
$env:NEXAFLOW_AI_BASE_URL = "https://api.openai.com/v1"
$env:NEXAFLOW_AI_MODEL = "gpt-4o-mini"
npm run dev
```

The base URL and model are optional. Change them to match your provider. The API key stays in the server process environment and is never saved to the project or browser. Only messages submitted in the assistant are sent to the configured provider; NexaFlow does not automatically include workspace data in prompts.

For Docker, set these variables in PowerShell before starting or restarting the container with `docker compose up -d`:

```powershell
$env:NEXAFLOW_AI_API_KEY = "your-provider-api-key"
$env:NEXAFLOW_AI_BASE_URL = "https://api.openai.com/v1"
$env:NEXAFLOW_AI_MODEL = "gpt-4o-mini"
docker compose up -d
```

## Local data and privacy

In local mode, projects, tasks, notes, and assistant conversations are stored in `data\nexaflow.json`. Settings can export a JSON backup. The workspace data and dependencies are excluded from source control. The local API binds to `127.0.0.1` and this single-user app does not provide accounts, encryption, or multi-user access controls. Keep the data folder private on shared computers.

Backup imports can either merge records into the current workspace or replace it after confirmation. Merged records with conflicting IDs receive new IDs; replacing is destructive, so export a backup first if you may want to restore the current data.

## Workspace sync

Open **Settings > Device Sync** to choose local-only storage, Supabase, or a self-hosted NexaFlow server. Export a backup before changing providers. Remote modes keep a browser copy for offline recovery. If a previously connected device briefly loses its network, NexaFlow retries its saved changes when the connection returns. If the device starts offline or has unresolved changes, choose explicitly whether to load the remote workspace or upload this device's copy.

### Supabase

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) to create the per-account workspace table and row-level security policies.
3. In NexaFlow Settings, choose **Supabase account**, then enter the project URL and its publishable/anon key. Never use a service-role key in the browser.
4. Sign in, or create an account. If email confirmation is enabled for the project's Auth settings, confirm the email and then sign in.
5. Choose whether to load the cloud copy or upload this device's workspace. If the account has no workspace yet, NexaFlow asks before creating one from the current device.

Each Supabase account has one private workspace. Supabase row-level security restricts access to the signed-in user. Updates use a revision check and report concurrent edits instead of silently replacing them; reconnect in Settings and load the latest cloud copy to resolve a conflict. NexaFlow does not provide live multi-device editing.

### Self-hosted server

Self-hosted sync requires an HTTPS reverse proxy or private VPN for connections outside localhost. Do not expose the unencrypted Node API port directly to the Internet. On the server, build the app and configure the API before starting it:

```powershell
npm run build
$env:NEXAFLOW_HOST = "0.0.0.0"
$env:NEXAFLOW_SYNC_TOKEN = "set-a-long-private-token"
$env:NEXAFLOW_ALLOWED_ORIGIN = "https://your-nexaflow-site.example"
npm start
```

Set `NEXAFLOW_ALLOWED_ORIGIN` to the exact browser origin, including the scheme and port when needed. Configure the reverse proxy to provide TLS and forward the site and `/api` requests to the Node server. In NexaFlow Settings, choose **My self-hosted server**, enter the public HTTPS URL and the same sync token, then select which workspace to load. Keep the token private; it is stored in this browser to authorize sync requests. Use a private network or VPN and back up the server's `data\nexaflow.json` file.

The self-hosted API uses a shared token, not per-user accounts. Anyone with that token can access the same server workspace. HTTPS protects the token in transit; it does not encrypt workspace files on the server or in browser storage.

### Backups and calendars

The JSON backup export/import works in every sync mode. Store exported backups somewhere separate from the NexaFlow project and protect them like your workspace data. Calendar export downloads an `.ics` snapshot of task due dates and reminder times; import that file into a calendar app. It is not a live calendar subscription, and later task edits require another export and import.

The Supabase project URL, publishable/anon key, session, and self-hosted sync token are kept in browser local storage so the selected provider can be used again. The publishable key is intended for browser use; never enter a service-role key. Browser storage is not encrypted. Sign out of Supabase on shared devices, keep them locked, and never share your account password or self-hosted token.

## Troubleshooting

- If `node` is not recognized, close and reopen VS Code after installing Node.js, then check `node --version` in a new terminal.
- If dependency installation fails, confirm that npm can access the package registry and retry `npm install`.
- If the app cannot connect, keep the `npm run dev` terminal running and open `http://127.0.0.1:5173/`.
- If port 4317 or 5173 is already in use, stop the other local service using that port.
- If AI is unavailable, check the provider base URL, model, API key, and network access.
