import math
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os

out_dir = "/home/stilxso/.gemini/antigravity-ide/brain/6c189771-dff0-4043-903b-9f5ab6d84781"
os.makedirs(out_dir, exist_ok=True)

sns.set_theme(style="whitegrid", context="talk")
colors = sns.color_palette("husl", 5)

# 1. Monte Carlo Dropout Confidence Mapping
_CONF_UNCERTAINTY_LAMBDA = 6.0
cvs = np.linspace(0, 0.4, 100)
confidences = [math.exp(-_CONF_UNCERTAINTY_LAMBDA * cv) for cv in cvs]

plt.figure(figsize=(10, 6))
plt.plot(cvs, confidences, linewidth=3, color=colors[3])
plt.axvline(0.04, color='green', linestyle=':', label="Хорошее фото (Низкий разброс, CV ≈ 0.04)")
plt.axvline(0.08, color='orange', linestyle=':', label="Неочевидное фото (Средний разброс, CV ≈ 0.08)")
plt.axvline(0.3, color='red', linestyle=':', label="Плохое фото/Мусор (Огромный разброс, CV > 0.2)")
plt.title("Уверенность ИИ на базе Монте-Карло (MC Dropout)", pad=20)
plt.xlabel("Коэффициент вариации (CV = Станд. Отклонение / Среднее)")
plt.ylabel("Базовая Уверенность (Base Confidence)")
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/mc_dropout_confidence.png", dpi=300)
plt.close()

# 2. Station Corroboration Bonus
_CONF_STATION_GAMMA_MAX = 0.15
_CONF_STATION_SCALE = 3.0

stations = np.arange(0, 15)
station_bonus = [1.0 + _CONF_STATION_GAMMA_MAX * (1.0 - math.exp(-s / _CONF_STATION_SCALE)) for s in stations]

plt.figure(figsize=(10, 6))
plt.plot(stations, station_bonus, marker='o', linewidth=3, color=colors[0])
plt.axhline(1.0 + _CONF_STATION_GAMMA_MAX, color='gray', linestyle=':', label="Максимальный бонус (+15%)")
plt.title("Бонус уверенности от количества ближайших станций", pad=20)
plt.xlabel("Количество доступных датчиков рядом")
plt.ylabel("Множитель уверенности (Бонус)")
plt.xticks(np.arange(0, 15, step=2))
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/station_bonus.png", dpi=300)
plt.close()

# 3. AI-Station Agreement Bonus
_CONF_AGREEMENT_BONUS = 0.10
_CONF_AGREEMENT_THRESHOLD = 0.20

errors = np.linspace(0, 0.4, 100)
agreement_bonus = []
for e in errors:
    if e < _CONF_AGREEMENT_THRESHOLD:
        b = 1.0 + _CONF_AGREEMENT_BONUS * (1.0 - e / _CONF_AGREEMENT_THRESHOLD)
    else:
        b = 1.0
    agreement_bonus.append(b)

plt.figure(figsize=(10, 6))
plt.plot(errors * 100, agreement_bonus, linewidth=3, color=colors[1])
plt.axvline(_CONF_AGREEMENT_THRESHOLD * 100, color='gray', linestyle=':', label="Порог расхождения (20%)")
plt.title("Бонус за согласие между ИИ и датчиком", pad=20)
plt.xlabel("Относительная ошибка между ИИ и датчиком (%)")
plt.ylabel("Множитель уверенности (Бонус)")
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/agreement_bonus.png", dpi=300)
plt.close()

# 4. Fusion Surface (Heatmap: Distance vs Humidity)
# Let's say AI predicts 100, Station is 20. How does the final PM2.5 change based on Distance and Humidity?
_HUMIDITY_ONSET = 60.0
_HUMIDITY_LAMBDA = 0.008
_SIGMOID_K = 0.5
_SIGMOID_D0 = 5.0
_AI_WEIGHT_FLOOR = 0.35

distances = np.linspace(0, 15, 50)
humidities = np.linspace(30, 100, 50)
X, Y = np.meshgrid(distances, humidities)
Z = np.zeros_like(X)

AI_RAW = 100.0
STATION = 20.0

for i in range(X.shape[0]):
    for j in range(X.shape[1]):
        d = X[i, j]
        h = Y[i, j]
        
        # Weather correction
        adj_ai = AI_RAW * math.exp(-_HUMIDITY_LAMBDA * max(0.0, h - _HUMIDITY_ONSET))
        
        # Blending
        w_ai = 1.0 / (1.0 + math.exp(-_SIGMOID_K * (d - _SIGMOID_D0)))
        w_ai = max(_AI_WEIGHT_FLOOR, w_ai)
        
        Z[i, j] = adj_ai * w_ai + STATION * (1.0 - w_ai)

plt.figure(figsize=(11, 7))
contour = plt.contourf(X, Y, Z, 20, cmap="YlOrRd")
plt.colorbar(contour, label="Итоговый PM2.5 (Фьюжн)")
plt.title("Как работает Data Fusion: Влияние Расстояния и Влажности\n(Сырой ИИ=100, Станция=20)", pad=20)
plt.xlabel("Расстояние до ближайшей станции (км)")
plt.ylabel("Влажность (%)")
plt.tight_layout()
plt.savefig(f"{out_dir}/fusion_heatmap.png", dpi=300)
plt.close()

print("More graphs generated successfully.")
