import json
import matplotlib.pyplot as plt
import numpy as np
import os
from matplotlib.animation import FuncAnimation

def plot_packet_size_distribution(json_file):
    fig, ax = plt.subplots(figsize=(10, 6))

    def animate(i):
        ax.clear()
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
                packets = data.get('packets', [])
        except Exception as e:
            print(f"Error pri načítavaní JSON súboru: {e}")
            return
        sizes = [packet['size'] for packet in packets if 'size' in packet]
        if sizes:
            max_size = max(sizes)
            if max_size <= 1500:
                bins = np.linspace(0, max_size, 30)
            else:
                small_bins = np.linspace(0, 1500, 20)
                large_bins = np.linspace(1500, max_size, 10)
                bins = np.unique(np.concatenate([small_bins, large_bins]))
            ax.hist(sizes, bins=bins, color='royalblue', alpha=0.7, edgecolor='black', linewidth=0.5)
            ax.set_title('Distribúcia veľkosti paketov')
            ax.set_xlabel('Veľkosť paketu (bajty)')
            ax.set_ylabel('Frekvencia')
            ax.grid(axis='y', linestyle='--', alpha=0.7)
            stats_text = (f"Minimum: {min(sizes)} bajtov\n"
                          f"Maximum: {max(sizes)} bajtov\n"
                          f"Priemer: {np.mean(sizes):.2f} bajtov\n"
                          f"Medián: {np.median(sizes):.2f} bajtov\n"
                          f"Štandardná odchýlka: {np.std(sizes):.2f} bajtov")

            ax.text(0.95, 0.95, stats_text, transform=ax.transAxes,
                    verticalalignment='top', horizontalalignment='right',
                    bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        else:
            ax.text(0.5, 0.5, "Žiadne údaje o veľkosti paketov nie sú k dispozícii",
                    horizontalalignment='center', fontsize=14)
        file_name = os.path.basename(json_file)
        ax.set_title(f"Analýza veľkosti paketov - {file_name}", fontsize=14)

        plt.tight_layout()
    ani = FuncAnimation(fig, animate, interval=1000)
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Distribúcia veľkosti paketov")
    parser.add_argument("json_file", type=str, help="Cesta k súboru JSON s paketmi")
    args = parser.parse_args()

    plot_packet_size_distribution(args.json_file)