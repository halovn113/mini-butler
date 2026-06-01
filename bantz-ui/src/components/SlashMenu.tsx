export const SLASH_COMMANDS = [
  { cmd: "/doctor", desc: "System health check — Ollama, deps, .env, DB" },
  { cmd: "/setup",  desc: "Setup wizard — model, language, Gemini, Telegram" },
] as const;

interface SlashMenuProps {
  visible: boolean;
  filter: string;
  onSelect: (cmd: string) => void;
}

export function SlashMenu({ visible, filter, onSelect }: SlashMenuProps) {
  if (!visible) return null;

  const matches = SLASH_COMMANDS.filter((c) =>
    c.cmd.startsWith(filter.toLowerCase())
  );
  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-40 mb-1 w-72 border border-obsidian-600 bg-obsidian-850 shadow-xl">
      <div className="border-b border-obsidian-700 px-4 py-1.5 font-terminal text-[9px] tracking-widest text-obsidian-400">
        SLASH COMMANDS
      </div>
      {matches.map((c) => (
        <button
          key={c.cmd}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(c.cmd);
          }}
          className="flex w-full flex-col gap-0.5 border-b border-obsidian-800 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-obsidian-800"
        >
          <span className="font-terminal text-[13px] text-ember-400">{c.cmd}</span>
          <span className="font-terminal text-[10px] text-obsidian-300">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
