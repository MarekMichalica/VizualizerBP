import re
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
import json

def plot_tcp_window_size(data_input, pcap_file=None):
    import os
    packets = None

    if isinstance(data_input, str):
        try:
            if os.path.isfile(data_input):
                with open(data_input, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, list):
                        packets = loaded
                    elif isinstance(loaded, dict):
                        if "packets" in loaded:
                            packets = loaded["packets"]
                        else:
                            print("Neplatný formát JSON: očakávaný kľúč 'packets'")
                            return
                    else:
                        print("Neplatný formát JSON: očakávaný zoznam alebo slovník")
                        return
            else:
                print(f"Súbor {data_input} neexistuje")
                return
        except Exception as e:
            print(f"Chyba pri načítaní JSON: {e}")
            return
    elif isinstance(data_input, dict):
        if "packets" in data_input:
            packets = data_input["packets"]
        else:
            packets = [data_input]  
    elif isinstance(data_input, list):
        packets = data_input
    else:
        print(f"Neplatný vstup pre vizualizáciu: {type(data_input)}")
        return

    if not packets:
        print("Žiadne pakety na zobrazenie")
        return
    times = []
    window_sizes = []

    for index, packet in enumerate(packets):
        if packet.get("protocol", "").upper() == "TCP":
            payload = packet.get("payload", "")
            if payload:
                match = re.search(r"win=(\d+)", payload)
                if match:
                    window_size = int(match.group(1))
                    timestamp = packet.get("timestamp")
                    if isinstance(timestamp, str):
                        try:
                            timestamp_dt = datetime.fromisoformat(timestamp)
                        except Exception:
                            timestamp_dt = None
                    else:
                        timestamp_dt = None
                    times.append(timestamp_dt if timestamp_dt else index)
                    window_sizes.append(window_size)

    if not window_sizes:
        print("Neboli nájdené žiadne veľkosti TCP okna")
        return
    fig, ax = plt.subplots(figsize=(12, 6))

    if all(isinstance(t, datetime) for t in times):
        ax.plot(times, window_sizes, marker='o', linestyle='-', color='steelblue')
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d %H:%M:%S'))
        fig.autofmt_xdate(rotation=45)
        ax.set_xlabel("Čas")
    else:
        ax.plot(times, window_sizes, marker='o', linestyle='-', color='steelblue')
        ax.set_xlabel("Paket index")

    ax.set_ylabel("Veľkosť okna")
    ax.set_title("Veľkosť TCP okna v čase")
    ax.grid(True)

    plt.tight_layout()
    plt.show()
