"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "EN" | "RU" | "KZ";

export type Dict = {
  brand: string;
  tagline: string;
  scanSky: string;
  scanNnOnly: string;
  nnOnlyBadge: string;
  nnOnlyHint: string;
  uploadPrompt: string;
  chooseAnother: string;
  reset: string;
  locationRequest: string;
  locationDenied: string;
  fallbackTitle: string;
  fallbackPrompt: string;
  fallbackAstana: string;
  fallbackAlmaty: string;
  fallbackKaraganda: string;
  fallbackUse: string;
  states: string[];
  aqi: string;
  status: string;
  confidence: string;
  pollutant: string;
  coordinates: string;
  yourLocation: string;
  mapTitle: string;
  locationLive: string;
  pollutionLayer: string;
  stationsNearby: string;
  stationsModelled: string;
  stationsLoading: string;
  modelled: string;
  gridCells: string;
  stationsFailed: string;
  sourcesDegraded: string;
  low: string;
  high: string;
  mapTokenMissing: string;
  mapTokenHint: string;
  aqiGood: string;
  aqiModerate: string;
  aqiUsg: string;
  aqiUnhealthy: string;
  aqiVeryUnhealthy: string;
  aqiHazardous: string;
  errorTitle: string;
  errorBody: string;
  tryAgain: string;
  poweredBy: string;
  authSignIn: string;
  authRegister: string;
  authSignInTitle: string;
  authRegisterTitle: string;
  authSignInSubtitle: string;
  authRegisterSubtitle: string;
  authUsername: string;
  authPassword: string;
  authUsernamePlaceholder: string;
  authPasswordPlaceholder: string;
  authSubmitSignIn: string;
  authSubmitRegister: string;
  authNoAccount: string;
  authHasAccount: string;
  authPasswordHint: string;
  authDemoLabel: string;
  authDemoFill: string;
  authSignOut: string;
  authChecking: string;
  locationSimulated: string;
  adminLocationTitle: string;
  adminLocationHint: string;
  adminLat: string;
  adminLng: string;
  adminApply: string;
  adminResetLocation: string;
  adminInvalidCoords: string;
};

const dictionaries: Record<Lang, Dict> = {
  EN: {
    brand: "AirQ",
    tagline: "Photograph the sky. Read your air.",
    scanSky: "Scan Sky",
    scanNnOnly: "Neural net only",
    nnOnlyBadge: "Neural net only",
    nnOnlyHint: "Vision model output, no stations or weather.",
    uploadPrompt: "Drop a photo of the sky, or tap to capture",
    chooseAnother: "Choose another photo",
    reset: "New scan",
    locationRequest: "Requesting your location…",
    locationDenied: "Location unavailable — pick a city below.",
    fallbackTitle: "Manual location",
    fallbackPrompt: "Choose a region to center the map",
    fallbackAstana: "Astana — Left Bank",
    fallbackAlmaty: "Almaty — Center",
    fallbackKaraganda: "Karaganda — Zone 1",
    fallbackUse: "Use this location",
    states: [
      "Uploading image…",
      "Extracting features…",
      "Scanning horizon…",
      "Estimating particulate density…",
      "Calculating AQI…",
    ],
    aqi: "AQI",
    status: "Air quality",
    confidence: "AI confidence",
    pollutant: "Dominant pollutant",
    coordinates: "Coordinates",
    yourLocation: "You are here",
    mapTitle: "Live map",
    locationLive: "Live location",
    pollutionLayer: "Pollution density",
    stationsNearby: "stations nearby",
    stationsModelled: "Modelled coverage",
    stationsLoading: "Loading readings…",
    modelled: "modelled",
    gridCells: "modelled cells",
    stationsFailed: "Readings unavailable",
    sourcesDegraded: "Some data sources are degraded",
    low: "Low",
    high: "High",
    mapTokenMissing: "Mapbox token required",
    mapTokenHint: "Add a Mapbox public token to .env.local and restart the dev server to load the live map.",
    aqiGood: "Good",
    aqiModerate: "Moderate",
    aqiUsg: "Unhealthy for Sensitive Groups",
    aqiUnhealthy: "Unhealthy",
    aqiVeryUnhealthy: "Very Unhealthy",
    aqiHazardous: "Hazardous",
    errorTitle: "Something went wrong",
    errorBody: "The AI backend did not respond. Try again in a moment.",
    tryAgain: "Try again",
    poweredBy: "AI-vision · Tech Vision 2026",
    authSignIn: "Sign in",
    authRegister: "Register",
    authSignInTitle: "Welcome back",
    authRegisterTitle: "Create your account",
    authSignInSubtitle: "Sign in to scan the sky and read your air.",
    authRegisterSubtitle: "Register to start scanning the sky.",
    authUsername: "Username",
    authPassword: "Password",
    authUsernamePlaceholder: "your-username",
    authPasswordPlaceholder: "••••••••",
    authSubmitSignIn: "Sign in",
    authSubmitRegister: "Create account",
    authNoAccount: "No account yet? Register",
    authHasAccount: "Already registered? Sign in",
    authPasswordHint: "At least 8 characters.",
    authDemoLabel: "Demo account",
    authDemoFill: "Use demo credentials",
    authSignOut: "Sign out",
    authChecking: "Checking your session…",
    locationSimulated: "Simulated location",
    adminLocationTitle: "Admin · location override",
    adminLocationHint: "Coordinates sent to the analyzer instead of your real position.",
    adminLat: "Latitude",
    adminLng: "Longitude",
    adminApply: "Apply",
    adminResetLocation: "Reset to real location",
    adminInvalidCoords: "Latitude must be −90…90, longitude −180…180.",
  },
  RU: {
    brand: "AirQ",
    tagline: "Сфотографируйте небо — прочитайте свой воздух.",
    scanSky: "Анализ воздуха",
    scanNnOnly: "Только нейросеть",
    nnOnlyBadge: "Только нейросеть",
    nnOnlyHint: "Оценка модели без станций и погоды.",
    uploadPrompt: "Перетащите фото неба или коснитесь, чтобы сделать снимок",
    chooseAnother: "Выбрать другое фото",
    reset: "Новый анализ",
    locationRequest: "Определяем ваше местоположение…",
    locationDenied: "Геолокация недоступна — выберите город ниже.",
    fallbackTitle: "Указать местоположение",
    fallbackPrompt: "Выберите регион, чтобы центрировать карту",
    fallbackAstana: "Астана — Левый берег",
    fallbackAlmaty: "Алматы — Центр",
    fallbackKaraganda: "Караганда — Зона 1",
    fallbackUse: "Использовать локацию",
    states: [
      "Загрузка изображения…",
      "Извлечение признаков…",
      "Сканирование горизонта…",
      "Оценка плотности частиц…",
      "Расчёт индекса AQI…",
    ],
    aqi: "AQI",
    status: "Качество воздуха",
    confidence: "Уверенность ИИ",
    pollutant: "Основной загрязнитель",
    coordinates: "Координаты",
    yourLocation: "Вы здесь",
    mapTitle: "Живая карта",
    locationLive: "Геолокация в реальном времени",
    pollutionLayer: "Плотность загрязнения",
    stationsNearby: "станций рядом",
    stationsModelled: "Модельные данные",
    stationsLoading: "Загрузка данных…",
    modelled: "модель",
    gridCells: "модельных ячеек",
    stationsFailed: "Данные недоступны",
    sourcesDegraded: "Некоторые источники данных недоступны",
    low: "Низкое",
    high: "Высокое",
    mapTokenMissing: "Требуется токен Mapbox",
    mapTokenHint: "Добавьте публичный токен Mapbox в .env.local и перезапустите сервер, чтобы загрузить карту.",
    aqiGood: "Хорошо",
    aqiModerate: "Умеренно",
    aqiUsg: "Вредно для чувствительных групп",
    aqiUnhealthy: "Вредно",
    aqiVeryUnhealthy: "Очень вредно",
    aqiHazardous: "Опасно",
    errorTitle: "Что-то пошло не так",
    errorBody: "AI-бэкенд не ответил. Попробуйте ещё раз.",
    tryAgain: "Повторить",
    poweredBy: "AI-vision · Tech Vision 2026",
    authSignIn: "Вход",
    authRegister: "Регистрация",
    authSignInTitle: "С возвращением",
    authRegisterTitle: "Создайте аккаунт",
    authSignInSubtitle: "Войдите, чтобы сканировать небо и читать свой воздух.",
    authRegisterSubtitle: "Зарегистрируйтесь, чтобы начать сканирование неба.",
    authUsername: "Имя пользователя",
    authPassword: "Пароль",
    authUsernamePlaceholder: "ваш-логин",
    authPasswordPlaceholder: "••••••••",
    authSubmitSignIn: "Войти",
    authSubmitRegister: "Создать аккаунт",
    authNoAccount: "Нет аккаунта? Зарегистрируйтесь",
    authHasAccount: "Уже есть аккаунт? Войдите",
    authPasswordHint: "Минимум 8 символов.",
    authDemoLabel: "Демо-аккаунт",
    authDemoFill: "Подставить демо-данные",
    authSignOut: "Выйти",
    authChecking: "Проверяем вашу сессию…",
    locationSimulated: "Смоделированная локация",
    adminLocationTitle: "Админ · подмена локации",
    adminLocationHint: "Эти координаты уйдут в анализатор вместо вашего реального положения.",
    adminLat: "Широта",
    adminLng: "Долгота",
    adminApply: "Применить",
    adminResetLocation: "Вернуть реальную локацию",
    adminInvalidCoords: "Широта должна быть −90…90, долгота −180…180.",
  },
  KZ: {
    brand: "AirQ",
    tagline: "Аспанды суретке түсіріңіз — ауаны оқыңыз.",
    scanSky: "Ауаны талдау",
    scanNnOnly: "Тек нейрожелі",
    nnOnlyBadge: "Тек нейрожелі",
    nnOnlyHint: "Станциясыз және ауа райысыз модель бағасы.",
    uploadPrompt: "Аспан суретін тастаңыз немесе түсіру үшін басыңыз",
    chooseAnother: "Басқа сурет таңдау",
    reset: "Жаңа талдау",
    locationRequest: "Орналасқан жеріңізді анықтап жатырмыз…",
    locationDenied: "Геолокация қолжетімсіз — төменнен қаланы таңдаңыз.",
    fallbackTitle: "Орынды қолмен таңдау",
    fallbackPrompt: "Картаны орталықтандыру үшін аймақты таңдаңыз",
    fallbackAstana: "Астана — Сол жағалау",
    fallbackAlmaty: "Алматы — Орталық",
    fallbackKaraganda: "Қарағанды — 1-аймақ",
    fallbackUse: "Осы орынды қолдану",
    states: [
      "Сурет жүктелуде…",
      "Белгілер шығарылуда…",
      "Көкжиек сканерленуде…",
      "Бөлшек тығыздығы бағалануда…",
      "AQI есептелуде…",
    ],
    aqi: "AQI",
    status: "Ауа сапасы",
    confidence: "AI сенімділігі",
    pollutant: "Басым ластауыш",
    coordinates: "Координаттар",
    yourLocation: "Сіз осындасыз",
    mapTitle: "Тірі карта",
    locationLive: "Нақты уақыттағы орналасу",
    pollutionLayer: "Ластану тығыздығы",
    stationsNearby: "станция жақын",
    stationsModelled: "Модельдік деректер",
    stationsLoading: "Деректер жүктелуде…",
    modelled: "модель",
    gridCells: "модельдік ұяшық",
    stationsFailed: "Деректер қолжетімсіз",
    sourcesDegraded: "Кейбір дерек көздері қолжетімсіз",
    low: "Төмен",
    high: "Жоғары",
    mapTokenMissing: "Mapbox токені қажет",
    mapTokenHint: ".env.local файлына Mapbox публикалық токенін қосып, серверді қайта іске қосыңыз.",
    aqiGood: "Жақсы",
    aqiModerate: "Орташа",
    aqiUsg: "Сезімтал топтарға зиянды",
    aqiUnhealthy: "Зиянды",
    aqiVeryUnhealthy: "Өте зиянды",
    aqiHazardous: "Қауіпті",
    errorTitle: "Бірдеңе дұрыс болмады",
    errorBody: "AI-сервер жауап бермеді. Сәл кейін қайталап көріңіз.",
    tryAgain: "Қайталау",
    poweredBy: "AI-vision · Tech Vision 2026",
    authSignIn: "Кіру",
    authRegister: "Тіркелу",
    authSignInTitle: "Қайта келуіңізбен",
    authRegisterTitle: "Аккаунт жасаңыз",
    authSignInSubtitle: "Аспанды сканерлеп, ауаңызды оқу үшін кіріңіз.",
    authRegisterSubtitle: "Аспанды сканерлеуді бастау үшін тіркеліңіз.",
    authUsername: "Пайдаланушы аты",
    authPassword: "Құпиясөз",
    authUsernamePlaceholder: "логиніңіз",
    authPasswordPlaceholder: "••••••••",
    authSubmitSignIn: "Кіру",
    authSubmitRegister: "Аккаунт жасау",
    authNoAccount: "Аккаунт жоқ па? Тіркеліңіз",
    authHasAccount: "Аккаунт бар ма? Кіріңіз",
    authPasswordHint: "Кемінде 8 таңба.",
    authDemoLabel: "Демо-аккаунт",
    authDemoFill: "Демо деректерін қою",
    authSignOut: "Шығу",
    authChecking: "Сессияңыз тексерілуде…",
    locationSimulated: "Модельденген орналасу",
    adminLocationTitle: "Әкімші · орынды ауыстыру",
    adminLocationHint: "Нақты орныңыздың орнына талдағышқа осы координаттар жіберіледі.",
    adminLat: "Ендік",
    adminLng: "Бойлық",
    adminApply: "Қолдану",
    adminResetLocation: "Нақты орынға қайту",
    adminInvalidCoords: "Ендік −90…90, бойлық −180…180 болуы керек.",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("EN");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("airq.lang")) as Lang | null;
    if (saved && (saved === "EN" || saved === "RU" || saved === "KZ")) setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem("airq.lang", l); } catch {}
  };

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: dictionaries[lang] }), [lang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function aqiLabel(t: Dict, score: number): string {
  if (score <= 50) return t.aqiGood;
  if (score <= 100) return t.aqiModerate;
  if (score <= 150) return t.aqiUsg;
  if (score <= 200) return t.aqiUnhealthy;
  if (score <= 300) return t.aqiVeryUnhealthy;
  return t.aqiHazardous;
}
