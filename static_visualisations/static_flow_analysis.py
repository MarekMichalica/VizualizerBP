import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from datetime import datetime
from collections import defaultdict


def analyze_flows(filtered_packets, pcap_file):
    packets = filtered_packets
    flows = defaultdict(list)
    for packet in packets:
        src_ip = packet.get("src_ip", "N/A")
        dst_ip = packet.get("dst_ip", "N/A")
        protocol = packet.get("protocol", "N/A")
        src_port = packet.get("src_port", "N/A")
        dst_port = packet.get("dst_port", "N/A")
        timestamp = packet.get("timestamp", "")
        size = packet.get("size", 0)
        if src_ip == "N/A" or dst_ip == "N/A":
            continue
        ips = sorted([src_ip, dst_ip])
        ports = sorted([src_port, dst_port])
        flow_key = (ips[0], ips[1], protocol, ports[0], ports[1])
        direction = 1 if src_ip == ips[0] else -1
        try:
            dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
            flows[flow_key].append((dt, size, direction))
        except ValueError:
            continue
    if not flows:
        fig = plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, "Žiadne dáta o tokoch nie sú k dispozícii",
                 horizontalalignment='center', fontsize=14)
        plt.tight_layout()
        plt.show()
        return
    top_flows = sorted(flows.items(), key=lambda x: len(x[1]), reverse=True)[:5]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8),
                                   gridspec_kw={'height_ratios': [2, 1]})
    protocol_colors = {
        'TCP': 'blue', 'UDP': 'green', 'HTTP': 'red',
        'HTTPS': 'purple', 'DNS': 'orange', 'ICMP': 'brown'
    }
    all_times = [dt for _, flow_data in top_flows for dt, _, _ in flow_data]
    if not all_times:
        plt.close(fig)
        plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, "Žiadne platné časové údaje",
                 horizontalalignment='center', fontsize=14)
        plt.tight_layout()
        plt.show()
        return

    min_time, max_time = min(all_times), max(all_times)
    y_labels = []
    flow_stats = []
    for i, (flow_key, packets_in_flow) in enumerate(top_flows):
        src_ip, dst_ip, protocol, src_port, dst_port = flow_key
        flow_label = f"{src_ip.split('.')[-1]}:{src_port} ↔ {dst_ip.split('.')[-1]}:{dst_port}"
        y_labels.append(flow_label)
        y_pos = len(top_flows) - i
        color = protocol_colors.get(protocol, 'darkgray')
        packet_count = len(packets_in_flow)
        data_volume = sum(size for _, size, _ in packets_in_flow) / 1024
        flow_stats.append((flow_label, packet_count, data_volume))
        forward_packets = [(dt, size) for dt, size, dir in packets_in_flow if dir > 0]
        reverse_packets = [(dt, size) for dt, size, dir in packets_in_flow if dir < 0]
        if forward_packets:
            f_times, f_sizes = zip(*forward_packets)
            f_sizes = [max(20, min(80, s / 30)) for s in f_sizes]
            ax1.scatter(f_times, [y_pos] * len(f_times), s=f_sizes,
                        color=color, marker='^', alpha=0.7)

        if reverse_packets:
            r_times, r_sizes = zip(*reverse_packets)
            r_sizes = [max(20, min(80, s / 30)) for s in r_sizes]
            ax1.scatter(r_times, [y_pos] * len(r_times), s=r_sizes,
                        color=color, marker='v', alpha=0.7)
    ax1.set_yticks(range(1, len(top_flows) + 1))
    ax1.set_yticklabels(y_labels[::-1])
    ax1.grid(True, axis='x', linestyle='--', alpha=0.5)
    ax1.set_title("Časová os toku paketov")
    time_span = max_time - min_time
    padding = time_span * 0.05
    ax1.set_xlim(min_time - padding, max_time + padding)
    if time_span.total_seconds() < 3600:
        formatter = mdates.DateFormatter('%H:%M:%S')
        locator = mdates.MinuteLocator(interval=1)
    else: 
        formatter = mdates.DateFormatter('%H:%M')
        locator = mdates.HourLocator(interval=1)

    ax1.xaxis.set_major_formatter(formatter)
    ax1.xaxis.set_major_locator(locator)
    plt.setp(ax1.get_xticklabels(), rotation=45, ha='right')
    ax1.scatter([], [], s=50, marker='^', color='gray', label="Vpred")
    ax1.scatter([], [], s=50, marker='v', color='gray', label="Spätne")
    ax1.legend(loc='upper right')
    labels, packet_counts, data_volumes = zip(*flow_stats)
    x = np.arange(len(labels))
    width = 0.35
    ax2.bar(x - width / 2, packet_counts, width, color='steelblue', label="Počet paketov")
    ax2.set_ylabel("Počet paketov", color='steelblue')
    ax2.tick_params(axis='y', labelcolor='steelblue')
    ax3 = ax2.twinx()
    ax3.bar(x + width / 2, data_volumes, width, color='darkorange', label="Objem dát (KB)")
    ax3.set_ylabel("Objem dát (KB)", color='darkorange')
    ax3.tick_params(axis='y', labelcolor='darkorange')
    ax2.set_xticks(x)
    ax2.set_xticklabels(labels, rotation=45, ha='right')
    ax2.set_xlabel("Tok")
    ax2.set_title("Štatistika tokov")
    lines1, labels1 = ax2.get_legend_handles_labels()
    lines2, labels2 = ax3.get_legend_handles_labels()
    ax2.legend(lines1 + lines2, labels1 + labels2, loc='upper right')
    fig.suptitle(f"Analýza tokov - {pcap_file.split('/')[-1]}",
                 fontsize=14)
    plt.tight_layout()
    plt.subplots_adjust(top=0.92)
    plt.show()