"use client";

import { useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { BuildResult } from "@/components/build/BuildResult";
import { ChampionSelector } from "@/components/champions/ChampionSelector";
import { LaneSelector } from "@/components/matchup/LaneSelector";
import { MatchupReview } from "@/components/matchup/MatchupReview";
import { PlaystyleSelector } from "@/components/matchup/PlaystyleSelector";
import type { BuildRecommendation } from "@/types/build";
import type { Champion } from "@/types/champion";
import type { Lane, Playstyle } from "@/types/matchup";
import { api } from "../../../convex/_generated/api";

const RECALL_GOLD_PRESETS = [500, 800, 1100, 1300] as const;

type RecommendationMetadata = {
  source: "cache" | "groq";
  generatedAt: number;
  dataDragonVersion: string;
};

export function MatchupForm() {
  const generateBuildAction = useAction(api.builds.generateBuild);
  const generationIdRef = useRef(0);

  const [playerChampion, setPlayerChampion] =
    useState<Champion | null>(null);
  const [enemyChampion, setEnemyChampion] =
    useState<Champion | null>(null);
  const [selectedLane, setSelectedLane] = useState<Lane | null>(null);
  const [selectedPlaystyle, setSelectedPlaystyle] =
    useState<Playstyle | null>("BALANCED");
  const [firstRecallGold, setFirstRecallGold] = useState(1100);
  const [recommendation, setRecommendation] =
    useState<BuildRecommendation | null>(null);
  const [recommendationMetadata, setRecommendationMetadata] =
    useState<RecommendationMetadata | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  const isMatchupComplete = useMemo(() => {
    return Boolean(
      playerChampion &&
        enemyChampion &&
        selectedLane &&
        selectedPlaystyle &&
        firstRecallGold >= 300 &&
        playerChampion.id !== enemyChampion.id,
    );
  }, [
    playerChampion,
    enemyChampion,
    selectedLane,
    selectedPlaystyle,
    firstRecallGold,
  ]);

  function resetGeneratedBuild() {
    generationIdRef.current += 1;
    setRecommendation(null);
    setRecommendationMetadata(null);
    setGenerationError("");
    setIsGenerating(false);
  }

  function handlePlayerChampionChange(champion: Champion | null) {
    setPlayerChampion(champion);
    resetGeneratedBuild();

    if (champion && enemyChampion?.id === champion.id) {
      setEnemyChampion(null);
    }
  }

  function handleEnemyChampionChange(champion: Champion | null) {
    setEnemyChampion(champion);
    resetGeneratedBuild();

    if (champion && playerChampion?.id === champion.id) {
      setPlayerChampion(null);
    }
  }

  function handleLaneChange(lane: Lane) {
    setSelectedLane(lane);
    resetGeneratedBuild();
  }

  function handlePlaystyleChange(playstyle: Playstyle) {
    setSelectedPlaystyle(playstyle);
    resetGeneratedBuild();
  }

  async function handleGenerateBuild() {
    if (
      !playerChampion ||
      !enemyChampion ||
      !selectedLane ||
      !selectedPlaystyle ||
      isGenerating
    ) {
      return;
    }

    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;

    try {
      setIsGenerating(true);
      setGenerationError("");

      const result = await generateBuildAction({
        playerChampionId: playerChampion.id,
        playerChampionKey: playerChampion.key,
        playerChampionName: playerChampion.name,
        playerChampionTags: playerChampion.tags,
        enemyChampionId: enemyChampion.id,
        enemyChampionKey: enemyChampion.key,
        enemyChampionName: enemyChampion.name,
        lane: selectedLane,
        playstyle: selectedPlaystyle,
        firstRecallGold,
      });

      if (generationIdRef.current !== generationId) {
        return;
      }

      setGenerationError("");
      setRecommendation(result.recommendation);
      setRecommendationMetadata({
        source: result.source,
        generatedAt: result.generatedAt,
        dataDragonVersion: result.dataDragonVersion,
      });

      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      });
    } catch (error) {
      if (generationIdRef.current !== generationId) {
        return;
      }

      console.error("Build generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : "";
      setGenerationError(
        /statistically meaningful|statistical evidence|available match evidence/i.test(
          errorMessage,
        )
          ? "No statistically supported build is available for this request yet. More ranked match data must be collected before a recommendation can be shown."
          : "We could not generate this recommendation. Please try again.",
      );
    } finally {
      if (generationIdRef.current === generationId) {
        setIsGenerating(false);
      }
    }
  }

  if (
    recommendation &&
    recommendationMetadata &&
    playerChampion &&
    enemyChampion &&
    selectedLane &&
    selectedPlaystyle
  ) {
    return (
      <BuildResult
        playerChampion={playerChampion}
        enemyChampion={enemyChampion}
        lane={selectedLane}
        playstyle={selectedPlaystyle}
        recommendation={recommendation}
        metadata={recommendationMetadata}
        onEditMatchup={() => {
          setRecommendation(null);
          setRecommendationMetadata(null);
          setGenerationError("");

          window.requestAnimationFrame(() => {
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          });
        }}
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-7 lg:p-10">
        <header className="mb-9">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-400">
              Matchup setup
            </p>
            <p className="text-sm text-slate-500">5 required choices</p>
          </div>

          <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
            Build your lane matchup
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Choose the matchup and how you want to approach the lane.
          </p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_auto_1fr]">
          <ChampionSelector
            label="Your champion"
            selectedChampion={playerChampion}
            onSelect={handlePlayerChampionChange}
            excludedChampionId={enemyChampion?.id}
            placeholder="Search your champion..."
          />

          <div className="flex items-center justify-center lg:pt-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-950 font-black text-slate-500">
              VS
            </div>
          </div>

          <ChampionSelector
            label="Enemy champion"
            selectedChampion={enemyChampion}
            onSelect={handleEnemyChampionChange}
            excludedChampionId={playerChampion?.id}
            placeholder="Search the enemy champion..."
          />
        </div>

        <div className="my-9 h-px bg-slate-800" />

        <LaneSelector selectedLane={selectedLane} onSelect={handleLaneChange} />

        <div className="my-9 h-px bg-slate-800" />

        <PlaystyleSelector
          selectedPlaystyle={selectedPlaystyle}
          onSelect={handlePlaystyleChange}
        />

        <div className="my-9 h-px bg-slate-800" />

        <fieldset>
          <legend className="text-lg font-bold text-white">
            First recall gold
          </legend>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Recall recommendations will never exceed this budget.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {RECALL_GOLD_PRESETS.map((gold) => {
              const isSelected = firstRecallGold === gold;

              return (
                <button
                  key={gold}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setFirstRecallGold(gold);
                    resetGeneratedBuild();
                  }}
                  className={`rounded-xl border px-4 py-2.5 font-semibold transition ${
                    isSelected
                      ? "border-amber-400 bg-amber-400/10 text-amber-200"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {gold.toLocaleString()} gold
                </button>
              );
            })}

            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-400 focus-within:border-amber-400">
              Custom
              <input
                type="number"
                min={300}
                max={5000}
                step={50}
                value={firstRecallGold}
                onChange={(event) => {
                  const nextGold = Number(event.target.value);
                  setFirstRecallGold(
                    Number.isFinite(nextGold)
                      ? Math.min(5000, Math.max(0, Math.floor(nextGold)))
                      : 0,
                  );
                  resetGeneratedBuild();
                }}
                aria-label="Custom first recall gold"
                className="w-24 bg-transparent py-2.5 text-right font-semibold text-white outline-none"
              />
            </label>
          </div>
        </fieldset>

        {playerChampion &&
          enemyChampion &&
          selectedLane &&
          selectedPlaystyle && (
            <div className="mt-9">
              <MatchupReview
                playerChampion={playerChampion}
                enemyChampion={enemyChampion}
                lane={selectedLane}
                playstyle={selectedPlaystyle}
              />
            </div>
          )}

        {isGenerating && (
          <div
            role="status"
            className="mt-7 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5"
          >
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-300"
              />

              <div>
                <p className="font-semibold text-amber-200">
                  Analyzing the matchup
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Ranking recent match evidence and validating the recall
                  budget before preparing the explanation.
                </p>
              </div>
            </div>
          </div>
        )}

        {generationError && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
          >
            <p className="font-semibold text-red-300">
              Build generation failed
            </p>
            <p className="mt-1 text-sm leading-6 text-red-200/80">
              {generationError}
            </p>
            <button
              type="button"
              onClick={() => {
                void handleGenerateBuild();
              }}
              disabled={isGenerating}
              className="mt-4 rounded-xl border border-red-400/30 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        )}

        <div className="mt-9 flex flex-col gap-4 border-t border-slate-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <SelectionStatus
            playerChampion={playerChampion}
            enemyChampion={enemyChampion}
            selectedLane={selectedLane}
            selectedPlaystyle={selectedPlaystyle}
            firstRecallGold={firstRecallGold}
          />

          <button
            type="button"
            disabled={!isMatchupComplete || isGenerating}
            onClick={() => {
              void handleGenerateBuild();
            }}
            className="min-w-52 rounded-2xl bg-amber-400 px-7 py-3.5 font-bold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isGenerating ? "Analyzing matchup..." : "Generate Build"}
          </button>
        </div>
      </div>
    </section>
  );
}

type SelectionStatusProps = {
  playerChampion: Champion | null;
  enemyChampion: Champion | null;
  selectedLane: Lane | null;
  selectedPlaystyle: Playstyle | null;
  firstRecallGold: number;
};

function SelectionStatus({
  playerChampion,
  enemyChampion,
  selectedLane,
  selectedPlaystyle,
  firstRecallGold,
}: SelectionStatusProps) {
  const completedCount = [
    playerChampion,
    enemyChampion,
    selectedLane,
    selectedPlaystyle,
    firstRecallGold >= 300 ? firstRecallGold : null,
  ].filter(Boolean).length;

  if (completedCount === 5) {
    return (
      <p className="text-sm font-medium text-emerald-300">
        Everything is ready.
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-500">
      {completedCount} of 5 selections completed.
    </p>
  );
}
