import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh EUW ranked build samples",
  { minutes: 15 },
  internal.datasetMaintenance.refreshEuwDataset,
  {},
);

crons.interval(
  "prune expired EUW build data",
  { minutes: 30 },
  internal.datasetMaintenance.pruneExpiredData,
  {},
);

export default crons;
