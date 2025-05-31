import json
import re
import matplotlib.pyplot as plt
from collections import OrderedDict

def plot_http_codes(data_input):
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
    status_codes = {}
    status_pattern = re.compile(r'Status: (\d+)')

    for pkt in packets:
        if pkt.get('protocol', '').upper() == 'HTTP':
            payload = pkt.get('payload', '')
            match = status_pattern.search(payload)
            if match:
                code = match.group(1)
                status_codes[code] = status_codes.get(code, 0) + 1

    if not status_codes:
        print("Žiadne dostupné HTTP kódy")
        return
    sorted_codes = sorted(status_codes.items(), key=lambda x: int(x[0]))
    codes, counts = zip(*sorted_codes)
    def get_code_category(code):
        c = int(code)
        if 100 <= c < 200:
            return "1xx - Informational"
        elif 200 <= c < 300:
            return "2xx - Success"
        elif 300 <= c < 400:
            return "3xx - Redirection"
        elif 400 <= c < 500:
            return "4xx - Client Error"
        elif 500 <= c < 600:
            return "5xx - Server Error"
        else:
            return "Unknown"

    categories = [get_code_category(c) for c in codes]
    category_colors = {
        "1xx - Informational": '#4285F4',
        "2xx - Success": '#34A853',
        "3xx - Redirection": '#FBBC05',
        "4xx - Client Error": '#EA4335',
        "5xx - Server Error": '#8F00FF',
        "Unknown": '#999999'
    }
    colors = [category_colors.get(cat, '#999999') for cat in categories]
    fig, ax = plt.subplots(figsize=(12, 6))
    bars = ax.bar(codes, counts, color=colors)

    ax.set_title('Distribúcia HTTP kódov', fontsize=14, fontweight='bold')
    ax.set_xlabel('HTTP stavový kód')
    ax.set_ylabel('Počet odpovedí')
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{int(height)}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')
    unique_categories = list(OrderedDict.fromkeys(categories))
    handles = [plt.Rectangle((0,0),1,1, color=category_colors[cat]) for cat in unique_categories]
    ax.legend(handles, unique_categories, title="Kategórie", loc='upper right')

    plt.tight_layout()
    plt.show()
