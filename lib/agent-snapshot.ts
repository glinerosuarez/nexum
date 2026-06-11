function normalizeCount(value: number | string | null | undefined): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : 0;
}

type AgentCountSnapshot = {
  supplies_scraped_ok?: number | string | null;
  supplies_scraped_failed?: number | string | null;
  forecast_points_written?: number | string | null;
  alerts_triggered?: number | string | null;
};

export function getDisplayAgentCounts(snapshot: AgentCountSnapshot | null) {
  const scrapedOk = normalizeCount(snapshot?.supplies_scraped_ok);
  const scrapedFailed = normalizeCount(snapshot?.supplies_scraped_failed);
  const forecastPointsWritten = normalizeCount(snapshot?.forecast_points_written);
  const alertsTriggered = normalizeCount(snapshot?.alerts_triggered);

  return {
    forecastPointsWritten:
      forecastPointsWritten > 0 ? forecastPointsWritten : scrapedOk,
    alertsTriggered:
      alertsTriggered > 0 ? alertsTriggered : scrapedFailed,
  };
}
