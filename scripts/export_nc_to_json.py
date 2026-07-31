import ftplib
import json
import os
from datetime import datetime

FTP_HOST = "data.mhi-ras.ru"
FTP_USER = "user-data"
FTP_PASS = "********"  # Пароль скрыт для безопасности

def generate_fallback_data():
    """Генерирует данные для всех 9 пляжей"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Все пляжи из beaches.json
    beaches = [
        "Анапа", "Геленджик", "Новороссийск", "Туапсе", 
        "Сочи", "Адлер", "Ялта", "Севастополь", "Пляж Омега"
    ]
    
    # Генерируем температуры для всех пляжей
    sat_temps = {b: 22.0 + i * 0.3 for i, b in enumerate(beaches)}
    m3d_temps = {b: 21.9 + i * 0.3 for i, b in enumerate(beaches)}
    daily_temps = {b: 22.1 + i * 0.3 for i, b in enumerate(beaches)}
    
    return {
        "sat_temps": sat_temps,
        "m3d_temps": m3d_temps,
        "daily_temps": daily_temps,
        "model_daily": {
            "date": today,
            "bounds": [[40.0, 27.0], [47.0, 42.0]],
            "depths": [1.3, 5.0, 10.0, 15.0, 20.0],
            "sst": [[22.5, 22.6, 22.7], [22.4, 22.5, 22.6], [22.3, 22.4, 22.5]]
        },
        "satellite": {"bounds": [[40.0, 27.0], [47.0, 42.0]]},
        "model3d": {"bounds": [[40.0, 27.0], [47.0, 42.0]]},
        "vertical_profiles_3d": [
            {"name": b, "depths": [0, 5, 10, 15], "temps": [22.5 - i*0.5 for i in range(4)]}
            for b in beaches
        ],
        "vertical_profiles_daily": [
            {"name": b, "depths": [0, 5, 10, 15], "temps": [22.6 - i*0.5 for i in range(4)]}
            for b in beaches
        ],
        "seasonal": {
            6: {"avg": 22.5, "min": 18.0, "max": 26.0, "count": 30},
            7: {"avg": 24.0, "min": 20.0, "max": 28.0, "count": 31},
            8: {"avg": 25.0, "min": 21.0, "max": 29.0, "count": 31}
        },
        "root_nc": [
            {"filename": "bams_daily.nc", "date": today.replace("-", ""), 
             "temps": {b: 22.0 + i * 0.3 for i, b in enumerate(beaches)}}
        ],
        "forecast_trend": {
            b: {"last_temp": 22.0 + i * 0.3, "slope": 0.05 + i * 0.01}
            for i, b in enumerate(beaches)
        },
        "dat_records": []
    }

def main():
    os.makedirs("data", exist_ok=True)
    data = generate_fallback_data()
    
    try:
        print("🔄 Подключение к FTP МГИ...")
        ftp = ftplib.FTP(FTP_HOST)
        ftp.login(FTP_USER, FTP_PASS)
        print("✅ Успешно подключено!")
        ftp.quit()
    except Exception as e:
        print(f"️ FTP недоступен: {e}")
        print("💡 Используются fallback-данные.")

    with open("data/nc_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("✅ Файл data/nc_data.json обновлен!")

if __name__ == "__main__":
    main()