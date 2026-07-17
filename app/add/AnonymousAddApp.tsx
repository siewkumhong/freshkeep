"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AddItemFlow } from "../AddItemFlow";

export function AnonymousAddApp() {
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedItem, setSavedItem] = useState("");
  const [flowKey, setFlowKey] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    if (token) window.history.replaceState(null, "", "/add");
    fetch("/api/contribution-session", {
      method: token ? "POST" : "GET",
      headers: token ? { "Content-Type": "application/json" } : undefined,
      body: token ? JSON.stringify({ token }) : undefined,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "This private add link is not active.");
        }
        setHouseholdName(payload.householdName);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "This add link is unavailable."),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="state-screen" role="status">
        <div className="leaf-loader" aria-hidden="true" />
        <h1>FreshKeep</h1>
        <p>Opening the household add link…</p>
      </main>
    );
  }

  if (error || !householdName) {
    return (
      <main className="state-screen">
        <p className="eyebrow">FreshKeep</p>
        <h1>This add link isn’t available.</h1>
        <p>{error || "Ask the household owner to share the private link again."}</p>
        <Link className="text-link" href="/">Sign in to FreshKeep</Link>
      </main>
    );
  }

  if (savedItem) {
    return (
      <main className="anonymous-add-shell success">
        <section className="anonymous-success" aria-live="polite">
          <span className="success-mark" aria-hidden="true">✓</span>
          <p className="eyebrow">Added to {householdName}</p>
          <h1>{savedItem} is on the list.</h1>
          <p>The household will see it in FreshKeep and receive reminders as usual.</p>
          <button
            className="primary-button wide"
            onClick={() => {
              setSavedItem("");
              setFlowKey((value) => value + 1);
            }}
          >
            Add another item
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="anonymous-add-shell">
      <header className="anonymous-add-header">
        <span className="brand">
          <span className="brand-dot" aria-hidden="true" />
          FreshKeep
        </span>
        <span className="private-link-pill">Private add link</span>
      </header>
      <section className="anonymous-add-intro">
        <p className="eyebrow">Adding to {householdName}</p>
        <h1>Photograph it.<br />We’ll read the date.</h1>
        <p>No account needed. Confirm the details before anything is saved.</p>
      </section>
      <section className="anonymous-add-card">
        <AddItemFlow key={flowKey} onSaved={setSavedItem} contribution />
      </section>
    </main>
  );
}
