// ここにUnsplash Access Keyを入れる
// 例: const UNSPLASH_ACCESS_KEY = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const UNSPLASH_ACCESS_KEY = "";

// 業務時間はここで管理します。変更したくなったら、この数字だけ直せばOKです。
const WORK_START = { hour: 8, minute: 30 };
const WORK_END = { hour: 17, minute: 15 };

// Date.getDay() の戻り値に合わせています。0が日曜、1が月曜です。
const WEEKDAY_LABELS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

// 曜日ごとのUnsplash検索テーマです。
const UNSPLASH_THEMES = {
  0: "peaceful cozy room soft light",
  1: "calm forest morning soft light",
  2: "calm ocean sea peaceful",
  3: "misty mountain landscape calm",
  4: "night sky stars peaceful",
  5: "sunset city lights calm",
  6: "peaceful nature relaxing",
};

const STORAGE_KEY = "workEndCountdownBackground";
const APP_NAME_FOR_UNSPLASH = "work-end-countdown";

const elements = {
  backgroundPhoto: document.getElementById("backgroundPhoto"),
  clock: document.getElementById("clock"),
  dateLabel: document.getElementById("dateLabel"),
  mainTitle: document.getElementById("mainTitle"),
  statusMessage: document.getElementById("statusMessage"),
  subMessage: document.getElementById("subMessage"),
  progressFill: document.getElementById("progressFill"),
  progressTrack: document.getElementById("progressTrack"),
  progressLabel: document.getElementById("progressLabel"),
  progressPercent: document.getElementById("progressPercent"),
  photoCredit: document.getElementById("photoCredit"),
};

let activeDateKey = "";

// 2桁表示にするための小さな関数です。例: 7 -> "07"
function pad2(value) {
  return String(value).padStart(2, "0");
}

// 端末のローカル日付で保存キーを作ります。UTCではなく、iPadの時刻設定を使います。
function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function getDateLabel(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日 ${WEEKDAY_LABELS[date.getDay()]}`;
}

// 指定日の 8:30 / 17:15 のDateを作ります。
function getTodayTime(date, hour, minute) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ミリ秒を hh:mm:ss 形式に変換します。
function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 60 / 60);
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function setProgress(percent) {
  const safePercent = clamp(percent, 0, 100);
  const roundedPercent = Math.round(safePercent);

  elements.progressFill.style.width = `${safePercent}%`;
  elements.progressPercent.textContent = `${roundedPercent}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(roundedPercent));
}

function setPhotoCredit(photoData) {
  if (!photoData || !photoData.creditName || !photoData.creditUrl) {
    elements.photoCredit.hidden = true;
    elements.photoCredit.removeAttribute("href");
    return;
  }

  elements.photoCredit.textContent = `Photo by ${photoData.creditName} on Unsplash`;
  elements.photoCredit.href = photoData.creditUrl;
  elements.photoCredit.hidden = false;
}

function useGradientBackground() {
  document.body.classList.remove("has-photo");
  elements.backgroundPhoto.style.backgroundImage = "";
  setPhotoCredit(null);
}

function applyPhotoBackground(photoData) {
  if (!photoData || !photoData.imageUrl) {
    useGradientBackground();
    return;
  }

  // 画像の読み込みが終わるまではグラデーションを見せ続けます。
  const image = new Image();

  image.onload = () => {
    elements.backgroundPhoto.style.backgroundImage = `url("${photoData.imageUrl}")`;
    document.body.classList.add("has-photo");
    setPhotoCredit(photoData);
  };

  image.onerror = () => {
    useGradientBackground();
  };

  image.src = photoData.imageUrl;
}

async function registerUnsplashDownload(downloadLocation) {
  if (!downloadLocation || !UNSPLASH_ACCESS_KEY) {
    return;
  }

  // Unsplash APIでは、写真を使うときにdownload_locationへアクセスすることが推奨されています。
  try {
    await fetch(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });
  } catch (error) {
    // 背景表示には影響しないので、失敗しても何もしません。
    console.warn("Unsplash download tracking failed:", error);
  }
}

function readCachedPhoto(dateKey, dayNumber) {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (cached && cached.dateKey === dateKey && cached.dayNumber === dayNumber && cached.imageUrl) {
      return cached;
    }
  } catch (error) {
    console.warn("Background cache could not be read:", error);
  }

  return null;
}

function saveCachedPhoto(photoData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photoData));
  } catch (error) {
    // localStorageの容量制限などで保存できなくても、アプリ自体は動きます。
    console.warn("Background cache could not be saved:", error);
  }
}

function buildUnsplashImageUrl(photo) {
  if (photo.urls && photo.urls.raw) {
    return `${photo.urls.raw}&auto=format&fit=crop&w=2400&q=82`;
  }

  return photo.urls && (photo.urls.full || photo.urls.regular);
}

function buildUnsplashCreditUrl(photo) {
  const baseUrl = photo.user && photo.user.links && photo.user.links.html;
  if (!baseUrl) {
    return "https://unsplash.com/";
  }

  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", APP_NAME_FOR_UNSPLASH);
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

async function fetchUnsplashPhoto(dateKey, dayNumber) {
  const theme = UNSPLASH_THEMES[dayNumber];
  const apiUrl = new URL("https://api.unsplash.com/photos/random");

  apiUrl.searchParams.set("query", theme);
  apiUrl.searchParams.set("orientation", "landscape");
  apiUrl.searchParams.set("content_filter", "high");

  const response = await fetch(apiUrl.toString(), {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unsplash API error: ${response.status}`);
  }

  const photo = await response.json();
  const photoData = {
    dateKey,
    dayNumber,
    imageUrl: buildUnsplashImageUrl(photo),
    creditName: photo.user ? photo.user.name : "Unsplash",
    creditUrl: buildUnsplashCreditUrl(photo),
    downloadLocation: photo.links ? photo.links.download_location : "",
  };

  saveCachedPhoto(photoData);
  registerUnsplashDownload(photoData.downloadLocation);
  return photoData;
}

async function setupBackground(date) {
  const dateKey = getLocalDateKey(date);
  const dayNumber = date.getDay();

  document.body.dataset.day = String(dayNumber);
  useGradientBackground();

  // APIキーが空のときは通信せず、曜日ごとのグラデーションだけを使います。
  if (!UNSPLASH_ACCESS_KEY) {
    return;
  }

  const cachedPhoto = readCachedPhoto(dateKey, dayNumber);
  if (cachedPhoto) {
    applyPhotoBackground(cachedPhoto);
    return;
  }

  try {
    const freshPhoto = await fetchUnsplashPhoto(dateKey, dayNumber);
    applyPhotoBackground(freshPhoto);
  } catch (error) {
    console.warn("Unsplash background could not be loaded:", error);
    useGradientBackground();
  }
}

function updateCountdown() {
  const now = new Date();
  const dateKey = getLocalDateKey(now);
  const startTime = getTodayTime(now, WORK_START.hour, WORK_START.minute);
  const endTime = getTodayTime(now, WORK_END.hour, WORK_END.minute);

  // 日付が変わったら、曜日テーマと背景画像も切り替えます。
  if (dateKey !== activeDateKey) {
    activeDateKey = dateKey;
    setupBackground(now);
  }

  elements.dateLabel.textContent = getDateLabel(now);

  if (isWeekend(now)) {
    elements.mainTitle.textContent = "充電中。。。";
    elements.clock.textContent = "--:--:--";
    elements.clock.setAttribute("datetime", "");
    elements.statusMessage.textContent = "週末はゆっくり休みましょう";
    elements.subMessage.textContent = "また平日に静かにカウントします";
    elements.progressLabel.textContent = "週末モード";
    setProgress(0);
    return;
  }

  elements.mainTitle.textContent = "業務終了まで";
  elements.progressLabel.textContent = "今日の進み具合";

  if (now >= endTime) {
    elements.clock.textContent = "00:00:00";
    elements.clock.setAttribute("datetime", "PT0S");
    elements.statusMessage.textContent = "本日の業務は終了しました";
    elements.subMessage.textContent = "おつかれさまでした";
    setProgress(100);
    return;
  }

  const remaining = endTime.getTime() - now.getTime();
  const elapsed = now.getTime() - startTime.getTime();
  const workDuration = endTime.getTime() - startTime.getTime();
  const progress = (elapsed / workDuration) * 100;

  elements.clock.textContent = formatRemainingTime(remaining);
  elements.clock.setAttribute("datetime", `PT${Math.max(0, Math.floor(remaining / 1000))}S`);

  if (now < startTime) {
    elements.statusMessage.textContent = "業務開始前です";
    elements.subMessage.textContent = "8:30から進捗バーが動き始めます";
  } else {
    elements.statusMessage.textContent = "17:15まで、あと少し";
    elements.subMessage.textContent = "おだやかに進めていきましょう";
  }

  setProgress(progress);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      // file://で直接開いた場合など、Service Workerを登録できない環境もあります。
      console.warn("Service worker registration failed:", error);
    });
  });
}

updateCountdown();
setInterval(updateCountdown, 1000);
registerServiceWorker();
