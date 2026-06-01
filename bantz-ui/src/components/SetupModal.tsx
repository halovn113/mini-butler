import { useState, type ReactNode } from "react";
import { X, ChevronRight, Check } from "lucide-react";
import { PanelHeader } from "./primitives";
import { useAppStore } from "../store/useAppStore";

// TODO(backend): Writing the .env file requires a new WS message in live_ui.py:
//   recv: { type: "write_env", values: { KEY: "value", ... } }
//   send: { type: "env_saved" }
// Until then, known keys are applied via the existing set_config WS message,
// and a copyable .env snippet is shown for keys without a set_config handler.

interface WizardValues {
  ollamaModel: string;
  language: "tr" | "en";
  geminiEnabled: boolean;
  geminiKey: string;
  porcupineEnabled: boolean;
  porcupineKey: string;
  telegramEnabled: boolean;
  telegramToken: string;
  telegramUserId: string;
}

const DEFAULTS: WizardValues = {
  ollamaModel: "llama3.1:8b",
  language: "tr",
  geminiEnabled: false,
  geminiKey: "",
  porcupineEnabled: false,
  porcupineKey: "",
  telegramEnabled: false,
  telegramToken: "",
  telegramUserId: "",
};

const STEPS = ["Model", "Language", "Gemini", "Porcupine", "Telegram", "Review"] as const;
type StepName = typeof STEPS[number];

interface SetupModalProps {
  onClose: () => void;
}

export function SetupModal({ onClose }: SetupModalProps) {
  const wsSend = useAppStore((s) => s.wsSend);
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<WizardValues>(DEFAULTS);
  const [submitted, setSubmitted] = useState(false);

  const set = <K extends keyof WizardValues>(k: K, v: WizardValues[K]) =>
    setVals((p) => ({ ...p, [k]: v }));

  function apply() {
    if (wsSend) {
      wsSend({ type: "set_config", key: "ollama_model",           value: vals.ollamaModel });
      wsSend({ type: "set_config", key: "language",               value: vals.language });
      wsSend({ type: "set_config", key: "gemini_enabled",         value: vals.geminiEnabled });
      if (vals.geminiKey)      wsSend({ type: "set_config", key: "gemini_api_key",         value: vals.geminiKey });
      wsSend({ type: "set_config", key: "wake_word_enabled",      value: vals.porcupineEnabled });
      if (vals.porcupineKey)   wsSend({ type: "set_config", key: "picovoice_access_key",   value: vals.porcupineKey });
      if (vals.telegramToken)  wsSend({ type: "set_config", key: "telegram_bot_token",     value: vals.telegramToken });
      if (vals.telegramUserId) wsSend({ type: "set_config", key: "telegram_allowed_users", value: vals.telegramUserId });
    }
    setSubmitted(true);
  }

  const progressPct = (step / (STEPS.length - 1)) * 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-900/80 backdrop-blur-sm"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex w-[520px] flex-col border border-obsidian-600 bg-obsidian-900 shadow-2xl">
        <PanelHeader
          title="Setup Wizard"
          subtitle={`STEP ${step + 1} / ${STEPS.length} · ${STEPS[step].toUpperCase()}`}
          right={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center border border-obsidian-500 text-obsidian-300 transition-colors hover:border-ember-500 hover:text-ember-500"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          }
        />

        {/* Progress bar */}
        <div className="h-0.5 bg-obsidian-800">
          <div
            className="h-0.5 bg-ember-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="min-h-[220px] px-6 py-6">
          {submitted ? (
            <SubmittedView vals={vals} connected={!!wsSend} />
          ) : (
            <StepContent step={STEPS[step]} vals={vals} set={set} />
          )}
        </div>

        {!submitted && (
          <div className="flex items-center justify-between border-t border-obsidian-700 bg-obsidian-850/60 px-5 py-3">
            <button
              type="button"
              onClick={() => setStep((p) => Math.max(0, p - 1))}
              disabled={step === 0}
              className="border border-obsidian-500 px-3 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-obsidian-300 transition-colors hover:border-obsidian-300 hover:text-fg-primary disabled:opacity-30"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((p) => p + 1)}
                className="flex items-center gap-2 border border-ember-500 bg-ember-500/10 px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-ember-500 transition-all hover:bg-ember-500 hover:text-obsidian-900"
              >
                Next <ChevronRight size={11} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={apply}
                className="flex items-center gap-2 border border-[#2E7D32] bg-[#2E7D32]/10 px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-[#2E7D32] transition-all hover:bg-[#2E7D32] hover:text-obsidian-900"
              >
                <Check size={11} strokeWidth={2} /> Apply
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepContent({
  step,
  vals,
  set,
}: {
  step: StepName;
  vals: WizardValues;
  set: <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void;
}) {
  const inputCls =
    "w-full border border-obsidian-500 bg-obsidian-850 px-3 py-2 font-terminal text-[13px] text-fg-primary focus:border-ember-500 focus:outline-none";

  switch (step) {
    case "Model":
      return (
        <Field label="Ollama model" hint="Must be pulled first: ollama pull <model>">
          <input
            type="text"
            className={inputCls}
            value={vals.ollamaModel}
            onChange={(e) => set("ollamaModel", e.target.value)}
            placeholder="llama3.1:8b"
          />
        </Field>
      );

    case "Language":
      return (
        <Field label="Preferred language" hint="Language Bantz uses in responses.">
          <div className="inline-flex border border-obsidian-500">
            {(["tr", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => set("language", l)}
                className={`px-5 py-2 font-ui text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  vals.language === l
                    ? "bg-ember-500 text-obsidian-900"
                    : "bg-obsidian-850 text-obsidian-200 hover:text-ember-300"
                }`}
              >
                {l === "tr" ? "Türkçe" : "English"}
              </button>
            ))}
          </div>
        </Field>
      );

    case "Gemini":
      return (
        <div className="space-y-5">
          <Field label="Enable Gemini as fallback LLM" hint="Uses Gemini Flash when Ollama is overloaded or offline.">
            <Toggle on={vals.geminiEnabled} onChange={(v) => set("geminiEnabled", v)} />
          </Field>
          {vals.geminiEnabled && (
            <Field label="Gemini API key" hint="Free key at aistudio.google.com">
              <input
                type="password"
                className={inputCls}
                value={vals.geminiKey}
                onChange={(e) => set("geminiKey", e.target.value)}
                placeholder="AIza…"
              />
            </Field>
          )}
        </div>
      );

    case "Porcupine":
      return (
        <div className="space-y-5">
          <Field label={`"Hey Bantz" wake word`} hint="Free Porcupine key at console.picovoice.ai.">
            <Toggle on={vals.porcupineEnabled} onChange={(v) => set("porcupineEnabled", v)} />
          </Field>
          {vals.porcupineEnabled && (
            <Field label="Porcupine access key" hint="Free tier available at console.picovoice.ai">
              <input
                type="password"
                className={inputCls}
                value={vals.porcupineKey}
                onChange={(e) => set("porcupineKey", e.target.value)}
                placeholder="Access key…"
              />
            </Field>
          )}
        </div>
      );

    case "Telegram":
      return (
        <div className="space-y-5">
          <Field label="Telegram remote access" hint="Control Bantz from your phone via a Telegram bot.">
            <Toggle on={vals.telegramEnabled} onChange={(v) => set("telegramEnabled", v)} />
          </Field>
          {vals.telegramEnabled && (
            <>
              <Field label="Bot token" hint="Create a bot at t.me/BotFather">
                <input
                  type="password"
                  className={inputCls}
                  value={vals.telegramToken}
                  onChange={(e) => set("telegramToken", e.target.value)}
                  placeholder="1234567890:ABC…"
                />
              </Field>
              <Field label="Your Telegram user ID" hint="Find yours at t.me/userinfobot">
                <input
                  type="text"
                  className={inputCls}
                  value={vals.telegramUserId}
                  onChange={(e) => set("telegramUserId", e.target.value)}
                  placeholder="123456789"
                />
              </Field>
            </>
          )}
        </div>
      );

    case "Review":
      return (
        <div className="space-y-1.5">
          <div className="mb-4 font-ui text-[11px] uppercase tracking-widest text-obsidian-300">
            Review your configuration:
          </div>
          {[
            ["Ollama model",  vals.ollamaModel],
            ["Language",      vals.language],
            ["Gemini",        vals.geminiEnabled ? "enabled" : "disabled"],
            ["Wake word",     vals.porcupineEnabled ? "enabled" : "disabled"],
            ["Telegram",      vals.telegramEnabled ? "enabled" : "disabled"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-obsidian-800 py-2">
              <span className="font-terminal text-[11px] text-obsidian-300">{label}</span>
              <span className="font-terminal text-[11px] text-ember-300">{value}</span>
            </div>
          ))}
        </div>
      );
  }
}

function SubmittedView({ vals, connected }: { vals: WizardValues; connected: boolean }) {
  const envLines = [
    `BANTZ_OLLAMA_MODEL=${vals.ollamaModel}`,
    `BANTZ_LANGUAGE=${vals.language}`,
    `BANTZ_GEMINI_ENABLED=${vals.geminiEnabled}`,
    vals.geminiKey      ? `BANTZ_GEMINI_API_KEY=${vals.geminiKey}`       : null,
    `BANTZ_WAKE_WORD_ENABLED=${vals.porcupineEnabled}`,
    vals.porcupineKey   ? `BANTZ_PICOVOICE_ACCESS_KEY=${vals.porcupineKey}` : null,
    vals.telegramToken  ? `TELEGRAM_BOT_TOKEN=${vals.telegramToken}`     : null,
    vals.telegramUserId ? `TELEGRAM_ALLOWED_USERS=${vals.telegramUserId}` : null,
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-ui text-[12px] font-bold uppercase tracking-wider text-[#2E7D32]">
        <Check size={14} strokeWidth={2} />
        {connected
          ? "Settings sent to Bantz via WebSocket."
          : "Backend offline — copy these values to your .env:"}
      </div>
      {/* Shown when WS unavailable; remove once write_env backend message is implemented */}
      {!connected && (
        <pre className="overflow-auto border border-obsidian-600 bg-obsidian-850 p-4 font-terminal text-[11px] leading-relaxed text-gold-300 select-all">
          {envLines}
        </pre>
      )}
      <div className="font-terminal text-[10px] text-obsidian-400">
        .env path: ~/.local/share/bantz/.env
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="font-ui text-[12px] font-semibold uppercase tracking-wider text-fg-primary">
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 font-terminal text-[10px] text-obsidian-300">{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="bz-switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="knob" />
      </span>
    </label>
  );
}
