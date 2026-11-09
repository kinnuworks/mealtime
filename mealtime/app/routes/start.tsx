import { callAction } from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export function meta() {
  return [{ title: "Mealtime: every dish lands on time" }];
}

// The first screen does the thing: open a fresh copy of the demo kitchen.
export default function Start() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let done = false;
    callAction("create-kitchen", { demo: true })
      .then((r: { hostKey: string }) => {
        if (!done) navigate(`/k/${r.hostKey}`, { replace: true });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      done = true;
    };
  }, [navigate]);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      {error ? (
        <p className="text-sm text-red-600">Couldn't open the demo kitchen: {error}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Setting the table…</p>
      )}
    </main>
  );
}
