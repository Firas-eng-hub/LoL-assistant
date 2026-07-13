import type { Lane } from "@/types/matchup";

type LaneSelectorProps = {
  selectedLane: Lane | null;
  onSelect: (lane: Lane) => void;
};

type LaneOption = {
  value: Lane;
  label: string;
  description: string;
  icon: string;
};

const laneOptions: LaneOption[] = [
  {
    value: "TOP",
    label: "Top",
    description: "Solo lane",
    icon: "◩",
  },
  {
    value: "JUNGLE",
    label: "Jungle",
    description: "Map control",
    icon: "♧",
  },
  {
    value: "MID",
    label: "Mid",
    description: "Central lane",
    icon: "◇",
  },
  {
    value: "ADC",
    label: "ADC",
    description: "Bot carry",
    icon: "⌁",
  },
  {
    value: "SUPPORT",
    label: "Support",
    description: "Bot utility",
    icon: "✦",
  },
];

export function LaneSelector({
  selectedLane,
  onSelect,
}: LaneSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-slate-300">
        Choose your lane
      </legend>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {laneOptions.map((lane) => {
          const isSelected = selectedLane === lane.value;

          return (
            <button
              key={lane.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(lane.value)}
              className={`group rounded-2xl border p-4 text-left transition ${
                isSelected
                  ? "border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-950/20"
                  : "border-slate-700 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mb-3 grid h-9 w-9 place-items-center rounded-lg text-lg ${
                  isSelected
                    ? "bg-amber-400 text-slate-950"
                    : "bg-slate-800 text-slate-400 group-hover:text-white"
                }`}
              >
                {lane.icon}
              </span>

              <span
                className={`block font-bold ${
                  isSelected ? "text-amber-200" : "text-white"
                }`}
              >
                {lane.label}
              </span>

              <span className="mt-1 block text-xs text-slate-500">
                {lane.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
