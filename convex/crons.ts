import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "recover stalled notifications",
  { minutes: 10 },
  internal.automation.outbox.sweep,
);

crons.daily(
  "refresh tool availability",
  { hourUTC: 0, minuteUTC: 5 },
  internal.automation.inbound.refreshAvailability,
);

export default crons;
