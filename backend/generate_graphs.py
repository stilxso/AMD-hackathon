import math
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os

# Create output dir if needed
out_dir = "/home/stilxso/.gemini/antigravity-ide/brain/6c189771-dff0-4043-903b-9f5ab6d84781"
os.makedirs(out_dir, exist_ok=True)

# Set style
sns.set_theme(style="whitegrid", context="talk")
colors = sns.color_palette("husl", 3)

# 1. Sigmoid Curve
_SIGMOID_K = 0.5
_SIGMOID_D0 = 5.0
_AI_WEIGHT_FLOOR = 0.35

def get_weight(d):
    w = 1.0 / (1.0 + math.exp(-_SIGMOID_K * (d - _SIGMOID_D0)))
    return max(_AI_WEIGHT_FLOOR, w)

distances = np.linspace(0, 20, 100)
ai_weights = [get_weight(d) for d in distances]
station_weights = [1.0 - w for w in ai_weights]

plt.figure(figsize=(10, 6))
plt.plot(distances, ai_weights, label="Вес Нейросети (Фотография)", linewidth=3, color=colors[0])
plt.plot(distances, station_weights, label="Вес Датчиков (Станции)", linewidth=3, color=colors[1], linestyle='--')
plt.axvline(_SIGMOID_D0, color='gray', linestyle=':', label="Точка равновесия (5 км)")
plt.axhline(_AI_WEIGHT_FLOOR, color='red', linestyle=':', label="Минимальный порог ИИ (35%)")
plt.title("Как алгоритм распределяет доверие в зависимости от расстояния", pad=20)
plt.xlabel("Расстояние до ближайшей станции (км)")
plt.ylabel("Доля влияния (Вес)")
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/sigmoid_weight.png", dpi=300)
plt.close()

# 2. Humidity Penalty
_HUMIDITY_ONSET = 60.0
_HUMIDITY_LAMBDA = 0.008

def get_humidity_factor(h):
    return math.exp(-_HUMIDITY_LAMBDA * max(0.0, h - _HUMIDITY_ONSET))

humidities = np.linspace(0, 100, 100)
h_factors = [get_humidity_factor(h) for h in humidities]

plt.figure(figsize=(10, 6))
plt.plot(humidities, h_factors, linewidth=3, color=colors[2])
plt.axvline(_HUMIDITY_ONSET, color='gray', linestyle=':', label="Начало образования дымки (60%)")
plt.title("Влияние влажности на оценку нейросети", pad=20)
plt.xlabel("Влажность воздуха (%)")
plt.ylabel("Множитель предсказания (Штраф)")
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/humidity_penalty.png", dpi=300)
plt.close()

# 3. Wind Penalty
_WIND_LAMBDA = 0.015
_WIND_REFERENCE = 3.0

def get_wind_factor(w):
    return math.exp(-_WIND_LAMBDA * (w - _WIND_REFERENCE))

winds = np.linspace(0, 20, 100)
w_factors = [get_wind_factor(w) for w in winds]

plt.figure(figsize=(10, 6))
plt.plot(winds, w_factors, linewidth=3, color=colors[0])
plt.axvline(_WIND_REFERENCE, color='gray', linestyle=':', label="Нормальный ветер (3 м/с)")
plt.axhline(1.0, color='black', linewidth=1)
plt.title("Влияние ветра на оценку нейросети", pad=20)
plt.xlabel("Скорость ветра (м/с)")
plt.ylabel("Множитель предсказания (Штраф/Бонус)")
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(f"{out_dir}/wind_penalty.png", dpi=300)
plt.close()

print("Graphs generated successfully.")
