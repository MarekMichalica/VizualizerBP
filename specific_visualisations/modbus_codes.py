import re
import json
import matplotlib.pyplot as plt

def plot_modbus_codes(data_input, pcap_file=None):
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
    modbus_codes = {
        "1": "Read Coils",
        "2": "Read Discrete Inputs",
        "3": "Read Holding Registers",
        "4": "Read Input Registers",
        "5": "Write Single Coil",
        "6": "Write Single Register",
        "15": "Write Multiple Coils",
        "16": "Write Multiple Registers",
        "23": "Read/Write Multiple Registers"
    }

    codes_counts = {}
    for pkt in packets:
        protocol = pkt.get("protocol", "").upper()
        if protocol == "MODBUS":
            payload = pkt.get("payload", "")
            if payload:
                match = re.search(r"Code: (\d+)", payload)
                if match:
                    code = match.group(1)
                    codes_counts[code] = codes_counts.get(code, 0) + 1

    if not codes_counts:
        print("Žiadne dostupné Modbus kódy na zobrazenie.")
        plt.figure(figsize=(8, 4))
        plt.text(0.5, 0.5, "Žiadne dostupné Modbus kódy", ha='center', va='center', fontsize=14)
        plt.axis('off')
        plt.show()
        return
    sorted_items = sorted(codes_counts.items(), key=lambda x: int(x[0]))
    codes = [item[0] for item in sorted_items]
    counts = [item[1] for item in sorted_items]
    names = [modbus_codes.get(code, f"Function {code}") for code in codes]
    fig, ax = plt.subplots(figsize=(10, 6))

    bars = ax.bar(codes, counts, color=plt.cm.tab10.colors[:len(codes)])
    for bar, count in zip(bars, counts):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width() / 2, height + max(counts) * 0.01, str(count),
                ha='center', va='bottom', fontsize=9)

    ax.set_xlabel("Kód funkcie")
    ax.set_ylabel("Počet")
    ax.set_title("Distribúcia Modbus funkčných kódov" + (f"\n{pcap_file}" if pcap_file else ""))
    ax.set_ylim(0, max(counts) * 1.15)
    legend_labels = [f"{code}: {name}" for code, name in zip(codes, names)]
    ax.legend(bars, legend_labels, title="Funkčné kódy", loc='upper right', bbox_to_anchor=(1.3, 1))

    plt.tight_layout()
    plt.show()
