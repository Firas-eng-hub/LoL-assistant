import { MatchupForm } from "@/components/matchup/MatchupForm";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative">
        <header className="mx-auto mb-10 flex w-full max-w-3xl items-center gap-3">
          <Image
            src="/Logo.png"
            alt="LaneForge logo"
            width={44}
            height={44}
            priority
            className="h-11 w-11 rounded-xl"
          />

          <div>
            <p className="font-black text-white">LaneForge</p>
            <p className="text-xs text-slate-500">Matchup build assistant</p>
          </div>
        </header>

        <MatchupForm />

        <footer className="mx-auto mt-10 max-w-4xl text-center text-xs leading-5 text-slate-600">
          LaneForge is not endorsed by Riot Games and does not reflect the
          views or opinions of Riot Games or anyone officially involved in
          producing or managing Riot Games properties. Riot Games and all
          associated properties are trademarks or registered trademarks of
          Riot Games, Inc.
        </footer>
      </div>
    </main>
  );
}
