import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh EUW ranked build samples",
  { hours: 1 },
  internal.datasetMaintenance.refreshEuwDataset,
  {},
);

export default crons;
