import json
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from collections import Counter

def plot_top_senders_receivers(json_file, top_n=5):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    def animate(i):
        ax1.clear()
        ax2.clear()
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
                packets = data['packets']
        except Exception as e:
            print(f"Error pri načítaní JSON súboru: {e}")
            return
        src_ips = Counter([packet['src_ip'] for packet in packets])
        dst_ips = Counter([packet['dst_ip'] for packet in packets])
        top_senders = src_ips.most_common(top_n)
        top_receivers = dst_ips.most_common(top_n)
        sender_ips = [ip for ip, count in top_senders]
        sender_counts = [count for ip, count in top_senders]

        ax1.barh(sender_ips, sender_counts, color='skyblue')
        ax1.set_title('Top odosielatelia')
        ax1.set_xlabel('Počet paketov')
        receiver_ips = [ip for ip, count in top_receivers]
        receiver_counts = [count for ip, count in top_receivers]

        ax2.barh(receiver_ips, receiver_counts, color='lightgreen')
        ax2.set_title('Top prijímatelia')
        ax2.set_xlabel('Počet paketov')

        plt.tight_layout()
    ani = FuncAnimation(fig, animate, interval=1000)
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Top odosielatelia a prijímatelia")
    parser.add_argument("json_file", type=str, help="Cesta k súboru JSON s paketmi")
    args = parser.parse_args()

    plot_top_senders_receivers(args.json_file)