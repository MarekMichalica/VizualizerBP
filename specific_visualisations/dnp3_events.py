import json
import re
import matplotlib.pyplot as plt


def plot_dnp3_events(data_input):
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
    class_counts = {
        'Class 0': 0,
        'Class 1': 0,
        'Class 2': 0,
        'Class 3': 0,
        'Iné': 0
    }

    class_pattern = re.compile(r'Class: (\d+)')
    for packet in packets:
        if packet.get('protocol', '').upper() == 'DNP3':
            payload = packet.get('payload', '')
            if 'Class:' in payload:
                match = class_pattern.search(payload)
                if match:
                    class_num = int(match.group(1))
                    if 0 <= class_num <= 3:
                        class_counts[f'Class {class_num}'] += 1
                    else:
                        class_counts['Iné'] += 1

    total_events = sum(class_counts.values())

    if total_events == 0:
        print("Žiadne dostupné DNP3 udalosti")
        return
    chart_data = {k: v for k, v in class_counts.items() if v > 0}

    labels = list(chart_data.keys())
    counts = list(chart_data.values())
    class_colors = {
        'Class 0': '#4285F4',
        'Class 1': '#34A853',
        'Class 2': '#FBBC05',
        'Class 3': '#EA4335',
        'Iné': '#9E9E9E'
    }
    colors = [class_colors.get(label, '#9E9E9E') for label in labels]
    fig, ax = plt.subplots(figsize=(8, 6))
    wedges, texts, autotexts = ax.pie(
        counts,
        labels=None,
        autopct=lambda pct: f'{int(round(pct))}%' if pct >= 5 else '',
        colors=colors,
        startangle=90,
        wedgeprops=dict(width=0.6, edgecolor='white')
    )
    legend_labels = [f'{label}: {count}' for label, count in zip(labels, counts)]
    ax.legend(wedges, legend_labels, title='Triedy', loc='center left', bbox_to_anchor=(1, 0, 0.5, 1))
    ax.set_title('DNP3 udalosti podľa tried', fontsize=14, fontweight='bold')
    ax.axis('equal')

    plt.tight_layout()
    plt.show()
