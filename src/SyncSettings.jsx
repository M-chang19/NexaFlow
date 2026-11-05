import { useEffect, useState } from "react";

const EMPTY_FIELDS = {
  mode: "local",
  supabaseUrl: "",
  supabaseAnonKey: "",
  selfHostedUrl: "",
  selfHostedToken: ""
};

export default function SyncSettings({
  settings,
  session,
  syncStatus,
  onUseLocal,
  onConnectSupabase,
  onConnectSelfHosted,
  onSignOut
}) {
  const [fields, setFields] = useState({ ...EMPTY_FIELDS, ...settings });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setFields({ ...EMPTY_FIELDS, ...settings });
  }, [settings]);

  function updateField(event) {
    setFields(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event, action) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action({
        settings: fields,
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
        accountAction: String(form.get("accountAction") || "signin"),
        workspaceAction: String(form.get("workspaceAction") || "cloud")
      });
      setMessage(result || "Sync is ready.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onSignOut();
      setMessage("Signed out. Your local backup is still available on this device.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card card-surface sync-settings">
      <div className="settings-icon settings-icon-mint">⇄</div>
      <Eyebrow>DEVICE SYNC</Eyebrow>
      <h2>Choose where your workspace lives</h2>
      <p className="settings-copy">
        Local mode stays on this computer. Supabase syncs your private account between devices.
        Self-hosted sync uses your own HTTPS server. Export a backup before changing modes.
      </p>
      <label className="sync-mode-label">
        Sync method
        <select name="mode" value={fields.mode} onChange={updateField}>
          <option value="local">This device only</option>
          <option value="supabase">Supabase account</option>
          <option value="self-hosted">My self-hosted server</option>
        </select>
      </label>

      {fields.mode === "supabase" && (
        <form className="sync-form" onSubmit={event => submit(event, onConnectSupabase)}>
          <label>Supabase project URL<input name="supabaseUrl" type="url" required value={fields.supabaseUrl} onChange={updateField} placeholder="https://your-project.supabase.co" autoComplete="url" /></label>
          <label>Publishable anon key<input name="supabaseAnonKey" type="password" required value={fields.supabaseAnonKey} onChange={updateField} placeholder="sb_publishable_..." autoComplete="off" /></label>
          <label>Email<input name="email" type="email" required autoComplete="username" /></label>
          <label>Password<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
          <label>Account<select name="accountAction" defaultValue="signin"><option value="signin">Sign in</option><option value="signup">Create an account</option></select></label>
          <label>Workspace on this account<select name="workspaceAction" defaultValue="cloud"><option value="cloud">Load the cloud workspace</option><option value="upload">Upload this device's workspace</option></select></label>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect and sync"}</button>
          {session && <button className="button button-secondary" type="button" onClick={signOut} disabled={busy}>Sign out {session.user?.email ? `(${session.user.email})` : ""}</button>}
          <p className="settings-footnote">Use only the project's publishable/anon key, never a service-role key. Your password is sent only to Supabase Auth and is not saved by NexaFlow.</p>
        </form>
      )}

      {fields.mode === "self-hosted" && (
        <form className="sync-form" onSubmit={event => submit(event, onConnectSelfHosted)}>
          <label>Server URL<input name="selfHostedUrl" type="url" required value={fields.selfHostedUrl} onChange={updateField} placeholder="https://your-private-server.example" autoComplete="url" /></label>
          <label>Sync token<input name="selfHostedToken" type="password" required value={fields.selfHostedToken} onChange={updateField} placeholder="Token configured on your server" autoComplete="off" /></label>
          <label>Workspace on this server<select name="workspaceAction" defaultValue="cloud"><option value="cloud">Load the server workspace</option><option value="upload">Upload this device's workspace</option></select></label>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect and sync"}</button>
          <p className="settings-footnote">Only connect over HTTPS outside localhost. Restrict server access with a private network or VPN, and keep the sync token private.</p>
        </form>
      )}

      {fields.mode === "local" && (
        <div className="sync-form">
          <p className="connection-status"><span className="connection-dot connected" />{syncStatus || "Saved on this device; export a backup regularly."}</p>
          <button className="button button-secondary" type="button" onClick={onUseLocal}>Use this device only</button>
        </div>
      )}

      {(fields.mode !== "local" || session) && <p className="connection-status" role="status" aria-live="polite">{syncStatus || "Not connected."}</p>}
      {message && <p className="sync-message" role="status" aria-live="polite">{message}</p>}
      {error && <p className="sync-error" role="alert">{error}</p>}
    </section>
  );
}
