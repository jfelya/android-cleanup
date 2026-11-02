import { create } from "zustand";
import type {
  AppConfig,
  DeviceInfo,
  DeviceRow,
  DryRun,
  ExecutionReport,
  Page,
  ScanData,
} from "./types";
import type { Language, Theme } from "./i18n";

const storedLanguage =
  typeof localStorage !== "undefined" ? localStorage.getItem("asc.language") : null;
const storedTheme =
  typeof localStorage !== "undefined" ? localStorage.getItem("asc.theme") : null;


export const defaultProtectedPaths = [
  "/storage/emulated/0/Fely",
  "/storage/emulated/0/snaptube",
  "/storage/emulated/0/Download",
  "/storage/emulated/0/DCIM/Camera",
  "/storage/emulated/0/DCIM/ScreenRecorder",
  "/storage/emulated/0/Pictures/Screenshots",
  "/storage/emulated/0/DCIM/Screenshots",
  "/storage/emulated/0/Android/obb",
  "/storage/emulated/0/Android/data/com.gryphline.endfield.gp",
  "/storage/emulated/0/Android/data/com.riotgames.league.teamfighttactics",
  "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Databases",
  "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
  "/storage/emulated/0/Android/data/org.telegram.messenger/files/Telegram/Telegram Documents",
  "/storage/emulated/0/Android/data/org.telegram.messenger/files/Telegram/Telegram Files",
];

export const fallbackConfig: AppConfig = {
  protectedPaths: defaultProtectedPaths,
  enabledCategories: [],
  customRules: [],
  deepDuplicates: true,
  duplicateCapFiles: 5000,
  duplicateCapBytes: 2 * 1024 * 1024 * 1024,
  cacheTrimEnabled: false,
  cacheTrimBytes: 3 * 1024 * 1024 * 1024,
};

interface AppStore {
  page: Page;
  setPage: (page: Page) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  devices: DeviceRow[];
  setDevices: (devices: DeviceRow[]) => void;
  selectedSerial: string | null;
  selectDevice: (serial: string | null) => void;
  device: DeviceInfo | null;
  setDevice: (device: DeviceInfo | null) => void;
  scan: ScanData | null;
  setScan: (scan: ScanData | null) => void;
  scanning: boolean;
  setScanning: (value: boolean) => void;
  scanProgress: number;
  setScanProgress: (value: number) => void;
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  dryRun: DryRun | null;
  setDryRun: (dryRun: DryRun | null) => void;
  building: boolean;
  setBuilding: (value: boolean) => void;
  executing: boolean;
  setExecuting: (value: boolean) => void;
  cleanupProgress: string;
  setCleanupProgress: (value: string) => void;
  execution: ExecutionReport | null;
  setExecution: (report: ExecutionReport | null) => void;
  error: string | null;
  setError: (message: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  page: "connect",
  setPage: (page) => set({ page }),
  language: storedLanguage === "en" ? "en" : "es",
  setLanguage: (language) => {
    localStorage.setItem("asc.language", language);
    document.documentElement.lang = language;
    set({ language });
  },
  theme: storedTheme === "light" ? "light" : "dark",
  setTheme: (theme) => {
    localStorage.setItem("asc.theme", theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  devices: [],
  setDevices: (devices) => set({ devices }),
  selectedSerial: null,
  selectDevice: (selectedSerial) => set({ selectedSerial }),
  device: null,
  setDevice: (device) => set({ device }),
  scan: null,
  setScan: (scan) => set({ scan }),
  scanning: false,
  setScanning: (scanning) => set({ scanning }),
  scanProgress: 0,
  setScanProgress: (scanProgress) => set({ scanProgress }),
  config: fallbackConfig,
  setConfig: (config) => set({ config }),
  dryRun: null,
  setDryRun: (dryRun) => set({ dryRun }),
  building: false,
  setBuilding: (building) => set({ building }),
  executing: false,
  setExecuting: (executing) => set({ executing }),
  cleanupProgress: "",
  setCleanupProgress: (cleanupProgress) => set({ cleanupProgress }),
  execution: null,
  setExecution: (execution) => set({ execution }),
  error: null,
  setError: (error) => set({ error }),
}));
