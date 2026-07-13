const DATA_DRAGON_URL = "https://ddragon.leagueoflegends.com";

type DataDragonItem = {
  name: string;
  tags?: string[];
  into?: string[];
  maps?: Record<string, boolean>;
  inStore?: boolean;
  gold?: {
    total?: number;
    purchasable?: boolean;
  };
};

type DataDragonItemsResponse = {
  data: Record<string, DataDragonItem>;
};

export async function getCurrentDataDragonPatch(): Promise<string> {
  const versionsResponse = await fetch(`${DATA_DRAGON_URL}/api/versions.json`);

  if (!versionsResponse.ok) {
    throw new Error("Could not retrieve the current Data Dragon version.");
  }

  const versions = (await versionsResponse.json()) as string[];
  const version = versions[0];

  if (!version) {
    throw new Error("Data Dragon returned no versions.");
  }

  const [major, minor] = version.split(".");

  if (!major || !minor || !/^\d+$/.test(major) || !/^\d+$/.test(minor)) {
    throw new Error(`Data Dragon returned an invalid version: ${version}.`);
  }

  return `${major}.${minor}`;
}

export async function getCompletedItemIdsForPatch(
  patch: string,
): Promise<Set<string>> {
  const versionsResponse = await fetch(`${DATA_DRAGON_URL}/api/versions.json`);

  if (!versionsResponse.ok) {
    throw new Error("Could not retrieve Data Dragon versions.");
  }

  const versions = (await versionsResponse.json()) as string[];
  const version = versions.find((candidate) =>
    candidate.startsWith(`${patch}.`),
  );

  if (!version) {
    throw new Error(`No Data Dragon item data is available for patch ${patch}.`);
  }

  const itemsResponse = await fetch(
    `${DATA_DRAGON_URL}/cdn/${version}/data/en_US/item.json`,
  );

  if (!itemsResponse.ok) {
    throw new Error(`Could not retrieve Data Dragon items for ${version}.`);
  }

  const itemData = (await itemsResponse.json()) as DataDragonItemsResponse;
  const storeItems = Object.fromEntries(
    Object.entries(itemData.data).filter(([, item]) =>
      isCurrentStoreItem(item),
    ),
  );
  const storeItemIds = new Set(Object.keys(storeItems));
  const completedItemIds = new Set<string>();

  for (const [itemId, item] of Object.entries(storeItems)) {
    const tags = item.tags ?? [];
    const buildsIntoStoreItem = (item.into ?? []).some((targetId) =>
      storeItemIds.has(targetId),
    );
    const excludedCategory = ["Boots", "Consumable", "Trinket"].some((tag) =>
      tags.includes(tag),
    );
    const excludedName = /ornn|masterwork|placeholder|deprecated|prototype/i.test(
      item.name,
    );

    if (
      !buildsIntoStoreItem &&
      !excludedCategory &&
      !excludedName &&
      (item.gold?.total ?? 0) >= 1800
    ) {
      completedItemIds.add(itemId);
    }
  }

  if (completedItemIds.size === 0) {
    throw new Error(`No completed items were found for patch ${patch}.`);
  }

  return completedItemIds;
}

function isCurrentStoreItem(item: DataDragonItem): boolean {
  return (
    item.maps?.["11"] === true &&
    item.gold?.purchasable === true &&
    item.inStore !== false &&
    Boolean(item.name)
  );
}
