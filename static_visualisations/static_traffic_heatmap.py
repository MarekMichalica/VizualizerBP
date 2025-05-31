import matplotlib.pyplot as plt
import numpy as np
import os
from datetime import datetime, timedelta
from collections import defaultdict

def plot_traffic_heatmap(filtered_packets, pcap_file):
    packets = filtered_packets
    if not packets:
        plt.figure(figsize=(8, 6))
        plt.text(0.5, 0.5, "Nie sú dostupné žiadne údaje o paketoch",
                 horizontalalignment='center', fontsize=12)
        plt.tight_layout()
        plt.show()
        return
    timestamps = []
    for packet in packets:
        try:
            dt = datetime.strptime(packet["timestamp"], "%Y-%m-%d %H:%M:%S")
            timestamps.append((dt, packet["size"]))
        except ValueError:
            continue 

    if not timestamps:
        plt.figure(figsize=(8, 6))
        plt.text(0.5, 0.5, "Nie sú dostupné žiadne platné časové údaje",
                 horizontalalignment='center', fontsize=12)
        plt.tight_layout()
        plt.show()
        return
    timestamps.sort(key=lambda x: x[0])
    start_time = timestamps[0][0]
    end_time = timestamps[-1][0]
    time_span = end_time - start_time
    if time_span.total_seconds() <= 3600:
        time_matrix = defaultdict(lambda: defaultdict(int))

        for dt, size in timestamps:
            minute = dt.minute
            second = dt.second
            time_matrix[minute][second] += size
        minutes = sorted(time_matrix.keys())
        seconds = list(range(60))

        heat_data = np.zeros((len(minutes), 60))
        for i, minute in enumerate(minutes):
            for second in seconds:
                heat_data[i, second] = time_matrix[minute].get(second, 0)
        plt.figure(figsize=(10, 7))
        plt.imshow(heat_data, aspect='auto', origin='lower', cmap='viridis')
        plt.xlabel('Sekundy')
        plt.ylabel('Minúty')
        plt.xticks(np.arange(0, 60, 5))
        plt.yticks(range(len(minutes)), [f"{m:02d}" for m in minutes])

        plt.title(f"Tepelná mapa prevádzky podľa sekúnd ({start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')})")

    elif time_span.total_seconds() <= 86400:
        time_matrix = defaultdict(lambda: defaultdict(int))

        for dt, size in timestamps:
            hour = dt.hour
            minute = dt.minute
            time_matrix[hour][minute] += size
        hours = sorted(time_matrix.keys())
        minutes = list(range(60))

        heat_data = np.zeros((len(hours), 60))
        for i, hour in enumerate(hours):
            for minute in minutes:
                heat_data[i, minute] = time_matrix[hour].get(minute, 0)
        plt.figure(figsize=(10, 7))
        plt.imshow(heat_data, aspect='auto', origin='lower', cmap='viridis')
        plt.xlabel('Minúty')
        plt.ylabel('Hodiny')
        plt.xticks(np.arange(0, 60, 5))
        plt.yticks(range(len(hours)), [f"{h:02d}" for h in hours])

        plt.title(f"Tepelná mapa prevádzky podľa minút ({start_time.strftime('%Y-%m-%d %H:%M')} - {end_time.strftime('%H:%M')})")

    else:
        time_matrix = defaultdict(lambda: defaultdict(int))

        for dt, size in timestamps:
            day = (dt - start_time).days
            hour = dt.hour
            time_matrix[day][hour] += size
        days = sorted(time_matrix.keys())
        hours = list(range(24))

        heat_data = np.zeros((len(days), 24))
        for i, day in enumerate(days):
            for hour in hours:
                heat_data[i, hour] = time_matrix[day].get(hour, 0)
        plt.figure(figsize=(10, 7))
        plt.imshow(heat_data, aspect='auto', origin='lower', cmap='viridis')
        plt.xlabel('Hodina dňa')
        plt.ylabel('Deň')
        plt.xticks(range(24))
        date_labels = [(start_time + timedelta(days=day)).strftime('%Y-%m-%d') for day in days]
        plt.yticks(range(len(days)), date_labels)

        plt.title(f"Tepelná mapa prevádzky podľa hodín ({start_time.strftime('%Y-%m-%d')} - {end_time.strftime('%Y-%m-%d')})")
    cbar = plt.colorbar()
    cbar.set_label('Objem prevádzky (bajty)')
    file_name = os.path.basename(pcap_file)
    plt.suptitle(f"Tepelná mapa prevádzky - {file_name}", fontsize=14)

    plt.tight_layout()
    plt.subplots_adjust(top=0.9)
    plt.show()