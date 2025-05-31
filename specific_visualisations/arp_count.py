import json
import re
import matplotlib.pyplot as plt

def plot_arp_count(data_input):
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
    arp_counts = {}

    for pkt in packets:
        if pkt.get('protocol', '').upper() == 'ARP':
            payload = pkt.get('payload', '')
            match = re.search(r'Sender: ([0-9.]+)', payload)
            if match:
                sender_ip = match.group(1)
                arp_counts[sender_ip] = arp_counts.get(sender_ip, 0) + 1

    if not arp_counts:
        print("Žiadne dostupné ARP správy")
        return
    sorted_data = sorted(arp_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    ips, counts = zip(*sorted_data)

    fig, ax = plt.subplots(figsize=(12, 7))
    bars = ax.bar(ips, counts, color='#4285F4')
    plt.xticks(rotation=-45, ha='right')
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{int(height)}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom')

    ax.set_title('Počet ARP správ podľa IP adresy', fontsize=14, fontweight='bold')
    ax.set_xlabel('IP adresa')
    ax.set_ylabel('Počet správ')
    ax.yaxis.set_major_locator(plt.MaxNLocator(5))

    plt.tight_layout()
    plt.show()
