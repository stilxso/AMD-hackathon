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
  themeLight: string;
  themeDark: string;
  themeToLight: string;
  themeToDark: string;
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
  routeOpen: string;
  routeTitle: string;
  routeWalk: string;
  routeBike: string;
  routePickStart: string;
  routePickEnd: string;
  routePlanning: string;
  routeFailed: string;
  routeClear: string;
  routeDistance: string;
  routeTime: string;
  routeAvgPm: string;
  routeCleaner: string;
  routeAlreadyBest: string;
  routeUniform: string;
  routeMin: string;
  routeMonitors: string;
  routeGrid: string;
  // ── Personal cabinet ──
  cabinetOpen: string;
  cabinetTitle: string;
  cabinetSubtitle: string;
  cabinetBack: string;
  cabinetError: string;
  cabinetRetry: string;
  cabinetLoading: string;
  tabOverview: string;
  tabHistory: string;
  tabLocations: string;
  tabReports: string;
  tabSecurity: string;
  statScans: string;
  statAvgAqi: string;
  statWorst: string;
  statBest: string;
  statShared: string;
  statReports: string;
  statSaved: string;
  statLastScan: string;
  statNone: string;
  trendTitle: string;
  trendHint: string;
  trendEmpty: string;
  historyTitle: string;
  historyEmpty: string;
  historyEmptyHint: string;
  historyLoadMore: string;
  historyShowing: string;
  historyDelete: string;
  historyDeleteConfirm: string;
  historyShare: string;
  historyUnshare: string;
  historyShared: string;
  historyPrivate: string;
  historyShareHint: string;
  historyNoImage: string;
  locationsTitle: string;
  locationsHint: string;
  locationsEmpty: string;
  locationName: string;
  locationNamePlaceholder: string;
  locationAdd: string;
  locationDelete: string;
  locationUseCurrent: string;
  locationNoCoords: string;
  reportsTitle: string;
  reportsEmpty: string;
  reportDelete: string;
  securityTitle: string;
  securityHint: string;
  securityCurrent: string;
  securityNew: string;
  securityConfirm: string;
  securitySubmit: string;
  securityChanged: string;
  securityMismatch: string;
  // ── Crowdsourcing ──
  communityTitle: string;
  communityOpen: string;
  communityLayer: string;
  communityNobody: string;
  communityConsensus: string;
  communityReportsCount: string;
  communitySharedCount: string;
  communityVisibility: string;
  communityDisclaimer: string;
  reportTitle: string;
  reportSubtitle: string;
  reportPerceived: string;
  reportVisibility: string;
  reportVisibilityHint: string;
  reportSymptoms: string;
  reportNote: string;
  reportNotePlaceholder: string;
  reportSubmit: string;
  reportSubmitting: string;
  reportSubmitted: string;
  reportCancel: string;
  reportFailed: string;
  reportNeedsLocation: string;
  perceivedGood: string;
  perceivedModerate: string;
  perceivedPoor: string;
  perceivedSevere: string;
  symptoms: string[];
  chatTitle: string;
  chatSubtitle: string;
  chatOpen: string;
  chatPlaceholder: string;
  chatSend: string;
  chatThinking: string;
  chatFailed: string;
  chatRetry: string;
  chatClear: string;
  chatNeedsLocation: string;
  chatDisclaimer: string;
  chatSuggestions: string[];
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
    themeLight: "Light",
    themeDark: "Dark",
    themeToLight: "Switch to light theme",
    themeToDark: "Switch to dark theme",
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
    routeOpen: "Clean route",
    routeTitle: "Clean route",
    routeWalk: "Walk",
    routeBike: "Bike",
    routePickStart: "Click the map to set your start",
    routePickEnd: "Now click your destination",
    routePlanning: "Comparing routes…",
    routeFailed: "Route unavailable",
    routeClear: "Clear",
    routeDistance: "Distance",
    routeTime: "Time",
    routeAvgPm: "Avg PM2.5",
    routeCleaner: "less breathed in than the shortest way",
    routeAlreadyBest: "The shortest way is already the cleanest.",
    routeUniform: "Routes differ by less than the data can resolve here — this is just the shortest one.",
    routeMin: "min",
    routeMonitors: "monitors scored this",
    routeGrid: "km model grid",
    // ── Personal cabinet ──
    cabinetOpen: "Cabinet",
    cabinetTitle: "Your cabinet",
    cabinetSubtitle: "Every scan you have taken, the places you watch, and what you told the community.",
    cabinetBack: "Back to the scanner",
    cabinetError: "Could not load your cabinet",
    cabinetRetry: "Try again",
    cabinetLoading: "Loading your cabinet…",
    tabOverview: "Overview",
    tabHistory: "History",
    tabLocations: "Places",
    tabReports: "Reports",
    tabSecurity: "Security",
    statScans: "Scans",
    statAvgAqi: "Average AQI",
    statWorst: "Worst",
    statBest: "Best",
    statShared: "Shared",
    statReports: "Reports filed",
    statSaved: "Saved places",
    statLastScan: "Last scan",
    statNone: "—",
    trendTitle: "Your last readings",
    trendHint: "AQI of your most recent scans, oldest first.",
    trendEmpty: "Scan the sky once and your trend appears here.",
    historyTitle: "Scan history",
    historyEmpty: "No scans yet.",
    historyEmptyHint: "Every photo you analyse is kept here with its reading.",
    historyLoadMore: "Load more",
    historyShowing: "shown of",
    historyDelete: "Delete",
    historyDeleteConfirm: "Delete this scan permanently?",
    historyShare: "Share",
    historyUnshare: "Unshare",
    historyShared: "Shared",
    historyPrivate: "Private",
    historyShareHint: "Sharing puts this reading, its coordinates and its photo on the community map.",
    historyNoImage: "no image",
    locationsTitle: "Saved places",
    locationsHint: "Pin a place to jump the map straight to it.",
    locationsEmpty: "No saved places yet.",
    locationName: "Name",
    locationNamePlaceholder: "Home, office, school…",
    locationAdd: "Save this place",
    locationDelete: "Remove",
    locationUseCurrent: "Uses your current coordinates",
    locationNoCoords: "Waiting for a location to save.",
    reportsTitle: "Your reports",
    reportsEmpty: "You have not reported the air yet.",
    reportDelete: "Withdraw",
    securityTitle: "Password",
    securityHint: "Changing it does not sign out your other sessions.",
    securityCurrent: "Current password",
    securityNew: "New password",
    securityConfirm: "Repeat new password",
    securitySubmit: "Change password",
    securityChanged: "Password changed.",
    securityMismatch: "The two new passwords do not match.",
    // ── Crowdsourcing ──
    communityTitle: "What people report",
    communityOpen: "Report the air",
    communityLayer: "Community",
    communityNobody: "Nobody has reported here in the last 24 hours.",
    communityConsensus: "Most people call the air",
    communityReportsCount: "reports nearby",
    communitySharedCount: "shared scans",
    communityVisibility: "Reported visibility",
    communityDisclaimer: "Reports are people's impressions, not measurements. They are shown beside the sensor and model data, never mixed into it.",
    reportTitle: "How does the air feel?",
    reportSubtitle: "Your impression, pinned where you are.",
    reportPerceived: "The air here is",
    reportVisibility: "How far can you see?",
    reportVisibilityHint: "km — optional, but it is the part that tracks particulate",
    reportSymptoms: "Anything you feel?",
    reportNote: "Note",
    reportNotePlaceholder: "Smoke from the east, burning smell…",
    reportSubmit: "Send report",
    reportSubmitting: "Sending…",
    reportSubmitted: "Thanks — your report is on the map.",
    reportCancel: "Cancel",
    reportFailed: "Could not send your report",
    reportNeedsLocation: "Waiting for a location to report from.",
    perceivedGood: "Clean",
    perceivedModerate: "Passable",
    perceivedPoor: "Bad",
    perceivedSevere: "Severe",
    symptoms: ["Coughing", "Itchy eyes", "Sore throat", "Headache", "Hard to breathe", "Smell of smoke"],
    chatTitle: "Ask the air",
    chatSubtitle: "Why the air here reads the way it does",
    chatOpen: "Ask about this air",
    chatPlaceholder: "Ask why the air is like this…",
    chatSend: "Send",
    chatThinking: "Reading the evidence…",
    chatFailed: "Could not answer",
    chatRetry: "Try again",
    chatClear: "New conversation",
    chatNeedsLocation: "Waiting for a location to reason about.",
    chatDisclaimer: "Answers come from live station, model and weather data for this point. Not medical advice.",
    chatSuggestions: [
      "Why is it at this level right now?",
      "Is it safe to go for a run?",
      "Where is the pollution coming from?",
      "Will it get better tonight?",
    ],
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
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeToLight: "Переключить на светлую тему",
    themeToDark: "Переключить на тёмную тему",
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
    routeOpen: "Чистый маршрут",
    routeTitle: "Чистый маршрут",
    routeWalk: "Пешком",
    routeBike: "Велосипед",
    routePickStart: "Кликните по карте — начало маршрута",
    routePickEnd: "Теперь кликните точку назначения",
    routePlanning: "Сравниваем маршруты…",
    routeFailed: "Маршрут недоступен",
    routeClear: "Сбросить",
    routeDistance: "Расстояние",
    routeTime: "Время",
    routeAvgPm: "Средний PM2.5",
    routeCleaner: "меньше вдыхаемых частиц, чем на коротком пути",
    routeAlreadyBest: "Самый короткий путь и так самый чистый.",
    routeUniform: "Здесь маршруты различаются меньше, чем позволяет разрешение данных — это просто кратчайший.",
    routeMin: "мин",
    routeMonitors: "станций в оценке",
    routeGrid: "км сетка модели",
    // ── Личный кабинет ──
    cabinetOpen: "Кабинет",
    cabinetTitle: "Ваш кабинет",
    cabinetSubtitle: "Все ваши замеры, отслеживаемые места и то, что вы рассказали сообществу.",
    cabinetBack: "Назад к сканеру",
    cabinetError: "Не удалось загрузить кабинет",
    cabinetRetry: "Повторить",
    cabinetLoading: "Загружаем кабинет…",
    tabOverview: "Обзор",
    tabHistory: "История",
    tabLocations: "Места",
    tabReports: "Сообщения",
    tabSecurity: "Безопасность",
    statScans: "Замеров",
    statAvgAqi: "Средний AQI",
    statWorst: "Худший",
    statBest: "Лучший",
    statShared: "Опубликовано",
    statReports: "Сообщений",
    statSaved: "Сохранено мест",
    statLastScan: "Последний замер",
    statNone: "—",
    trendTitle: "Ваши последние замеры",
    trendHint: "AQI последних замеров, от старых к новым.",
    trendEmpty: "Сделайте первый замер — здесь появится динамика.",
    historyTitle: "История замеров",
    historyEmpty: "Замеров пока нет.",
    historyEmptyHint: "Каждое проанализированное фото сохраняется здесь вместе с результатом.",
    historyLoadMore: "Показать ещё",
    historyShowing: "показано из",
    historyDelete: "Удалить",
    historyDeleteConfirm: "Удалить этот замер безвозвратно?",
    historyShare: "Опубликовать",
    historyUnshare: "Скрыть",
    historyShared: "Опубликован",
    historyPrivate: "Приватный",
    historyShareHint: "Публикация покажет результат, координаты и фото на карте сообщества.",
    historyNoImage: "без фото",
    locationsTitle: "Сохранённые места",
    locationsHint: "Закрепите место, чтобы сразу открывать его на карте.",
    locationsEmpty: "Сохранённых мест пока нет.",
    locationName: "Название",
    locationNamePlaceholder: "Дом, работа, школа…",
    locationAdd: "Сохранить место",
    locationDelete: "Удалить",
    locationUseCurrent: "Используются ваши текущие координаты",
    locationNoCoords: "Ожидаем координаты для сохранения.",
    reportsTitle: "Ваши сообщения",
    reportsEmpty: "Вы ещё не сообщали о воздухе.",
    reportDelete: "Отозвать",
    securityTitle: "Пароль",
    securityHint: "Смена пароля не завершает другие сессии.",
    securityCurrent: "Текущий пароль",
    securityNew: "Новый пароль",
    securityConfirm: "Повторите новый пароль",
    securitySubmit: "Сменить пароль",
    securityChanged: "Пароль изменён.",
    securityMismatch: "Новые пароли не совпадают.",
    // ── Краудсорсинг ──
    communityTitle: "Что сообщают люди",
    communityOpen: "Сообщить о воздухе",
    communityLayer: "Сообщество",
    communityNobody: "За последние 24 часа здесь никто не сообщал.",
    communityConsensus: "Большинство оценивает воздух как",
    communityReportsCount: "сообщений рядом",
    communitySharedCount: "опубликованных замеров",
    communityVisibility: "Видимость по сообщениям",
    communityDisclaimer: "Сообщения — это впечатления людей, а не измерения. Они показаны рядом с данными датчиков и модели, но не смешиваются с ними.",
    reportTitle: "Каким кажется воздух?",
    reportSubtitle: "Ваше впечатление, закреплённое там, где вы находитесь.",
    reportPerceived: "Воздух здесь",
    reportVisibility: "Как далеко видно?",
    reportVisibilityHint: "км — необязательно, но именно это связано с частицами",
    reportSymptoms: "Что-нибудь чувствуете?",
    reportNote: "Заметка",
    reportNotePlaceholder: "Дым с востока, запах гари…",
    reportSubmit: "Отправить",
    reportSubmitting: "Отправляем…",
    reportSubmitted: "Спасибо — ваше сообщение на карте.",
    reportCancel: "Отмена",
    reportFailed: "Не удалось отправить сообщение",
    reportNeedsLocation: "Ожидаем координаты для сообщения.",
    perceivedGood: "Чистый",
    perceivedModerate: "Терпимый",
    perceivedPoor: "Плохой",
    perceivedSevere: "Тяжёлый",
    symptoms: ["Кашель", "Резь в глазах", "Боль в горле", "Головная боль", "Трудно дышать", "Запах гари"],
    chatTitle: "Спросите о воздухе",
    chatSubtitle: "Почему воздух здесь именно такой",
    chatOpen: "Спросить об этом воздухе",
    chatPlaceholder: "Спросите, почему воздух такой…",
    chatSend: "Отправить",
    chatThinking: "Разбираем данные…",
    chatFailed: "Не удалось ответить",
    chatRetry: "Повторить",
    chatClear: "Новый диалог",
    chatNeedsLocation: "Ждём местоположение, чтобы было о чём рассуждать.",
    chatDisclaimer: "Ответы строятся на данных станций, модели и погоды для этой точки. Не медицинский совет.",
    chatSuggestions: [
      "Почему сейчас именно такой уровень?",
      "Можно ли идти на пробежку?",
      "Откуда приходит загрязнение?",
      "Станет ли лучше к вечеру?",
    ],
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
    themeLight: "Ашық",
    themeDark: "Күңгірт",
    themeToLight: "Ашық тақырыпқа ауысу",
    themeToDark: "Күңгірт тақырыпқа ауысу",
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
    routeOpen: "Таза маршрут",
    routeTitle: "Таза маршрут",
    routeWalk: "Жаяу",
    routeBike: "Велосипед",
    routePickStart: "Бастау нүктесін картадан басыңыз",
    routePickEnd: "Енді межелі нүктені басыңыз",
    routePlanning: "Маршруттар салыстырылуда…",
    routeFailed: "Маршрут қолжетімсіз",
    routeClear: "Тазарту",
    routeDistance: "Қашықтық",
    routeTime: "Уақыт",
    routeAvgPm: "Орташа PM2.5",
    routeCleaner: "қысқа жолмен салыстырғанда аз бөлшек жұтасыз",
    routeAlreadyBest: "Ең қысқа жол әрі ең таза жол.",
    routeUniform: "Мұнда маршруттар деректер ажырата алатын шектен аз ерекшеленеді — бұл жай ғана ең қысқасы.",
    routeMin: "мин",
    routeMonitors: "станция бағалауда",
    routeGrid: "км модель торы",
    // ── Жеке кабинет ──
    cabinetOpen: "Кабинет",
    cabinetTitle: "Сіздің кабинетіңіз",
    cabinetSubtitle: "Барлық өлшемдеріңіз, бақылайтын орындарыңыз және қоғамдастыққа айтқаныңыз.",
    cabinetBack: "Сканерге оралу",
    cabinetError: "Кабинетті жүктеу мүмкін болмады",
    cabinetRetry: "Қайталау",
    cabinetLoading: "Кабинет жүктелуде…",
    tabOverview: "Шолу",
    tabHistory: "Тарих",
    tabLocations: "Орындар",
    tabReports: "Хабарламалар",
    tabSecurity: "Қауіпсіздік",
    statScans: "Өлшемдер",
    statAvgAqi: "Орташа AQI",
    statWorst: "Ең нашар",
    statBest: "Ең жақсы",
    statShared: "Жарияланған",
    statReports: "Хабарламалар",
    statSaved: "Сақталған орындар",
    statLastScan: "Соңғы өлшем",
    statNone: "—",
    trendTitle: "Соңғы өлшемдеріңіз",
    trendHint: "Соңғы өлшемдердің AQI мәні, ескісінен жаңасына қарай.",
    trendEmpty: "Аспанды бір рет сканерлеңіз — динамика осында пайда болады.",
    historyTitle: "Өлшемдер тарихы",
    historyEmpty: "Әзірге өлшем жоқ.",
    historyEmptyHint: "Талданған әрбір фото нәтижесімен бірге осында сақталады.",
    historyLoadMore: "Тағы көрсету",
    historyShowing: "көрсетілді, барлығы",
    historyDelete: "Жою",
    historyDeleteConfirm: "Бұл өлшемді біржола жою керек пе?",
    historyShare: "Жариялау",
    historyUnshare: "Жасыру",
    historyShared: "Жарияланған",
    historyPrivate: "Жеке",
    historyShareHint: "Жариялау нәтижені, координаттарды және фотоны қоғамдастық картасына шығарады.",
    historyNoImage: "фотосыз",
    locationsTitle: "Сақталған орындар",
    locationsHint: "Орынды бекітсеңіз, картаны бірден соған ашасыз.",
    locationsEmpty: "Сақталған орын жоқ.",
    locationName: "Атауы",
    locationNamePlaceholder: "Үй, жұмыс, мектеп…",
    locationAdd: "Орынды сақтау",
    locationDelete: "Жою",
    locationUseCurrent: "Ағымдағы координаттарыңыз қолданылады",
    locationNoCoords: "Сақтау үшін координаттар күтілуде.",
    reportsTitle: "Сіздің хабарламаларыңыз",
    reportsEmpty: "Сіз әлі ауа туралы хабарлаған жоқсыз.",
    reportDelete: "Кері қайтару",
    securityTitle: "Құпия сөз",
    securityHint: "Оны ауыстыру басқа сеанстарды аяқтамайды.",
    securityCurrent: "Ағымдағы құпия сөз",
    securityNew: "Жаңа құпия сөз",
    securityConfirm: "Жаңа құпия сөзді қайталаңыз",
    securitySubmit: "Құпия сөзді ауыстыру",
    securityChanged: "Құпия сөз ауыстырылды.",
    securityMismatch: "Жаңа құпия сөздер сәйкес келмейді.",
    // ── Краудсорсинг ──
    communityTitle: "Адамдар не хабарлайды",
    communityOpen: "Ауа туралы хабарлау",
    communityLayer: "Қоғамдастық",
    communityNobody: "Соңғы 24 сағатта мұнда ешкім хабарламаған.",
    communityConsensus: "Көпшілік ауаны былай бағалайды:",
    communityReportsCount: "жақын маңдағы хабарлама",
    communitySharedCount: "жарияланған өлшем",
    communityVisibility: "Хабарланған көрінім",
    communityDisclaimer: "Хабарламалар — адамдардың әсері, өлшем емес. Олар датчик пен модель деректерінің қасында көрсетіледі, оларға араласпайды.",
    reportTitle: "Ауа қалай сезіледі?",
    reportSubtitle: "Сіз тұрған жерге бекітілген әсеріңіз.",
    reportPerceived: "Мұндағы ауа",
    reportVisibility: "Қаншалықты алысты көресіз?",
    reportVisibilityHint: "км — міндетті емес, бірақ дәл осы бөлшектермен байланысты",
    reportSymptoms: "Бірдеңе сезесіз бе?",
    reportNote: "Ескертпе",
    reportNotePlaceholder: "Шығыстан түтін, күйік иісі…",
    reportSubmit: "Жіберу",
    reportSubmitting: "Жіберілуде…",
    reportSubmitted: "Рақмет — хабарламаңыз картада.",
    reportCancel: "Болдырмау",
    reportFailed: "Хабарламаны жіберу мүмкін болмады",
    reportNeedsLocation: "Хабарлау үшін координаттар күтілуде.",
    perceivedGood: "Таза",
    perceivedModerate: "Шыдамды",
    perceivedPoor: "Нашар",
    perceivedSevere: "Ауыр",
    symptoms: ["Жөтел", "Көз ашуы", "Тамақ ауыруы", "Бас ауыруы", "Тыныс алу қиын", "Күйік иісі"],
    chatTitle: "Ауа туралы сұраңыз",
    chatSubtitle: "Мұндағы ауа неліктен осындай",
    chatOpen: "Осы ауа туралы сұрау",
    chatPlaceholder: "Ауа неге осындай екенін сұраңыз…",
    chatSend: "Жіберу",
    chatThinking: "Деректерді талдап жатырмыз…",
    chatFailed: "Жауап беру мүмкін болмады",
    chatRetry: "Қайталау",
    chatClear: "Жаңа әңгіме",
    chatNeedsLocation: "Талдау үшін орналасқан жер күтілуде.",
    chatDisclaimer: "Жауаптар осы нүктедегі станция, модель және ауа райы деректеріне негізделген. Медициналық кеңес емес.",
    chatSuggestions: [
      "Неліктен деңгей дәл осындай?",
      "Жүгіруге шығуға бола ма?",
      "Ластану қайдан келеді?",
      "Кешке жақсара ма?",
    ],
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
