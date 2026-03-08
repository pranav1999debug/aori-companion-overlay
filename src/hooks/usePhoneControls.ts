import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

// Dynamically import Capacitor plugins to avoid errors in web-only mode
const isNative = Capacitor.isNativePlatform();

interface PhoneAction {
  type: "flashlight" | "volume" | "alarm" | "timer" | "open_app" | "whatsapp";
  action: string; // on, off, toggle, up, down, mute, set, send
  value?: string; // e.g., app name, volume level, timer minutes
  phone?: string; // phone number for WhatsApp
  message?: string; // message text for WhatsApp
}

export function usePhoneControls() {
  const [flashlightOn, setFlashlightOn] = useState(false);
  const flashlightModuleRef = useRef<any>(null);
  const notificationsModuleRef = useRef<any>(null);
  const appLauncherModuleRef = useRef<any>(null);

  const getFlashlight = useCallback(async () => {
    if (!flashlightModuleRef.current) {
      try {
        const mod = await import("@capgo/capacitor-flash");
        flashlightModuleRef.current = mod.CapacitorFlash;
      } catch {
        return null;
      }
    }
    return flashlightModuleRef.current;
  }, []);

  const getNotifications = useCallback(async () => {
    if (!notificationsModuleRef.current) {
      try {
        const mod = await import("@capacitor/local-notifications");
        notificationsModuleRef.current = mod.LocalNotifications;
      } catch {
        return null;
      }
    }
    return notificationsModuleRef.current;
  }, []);

  const getAppLauncher = useCallback(async () => {
    if (!appLauncherModuleRef.current) {
      try {
        const mod = await import("@capacitor/app-launcher");
        appLauncherModuleRef.current = mod.AppLauncher;
      } catch {
        return null;
      }
    }
    return appLauncherModuleRef.current;
  }, []);

  // === Flashlight ===
  const toggleFlashlight = useCallback(async (turnOn?: boolean) => {
    const Flash = await getFlashlight();
    if (!Flash) {
      toast.error("Flashlight not available on this device");
      return false;
    }
    try {
      const { value: available } = await Flash.isAvailable();
      if (!available) {
        toast.error("No flashlight on this device");
        return false;
      }
      const shouldBeOn = turnOn !== undefined ? turnOn : !flashlightOn;
      if (shouldBeOn) {
        await Flash.switchOn({ intensity: 1.0 });
      } else {
        await Flash.switchOff();
      }
      setFlashlightOn(shouldBeOn);
      return true;
    } catch (e) {
      console.error("Flashlight error:", e);
      toast.error("Failed to control flashlight");
      return false;
    }
  }, [flashlightOn, getFlashlight]);

  // === Volume (Web Audio API fallback) ===
  const setVolume = useCallback(async (action: string, _value?: string) => {
    // Volume control is limited on web - we can control media volume via AudioContext
    // For native, this would need a custom plugin
    // For now, provide feedback
    if (!isNative) {
      toast("Volume control requires the native app", { duration: 3000 });
      return false;
    }
    toast(`Volume ${action}`, { duration: 2000 });
    return true;
  }, []);

  // === Alarms & Timers (via Local Notifications) ===
  const setAlarmOrTimer = useCallback(async (type: "alarm" | "timer", value?: string) => {
    const Notifications = await getNotifications();
    if (!Notifications) {
      toast.error("Notifications not available");
      return false;
    }
    try {
      const { display } = await Notifications.checkPermissions();
      if (display !== "granted") {
        const { display: newPerm } = await Notifications.requestPermissions();
        if (newPerm !== "granted") {
          toast.error("Notification permission denied");
          return false;
        }
      }

      if (type === "timer") {
        const minutes = parseInt(value || "5", 10);
        if (isNaN(minutes) || minutes <= 0) {
          toast.error("Invalid timer duration");
          return false;
        }
        const triggerAt = new Date(Date.now() + minutes * 60 * 1000);
        await Notifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 100000),
            title: "⏰ Aori Timer!",
            body: `Your ${minutes}-minute timer is up! Time's up, baka~ 💙`,
            schedule: { at: triggerAt },
            sound: "default",
          }],
        });
        toast(`⏰ Timer set for ${minutes} minutes!`, { duration: 3000 });
        return true;
      }

      if (type === "alarm") {
        // Parse time like "7:30 AM", "14:00", etc.
        let alarmTime: Date | null = null;
        if (value) {
          const now = new Date();
          const match12 = value.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
          const match24 = value.match(/(\d{1,2}):(\d{2})/);
          
          if (match12) {
            let hours = parseInt(match12[1], 10);
            const mins = parseInt(match12[2] || "0", 10);
            if (match12[3].toLowerCase() === "pm" && hours !== 12) hours += 12;
            if (match12[3].toLowerCase() === "am" && hours === 12) hours = 0;
            alarmTime = new Date(now);
            alarmTime.setHours(hours, mins, 0, 0);
            if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
          } else if (match24) {
            const hours = parseInt(match24[1], 10);
            const mins = parseInt(match24[2], 10);
            alarmTime = new Date(now);
            alarmTime.setHours(hours, mins, 0, 0);
            if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
          }
        }

        if (!alarmTime) {
          toast.error("Couldn't parse alarm time");
          return false;
        }

        await Notifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 100000),
            title: "⏰ Aori Alarm!",
            body: `Wake up! It's ${value}! Don't make me wait, baka~ 💙`,
            schedule: { at: alarmTime },
            sound: "default",
          }],
        });
        toast(`⏰ Alarm set for ${value}!`, { duration: 3000 });
        return true;
      }

      return false;
    } catch (e) {
      console.error("Alarm/timer error:", e);
      toast.error("Failed to set alarm/timer");
      return false;
    }
  }, [getNotifications]);

  // === Open Apps ===
  const openApp = useCallback(async (appName?: string) => {
    const AppLauncher = await getAppLauncher();
    if (!AppLauncher) {
      toast.error("App launcher not available");
      return false;
    }

    // Map common app names to package/scheme URIs
    const appMap: Record<string, { android: string; ios: string }> = {
      camera: { android: "com.android.camera", ios: "camera://" },
      settings: { android: "com.android.settings", ios: "App-prefs://" },
      browser: { android: "com.android.chrome", ios: "googlechrome://" },
      chrome: { android: "com.android.chrome", ios: "googlechrome://" },
      maps: { android: "com.google.android.apps.maps", ios: "comgooglemaps://" },
      youtube: { android: "com.google.android.youtube", ios: "youtube://" },
      whatsapp: { android: "com.whatsapp", ios: "whatsapp://" },
      instagram: { android: "com.instagram.android", ios: "instagram://" },
      spotify: { android: "com.spotify.music", ios: "spotify://" },
      calculator: { android: "com.google.android.calculator", ios: "calc://" },
      clock: { android: "com.google.android.deskclock", ios: "clock-alarm://" },
      messages: { android: "com.google.android.apps.messaging", ios: "sms://" },
      phone: { android: "com.google.android.dialer", ios: "tel://" },
      gmail: { android: "com.google.android.gm", ios: "googlegmail://" },
      twitter: { android: "com.twitter.android", ios: "twitter://" },
      x: { android: "com.twitter.android", ios: "twitter://" },
      telegram: { android: "org.telegram.messenger", ios: "tg://" },
      tiktok: { android: "com.zhiliaoapp.musically", ios: "snssdk1233://" },
      facebook: { android: "com.facebook.katana", ios: "fb://" },
      notes: { android: "com.google.android.keep", ios: "mobilenotes://" },
      music: { android: "com.google.android.music", ios: "music://" },
    };

    const key = (appName || "").toLowerCase().trim();
    const appInfo = appMap[key];

    try {
      if (appInfo) {
        const isAndroid = Capacitor.getPlatform() === "android";
        const url = isAndroid ? `intent://#Intent;package=${appInfo.android};end` : appInfo.ios;
        
        if (isAndroid) {
          // On Android, try opening by package
          const { value: canOpen } = await AppLauncher.canOpenUrl({ url: `market://details?id=${appInfo.android}` });
          if (canOpen) {
            await AppLauncher.openUrl({ url: `market://details?id=${appInfo.android}` });
          } else {
            await AppLauncher.openUrl({ url });
          }
        } else {
          await AppLauncher.openUrl({ url });
        }
        return true;
      } else {
        toast(`I don't know how to open "${appName}" yet~`, { duration: 3000 });
        return false;
      }
    } catch (e) {
      console.error("App launcher error:", e);
      toast.error(`Couldn't open ${appName}`);
      return false;
    }
  }, [getAppLauncher]);

  // === Execute a phone action from AI response ===
  const executeAction = useCallback(async (action: PhoneAction): Promise<boolean> => {
    switch (action.type) {
      case "flashlight":
        if (action.action === "on") return toggleFlashlight(true);
        if (action.action === "off") return toggleFlashlight(false);
        return toggleFlashlight();

      case "volume":
        return setVolume(action.action, action.value);

      case "alarm":
        return setAlarmOrTimer("alarm", action.value);

      case "timer":
        return setAlarmOrTimer("timer", action.value);

      case "open_app":
        return openApp(action.value);

      default:
        return false;
    }
  }, [toggleFlashlight, setVolume, setAlarmOrTimer, openApp]);

  return {
    executeAction,
    flashlightOn,
    isNative,
  };
}
