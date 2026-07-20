"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "EN" | "RU" | "KZ";

type Dict = {
  brand: string;
  tagline: string;
  scanSky: string;
  uploadPrompt: string;
  demoLoad: string;
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
};

const dictionaries: Record<Lang, Dict> = {
  EN: {
    brand: "AirQ",
    tagline: "Photograph the sky. Read your air.",
    scanSky: "Scan Sky",
    uploadPrompt: "Drop a photo of the sky, or tap to capture",
    demoLoad: "Demo Load",
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
  },
  RU: {
    brand: "AirQ",
    tagline: "Сфотографируйте небо — прочитайте свой воздух.",
    scanSky: "Анализ воздуха",
    uploadPrompt: "Перетащите фото неба или коснитесь, чтобы сделать снимок",
    demoLoad: "Демо-загрузка",
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
  },
  KZ: {
    brand: "AirQ",
    tagline: "Аспанды суретке түсіріңіз — ауаны оқыңыз.",
    scanSky: "Ауаны талдау",
    uploadPrompt: "Аспан суретін тастаңыз немесе түсіру үшін басыңыз",
    demoLoad: "Демо жүктеу",
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
