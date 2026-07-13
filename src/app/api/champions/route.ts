import { NextResponse } from "next/server";
import type { Champion } from "@/types/champion";

const DATA_DRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";

type DataDragonChampion = {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  image: {
    full: string;
  };
};

type DataDragonChampionResponse = {
  data: Record<string, DataDragonChampion>;
};

export async function GET() {
  try {
    const versionsResponse = await fetch(
      `${DATA_DRAGON_BASE_URL}/api/versions.json`,
      {
        next: {
          revalidate: 60 * 60 * 12,
        },
      },
    );

    if (!versionsResponse.ok) {
      throw new Error(
        `Unable to retrieve Data Dragon versions: ${versionsResponse.status}`,
      );
    }

    const versions = (await versionsResponse.json()) as string[];
    const latestVersion = versions[0];

    if (!latestVersion) {
      throw new Error("No Data Dragon version was returned.");
    }

    const championsResponse = await fetch(
      `${DATA_DRAGON_BASE_URL}/cdn/${latestVersion}/data/en_US/champion.json`,
      {
        next: {
          revalidate: 60 * 60 * 12,
        },
      },
    );

    if (!championsResponse.ok) {
      throw new Error(
        `Unable to retrieve champions: ${championsResponse.status}`,
      );
    }

    const championData =
      (await championsResponse.json()) as DataDragonChampionResponse;

    const champions: Champion[] = Object.values(championData.data)
      .map((champion) => ({
        id: champion.id,
        key: champion.key,
        name: champion.name,
        title: champion.title,
        tags: champion.tags,
        imageUrl:
          `${DATA_DRAGON_BASE_URL}/cdn/${latestVersion}` +
          `/img/champion/${champion.image.full}`,
      }))
      .sort((firstChampion, secondChampion) =>
        firstChampion.name.localeCompare(secondChampion.name),
      );

    return NextResponse.json({
      version: latestVersion,
      champions,
    });
  } catch (error) {
    console.error("Champion API error:", error);

    return NextResponse.json(
      {
        message: "Unable to load champions.",
      },
      {
        status: 500,
      },
    );
  }
}
