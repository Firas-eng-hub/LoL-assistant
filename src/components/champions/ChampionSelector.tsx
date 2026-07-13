"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Champion } from "@/types/champion";

type ChampionsApiResponse = {
  version: string;
  champions: Champion[];
};

type ChampionSelectorProps = {
  label: string;
  selectedChampion: Champion | null;
  onSelect: (champion: Champion | null) => void;
  placeholder?: string;
  excludedChampionId?: string;
};

const MAX_RESULTS = 12;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function filterChampions(
  champions: Champion[],
  searchTerm: string,
  excludedChampionId?: string,
): Champion[] {
  const normalizedSearch = normalizeText(searchTerm.trim());
  const availableChampions = champions.filter(
    (champion) => champion.id !== excludedChampionId,
  );

  if (!normalizedSearch) {
    return availableChampions.slice(0, MAX_RESULTS);
  }

  return availableChampions
    .filter((champion) => {
      const normalizedName = normalizeText(champion.name);
      const normalizedId = normalizeText(champion.id);

      return (
        normalizedName.includes(normalizedSearch) ||
        normalizedId.includes(normalizedSearch)
      );
    })
    .sort((firstChampion, secondChampion) => {
      const firstName = normalizeText(firstChampion.name);
      const secondName = normalizeText(secondChampion.name);

      const firstStartsWith = firstName.startsWith(normalizedSearch);
      const secondStartsWith = secondName.startsWith(normalizedSearch);

      if (firstStartsWith && !secondStartsWith) {
        return -1;
      }

      if (!firstStartsWith && secondStartsWith) {
        return 1;
      }

      return firstChampion.name.localeCompare(secondChampion.name);
    })
    .slice(0, MAX_RESULTS);
}

export function ChampionSelector({
  label,
  selectedChampion,
  onSelect,
  placeholder = "Search for a champion...",
  excludedChampionId,
}: ChampionSelectorProps) {
  const generatedId = useId();
  const inputId = `champion-search-${generatedId}`;
  const listboxId = `champion-results-${generatedId}`;

  const [champions, setChampions] = useState<Champion[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadChampions() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await fetch("/api/champions", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Champion list could not be loaded.");
        }

        const data = (await response.json()) as ChampionsApiResponse;
        setChampions(data.champions);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error(error);
        setErrorMessage(
          "We could not load the champion list. Refresh the page and try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadChampions();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const filteredChampions = useMemo(
    () => filterChampions(champions, searchTerm, excludedChampionId),
    [champions, searchTerm, excludedChampionId],
  );

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }

    resultRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex]);

  function selectChampion(champion: Champion) {
    onSelect(champion);
    setSearchTerm("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function clearSelection() {
    onSelect(null);
    setSearchTerm("");
    setIsOpen(true);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      setActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, filteredChampions.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
    }

    if (event.key === "Enter") {
      event.preventDefault();

      const champion = filteredChampions[activeIndex];

      if (champion) {
        selectChampion(champion);
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  }

  if (selectedChampion) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-300">{label}</p>

        <div className="flex min-h-24 items-center gap-4 rounded-2xl border border-amber-400/40 bg-slate-950/70 p-4 shadow-lg shadow-black/20">
          <img
            src={selectedChampion.imageUrl}
            alt={`${selectedChampion.name} portrait`}
            className="h-16 w-16 rounded-xl object-cover"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-white">
              {selectedChampion.name}
            </p>
            <p className="truncate text-sm capitalize text-slate-400">
              {selectedChampion.title}
            </p>
          </div>

          <button
            type="button"
            onClick={clearSelection}
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-3">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-slate-300"
      >
        {label}
      </label>

      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
        >
          <path
            d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={searchTerm}
          placeholder={placeholder}
          disabled={isLoading}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="h-16 w-full rounded-2xl border border-slate-700 bg-slate-950/80 pl-12 pr-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 disabled:cursor-wait disabled:opacity-60"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-slate-400">Loading champions...</p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {errorMessage}
        </p>
      )}

      {isOpen && !isLoading && !errorMessage && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-black/60"
        >
          {filteredChampions.length > 0 ? (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {filteredChampions.map((champion, index) => (
                <button
                  ref={(element) => {
                    resultRefs.current[index] = element;
                  }}
                  id={`${listboxId}-option-${index}`}
                  key={champion.id}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectChampion(champion)}
                  className={`flex items-center gap-3 rounded-xl p-3 text-left transition ${
                    activeIndex === index
                      ? "bg-amber-400/15 text-amber-200"
                      : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <img
                    src={champion.imageUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover"
                  />

                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {champion.name}
                    </span>
                    <span className="block truncate text-xs capitalize text-slate-500">
                      {champion.title}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-5 text-center">
              <p className="font-semibold text-slate-300">No champion found</p>
              <p className="mt-1 text-sm text-slate-500">
                Check the spelling and try again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
