import json
import re
import matplotlib.pyplot as plt

def plot_dns_domains(data_input):
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
    domain_counts = {}
    domain_regex = re.compile(r'Name: ([^\s,]+)')

    for packet in packets:
        if packet.get('protocol', '').upper() == 'DNS':
            payload = packet.get('payload', '')
            match = domain_regex.search(payload)
            if match:
                domain = match.group(1)
                if '.' in domain and not re.match(r'^\d+\.\d+\.\d+\.\d+$', domain):
                    domain_counts[domain] = domain_counts.get(domain, 0) + 1

    if not domain_counts:
        print("Žiadne dostupné DNS domény")
        return
    sorted_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:15]
    domains, counts = zip(*sorted_domains)
    fig, ax = plt.subplots(figsize=(12, 7))
    bars = ax.bar(domains, counts, color=plt.cm.Blues(range(50, 255, int(205 / len(domains)))))

    plt.xticks(rotation=45, ha='right')
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{height}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')

    ax.set_title('Top vyhľadávané doménové mená', fontsize=14, fontweight='bold')
    ax.set_xlabel('Doménové meno')
    ax.set_ylabel('Počet dopytov')
    plt.tight_layout()
    plt.show()
