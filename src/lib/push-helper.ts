export async function subscribeToPushNotification() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied.");
  }

  const reg = await navigator.serviceWorker.ready;
  
  // Public VAPID key
  const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 
    "BPTEaiq3XXh8bIzUK8CA4U0z2r2rnVVR_nm20RVnE3l5SyhRCb2dArL7CmnfJErH0d1nySBc4NltqPFnhJsxXSI";

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  });

  // Extract raw keys
  const p256dhRaw = subscription.getKey("p256dh");
  const authRaw = subscription.getKey("auth");
  if (!p256dhRaw || !authRaw) {
    throw new Error("Failed to extract subscription key credentials.");
  }

  // Safe binary to base64 conversions
  const p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhRaw)));
  const auth = btoa(String.fromCharCode(...new Uint8Array(authRaw)));

  // User Agent Parsing
  const ua = navigator.userAgent;
  let browser = "Unknown Browser";
  let os = "Unknown OS";
  
  if (ua.indexOf("Firefox") > -1) browser = "Firefox";
  else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
  else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
  else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
  else if (ua.indexOf("Edge") > -1) browser = "Microsoft Edge";
  else if (ua.indexOf("Chrome") > -1) browser = "Google Chrome";
  else if (ua.indexOf("Safari") > -1) browser = "Apple Safari";

  if (ua.indexOf("Windows") > -1) os = "Windows";
  else if (ua.indexOf("Mac") > -1) os = "macOS";
  else if (ua.indexOf("Android") > -1) os = "Android";
  else if (ua.indexOf("iPhone") > -1 || ua.indexOf("iPad") > -1) os = "iOS";
  else if (ua.indexOf("Linux") > -1) os = "Linux";

  const deviceName = `${os} (${browser})`;

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
      deviceName,
      browser,
      operatingSystem: os,
      userAgent: ua,
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Failed to register subscription on portal.");
  }

  return true;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
