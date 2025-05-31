import matplotlib.pyplot as plt
from collections import Counter
import os

def plot_top_senders_receivers(filtered_packets, pcap_file):
    packets = filtered_packets
    src_packet_count = Counter()
    dst_packet_count = Counter()

    for packet in packets:
        src_ip = packet["src_ip"]
        dst_ip = packet["dst_ip"]

        src_packet_count[src_ip] += 1
        dst_packet_count[dst_ip] += 1
    top_senders_packets = src_packet_count.most_common(10)
    top_receivers_packets = dst_packet_count.most_common(10)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    sender_ips_packets = [ip for ip, _ in top_senders_packets]
    sender_counts_packets = [count for _, count in top_senders_packets]

    ax1.barh(sender_ips_packets[::-1], sender_counts_packets[::-1], color='cornflowerblue')
    ax1.set_title('Najväčší odosielatelia (podľa počtu paketov)')
    ax1.set_xlabel('Počet paketov')
    ax1.set_ylabel('IP adresa')
    for i, count in enumerate(sender_counts_packets[::-1]):
        ax1.text(count + (max(sender_counts_packets) * 0.01), i, str(count), va='center')
    receiver_ips_packets = [ip for ip, _ in top_receivers_packets]
    receiver_counts_packets = [count for _, count in top_receivers_packets]

    ax2.barh(receiver_ips_packets[::-1], receiver_counts_packets[::-1], color='lightcoral')
    ax2.set_title('Najväčší príjemcovia (podľa počtu paketov)')
    ax2.set_xlabel('Počet paketov')
    ax2.set_ylabel('IP adresa')
    for i, count in enumerate(receiver_counts_packets[::-1]):
        ax2.text(count + (max(receiver_counts_packets) * 0.01), i, str(count), va='center')
    file_name = os.path.basename(pcap_file)
    plt.suptitle(f"Analýza najväčších odosielateľov a príjemcov - {file_name}", fontsize=14)

    plt.tight_layout()
    plt.subplots_adjust(top=0.88)
    plt.show()