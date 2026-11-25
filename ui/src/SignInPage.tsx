import { type FormEvent, useState } from "react";

import { Button, Card, CardBody, CardHeader, CoreAlert, Input, Typography } from "@tetherto/mdk-react-devkit/primitives";

import { auth, errorMessage } from "./utils";

// Users live in the Kernel: create one with `npm run mdk -- user add <name> --admin`.
export function SignInPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.signInWithPassword({ username, password });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Card style={{ width: 360 }}>
        <CardHeader>
          <Typography variant="heading3">Sign in to MDK Site</Typography>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <CoreAlert type="error" title={error} showIcon />}
            <Button type="submit" disabled={busy || !username || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
