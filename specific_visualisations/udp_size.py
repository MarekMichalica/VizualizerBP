import json
import matplotlib.pyplot as plt
import numpy as np

def plot_udp_size(data_input):
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
    udp_packets = [p for p in packets if p.get('protocol', '').upper() == 'UDP']
    if not udp_packets:
        print("Žiadne dostupné UDP pakety")
        return
    group_size = 100
    size_groups = {}

    for pkt in udp_packets:
        try:
            size = int(pkt.get('size', 0))
        except (ValueError, TypeError):
            continue
        group = (size // group_size) * group_size
        group_label = f"{group}-{group + group_size - 1}"
        size_groups[group_label] = size_groups.get(group_label, 0) + 1

    if not size_groups:
        print("Žiadne platné veľkosti paketov")
        return
    size_data = sorted(
        size_groups.items(),
        key=lambda x: int(x[0].split('-')[0])
    )
    labels, counts = zip(*size_data)
    fig, ax = plt.subplots(figsize=(12, 7))
    bars = ax.bar(labels, counts, color='steelblue')

    ax.set_title('Distribúcia veľkostí UDP packetov', fontsize=14, fontweight='bold')
    ax.set_xlabel('Veľkosť packetu (bytes)')
    ax.set_ylabel('Počet packetov')
    ax.set_xticklabels(labels, rotation=45, ha='right')
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{int(height)}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')

    plt.tight_layout()
    plt.show()
