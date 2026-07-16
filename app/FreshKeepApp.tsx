"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChatGPTUser } from "./chatgpt-auth";

type Item = {
  id: string;
  name: string;
  quantity: number;
  location: "fridge" | "pantry";
  dateType: DateType;
  itemDate: string;
  reminderOn: string;
  notes: string;
  status: "active" | "used" | "discarded";
  createdBy: string;
};

type Member = {
  id: string;
  email: string;
  displayName?: string | null;
  role: "owner" | "member";
  status: "active" | "pending";
};

type Bootstrap = {
  user: ChatGPTUser;
  needsHousehold?: boolean;
  waitingForInvite?: boolean;
  household?: { id: string; name: string; timezone: string; role: "owner" | "member" };
  items?: Item[];
  members?: Member[];
};

type DateType = "expiry" | "best_before" | "use_by" | "unknown";
type ScanResult = {
  itemName: string;
  date: string | null;
  dateType: DateType;
  rawDateText: string | null;
  dateStatus: "confident" | "ambiguous" | "unreadable";
  warnings: string[];
};

const EMPTY_FORM = {
  name: "",
  itemDate: "",
  dateType: "unknown" as DateType,
  location: "fridge" as "fridge" | "pantry",
  quantity: 1,
  notes: "",
};

export function FreshKeepApp({ signedInUser }: { signedInUser: ChatGPTUser }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<"all" | "fridge" | "pantry">("all");
  const [view, setView] = useState<"active" | "archive">("active");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "FreshKeep could not load.");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FreshKeep could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchBootstrap(controller.signal)
      .then(setData)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "FreshKeep could not load.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorScreen message={error} onRetry={refresh} />;
  if (data?.needsHousehold) return <CreateHousehold user={signedInUser} onCreated={refresh} />;
  if (data?.waitingForInvite || !data?.household) return <WaitingForInvite user={signedInUser} onRetry={refresh} />;

  const items = data.items ?? [];
  const visible = items.filter((item) => {
    const inView = view === "active" ? item.status === "active" : item.status !== "active";
    const matchesLocation = location === "all" || item.location === location;
    const query = search.trim().toLowerCase();
    return inView && matchesLocation && (!query || item.name.toLowerCase().includes(query));
  });
  const today = singaporeToday();
  const expired = visible.filter((item) => item.itemDate < today);
  const soon = visible.filter(
    (item) => item.itemDate >= today && item.reminderOn <= today,
  );
  const later = visible.filter((item) => item.reminderOn > today);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FreshKeep home">
          <span className="brand-dot" aria-hidden="true" />
          FreshKeep
        </a>
        <nav className="top-actions" aria-label="Account actions">
          <button className="quiet-button" onClick={() => setMembersOpen(true)}>
            Household
          </button>
          <a className="avatar" href="/signout-with-chatgpt?return_to=/" title={`Sign out ${signedInUser.email}`}>
            {initials(signedInUser.displayName)}
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">{data.household.name}</p>
          <h1>Know what to<br />use next.</h1>
          <p className="hero-copy">Your fridge and pantry, ordered by what needs attention first.</p>
        </div>
        <div className="hero-aside">
          <div className="fresh-orb" aria-hidden="true"><span>F</span></div>
          <p><strong>{items.filter((item) => item.status === "active").length}</strong> active items</p>
        </div>
      </section>

      <section className="summary-grid" aria-label="Inventory summary">
        <SummaryCard tone="coral" value={expired.length} label="Expired" note="Check these first" />
        <SummaryCard tone="gold" value={soon.length} label="Use soon" note="Inside one month" />
        <SummaryCard tone="sage" value={later.length} label="All good" note="Plenty of time" />
      </section>

      <section className="inventory-section">
        <div className="inventory-heading">
          <div>
            <p className="eyebrow">Household inventory</p>
            <h2>{view === "active" ? "What’s on hand" : "Used & discarded"}</h2>
          </div>
          <button className="primary-button desktop-add" onClick={() => setAddOpen(true)}>
            <span aria-hidden="true">＋</span> Add item
          </button>
        </div>

        <div className="toolbar">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search inventory</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your inventory" />
          </label>
          <div className="segmented" aria-label="Filter by location">
            {(["all", "fridge", "pantry"] as const).map((option) => (
              <button key={option} className={location === option ? "active" : ""} onClick={() => setLocation(option)}>
                {capitalize(option)}
              </button>
            ))}
          </div>
          <button className="archive-toggle" onClick={() => setView(view === "active" ? "archive" : "active")}>
            {view === "active" ? "View archive" : "Back to active"}
          </button>
        </div>

        {visible.length === 0 ? (
          <EmptyInventory archived={view === "archive"} onAdd={() => setAddOpen(true)} />
        ) : view === "archive" ? (
          <ItemGrid items={visible} today={today} onEdit={setEditing} onChanged={refresh} />
        ) : (
          <div className="inventory-groups">
            <ItemGroup title="Expired" detail="Needs attention" tone="coral" items={expired} today={today} onEdit={setEditing} onChanged={refresh} />
            <ItemGroup title="Use soon" detail="Inside the reminder window" tone="gold" items={soon} today={today} onEdit={setEditing} onChanged={refresh} />
            <ItemGroup title="Later" detail="Nothing urgent" tone="sage" items={later} today={today} onEdit={setEditing} onChanged={refresh} />
          </div>
        )}
      </section>

      <button className="floating-add" onClick={() => setAddOpen(true)} aria-label="Add a new item">＋</button>

      {addOpen && <AddItemDialog onClose={() => setAddOpen(false)} onSaved={async () => { setAddOpen(false); await refresh(); }} />}
      {editing && <EditItemDialog item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
      {membersOpen && (
        <HouseholdDialog
          household={data.household}
          members={data.members ?? []}
          onClose={() => setMembersOpen(false)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return <main className="state-screen" role="status"><div className="leaf-loader" aria-hidden="true" /><h1>FreshKeep</h1><p>Opening your household inventory…</p></main>;
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="state-screen"><p className="eyebrow">FreshKeep</p><h1>We couldn’t open your inventory.</h1><p>{message}</p><button className="primary-button" onClick={onRetry}>Try again</button></main>;
}

function CreateHousehold({ user, onCreated }: { user: ChatGPTUser; onCreated: () => void }) {
  const [name, setName] = useState("Our home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const payload = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(payload.error ?? "Could not create the household.");
    onCreated();
  }
  return <main className="onboarding"><div className="onboarding-card"><span className="brand-dot large" /><p className="eyebrow">Welcome to FreshKeep</p><h1>Set up your household.</h1><p>One shared place for {user.displayName} and everyone at home to know what needs using next.</p><form onSubmit={submit}><label>Household name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button wide" disabled={busy}>{busy ? "Creating…" : "Create household"}</button></form></div></main>;
}

function WaitingForInvite({ user, onRetry }: { user: ChatGPTUser; onRetry: () => void }) {
  return <main className="state-screen"><p className="eyebrow">Signed in as {user.email}</p><h1>Your invitation hasn’t arrived yet.</h1><p>Ask the household owner to invite this exact email address, then check again.</p><button className="primary-button" onClick={onRetry}>Check again</button><a className="text-link" href="/signout-with-chatgpt?return_to=/">Use another account</a></main>;
}

function SummaryCard({ tone, value, label, note }: { tone: string; value: number; label: string; note: string }) {
  return <article className={`summary-card ${tone}`}><div className="summary-icon" aria-hidden="true">{tone === "coral" ? "!" : tone === "gold" ? "↗" : "✓"}</div><div><strong>{value}</strong><span>{label}</span><small>{note}</small></div></article>;
}

function ItemGroup(props: { title: string; detail: string; tone: string; items: Item[]; today: string; onEdit: (item: Item) => void; onChanged: () => void }) {
  if (!props.items.length) return null;
  return <section className="item-group"><div className="group-title"><span className={`status-dot ${props.tone}`} /><h3>{props.title}</h3><span>{props.items.length}</span><small>{props.detail}</small></div><ItemGrid items={props.items} today={props.today} onEdit={props.onEdit} onChanged={props.onChanged} /></section>;
}

function ItemGrid({ items, today, onEdit, onChanged }: { items: Item[]; today: string; onEdit: (item: Item) => void; onChanged: () => void }) {
  return <div className="item-grid">{items.map((item) => <ItemCard key={item.id} item={item} today={today} onEdit={() => onEdit(item)} onChanged={onChanged} />)}</div>;
}

function ItemCard({ item, today, onEdit, onChanged }: { item: Item; today: string; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const state = item.itemDate < today ? "expired" : item.reminderOn <= today ? "soon" : "later";
  async function mark(status: "used" | "discarded") {
    setBusy(true);
    await fetch(`/api/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setBusy(false); onChanged();
  }
  return <article className={`item-card ${state}`}>
    <div className="item-photo-wrap">{/* Private photo routes require the viewer's request credentials. */}<img className="item-photo" src={`/api/photos/${item.id}`} alt="" /><span className="location-pill">{item.location === "fridge" ? "❄ Fridge" : "⌂ Pantry"}</span></div>
    <div className="item-content"><div className="item-top"><div><h4>{item.name}</h4><p>{dateLabel(item.dateType)} · {formatDate(item.itemDate)}</p></div><button className="icon-button" onClick={onEdit} aria-label={`Edit ${item.name}`}>•••</button></div>
    <div className="item-bottom"><span className={`date-badge ${state}`}>{relativeDate(item.itemDate, today)}</span><span className="quantity">×{item.quantity}</span></div>
    {item.status === "active" && <div className="quick-actions"><button disabled={busy} onClick={() => mark("used")}>Used up</button><button disabled={busy} onClick={() => mark("discarded")}>Discarded</button></div>}
    {item.status !== "active" && <span className="archive-status">{capitalize(item.status)}</span>}
    </div>
  </article>;
}

function EmptyInventory({ archived, onAdd }: { archived: boolean; onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-basket" aria-hidden="true">◡</div><h3>{archived ? "No archived items" : "Your shelves are clear"}</h3><p>{archived ? "Used and discarded items will appear here." : "Photograph your first perishable to start tracking it."}</p>{!archived && <button className="primary-button" onClick={onAdd}>Add your first item</button>}</div>;
}

function AddItemDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<"photos" | "confirm">("photos");
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [datePhoto, setDatePhoto] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    if (!itemPhoto || !datePhoto) return setError("Take both photos before continuing.");
    setBusy(true); setError("");
    const [preparedItem, preparedDate] = await Promise.all([prepareImage(itemPhoto), prepareImage(datePhoto)]);
    setItemPhoto(preparedItem); setDatePhoto(preparedDate);
    const body = new FormData(); body.set("itemPhoto", preparedItem); body.set("datePhoto", preparedDate);
    try {
      const response = await fetch("/api/analyze", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The photos could not be read.");
      const result = payload.result as ScanResult; setScan(result);
      setForm({ ...EMPTY_FORM, name: result.itemName, itemDate: result.date ?? "", dateType: result.dateType });
      setStep("confirm");
      if (result.dateStatus !== "confident") setTimeout(() => dateRef.current?.focus(), 50);
    } catch (reason) {
      setScan({ itemName: "", date: null, dateType: "unknown", rawDateText: null, dateStatus: "unreadable", warnings: [reason instanceof Error ? reason.message : "Enter the details manually."] });
      setForm(EMPTY_FORM); setStep("confirm"); setTimeout(() => dateRef.current?.focus(), 50);
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!itemPhoto) return setError("The item photo is required.");
    setBusy(true); setError("");
    const body = new FormData(); body.set("photo", itemPhoto);
    Object.entries(form).forEach(([key, value]) => body.set(key, String(value)));
    const response = await fetch("/api/items", { method: "POST", body });
    const payload = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(payload.error ?? "The item could not be saved.");
    onSaved();
  }

  return <Dialog title={step === "photos" ? "Add a perishable" : "Confirm the details"} onClose={onClose}>
    {step === "photos" ? <div className="photo-step"><p className="dialog-intro">Two quick photos help FreshKeep identify the item and read its date.</p><div className="photo-grid"><PhotoInput label="1. Item photo" hint="Show the front of the package" file={itemPhoto} onFile={setItemPhoto} /><PhotoInput label="2. Date photo" hint="Fill the frame with the printed date" file={datePhoto} onFile={setDatePhoto} /></div>{error && <p className="form-error">{error}</p>}<div className="dialog-actions split"><button className="secondary-button" onClick={() => { setStep("confirm"); setScan({ itemName: "", date: null, dateType: "unknown", rawDateText: null, dateStatus: "unreadable", warnings: ["Manual entry selected."] }); }}>Enter manually</button><button className="primary-button" onClick={analyze} disabled={busy || !itemPhoto || !datePhoto}>{busy ? "Reading photos…" : "Read photos"}</button></div><p className="privacy-note">The date photo is read once and never saved.</p></div> : <form className="confirm-form" onSubmit={save}>{scan && scan.dateStatus !== "confident" && <div className="scan-warning"><strong>Please enter the date manually.</strong><span>{scan.warnings[0] ?? "The printed date was not clear enough."}</span></div>}{scan?.rawDateText && <p className="raw-date">Visible text: “{scan.rawDateText}”</p>}<ItemFields form={form} setForm={setForm} dateRef={dateRef} />{error && <p className="form-error">{error}</p>}<div className="dialog-actions split"><button type="button" className="secondary-button" onClick={() => setStep("photos")}>Back</button><button className="primary-button" disabled={busy || !form.name || !form.itemDate}>{busy ? "Saving…" : "Add to inventory"}</button></div></form>}
  </Dialog>;
}

function PhotoInput({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (file: File) => void }) {
  const preview = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <label className={`photo-input ${file ? "has-photo" : ""}`}>{preview ? /* Blob previews cannot use the server image optimizer. */ <img src={preview} alt="Selected preview" /> : <span className="camera-mark" aria-hidden="true">◎</span>}<strong>{file ? "Retake photo" : label}</strong><small>{file ? file.name : hint}</small><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) onFile(selected); }} /></label>;
}

function ItemFields({ form, setForm, dateRef }: { form: typeof EMPTY_FORM; setForm: (form: typeof EMPTY_FORM) => void; dateRef?: React.RefObject<HTMLInputElement | null> }) {
  return <div className="field-grid"><label className="span-2">Item name<input required value={form.name} maxLength={100} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Date<input ref={dateRef} required type="date" value={form.itemDate} onChange={(event) => setForm({ ...form, itemDate: event.target.value })} /></label><label>Date label<select value={form.dateType} onChange={(event) => setForm({ ...form, dateType: event.target.value as DateType })}><option value="expiry">Expiry</option><option value="best_before">Best before</option><option value="use_by">Use by</option><option value="unknown">Date shown</option></select></label><fieldset className="span-2"><legend>Stored in</legend><div className="choice-row"><button type="button" className={form.location === "fridge" ? "selected" : ""} onClick={() => setForm({ ...form, location: "fridge" })}>❄ Fridge</button><button type="button" className={form.location === "pantry" ? "selected" : ""} onClick={() => setForm({ ...form, location: "pantry" })}>⌂ Pantry</button></div></fieldset><label>Quantity<input type="number" min={1} max={99} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label className="span-2">Notes <span>optional</span><textarea maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Opened on Monday, top shelf…" /></label></div>;
}

function EditItemDialog({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: item.name, itemDate: item.itemDate, dateType: item.dateType, location: item.location, quantity: item.quantity, notes: item.notes });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); const response = await fetch(`/api/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const payload = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setError(payload.error ?? "Could not save changes."); onSaved(); }
  async function remove() { if (!window.confirm(`Delete ${item.name} permanently?`)) return; setBusy(true); const response = await fetch(`/api/items/${item.id}`, { method: "DELETE" }); setBusy(false); if (!response.ok) return setError("Could not delete the item."); onSaved(); }
  return <Dialog title="Edit item" onClose={onClose}><form className="confirm-form" onSubmit={save}><ItemFields form={form} setForm={setForm} />{error && <p className="form-error">{error}</p>}<div className="dialog-actions split"><button type="button" className="danger-button" onClick={remove} disabled={busy}>Delete</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form></Dialog>;
}

function HouseholdDialog({ household, members, onClose, onChanged }: { household: NonNullable<Bootstrap["household"]>; members: Member[]; onClose: () => void; onChanged: () => void }) {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function invite(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); const response = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const payload = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) return setMessage(payload.error ?? "Could not add the invitation."); setEmail(""); setMessage(payload.emailSent ? "Invitation sent." : "Invitation saved. Email delivery will begin once Resend is configured."); await onChanged(); }
  async function remove(id: string) { const response = await fetch(`/api/members/${id}`, { method: "DELETE" }); if (response.ok) await onChanged(); }
  return <Dialog title={household.name} onClose={onClose}><div className="household-panel"><p className="dialog-intro">Everyone here can update the shared inventory and receives expiry digests.</p><div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="member-avatar">{initials(member.displayName ?? member.email)}</span><div><strong>{member.displayName ?? member.email.split("@")[0]}</strong><small>{member.email} · {member.status}</small></div><span className="role-pill">{member.role}</span>{household.role === "owner" && member.role !== "owner" && <button className="icon-button" aria-label={`Remove ${member.email}`} onClick={() => remove(member.id)}>×</button>}</div>)}</div>{household.role === "owner" && <form className="invite-form" onSubmit={invite}><label>Invite by email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="housemate@example.com" /></label><button className="primary-button" disabled={busy}>{busy ? "Adding…" : "Invite member"}</button></form>}{message && <p className="form-message">{message}</p>}<p className="privacy-note">Household timezone: {household.timezone}</p></div></Dialog>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); previouslyFocused?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><div><p className="eyebrow">FreshKeep</p><h2 id="dialog-title">{title}</h2></div><button ref={closeRef} className="close-button" onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>;
}

async function prepareImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d"); if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ? new File([blob], "freshkeep-photo.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

async function fetchBootstrap(signal?: AbortSignal): Promise<Bootstrap> {
  const response = await fetch("/api/bootstrap", { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "FreshKeep could not load.");
  return payload as Bootstrap;
}

function singaporeToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function formatDate(value: string): string { return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function relativeDate(value: string, today: string): string { const days = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000); if (days < 0) return `${Math.abs(days)}d overdue`; if (days === 0) return "Today"; if (days === 1) return "Tomorrow"; return `${days} days`; }
function dateLabel(value: DateType): string { return value === "best_before" ? "Best before" : value === "use_by" ? "Use by" : value === "expiry" ? "Expires" : "Dated"; }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function initials(value: string): string { return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FK"; }
