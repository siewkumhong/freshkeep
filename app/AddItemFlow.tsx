"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";

export type DateType = "expiry" | "best_before" | "use_by" | "unknown";

export type ItemForm = {
  name: string;
  itemDate: string;
  dateType: DateType;
  location: "fridge" | "pantry";
  quantity: number;
  notes: string;
};

type ScanResult = {
  itemName: string;
  date: string | null;
  dateType: DateType;
  rawDateText: string | null;
  dateStatus: "confident" | "ambiguous" | "unreadable";
  warnings: string[];
};

const EMPTY_FORM: ItemForm = {
  name: "",
  itemDate: "",
  dateType: "unknown",
  location: "fridge",
  quantity: 1,
  notes: "",
};

type AddItemFlowProps = {
  onSaved: (itemName: string) => void | Promise<void>;
  onStepChange?: (step: "photos" | "confirm") => void;
  contribution?: boolean;
};

export function AddItemFlow({
  onSaved,
  onStepChange,
  contribution = false,
}: AddItemFlowProps) {
  const [step, setStep] = useState<"photos" | "confirm">("photos");
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [datePhoto, setDatePhoto] = useState<File | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "confirm" || scan?.dateStatus === "confident") return;
    const timer = setTimeout(() => dateRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [scan, step]);

  function showConfirmation(result: ScanResult, nextForm: ItemForm) {
    setScan(result);
    setForm(nextForm);
    setStep("confirm");
    onStepChange?.("confirm");
  }

  async function analyze() {
    if (!itemPhoto || !datePhoto) {
      setError("Take both photos before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    const [preparedItem, preparedDate] = await Promise.all([
      prepareImage(itemPhoto),
      prepareImage(datePhoto),
    ]);
    setItemPhoto(preparedItem);
    setDatePhoto(preparedDate);
    const body = new FormData();
    body.set("itemPhoto", preparedItem);
    body.set("datePhoto", preparedDate);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: contribution ? { "X-FreshKeep-Contribution": "1" } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "The photos could not be read.");
      }
      const result = payload.result as ScanResult;
      showConfirmation(result, {
        ...EMPTY_FORM,
        name: result.itemName,
        itemDate: result.date ?? "",
        dateType: result.dateType,
      });
    } catch (reason) {
      showConfirmation(
        {
          itemName: "",
          date: null,
          dateType: "unknown",
          rawDateText: null,
          dateStatus: "unreadable",
          warnings: [
            reason instanceof Error ? reason.message : "Enter the details manually.",
          ],
        },
        EMPTY_FORM,
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!itemPhoto) {
      setError("The item photo is required.");
      return;
    }
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("photo", itemPhoto);
    Object.entries(form).forEach(([key, value]) => body.set(key, String(value)));
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: contribution ? { "X-FreshKeep-Contribution": "1" } : undefined,
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "The item could not be saved.");
        return;
      }
      await onSaved(form.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function enterManually() {
    showConfirmation(
      {
        itemName: "",
        date: null,
        dateType: "unknown",
        rawDateText: null,
        dateStatus: "unreadable",
        warnings: ["Manual entry selected."],
      },
      EMPTY_FORM,
    );
  }

  function backToPhotos() {
    setStep("photos");
    setError("");
    onStepChange?.("photos");
  }

  if (step === "photos") {
    return (
      <div className="photo-step">
        <p className="dialog-intro">
          Two quick photos help FreshKeep identify the item and read its date.
        </p>
        <div className="photo-grid">
          <PhotoInput
            label="1. Item photo"
            hint="Show the front of the package"
            file={itemPhoto}
            onFile={setItemPhoto}
          />
          <PhotoInput
            label="2. Date photo"
            hint="Fill the frame with the printed date"
            file={datePhoto}
            onFile={setDatePhoto}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions split">
          <button
            className="secondary-button"
            onClick={enterManually}
            disabled={!itemPhoto}
          >
            Enter date manually
          </button>
          <button
            className="primary-button"
            onClick={analyze}
            disabled={busy || !itemPhoto || !datePhoto}
          >
            {busy ? "Reading photos…" : "Read photos"}
          </button>
        </div>
        <p className="privacy-note">The date photo is read once and never saved.</p>
      </div>
    );
  }

  return (
    <form className="confirm-form" onSubmit={save}>
      {scan && scan.dateStatus !== "confident" && (
        <div className="scan-warning">
          <strong>Please enter the date manually.</strong>
          <span>{scan.warnings[0] ?? "The printed date was not clear enough."}</span>
        </div>
      )}
      {scan?.rawDateText && <p className="raw-date">Visible text: “{scan.rawDateText}”</p>}
      <ItemFields form={form} setForm={setForm} dateRef={dateRef} />
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions split">
        <button type="button" className="secondary-button" onClick={backToPhotos}>
          Back
        </button>
        <button
          className="primary-button"
          disabled={busy || !form.name || !form.itemDate}
        >
          {busy ? "Saving…" : "Add to inventory"}
        </button>
      </div>
    </form>
  );
}

export function ItemFields({
  form,
  setForm,
  dateRef,
}: {
  form: ItemForm;
  setForm: (form: ItemForm) => void;
  dateRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="field-grid">
      <label className="span-2">
        Item name
        <input
          required
          value={form.name}
          maxLength={100}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label>
        Date
        <input
          ref={dateRef}
          required
          type="date"
          value={form.itemDate}
          onChange={(event) => setForm({ ...form, itemDate: event.target.value })}
        />
      </label>
      <label>
        Date label
        <select
          value={form.dateType}
          onChange={(event) =>
            setForm({ ...form, dateType: event.target.value as DateType })
          }
        >
          <option value="expiry">Expiry</option>
          <option value="best_before">Best before</option>
          <option value="use_by">Use by</option>
          <option value="unknown">Date shown</option>
        </select>
      </label>
      <fieldset className="span-2">
        <legend>Stored in</legend>
        <div className="choice-row">
          <button
            type="button"
            className={form.location === "fridge" ? "selected" : ""}
            onClick={() => setForm({ ...form, location: "fridge" })}
          >
            ❄ Fridge
          </button>
          <button
            type="button"
            className={form.location === "pantry" ? "selected" : ""}
            onClick={() => setForm({ ...form, location: "pantry" })}
          >
            ⌂ Pantry
          </button>
        </div>
      </fieldset>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          max={99}
          value={form.quantity}
          onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
        />
      </label>
      <label className="span-2">
        Notes <span>optional</span>
        <textarea
          maxLength={500}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Opened on Monday, top shelf…"
        />
      </label>
    </div>
  );
}

function PhotoInput({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File) => void;
}) {
  const [preview, setPreview] = useState("");
  const previewRef = useRef("");
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  return (
    <label className={`photo-input ${file ? "has-photo" : ""}`}>
      {preview ? (
        // Blob previews cannot use the server image optimizer.
        <img src={preview} alt="Selected preview" />
      ) : (
        <span className="camera-mark" aria-hidden="true">◎</span>
      )}
      <strong>{file ? "Retake photo" : label}</strong>
      <small>{file ? file.name : hint}</small>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          if (previewRef.current) URL.revokeObjectURL(previewRef.current);
          previewRef.current = URL.createObjectURL(selected);
          setPreview(previewRef.current);
          onFile(selected);
        }}
      />
    </label>
  );
}

async function prepareImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    return blob
      ? new File([blob], "freshkeep-photo.jpg", { type: "image/jpeg" })
      : file;
  } catch {
    return file;
  }
}
