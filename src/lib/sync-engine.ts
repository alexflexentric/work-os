import { prisma } from "@/lib/db";
import {
  createCalendar,
  createEvent,
  importEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  listSyncedEvents,
  registerWatch,
} from "@/lib/google";
import { fetchAndParseIcal, icalEventToGoogleEvent } from "@/lib/ical";
import {
  getMicrosoftEventsDelta,
  createMicrosoftEvent,
  updateMicrosoftEvent,
  deleteMicrosoftEvent,
  graphEventToGoogleEvent,
  googleEventToGraphBody,
} from "@/lib/microsoft";
import type { CalendarConnection } from "@prisma/client";

const SYNC_ORIGIN_TAG = "calypso-sync";

// Returns true if a Google Calendar API error means the event is already gone (404/410).
// In that case we should clean up the local mapping but not surface it as an error.
function isGoneError(err: unknown): boolean {
  const e = err as { code?: number; status?: number; message?: string };
  const status = e.code ?? e.status;
  if (status === 404 || status === 410) return true;
  const msg = e.message ?? "";
  return msg.includes("Resource has been deleted") || msg.includes("Not Found");
}

// Returns true for Google OAuth token errors (expired/revoked refresh token, disabled client).
// These require the user to reconnect their Google account — surfaced as a clear message.
function isAuthError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? String(err);
  return (
    msg.includes("disabled_client") ||
    msg.includes("invalid_grant") ||
    msg.includes("Token has been expired or revoked") ||
    msg.includes("invalid_client")
  );
}

export interface SyncResult {
  connectionId: string;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export async function syncConnection(
  connection: CalendarConnection,
  force = false
): Promise<SyncResult> {
  const result: SyncResult = {
    connectionId: connection.id,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  try {
    if (connection.sourceType === "ical") {
      await syncIcal(connection, result, force);
    } else if (connection.sourceType === "microsoft") {
      await syncMicrosoft(connection, result);
    } else {
      result.errors.push(`Unsupported source type: ${connection.sourceType}`);
    }

    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncedAt: new Date(),
        syncErrors: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    // Ensure a push-notification watch is registered (or renewed) for this calendar
    await ensureWatch(connection);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);

    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        syncErrors: { increment: 1 },
        lastErrorAt: new Date(),
        lastErrorMessage: message.slice(0, 500),
      },
    });
  }

  return result;
}

async function syncIcal(
  connection: CalendarConnection,
  result: SyncResult,
  force = false
): Promise<void> {
  if (!connection.icalUrl) {
    throw new Error("iCal connection missing URL");
  }

  const userId = connection.userId;

  // Ensure target Google Calendar exists
  let targetCalendarId = connection.targetGoogleCalendarId;
  if (!targetCalendarId) {
    targetCalendarId = await createCalendar(
      userId,
      connection.targetGoogleCalendarName
    );
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { targetGoogleCalendarId: targetCalendarId },
    });
  }

  // Fetch and parse iCal feed — filter to 90 days past → 365 days ahead
  const allIcalEvents = await fetchAndParseIcal(connection.icalUrl);
  const now = Date.now();
  const windowStart = now - 30 * 24 * 3600 * 1000;
  const windowEnd = now + 365 * 24 * 3600 * 1000;
  const icalEvents = allIcalEvents.filter(
    (e) => e.end.getTime() >= windowStart && e.start.getTime() <= windowEnd
  );

  // Load existing event mappings for this connection
  const existingMappings = await prisma.eventMapping.findMany({
    where: { connectionId: connection.id },
  });
  const mappingBySourceId = new Map(
    existingMappings.map((m) => [m.sourceEventId, m])
  );
  const seenSourceIds = new Set<string>();

  for (const icalEvent of icalEvents) {
    const sourceId = icalEvent.uid;
    seenSourceIds.add(sourceId);
    const mapping = mappingBySourceId.get(sourceId);
    const googleEvent = icalEventToGoogleEvent(icalEvent);

    // Skip cancelled events that were never synced
    if (icalEvent.status === "cancelled" && !mapping) continue;

    if (!mapping) {
      // New event — import into Google Calendar (upserts by iCalUID, so
      // re-syncing after a lost EventMapping won't fail with "already exists")
      try {
        const created = await importEvent(userId, targetCalendarId, {
          ...googleEvent,
          extendedProperties: {
            private: { [SYNC_ORIGIN_TAG]: connection.id },
          },
        });
        await prisma.eventMapping.create({
          data: {
            connectionId: connection.id,
            sourceEventId: sourceId,
            googleEventId: created.id ?? null,
            sourceLastModified: icalEvent.lastModified ?? null,
            googleLastModified: created.updated
              ? new Date(created.updated)
              : null,
          },
        });
        result.created++;
      } catch (err) {
        result.errors.push(
          `Create failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if (mapping.googleEventId) {
      // Existing event — check if source was modified
      const sourceModified = icalEvent.lastModified?.getTime() ?? 0;
      const lastSynced = mapping.sourceLastModified?.getTime() ?? 0;

      if (icalEvent.status === "cancelled") {
        // Delete from Google Calendar
        try {
          await deleteEvent(userId, targetCalendarId, mapping.googleEventId);
        } catch (err) {
          // If already gone from Google, still clean up the stale mapping below
          if (!isGoneError(err)) {
            result.errors.push(
              `Delete failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`
            );
            continue;
          }
        }
        await prisma.eventMapping.delete({ where: { id: mapping.id } });
        result.deleted++;
      } else if (sourceModified > lastSynced || force) {
        // Update in Google Calendar
        try {
          const updated = await updateEvent(
            userId,
            targetCalendarId,
            mapping.googleEventId,
            {
              ...googleEvent,
              extendedProperties: {
                private: { [SYNC_ORIGIN_TAG]: connection.id },
              },
            }
          );
          await prisma.eventMapping.update({
            where: { id: mapping.id },
            data: {
              sourceLastModified: icalEvent.lastModified ?? null,
              googleLastModified: updated.updated
                ? new Date(updated.updated)
                : null,
            },
          });
          result.updated++;
        } catch (err) {
          result.errors.push(
            `Update failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  // ── Reconciliation pass ────────────────────────────────────────────────────
  // List every Google event we created for this connection (via the calypso-sync
  // extended property) within the sync window. Delete any that no longer exist
  // in the source feed — these are events cancelled/deleted in the origin calendar.
  const windowTimeMin = new Date(windowStart).toISOString();
  const windowTimeMax = new Date(windowEnd).toISOString();

  // Build a set of all UIDs currently in the source (including seen ones)
  const sourceUids = new Set(icalEvents.map((e) => e.uid));

  try {
    const googleSyncedEvents = await listSyncedEvents(
      userId, targetCalendarId, connection.id, windowTimeMin, windowTimeMax
    );

    for (const gEvent of googleSyncedEvents) {
      if (!gEvent.id) continue;
      // Google sometimes appends @google.com to iCalUID — strip it for comparison
      const rawUid = gEvent.iCalUID ?? "";
      const uid = rawUid.replace(/@google\.com$/, "");
      if (!uid) continue;

      if (sourceUids.has(uid) || sourceUids.has(rawUid)) continue; // still in source

      // No longer in source → delete from Google
      try {
        await deleteEvent(userId, targetCalendarId, gEvent.id);
      } catch (err) {
        if (!isGoneError(err)) {
          result.errors.push(
            `Reconcile delete failed for ${uid}: ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
      }
      result.deleted++;

      // Clean up EventMapping if one exists
      const mapping = mappingBySourceId.get(uid) ?? mappingBySourceId.get(rawUid);
      if (mapping) {
        await prisma.eventMapping.delete({ where: { id: mapping.id } }).catch(() => {});
      }
    }
  } catch (err) {
    if (isAuthError(err)) {
      result.errors.push("Google auth error — please reconnect your Google account in Settings");
    } else {
      result.errors.push(
        `Reconcile pass failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

async function syncMicrosoft(
  connection: CalendarConnection,
  result: SyncResult
): Promise<void> {
  if (!connection.sourceCalendarId) {
    throw new Error("Microsoft connection missing sourceCalendarId (Account ID)");
  }

  const userId = connection.userId;
  const accountId = connection.sourceCalendarId;

  // Ensure target Google Calendar exists
  let targetCalendarId = connection.targetGoogleCalendarId;
  if (!targetCalendarId) {
    targetCalendarId = await createCalendar(userId, connection.targetGoogleCalendarName);
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { targetGoogleCalendarId: targetCalendarId },
    });
  }

  // Sync window for first full pull
  const windowStart = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  let newDeltaToken = connection.deltaToken;
  let newSyncToken = connection.syncToken;

  // ── Pass 1: MS → Google ─────────────────────────────────────────────────────
  try {
    const wasFullPull = !connection.deltaToken;
    let deltaResult;
    try {
      deltaResult = await getMicrosoftEventsDelta(accountId, connection.deltaToken, windowStart, windowEnd);
    } catch (err) {
      // Delta token expired — retry with full pull
      if ((err as { code?: string }).code === "DELTA_EXPIRED") {
        await prisma.calendarConnection.update({ where: { id: connection.id }, data: { deltaToken: null } });
        deltaResult = await getMicrosoftEventsDelta(accountId, null, windowStart, windowEnd);
      } else throw err;
    }

    newDeltaToken = deltaResult.deltaToken;
    const existingMappings = await prisma.eventMapping.findMany({ where: { connectionId: connection.id } });
    const mappingBySourceId = new Map(existingMappings.map((m) => [m.sourceEventId, m]));
    const seenMsIds = new Set<string>();

    for (const ev of deltaResult.events) {
      const sourceId = ev.id;
      if (!ev["@removed"]) seenMsIds.add(sourceId);

      if (ev["@removed"]) {
        // Deleted in MS — remove from Google
        const mapping = mappingBySourceId.get(sourceId);
        if (mapping?.googleEventId) {
          try {
            await deleteEvent(userId, targetCalendarId, mapping.googleEventId);
            await prisma.eventMapping.delete({ where: { id: mapping.id } });
            result.deleted++;
          } catch (err) {
            result.errors.push(`MS delete in Google failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        continue;
      }

      const googleEvent = graphEventToGoogleEvent(ev);
      const mapping = mappingBySourceId.get(sourceId);

      if (!mapping) {
        // New MS event → create in Google
        try {
          const created = await createEvent(userId, targetCalendarId, {
            ...googleEvent,
            extendedProperties: { private: { [SYNC_ORIGIN_TAG]: connection.id } },
          });
          await prisma.eventMapping.create({
            data: {
              connectionId: connection.id,
              sourceEventId: sourceId,
              googleEventId: created.id ?? null,
              sourceLastModified: ev.lastModifiedDateTime ? new Date(ev.lastModifiedDateTime) : null,
              googleLastModified: created.updated ? new Date(created.updated) : null,
              syncDirection: connection.syncMode === "two_way" ? "two_way" : "source_to_google",
            },
          });
          result.created++;
        } catch (err) {
          result.errors.push(`MS→Google create failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (mapping.googleEventId) {
        // Existing — update if MS is newer
        const msModified = ev.lastModifiedDateTime ? new Date(ev.lastModifiedDateTime).getTime() : 0;
        const lastSynced = mapping.sourceLastModified?.getTime() ?? 0;
        if (msModified > lastSynced) {
          try {
            const updated = await updateEvent(userId, targetCalendarId, mapping.googleEventId, {
              ...googleEvent,
              extendedProperties: { private: { [SYNC_ORIGIN_TAG]: connection.id } },
            });
            await prisma.eventMapping.update({
              where: { id: mapping.id },
              data: {
                sourceLastModified: ev.lastModifiedDateTime ? new Date(ev.lastModifiedDateTime) : null,
                googleLastModified: updated.updated ? new Date(updated.updated) : null,
              },
            });
            result.updated++;
          } catch (err) {
            result.errors.push(`MS→Google update failed for ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
    // Reconciliation: on a full pull we have all current MS events, so we can
    // delete Google events that are no longer in the source.
    if (wasFullPull && seenMsIds.size > 0) {
      try {
        // Re-fetch mappings to include ones created in this sync run
        const freshMappings = await prisma.eventMapping.findMany({ where: { connectionId: connection.id } });
        const mappingByGoogleId = new Map(
          freshMappings.filter((m) => m.googleEventId).map((m) => [m.googleEventId!, m])
        );

        const googleSyncedEvents = await listSyncedEvents(
          userId, targetCalendarId, connection.id, windowStart, windowEnd
        );
        for (const gEvent of googleSyncedEvents) {
          if (!gEvent.id) continue;
          const mapping = mappingByGoogleId.get(gEvent.id);
          const msId = mapping?.sourceEventId;
          if (msId && seenMsIds.has(msId)) continue; // still in source

          try {
            await deleteEvent(userId, targetCalendarId, gEvent.id);
          } catch (err) {
            if (!isGoneError(err)) {
              result.errors.push(`MS reconcile delete failed for ${gEvent.id}: ${err instanceof Error ? err.message : String(err)}`);
              continue;
            }
          }
          result.deleted++;
          if (mapping) {
            await prisma.eventMapping.delete({ where: { id: mapping.id } }).catch(() => {});
          }
        }
      } catch (err) {
        if (isAuthError(err)) {
          result.errors.push("Google auth error — please reconnect your Google account in Settings");
        } else {
          result.errors.push(`MS reconcile pass failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    if (isAuthError(err)) {
      result.errors.push("Google auth error — please reconnect your Google account in Settings");
    } else {
      result.errors.push(`MS→Google pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Pass 2: Google → MS (two-way only) ─────────────────────────────────────
  if (connection.syncMode === "two_way") {
    try {
      let googleEvents: Awaited<ReturnType<typeof listEvents>>["events"];
      let nextSyncToken: string | null;

      try {
        ({ events: googleEvents, nextSyncToken } = await listEvents(userId, targetCalendarId, connection.syncToken));
      } catch (err) {
        // Sync token expired — full resync
        if ((err as { code?: number }).code === 410) {
          ({ events: googleEvents, nextSyncToken } = await listEvents(userId, targetCalendarId, null));
        } else throw err;
      }

      newSyncToken = nextSyncToken;
      const allMappings = await prisma.eventMapping.findMany({ where: { connectionId: connection.id } });
      const mappingByGoogleId = new Map(allMappings.map((m) => [m.googleEventId, m]));

      for (const gev of googleEvents) {
        if (!gev.id) continue;

        // Skip events mirrored from MS — they have the calypso-sync tag
        const syncTag = gev.extendedProperties?.private?.[SYNC_ORIGIN_TAG];
        if (syncTag === connection.id) continue;

        const mapping = mappingByGoogleId.get(gev.id);

        if (gev.status === "cancelled") {
          if (mapping?.sourceEventId) {
            try {
              await deleteMicrosoftEvent(accountId, mapping.sourceEventId);
              await prisma.eventMapping.delete({ where: { id: mapping.id } });
              result.deleted++;
            } catch (err) {
              result.errors.push(`Google→MS delete failed for ${gev.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          continue;
        }

        const graphBody = googleEventToGraphBody(gev);

        if (!mapping) {
          // User-created Google event — push to MS
          try {
            const created = await createMicrosoftEvent(accountId, graphBody);
            await prisma.eventMapping.create({
              data: {
                connectionId: connection.id,
                sourceEventId: created.id,
                googleEventId: gev.id,
                sourceLastModified: created.lastModifiedDateTime ? new Date(created.lastModifiedDateTime) : null,
                googleLastModified: gev.updated ? new Date(gev.updated) : null,
                syncDirection: "two_way",
              },
            });
            result.created++;
          } catch (err) {
            result.errors.push(`Google→MS create failed for ${gev.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (mapping.sourceEventId) {
          // Already in MS — update if Google is newer (MS wins on true conflict)
          const googleModified = gev.updated ? new Date(gev.updated).getTime() : 0;
          const googleLastSynced = mapping.googleLastModified?.getTime() ?? 0;
          const msModified = mapping.sourceLastModified?.getTime() ?? 0;
          const googleIsNewer = googleModified > googleLastSynced;
          const msAlsoChanged = msModified > googleLastSynced;

          if (googleIsNewer && !msAlsoChanged) {
            try {
              const updated = await updateMicrosoftEvent(accountId, mapping.sourceEventId, graphBody);
              await prisma.eventMapping.update({
                where: { id: mapping.id },
                data: {
                  sourceLastModified: updated.lastModifiedDateTime ? new Date(updated.lastModifiedDateTime) : null,
                  googleLastModified: gev.updated ? new Date(gev.updated) : null,
                },
              });
              result.updated++;
            } catch (err) {
              result.errors.push(`Google→MS update failed for ${gev.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else if (googleIsNewer && msAlsoChanged) {
            // True conflict — MS wins, log it
            result.errors.push(`Conflict on ${gev.summary ?? gev.id} — MS version kept`);
          }
        }
      }
    } catch (err) {
      if (isAuthError(err)) {
        result.errors.push("Google auth error — please reconnect your Google account in Settings");
      } else {
        result.errors.push(`Google→MS pass failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Persist updated tokens
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      deltaToken: newDeltaToken,
      syncToken: newSyncToken,
    },
  });
}

// Register (or renew) a Google push-notification watch for the connection's target calendar.
// Renews if the current watch expires within 24 hours. No-ops if NEXTAUTH_URL is missing.
async function ensureWatch(connection: CalendarConnection): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    console.warn("[sync-engine] NEXTAUTH_URL not set — skipping watch registration");
    return;
  }
  if (!connection.targetGoogleCalendarId) return;

  const now = new Date();
  const renewThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (
    connection.watchChannelId &&
    connection.watchExpiration &&
    connection.watchExpiration > renewThreshold
  ) {
    return; // Watch is still valid
  }

  const channelId = crypto.randomUUID();
  try {
    const { resourceId, expiration } = await registerWatch(
      connection.userId,
      connection.targetGoogleCalendarId,
      channelId,
      `${baseUrl}/api/webhooks/google`
    );
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { watchChannelId: channelId, watchResourceId: resourceId, watchExpiration: expiration },
    });
    console.log(
      `[sync-engine] Watch registered for connection ${connection.id}, expires ${expiration.toISOString()}`
    );
  } catch (err) {
    // Non-fatal: watch registration failure doesn't break sync
    console.warn(`[sync-engine] Watch registration failed for ${connection.id}:`, err);
  }
}

export async function syncAllForUser(userId: string): Promise<SyncResult[]> {
  const connections = await prisma.calendarConnection.findMany({
    where: { userId, isActive: true },
  });

  const results: SyncResult[] = [];
  for (const connection of connections) {
    const result = await syncConnection(connection);
    results.push(result);
  }
  return results;
}

export async function syncAll(): Promise<SyncResult[]> {
  const connections = await prisma.calendarConnection.findMany({
    where: { isActive: true },
  });

  const results: SyncResult[] = [];
  for (const connection of connections) {
    const result = await syncConnection(connection);
    results.push(result);
  }
  return results;
}
