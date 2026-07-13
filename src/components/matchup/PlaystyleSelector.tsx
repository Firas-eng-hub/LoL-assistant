import type { Playstyle } from "@/types/matchup";

type PlaystyleSelectorProps = {
  selectedPlaystyle: Playstyle | null;
  onSelect: (playstyle: Playstyle) => void;
};

type PlaystyleOption = {
  value: Playstyle;
  label: string;
  description: string;
  detail: string;
};

const playstyleOptions: PlaystyleOption[] = [
  {
    value: "SAFE",
    label: "Safe",
    description: "Prioritize survival",
    detail:
      "Focuses on sustain, defensive stats, and reducing early matchup risk.",
  },
  {
    value: "BALANCED",
    label: "Balanced",
    description: "Standard recommendation",
    detail:
      "Balances damage, survivability, and the normal power curve for the matchup.",
  },
  {
    value: "AGGRESSIVE",
    label: "Aggressive",
    description: "Pressure the opponent",
    detail:
      "Prioritizes early damage, lane pressure, and snowball potential.",
  },
];

export function PlaystyleSelector({
  selectedPlaystyle,
  onSelect,
}: PlaystyleSelectorProps) {
  const selectedOption = playstyleOptions.find(
    (option) => option.value === selectedPlaystyle,
  );

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-slate-300">
        Choose your playstyle
      </legend>

      <div className="grid gap-3 md:grid-cols-3">
        {playstyleOptions.map((option) => {
          const isSelected = selectedPlaystyle === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option.value)}
              className={`rounded-2xl border p-5 text-left transition ${
                isSelected
                  ? "border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-950/20"
                  : "border-slate-700 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`block text-lg font-bold ${
                      isSelected ? "text-amber-200" : "text-white"
                    }`}
                  >
                    {option.label}
                  </span>

                  <span className="mt-1 block text-sm text-slate-400">
                    {option.description}
                  </span>
                </div>

                <span
                  aria-hidden="true"
                  className={`mt-1 h-4 w-4 rounded-full border ${
                    isSelected
                      ? "border-amber-300 bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]"
                      : "border-slate-600"
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {selectedOption && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-sm text-slate-300">
            <strong className="text-white">{selectedOption.label}:</strong>{" "}
            {selectedOption.detail}
          </p>
        </div>
      )}
    </fieldset>
  );
}
