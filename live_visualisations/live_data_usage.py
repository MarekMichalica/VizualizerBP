import json
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from matplotlib.animation import FuncAnimation
from datetime import datetime

def plot_data_usage(file_path):
    fig, ax = plt.subplots(figsize=(12, 6))
    timestamps = []
    data_usage = []
    def animate(i):
        nonlocal timestamps, data_usage
        with open(file_path, 'r') as file:
            data = json.load(file)
        timestamps = [datetime.strptime(entry["timestamp"], "%H:%M:%S") for entry in data]
        data_usage = [int(entry["data_usage"]) for entry in data]
        data_usage_kb = [size / 1024 for size in data_usage]

        ax.clear()
        ax.plot(timestamps, data_usage_kb, 'b-', linewidth=1.5, marker='o', markersize=4)
        ax.fill_between(timestamps, [0] * len(timestamps), data_usage_kb,
                        color='skyblue', alpha=0.4)
        ax.grid(True, linestyle='--', alpha=0.7)
        formatter = mdates.DateFormatter('%H:%M:%S')
        ax.xaxis.set_major_formatter(formatter)
        plt.xticks(rotation=45)
        ax.set_xlabel('Časová pečiatka')
        ax.set_ylabel('Využitie dát (KB)')
        ax.set_title('Využitie dát v čase')
        if data_usage:
            total_data = sum(data_usage) / (1024 * 1024) 
            time_span = max(timestamps) - min(timestamps)
            seconds = time_span.total_seconds()

            if seconds > 0:
                avg_rate = (total_data * 8) / (seconds / 60)
                stats_text = (f"Celkové dáta: {total_data:.2f} MB\n"
                              f"Priemerná rýchlosť: {avg_rate:.2f} Mbps\n"
                              f"Trvanie: {time_span}")

                ax.text(0.02, 0.95, stats_text, transform=ax.transAxes,
                        verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        if timestamps:
            ax.set_xlim(min(timestamps), max(timestamps))
            max_usage = max(data_usage_kb) if data_usage_kb else 0
            ax.set_ylim(0, max_usage * 1.1)

        fig.tight_layout()
    ani = FuncAnimation(fig, animate, interval=1000, cache_frame_data=False)
    plt.tight_layout()
    plt.show()

    return ani 