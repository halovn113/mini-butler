import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { PageTitle, PanelHeader } from "../components/primitives";

const OLLAMA_MODELS = [
  "llama3.1:70b",
  "llama3.1:8b",
  "qwen2.5-coder:32b",
  "qwen2.5:14b",
  "mistral-nemo:12b",
  "deepseek-r1:32b",
  "phi3.5:3.8b",
];

const ACCENTS = [
  { key: "ember",  hex: "#FF4500", label: "Ember" },
  { key: "gold",   hex: "#E2BB0B", label: "Gold" },
  { key: "velvet", hex: "#00BFFF", label: "Velvet" },
  { key: "rose",   hex: "#CC1111", label: "Rose" },
];

interface SettingsState {
  ollamaModel: string;
  geminiKey: string;
  ctx: string;
  wakeWord: boolean;
  stt: boolean;
  tts: boolean;
  voice: string;
  lang: "TR" | "EN";
  dateFmt: "DDMM" | "MMDD" | "ISO";
  bonding: number;
  accent: string;
  nightShift: boolean;
  crt: boolean;
  verbosity: "silent" | "standard" | "insufferable";
  autonomy: "low" | "med" | "high" | "abs";
  mood: "tolerant" | "impatient" | "resigned";
}

const DEFAULTS: SettingsState = {
  ollamaModel: "llama3.1:70b",
  geminiKey: "AIzaSy_BantzExampleKey_42",
  ctx: "32k",
  wakeWord: true,
  stt: true,
  tts: true,
  voice: "Aristocratic",
  lang: "EN",
  dateFmt: "DDMM",
  bonding: 42,
  accent: "ember",
  nightShift: false,
  crt: true,
  verbosity: "standard",
  autonomy: "high",
  mood: "tolerant",
};

export function SettingsPage() {
  const [s, setS] = useState<SettingsState>(DEFAULTS);
  const [showKey, setShowKey] = useState(false);
  const set = <K extends keyof SettingsState>(k: K, v: SettingsState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow="Configuration"
        title="HOUSEHOLD SETTINGS"
        sub="Adjust Bantz's operational parameters. He will tolerate the changes."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setS(DEFAULTS)}
              className="border border-obsidian-500 bg-obsidian-800 px-3 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-obsidian-200 transition-colors hover:border-obsidian-300 hover:text-fg-primary"
            >
              Reset
            </button>
            <button
              type="button"
              className="border border-ember-500 bg-ember-500/10 px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-ember-500 transition-all hover:bg-ember-500 hover:text-obsidian-900"
            >
              Apply Changes
            </button>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-5 overflow-y-auto pr-2">
        {/* MODELS */}
        <Section title="Models" hint="LLM backends">
          <Row label="Ollama Model" hint="Local inference">
            <select
              value={s.ollamaModel}
              onChange={(e) => set("ollamaModel", e.target.value)}
              className="w-56 border border-obsidian-500 bg-obsidian-850 px-3 py-2 font-terminal text-[12px] text-ember-300 focus:border-ember-500 focus:outline-none"
            >
              {OLLAMA_MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Row>
          <Row label="Gemini API Key" hint="Remote fallback">
            <div className="flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={s.geminiKey}
                onChange={(e) => set("geminiKey", e.target.value)}
                className="w-44 border border-obsidian-500 bg-obsidian-850 px-3 py-2 font-terminal text-[12px] tracking-widest text-gold-400 focus:border-gold-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="grid h-9 w-9 place-items-center border border-obsidian-500 text-obsidian-200 transition-colors hover:border-ember-500 hover:text-ember-500"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Row>
          <Row label="Context Window" hint="Tokens">
            <select
              value={s.ctx}
              onChange={(e) => set("ctx", e.target.value)}
              className="w-56 border border-obsidian-500 bg-obsidian-850 px-3 py-2 font-terminal text-[12px] text-ember-300 focus:border-ember-500 focus:outline-none"
            >
              {["8k", "16k", "32k", "64k", "128k"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Row>
        </Section>

        {/* VOICE */}
        <Section title="Voice Pipeline" hint="Speech I/O">
          <Row label="Wake Word" hint='"Bantz" · 95% threshold'>
            <Switch on={s.wakeWord} onChange={(v) => set("wakeWord", v)} />
          </Row>
          <Row label="Speech-to-Text" hint="Whisper.cpp · local">
            <Switch on={s.stt} onChange={(v) => set("stt", v)} />
          </Row>
          <Row label="Text-to-Speech" hint="Piper · British male">
            <Switch on={s.tts} onChange={(v) => set("tts", v)} />
          </Row>
          <Row label="Voice" hint="TTS persona">
            <select
              value={s.voice}
              onChange={(e) => set("voice", e.target.value)}
              className="w-56 border border-obsidian-500 bg-obsidian-850 px-3 py-2 font-terminal text-[12px] text-ember-300 focus:border-ember-500 focus:outline-none"
            >
              {["Aristocratic", "Resigned", "Crisp", "Warmly Disdainful"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Row>
        </Section>

        {/* LOCALIZATION */}
        <Section title="Localization" hint="Language">
          <Row label="Language" hint="Conversation locale">
            <Segmented
              value={s.lang}
              onChange={(v) => set("lang", v as SettingsState["lang"])}
              options={[
                { k: "TR", label: "Türkçe" },
                { k: "EN", label: "English" },
              ]}
            />
          </Row>
          <Row label="Date Format" hint="Display">
            <Segmented
              value={s.dateFmt}
              onChange={(v) => set("dateFmt", v as SettingsState["dateFmt"])}
              options={[
                { k: "DDMM", label: "DD/MM" },
                { k: "MMDD", label: "MM/DD" },
                { k: "ISO", label: "ISO" },
              ]}
            />
          </Row>
        </Section>

        {/* BONDING */}
        <Section title="Affinity" hint="Read-only · earned not set">
          <div className="space-y-3 px-5 py-4">
            <div className="flex items-baseline justify-between">
              <div className="font-ui text-[10px] font-bold uppercase tracking-widest text-obsidian-200">
                Bonding Score
              </div>
              <div className="font-display text-[24px] font-extrabold leading-none text-gold-400">
                {s.bonding}
                <span className="text-[12px] opacity-60">/100</span>
              </div>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => {
                const filled = i < Math.round(s.bonding / 5);
                const intense = filled && i >= 14;
                return (
                  <span
                    key={i}
                    className={`h-3 flex-1 ${
                      filled
                        ? intense
                          ? "bg-gold-300 shadow-gold"
                          : "bg-gold-500"
                        : "bg-obsidian-700"
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between font-terminal text-[10px] text-obsidian-300">
              <span>BARELY TOLERATED</span>
              <span>TRUSTED</span>
              <span>FAMILIAR</span>
            </div>
            <p className="mt-3 border-l-2 border-gold-500/60 pl-3 font-terminal text-[12px] italic leading-relaxed text-obsidian-200">
              "I have tolerated your presence for 14 days, 6 hours. You are progressing from{" "}
              <span className="text-fg-primary">stranger</span> to{" "}
              <span className="text-gold-400">acceptable acquaintance</span>. Do not rush it."
            </p>
          </div>
        </Section>

        {/* APPEARANCE */}
        <Section title="Appearance" hint="Accent">
          <Row label="Accent Color" hint="Affects highlights & focus rings">
            <div className="flex items-center gap-2">
              {ACCENTS.map((a) => {
                const sel = s.accent === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => set("accent", a.key)}
                    title={a.label}
                    className={`relative h-9 w-9 border-2 transition-all ${sel ? "border-fg-primary" : "border-transparent hover:border-obsidian-300"}`}
                    style={{ background: a.hex, boxShadow: sel ? `0 0 12px ${a.hex}` : "" }}
                  >
                    {sel && <Check size={14} className="absolute inset-0 m-auto text-obsidian-900" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Night Shift" hint="Velvet palette · low-light hours">
            <Switch on={s.nightShift} onChange={(v) => set("nightShift", v)} />
          </Row>
          <Row label="CRT Effects" hint="Grain + scanlines">
            <Switch on={s.crt} onChange={(v) => set("crt", v)} />
          </Row>
        </Section>

        {/* BEHAVIOR */}
        <Section title="Bantz Behaviour" hint="Personality dials">
          <Row label="Verbosity" hint="Broadcast frequency">
            <Segmented
              value={s.verbosity}
              onChange={(v) => set("verbosity", v as SettingsState["verbosity"])}
              options={[
                { k: "silent", label: "Silent" },
                { k: "standard", label: "Standard" },
                { k: "insufferable", label: "Insufferable" },
              ]}
            />
          </Row>
          <Row label="Autonomy" hint="Permission to act unbidden">
            <Segmented
              value={s.autonomy}
              onChange={(v) => set("autonomy", v as SettingsState["autonomy"])}
              options={[
                { k: "low", label: "Low" },
                { k: "med", label: "Medium" },
                { k: "high", label: "High" },
                { k: "abs", label: "Absolute" },
              ]}
            />
          </Row>
          <Row label="Mood Bias" hint="Default disposition">
            <Segmented
              value={s.mood}
              onChange={(v) => set("mood", v as SettingsState["mood"])}
              options={[
                { k: "tolerant", label: "Tolerant" },
                { k: "impatient", label: "Impatient" },
                { k: "resigned", label: "Resigned" },
              ]}
            />
          </Row>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border border-obsidian-700 bg-obsidian-850/70">
      <PanelHeader title={title} subtitle={hint} />
      <div className="divide-y divide-obsidian-800">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-obsidian-800/30">
      <div>
        <div className="font-ui text-[12px] font-semibold uppercase tracking-wider text-fg-primary">
          {label}
        </div>
        {hint && <div className="mt-0.5 font-terminal text-[10px] text-obsidian-300">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="bz-switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="knob" />
      </span>
    </label>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { k: T; label: string }[];
}) {
  return (
    <div className="inline-flex border border-obsidian-500">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={`px-3 py-2 font-ui text-[10px] font-bold uppercase tracking-widest transition-colors ${
            value === o.k
              ? "bg-ember-500 text-obsidian-900"
              : "bg-obsidian-850 text-obsidian-200 hover:text-ember-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
