/**
 * Live-updating persistent notification for an active golf round.
 * Shows hole, distance to pin, and score-to-par on the lock screen.
 * Updates every time hole or distance changes.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const NOTIFICATION_ID = "fairway-caddie-round";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  if (!canAskAgain) return false;
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === "granted";
}

export interface RoundNotifData {
  hole: number;
  totalHoles: number;
  par: number;
  distanceToPin: number | null;
  scoreToPar: number;
  courseName: string;
}

function formatScore(scoreToPar: number): string {
  if (scoreToPar === 0) return "E";
  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

function formatDistance(yards: number | null): string {
  if (yards === null) return "–";
  return `${yards} yds`;
}

export async function showRoundNotification(data: RoundNotifData): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;

  const { hole, totalHoles, par, distanceToPin, scoreToPar, courseName } = data;

  const title = `⛳ Hole ${hole}/${totalHoles} · Par ${par}`;
  const body = [
    `📍 ${formatDistance(distanceToPin)} to pin`,
    `Score: ${formatScore(scoreToPar)}`,
  ].join("  ·  ");

  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title,
      body,
      subtitle: courseName,
      autoDismiss: false,
      data: { type: "golf-round" },
    },
    trigger: null,
  });
}

export async function dismissRoundNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID);
}
