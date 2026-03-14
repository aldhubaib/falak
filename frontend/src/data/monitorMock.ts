import avatarCh2 from "@/assets/avatars/ch2.jpg";
import avatarCh3 from "@/assets/avatars/ch3.jpg";
import avatarCh4 from "@/assets/avatars/ch4.jpg";
import avatarCh5 from "@/assets/avatars/ch5.jpg";
import avatarCh6 from "@/assets/avatars/ch6.jpg";

export type ChannelStatus = "active" | "regular" | "slow" | "inactive";

export interface MonitorChannel {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  status: ChannelStatus;
  lastCheck: string;
  newVideos?: string;
  lastVideo: string;
  nextCheck: string;
  cadence: string;
  cadenceType: "auto" | "owned";
  override: "Auto" | "locked";
  isStale?: boolean;
}

export const monitorHealth = {
  total: 47,
  healthy: 38,
  inactive: 7,
  gone: 1,
};

export const monitorCadence = [
  { label: "Active", desc: "uploaded <3d ago", color: "success" as const, channels: 18, freq: "every 2d" },
  { label: "Regular", desc: "3-14d", color: "blue" as const, channels: 20, freq: "every 5d" },
  { label: "Slow", desc: "14-30d", color: "orange" as const, channels: 5, freq: "every 10d" },
  { label: "Inactive", desc: "30d+", color: "destructive" as const, channels: 4, freq: "every 20d" },
];

export const monitorQuota = {
  used: 10000,
  remaining: 10000,
  total: 20000,
  checksLeft: 100,
  apiKeys: 2,
  unitsPerDay: 20000,
  checksToday: 32,
  queuedTomorrow: 68,
  unitsPerCheck: 100,
  resetsIn: "14h 22m",
  pct: 50,
};

export const monitorChannels: MonitorChannel[] = [
  { id: "ch2", name: "قرية العجائب", handle: "@badr3", avatar: avatarCh2, status: "active", lastCheck: "now", lastVideo: "2h ago", nextCheck: "in 2d", cadence: "2d", cadenceType: "auto", override: "Auto" },
  { id: "fun213", name: "Fun Channel", handle: "@fun213", avatar: avatarCh6, status: "active", lastCheck: "8m ago", newVideos: "+3 new", lastVideo: "5h ago", nextCheck: "in 23h", cadence: "1d", cadenceType: "owned", override: "locked" },
  { id: "funqa3e", name: "فن كوميدي", handle: "@funqa3e", avatar: avatarCh4, status: "active", lastCheck: "15m ago", lastVideo: "1d ago", nextCheck: "in 23h", cadence: "1d", cadenceType: "owned", override: "locked" },
  { id: "saud", name: "سعود الرياضي", handle: "@saud_sport", avatar: avatarCh5, status: "regular", lastCheck: "31m ago", lastVideo: "3d ago", nextCheck: "in 4d 12h", cadence: "5d", cadenceType: "auto", override: "Auto" },
  { id: "nawaf", name: "نواف الإبداع", handle: "@nawaf", avatar: avatarCh6, status: "active", lastCheck: "1h ago", lastVideo: "1d ago", nextCheck: "in 1d", cadence: "2d", cadenceType: "auto", override: "Auto" },
  { id: "reem", name: "ريم الإبداعية", handle: "@reem_cr", avatar: avatarCh4, status: "regular", lastCheck: "2h ago", newVideos: "+1 new", lastVideo: "6d ago", nextCheck: "in 3d", cadence: "5d", cadenceType: "auto", override: "Auto" },
  { id: "ch3", name: "طارق التقني", handle: "@tariq", avatar: avatarCh3, status: "inactive", lastCheck: "3h ago", lastVideo: "47d ago", nextCheck: "in 17d", cadence: "20d", cadenceType: "auto", override: "Auto", isStale: true },
  { id: "ahmed", name: "أحمد الرحالة", handle: "@ahmed_t", avatar: avatarCh5, status: "slow", lastCheck: "4h ago", lastVideo: "22d ago", nextCheck: "in 6d", cadence: "10d", cadenceType: "auto", override: "Auto", isStale: true },
  { id: "khstudio", name: "خالد ستوديو", handle: "@khstud1o", avatar: avatarCh3, status: "inactive", lastCheck: "5h ago", lastVideo: "35d ago", nextCheck: "in 15d", cadence: "20d", cadenceType: "auto", override: "Auto", isStale: true },
];
